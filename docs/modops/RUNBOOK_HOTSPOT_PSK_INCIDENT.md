# RUNBOOK — Hotspot PSK bootstrap/rotate en échec (ADR-074)

**Audience** : Ops / Support Niveau 2+
**Durée** : 5 à 30 minutes selon le scénario
**Version** : 1.0 (post-incident 2026-04-20)
**Références** : [ADR-074](../adr/ADR-074-hotspot-psk-single-source-of-truth.md), [MIGRATION_PSK_LEGACY](./MIGRATION_PSK_LEGACY.md), [RUNBOOK_URGENCE](./RUNBOOK_URGENCE.md)

---

## Symptômes couverts

- `POST /api/sites/:id/hotspot-config/bootstrap` → **500 Internal Server Error**
- `POST /api/sites/:id/hotspot-config/rotate` → **500 Internal Server Error**
- Le dashboard affiche "PSK non configuré" pour un site supposé bootstrappé
- `npm run hotspot:status` retourne `has_cloud_psk=false` pour tous les sites
- Une rotation dashboard réussit côté UI mais le Pi ne met pas à jour son `hostapd.conf`
- Alerte Prometheus `neopro_hotspot_bootstrap_attempts_total{status="500"}` > 0

---

## Pré-vol (à faire en 30 secondes)

```bash
# 1. Clé de chiffrement présente en prod ?
railway variables --kv | grep HOTSPOT_PSK_ENCRYPTION_KEY

# 2. Migrations à jour ?
railway logs --tail 100 | grep -E "migration|migrate"

# 3. Route ADR-074 bien montée ?
curl -sS -o /dev/null -w "%{http_code}" \
  "https://neopro-central-production.up.railway.app/api/sites/$SITE_ID/hotspot-config" \
  -H "X-API-Key: $SITE_API_KEY"
# 200 = OK, 404 = pas bootstrappé (normal), 500 = incident (ce runbook), 401/403 = ADR-076 route collision
```

---

## Diagnostic en arbre

### Branche A — Erreur 500 sur bootstrap

**Cause la plus probable** : `HOTSPOT_PSK_ENCRYPTION_KEY` absente de Railway.

#### A.1 — Vérifier la présence de la clé

```bash
cd central-server
railway variables --kv | grep HOTSPOT_PSK_ENCRYPTION_KEY
```

**Attendu** : `HOTSPOT_PSK_ENCRYPTION_KEY=<64 caractères hex>`

**Si absent** → passer à A.2.
**Si présent mais trop court** (< 64 chars) → A.3.

#### A.2 — Générer + setter la clé

> ⚠️ **Irréversible** : une fois la clé setée, tous les bootstraps à venir chiffrent avec
> cette clé. Perdre la clé = tous les PSK DB deviennent indéchiffrables. **Sauvegarder
> la clé dans 1Password AVANT de la setter.**

```bash
# 1. Générer
KEY=$(openssl rand -hex 32)
echo "$KEY"  # 64 chars hex

# 2. Sauvegarder dans 1Password :
#    Entrée : MadXP / HOTSPOT_PSK_ENCRYPTION_KEY
#    Tag : production, infra

# 3. Setter sur Railway (depuis central-server/, projet linké)
cd central-server
railway variables --set "HOTSPOT_PSK_ENCRYPTION_KEY=$KEY"

# 4. Railway redeploy automatiquement. Vérifier :
railway logs --tail 50 | grep "Server listening"
```

**Après redeploy** → relancer le bootstrap (dashboard ou `POST /hotspot-config/bootstrap`).

#### A.3 — Clé existante mais tronquée/invalide

Ne **jamais** supprimer la clé actuelle sans vérifier d'abord si des PSK sont déjà chiffrés en DB :

```sql
SELECT COUNT(*) AS encrypted_sites
FROM sites WHERE wifi_psk_encrypted IS NOT NULL;
```

- **0** → safe de remplacer la clé. Suivre A.2.
- **>0** → **STOP** : remplacer la clé rend les PSK existants indéchiffrables. Options :
  - Retrouver la clé originale dans 1Password / logs Railway archivés.
  - Ou : `UPDATE sites SET wifi_psk_encrypted=NULL` + re-bootstrap manuel par Pi (SSH →
    lire `hostapd.conf` → `POST /hotspot-config/bootstrap`).

---

### Branche B — Migrations pas jouées (healthcheck fail, 404 sur route ADR-074)

**Cause la plus probable** : Railway Custom Start Command override le Dockerfile `CMD`.

#### B.1 — Vérifier la Custom Start Command

1. Railway Dashboard → service `neopro-central` → Settings → Deploy
2. Lire le champ **Custom Start Command**.

**Attendu** : vide (Railway utilise le `CMD` du Dockerfile) **OU** contient
`node dist/scripts/migrate.js && node …dist/server.js`.

**Si override = `npm start`** → Vérifier que `central-server/package.json` contient bien :

```json
"start": "node dist/scripts/migrate.js && node --max-old-space-size=512 --expose-gc dist/server.js"
```

Sinon → forcer la mise à jour via PR (voir PR #497 pour le pattern).

#### B.2 — Forcer un replay des migrations

Si les migrations n'ont pas tourné au dernier deploy :

```bash
# Option 1 — redeploy propre (recommandé)
railway redeploy

# Option 2 — SSH et lancer manuellement
railway ssh
cd /app
node dist/scripts/migrate.js
exit
```

#### B.3 — Migration qui crash le server

Symptôme : `migrate.js` démarre mais plante → `server.js` ne boot jamais → healthcheck KO.

```bash
railway logs --tail 200 | grep -E "migration|error"
```

**Erreurs typiques** :

- `function uuid_generate_v4() does not exist` — l'extension `uuid-ossp` est dans le schema
  `extensions` non-inclus dans `search_path`. Fix : migration doit utiliser `gen_random_uuid()`
  (natif PG 13+). Cf. PR #498.
- `column "xxx" does not exist` — migration appliquée partiellement. Inspecter
  `schema_migrations` en DB et aligner à la main.

---

### Branche C — Rotation réussie côté dashboard mais Pi pas sync

**Cause la plus probable** : commande `rotate_psk` pas propagée au Pi.

#### C.1 — Vérifier que la commande est en queue

```sql
SELECT id, type, status, created_at, dispatched_at
FROM remote_commands
WHERE site_id = '<siteId>' AND type = 'rotate_psk'
ORDER BY created_at DESC LIMIT 5;
```

- `status='pending'` depuis > 5 min → Pi offline. Attendre reconnexion ou contacter support.
- `status='completed'` mais Pi n'a pas changé son SSID → Bug sync-agent. SSH Pi :

```bash
ssh pi@<ip>
sudo journalctl -u neopro-sync-agent -n 100 | grep -iE "hotspot|rotate"
```

#### C.2 — Forcer une resync depuis le Pi

```bash
ssh pi@<ip>
cd /home/pi/neopro/sync-agent
# Déclencher syncHotspotFromCloud() manuellement :
sudo systemctl restart neopro-sync-agent
sudo journalctl -u neopro-sync-agent -f
```

Chercher dans les logs : `Hotspot sync: cloud config fetched` puis `hostapd.conf rewritten`.

---

## Après résolution

1. **Vérifier l'état fleet** :

   ```bash
   cd central-server && npm run hotspot:status
   ```

2. **Vérifier les métriques Prometheus** (Grafana → dashboard `Hotspot PSK`) :
   - `neopro_hotspot_bootstrap_attempts_total{status="success"}` doit incrémenter.
   - `neopro_hotspot_psk_decrypt_errors_total` doit rester à 0.

3. **Logger l'incident** dans `docs/modops/archives/` avec :
   - Timeline (détection, fix, résolution)
   - Cause racine identifiée
   - Runbook utilisé (pointer cette page)
   - Qui a payé le coût (utilisateur/support/ops)

4. **Mettre à jour la mémoire système** si la cause n'est pas encore documentée dans
   `.claude/rules/hotspot-psk.md` ou ce runbook.

---

## Contacts escalade

- **Ops / infra Railway** : Guillaume (CTO)
- **Développeur ADR-074** : Guillaume (CTO)
- **Canal Slack incident** : `#incidents-prod`
