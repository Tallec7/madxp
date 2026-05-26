# Runbook — Migration FTP NEOPRO → MadXP (ADR-133, Phase 6)

> **Statut** : Préparé, NON exécuté.
> **Owner exécution** : Daisy.
> **Pré-requis bloquants** : accès panel Hostinger + accès Railway.
> **Fenêtre** : ~30 min côté Hostinger (création users + copie fichiers) + ~5 min Railway env vars + ~10 s migration SQL.
> **Risque** : MEDIUM. Une étape ratée = upload casse côté dashboard (mais lecture continue de marcher tant que les fichiers existent côté `/neopro-video/`).

## Pourquoi

L'env var `FTP_PUBLIC_URL=https://kalonpartners.bzh/neopro-video` détermine la base URL de tous les assets vidéos. Il faut migrer vers `madxp-video` sans casser :

- Les **lectures actuelles** côté Pi (assets vidéos déjà téléchargés via URLs `/neopro-video/...`)
- Les **lectures actuelles** côté dashboard (URLs de pubs/templates pointant sur `/neopro-video/...`)
- Les **uploads futurs** (qui écriront via le nouveau FTP user vers `/madxp-video/`)

Stratégie : copie + bascule + migration SQL (pas de double-écriture, car la lecture des anciens fichiers reste assurée par leur conservation sous `/neopro-video/`).

## Étapes

### 1. Hostinger — Créer les nouveaux utilisateurs FTP

Dans le panel Hostinger, créer 2 utilisateurs FTP :

| User                     | Home dir         | Mot de passe        |
| ------------------------ | ---------------- | ------------------- |
| `u406531085.madxpvideos` | `/madxp-video/`  | nouveau (16+ chars) |
| `u406531085.updatemadxp` | `/madxp-update/` | nouveau (16+ chars) |

**⚠️ Conserver les mots de passe dans 1Password (ou équivalent) pour l'étape 4.**

### 2. Hostinger — Créer les dossiers cible

Via le file manager Hostinger (ou via FTP avec un des nouveaux users) :

```
/public_html/madxp-video/
/public_html/madxp-video/db-backups/   ← sous-dossier utilisé par db-backup.yml
/public_html/madxp-update/
```

Permissions : identiques aux dossiers `/neopro-video/` et `/neopro-update/` actuels (`755` typique).

### 3. Hostinger — Copier les fichiers (PAS déplacer)

Depuis le file manager Hostinger ou via rsync FTP :

```bash
# Option recommandée : via lftp (mirror = rsync over FTP)
lftp -e "mirror --parallel=5 /neopro-video/ /madxp-video/; bye" \
  -u u406531085.videos,<password> ftp://72.60.93.193

lftp -e "mirror --parallel=5 /neopro-update/ /madxp-update/; bye" \
  -u u406531085.updateneopro,<password> ftp://72.60.93.193
```

Vérifier la complétude :

```bash
# Compter les fichiers (devrait matcher entre source et cible)
lftp -e "find /neopro-video/ | wc -l; bye" -u u406531085.videos,<password> ftp://72.60.93.193
lftp -e "find /madxp-video/ | wc -l; bye" -u u406531085.madxpvideos,<password> ftp://72.60.93.193
```

**⚠️ Volumétrie** : si le bucket vidéo dépasse plusieurs GB, prévoir une fenêtre plus longue ou faire en plusieurs batches.

### 4. Railway — Mettre à jour les env vars

Dans Railway, service `neopro-central` (puis `central-server-staging`) :

```
FTP_PUBLIC_URL=https://kalonpartners.bzh/madxp-video
FTP_USER=u406531085.madxpvideos
FTP_PASSWORD=<nouveau-mdp-étape-1>

FTP_UPDATE_PUBLIC_URL=https://kalonpartners.bzh/madxp-update
FTP_UPDATE_USER=u406531085.updatemadxp
FTP_UPDATE_PASSWORD=<nouveau-mdp-étape-1>
```

Railway redémarre automatiquement le service. Vérifier que les logs au boot affichent les nouvelles URLs (`logger.info('FTP storage configured', { publicUrl })`).

### 5. Test de bouclage (avant migration SQL)

- Uploader une vidéo de test via dashboard. Vérifier qu'elle apparaît sous `/madxp-video/` côté Hostinger.
- Vérifier que la nouvelle URL est lisible : `curl -I https://kalonpartners.bzh/madxp-video/<nouveau-fichier>` → 200.
- Vérifier que les URLs anciennes marchent toujours : `curl -I https://kalonpartners.bzh/neopro-video/<ancien-fichier>` → 200.

**🛑 STOP si l'un de ces tests échoue.** Revert les env vars Railway, investiguer.

### 6. Audit DB

```bash
cd central-server && source .env && npx ts-node src/scripts/audit-ftp-path-rebrand.ts
```

Note le nombre de rows à migrer par colonne. Si > 1000 rows sur une colonne, prévoir un `EXPLAIN ANALYZE` sur les UPDATE de la migration SQL avant exécution.

### 7. Migration SQL — backup d'abord

```bash
# Backup ciblé des tables impactées (depuis audit étape 6)
PGPASSWORD=<…> pg_dump -h <host> -U <user> -d railway \
  --table=public.proof_of_broadcasts \
  --table=public.template_definitions \
  --data-only > backup-pre-ftp-rebrand-$(date +%Y%m%d).sql
```

### 8. Migration SQL — exécution

```bash
cd central-server && npm run db:migrate -- --file=migrate-ftp-paths-to-madxp.sql
# OU
PGPASSWORD=<…> psql -h <host> -U <user> -d railway \
  -f src/scripts/migrations/migrate-ftp-paths-to-madxp.sql
```

Sortie attendue : `NOTICE: Post-migration : 0 rows referencent encore neopro-video, 0 rows neopro-update`.

Si ≠ 0, relancer l'audit `audit-ftp-path-rebrand.ts` pour identifier les colonnes manquantes, et étendre `migrate-ftp-paths-to-madxp.sql` avec un UPDATE supplémentaire.

### 9. Validation post-migration

- Recharger un sponsor PDF report (utilise `proof_of_broadcasts.screenshot_url`) → screenshot s'affiche.
- Ouvrir un template Studio V1 (utilise `template_definitions.manifest_json`) → assets vidéos chargent.
- Lancer `audit-ftp-path-rebrand.ts` une dernière fois → 0 row impactée.

### 10. Sunset legacy (après 30 jours sans incident)

- Vérifier qu'aucun fichier `/neopro-video/` n'a été modifié récemment (logs FTP Hostinger).
- Vérifier que la flotte Pi a basculé sur les nouvelles URLs (logs sync-agent, `analytics.video_plays.source_url` LIKE `%madxp-video%`).
- Une fois validé : supprimer les utilisateurs FTP `u406531085.videos` et `u406531085.updateneopro`, supprimer les dossiers `/neopro-video/` et `/neopro-update/`.

## Plan de rollback

À tout moment avant l'étape 8 :

1. Revert les env vars Railway aux valeurs `/neopro-video/` (Railway garde l'historique).
2. Redémarrer le service.
3. Les nouveaux uploads retournent sur l'ancien path. Les fichiers déjà copiés sous `/madxp-video/` restent là, inertes — ils seront supprimés lors d'une 2e tentative.

Après l'étape 8 (migration SQL exécutée) :

1. Restore le backup SQL de l'étape 7 :
   ```bash
   psql … < backup-pre-ftp-rebrand-YYYYMMDD.sql
   ```
2. Revert env vars Railway.
3. Investiguer la cause root, replanifier.

## Garde-fous

- **NE PAS déplacer** les fichiers `/neopro-video/` → `/madxp-video/` (copier seulement). Sinon les Pi qui ont des URLs cachées `neopro-video/...` cassent immédiatement.
- **NE PAS exécuter** la migration SQL avant d'avoir validé l'étape 5 (test upload + lecture).
- **NE PAS supprimer** `/neopro-video/` ou `/neopro-update/` avant les 30 jours de quarantaine de l'étape 10.

## Références

- [ADR-133](../adr/ADR-133-rebrand-neopro-to-madxp.md)
- [ADR-113 — FTP creds rotation](../adr/ADR-113-ftp-creds-rotation-procedure.md)
- Script audit : `central-server/src/scripts/audit-ftp-path-rebrand.ts`
- Migration SQL : `central-server/src/scripts/migrations/migrate-ftp-paths-to-madxp.sql`
