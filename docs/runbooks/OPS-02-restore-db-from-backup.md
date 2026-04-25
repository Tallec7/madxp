# Runbook OPS-02 — Tester un restore DB depuis backup

> **Objectif** : valider une fois par mois que les backups produits par `db-backup.yml` sont **réellement restaurables**. Un backup non testé n'est pas un backup.
> **Fréquence** : 1ʳᵉ semaine de chaque mois.
> **Pré-requis** : accès FTP Hostinger (`/backups/db/`) ou Supabase mirror, `psql` + `pg_restore` ≥ 18, accès Railway DB staging.
> **Niveau de risque** : 🟢 faible — on restaure sur **staging uniquement**, jamais sur prod.

---

## Contexte

Le workflow [`db-backup.yml`](../../.github/workflows/db-backup.yml) tourne tous les jours à 03:00 UTC :

1. `pg_dump` de la DB prod Railway → format `custom` (`.dump`)
2. Upload Hostinger FTP `/backups/db/neopro_<TIMESTAMP>.dump`
3. Mirror Supabase (rétention plus longue)

Il faut **vérifier mensuellement** que ces dumps sont :

- Téléchargeables
- Non corrompus
- Restaurables sans erreur fatale
- Cohérents (volume + checksums clés)

---

## Étape 1 — Récupérer le dernier dump (~5 min)

### Option A : depuis Hostinger FTP

```bash
# Variables (récupérer dans Railway secrets)
export FTP_HOST='<hostinger-host>'
export FTP_USER='<hostinger-user>'
export FTP_PASSWORD='<hostinger-password>'

# Lister les dumps disponibles
lftp -u "$FTP_USER,$FTP_PASSWORD" -p 21 "$FTP_HOST" -e "cd /backups/db/; ls -lt; quit" | head -20

# Télécharger le plus récent
LAST_DUMP=$(lftp -u "$FTP_USER,$FTP_PASSWORD" -p 21 "$FTP_HOST" -e "cd /backups/db/; cls -1 --sort=date | head -1; quit")
echo "Dernier dump : $LAST_DUMP"

mkdir -p /tmp/db-restore-test && cd /tmp/db-restore-test
lftp -u "$FTP_USER,$FTP_PASSWORD" -p 21 "$FTP_HOST" -e "cd /backups/db/; get $LAST_DUMP; quit"

ls -lh "$LAST_DUMP"   # taille attendue : 10-200 MB
```

### Option B : depuis Supabase mirror

Aller sur Supabase dashboard → projet `wrirmjohxkgvcuyhwaiw` → **Storage** → bucket `db-backups` → télécharger le plus récent.

---

## Étape 2 — Sanity check du dump (~2 min)

```bash
cd /tmp/db-restore-test

# Format custom doit commencer par "PGDMP"
file "$LAST_DUMP"   # → "PostgreSQL custom database dump"

# Lister le contenu sans restaurer
pg_restore --list "$LAST_DUMP" | head -30
pg_restore --list "$LAST_DUMP" | wc -l   # ~500-2000 entries attendues

# Vérifier les tables critiques sont présentes
pg_restore --list "$LAST_DUMP" | grep -E "TABLE DATA public\.(sites|users|videos|video_plays|club_sessions)"
```

❌ **STOP si :**

- Taille < 1 MB (workflow déjà bloqué par sanity check, mais redondance)
- `pg_restore --list` renvoie une erreur
- Une table critique manque

→ Ouvrir incident, vérifier `db-backup.yml` runs récents (`gh run list --workflow=db-backup.yml`).

---

## Étape 3 — Restaurer sur staging (~10 min)

⚠️ **NE JAMAIS** restaurer sur prod. La cible est **toujours** la DB staging Railway (`neopro-staging-db`).

```bash
export STAGING_DATABASE_PUBLIC_URL='postgresql://...@<staging-host>.railway.app:.../railway'

# Garde-fou : refuser si l'URL ne contient pas "staging"
case "$STAGING_DATABASE_PUBLIC_URL" in
  *staging*) echo "OK staging URL" ;;
  *) echo "ERREUR: URL ne contient pas 'staging' — STOP"; exit 1 ;;
esac

# 1. Drop + recreate du schéma public sur staging
psql "$STAGING_DATABASE_PUBLIC_URL" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL

# 2. Restore depuis le dump custom
pg_restore \
  --no-owner --no-acl \
  --dbname="$STAGING_DATABASE_PUBLIC_URL" \
  --jobs=4 \
  --verbose \
  "$LAST_DUMP" 2>&1 | tee restore.log

# 3. Compter les warnings vs erreurs
grep -c "WARNING" restore.log || true
grep -c "ERROR" restore.log || true   # doit être 0 ou très faible
```

⚠️ **Quelques warnings sont normaux** (extensions déjà présentes, GRANT redondants). **Aucune** ERROR n'est tolérée.

---

## Étape 4 — Vérifier la cohérence (~5 min)

```bash
psql "$STAGING_DATABASE_PUBLIC_URL" <<'SQL'
-- Compter les rows clés et comparer avec les attentes
SELECT 'sites' AS tbl, COUNT(*) FROM sites
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'videos', COUNT(*) FROM videos
UNION ALL SELECT 'clubs', COUNT(*) FROM clubs
UNION ALL SELECT 'video_plays', COUNT(*) FROM video_plays
UNION ALL SELECT 'club_sessions', COUNT(*) FROM club_sessions;

-- Vérifier la dernière migration appliquée
SELECT name, applied_at FROM schema_migrations
ORDER BY applied_at DESC LIMIT 5;

-- Vérifier la santé des index
SELECT schemaname, tablename, COUNT(*) AS index_count
FROM pg_indexes WHERE schemaname = 'public'
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10;
SQL
```

Comparer avec le snapshot prod attendu :

- Sites : ~50
- Users : ~20-100
- Videos : 1000+
- Migrations : doit matcher la prod du jour du dump

---

## Étape 5 — Re-anonymiser si dump non-anonymisé (~5 min)

⚠️ Le workflow `db-backup.yml` dump la prod **sans anonymisation** (c'est un backup de sécurité, pas un staging seed). Si tu utilises ce dump pour démo / debug staging :

```bash
# Lancer le script d'anonymisation après restore
cd central-server
DATABASE_URL="$STAGING_DATABASE_PUBLIC_URL" DATABASE_SSL=false \
  npm run db:anonymize-staging   # voir J3 pour le script

# Vérifier qu'aucune PII prod ne reste
psql "$STAGING_DATABASE_PUBLIC_URL" -c "SELECT COUNT(*) FROM users WHERE email LIKE '%@gmail.com' OR email LIKE '%kalonpartners%';"
# Doit retourner 0
```

---

## Étape 6 — Nettoyage (~1 min)

```bash
# Supprimer le dump local (RGPD + hygiène disque)
shred -u /tmp/db-restore-test/*.dump
rm -rf /tmp/db-restore-test

# Logger le test dans le tracking
cat >> docs/runbooks/RESTORE-TEST-LOG.md <<EOF

## $(date -u +%Y-%m-%d)
- Dump testé : $LAST_DUMP
- Taille : $(du -h "$LAST_DUMP" | cut -f1)
- ERROR count : <X>
- Restore : ✅ / ❌
- Anonymisation : ✅ / ❌
- Notes : <RAS ou détail>
EOF
```

---

## Checklist mensuelle

- [ ] Dump le plus récent téléchargé sans erreur
- [ ] `pg_restore --list` fonctionne et liste les tables critiques
- [ ] Restore staging sans ERROR
- [ ] Counts des tables critiques cohérents avec prod
- [ ] Anonymisation appliquée si usage non-incident
- [ ] Dump local supprimé (`shred -u`)
- [ ] Entry ajoutée à `RESTORE-TEST-LOG.md`
- [ ] Si échec : issue GitHub `label: backup-broken` + investigation `db-backup.yml`

## Métriques cibles

- **RPO** (recovery point objective) : 24h max (backup quotidien)
- **RTO** (recovery time objective) : < 30 min pour restore complet sur staging
- Test mensuel : **non négociable** — un backup non testé n'existe pas

## Référence

- Workflow backup : [.github/workflows/db-backup.yml](../../.github/workflows/db-backup.yml)
- [J3 — Anonymized prod dump](J3-anonymized-prod-dump.md) (process standard staging seed)
- [OPS-01 — Rollback prod](OPS-01-rollback-prod.md) (cas d'usage incident)
- [ADR-070](../adr/ADR-070-migration-postgres-railway-backup-strategy.md) — DB Railway + stratégie backup
