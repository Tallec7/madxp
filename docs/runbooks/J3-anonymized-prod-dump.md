# Runbook J3 — Restaurer un dump prod anonymisé sur staging

> **Objectif** : avoir des sites/users/vidéos réels (anonymisés) dans staging pour démos et tests, sans exposer aucune PII prod.
> **Pré-requis** : J1 + J2 terminés. `pg_dump` ≥ 16 installé localement (`/opt/homebrew/opt/postgresql@18/bin/pg_dump`).
> **Niveau de risque** : 🟠 modéré — on lit la prod (DUMP read-only) puis on écrit sur staging. Aucune écriture prod.
>
> **Conformité RGPD** : la DB staging contiendra des données dérivées de la prod **avec** PII anonymisée. Tout dump intermédiaire (`/tmp/prod-data.sql`) doit être supprimé après restore (cf. checklist).

---

## Étape 1 — Préparer les variables (~2 min)

```bash
# Récupérer les URLs publiques (Railway → Variables)
export PROD_DATABASE_PUBLIC_URL='postgresql://...@<prod-host>.railway.app:.../railway'
export STAGING_DATABASE_PUBLIC_URL='postgresql://...@<staging-host>.railway.app:.../railway'

# Vérification : ne JAMAIS confondre
echo "PROD    → $PROD_DATABASE_PUBLIC_URL"
echo "STAGING → $STAGING_DATABASE_PUBLIC_URL"
```

⚠️ **Garde-fou mental** : si l'URL staging contient `production` ou si l'URL prod ne contient ni `prod` ni le hostname connu de prod, **STOP**.

## Étape 2 — Dumper les données prod (~5 min)

On dump uniquement les **données** (le schéma staging est déjà à jour via full-schema.sql + migrations). On exclut les tables volumineuses ou éphémères qui n'apportent rien en staging.

```bash
/opt/homebrew/opt/postgresql@18/bin/pg_dump \
  --data-only \
  --no-owner --no-acl \
  --disable-triggers \
  --exclude-table-data='public.video_plays' \
  --exclude-table-data='public.advertiser_impressions' \
  --exclude-table-data='public.metrics' \
  --exclude-table-data='public.audit_logs' \
  --exclude-table-data='public.remote_commands' \
  --exclude-table-data='public.alerts' \
  --exclude-table-data='public.config_history' \
  --exclude-table-data='public.refresh_tokens' \
  --exclude-table-data='public.password_reset_tokens' \
  --exclude-table-data='public.user_invitations' \
  --exclude-table-data='public.club_sessions' \
  "$PROD_DATABASE_PUBLIC_URL" \
  > /tmp/prod-data.sql

ls -lh /tmp/prod-data.sql  # taille attendue : 1-50 MB selon volume
```

## Étape 3 — Reset complet de la DB staging (~3 min)

Pour restore propre, on repart d'un schéma vierge.

```bash
# 1. Drop + recreate du schéma public
psql "$STAGING_DATABASE_PUBLIC_URL" <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL

# 2. Bootstrap depuis full-schema.sql
psql "$STAGING_DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=0 \
  -f central-server/src/scripts/full-schema.sql

# 3. Marquer toutes les migrations comme appliquées
cd central-server && \
  DATABASE_URL="$STAGING_DATABASE_PUBLIC_URL" DATABASE_SSL=false \
  npm run db:migrate -- --mark-all-applied
cd ..
```

## Étape 4 — Restaurer les données prod sur staging (~5 min)

```bash
psql "$STAGING_DATABASE_PUBLIC_URL" \
  -v ON_ERROR_STOP=0 \
  --single-transaction \
  -f /tmp/prod-data.sql

# Erreurs probables (bénignes) :
#   - DUPLICATE KEY sur les rows seedées par full-schema.sql (ex: enum tables)
#     → ignorer, ON_ERROR_STOP=0 continue
#   - SET row_security : ignorer
```

## Étape 5 — Anonymiser (~1 min)

⚠️ **Avant de lancer**, modifier `anonymize-staging.sql` ligne ~120 pour mettre le vrai hash bcrypt de l'admin staging :

```bash
node -e "console.log(require('bcrypt').hashSync('StagingAdmin2026!', 10))"
# Coller le résultat dans la ligne YOUR_HASH_HERE_REPLACE_BEFORE_RUN
```

Puis :

```bash
psql "$STAGING_DATABASE_PUBLIC_URL" \
  -v ON_ERROR_STOP=1 \
  -f central-server/src/scripts/anonymize-staging.sql
```

Le script affiche en sortie :

- compteurs `users / sites / advertisers / videos`
- la liste des emails non-anonymisés (doit être **vide** sauf `admin@kalonpartners.bzh`)

## Étape 6 — Redémarrer l'API staging (~1 min)

Le pool PG cache les rows ; on force un redéploi pour repartir clean.

```bash
railway redeploy --service central-server-staging --yes
```

## Étape 7 — Vérifications (~5 min)

```bash
# 1. Login admin staging fonctionne
curl -X POST https://api-staging.kalonpartners.bzh/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kalonpartners.bzh","password":"StagingAdmin2026!"}' \
  | jq '.user.email'   # → "admin@kalonpartners.bzh"

# 2. Sites visibles avec noms anonymisés
TOKEN=$(curl -s -X POST https://api-staging.kalonpartners.bzh/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kalonpartners.bzh","password":"StagingAdmin2026!"}' \
  | jq -r '.token')

curl -s https://api-staging.kalonpartners.bzh/api/sites \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.[] | {site_name, club_name}' | head -20
# → tous doivent commencer par "Site Staging" / "Club Staging"

# 3. Aucune fuite d'email prod
curl -s https://api-staging.kalonpartners.bzh/api/users \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.[].email' | grep -v '@staging.test\|@kalonpartners.bzh' || echo "OK aucune fuite"
```

## Étape 8 — Cleanup obligatoire (~1 min)

```bash
shred -u /tmp/prod-data.sql 2>/dev/null || rm -P /tmp/prod-data.sql
ls /tmp/prod-data.sql 2>&1 | grep -q "No such" && echo "OK dump supprimé"

# Purge l'historique shell (au cas où les credentials seraient dedans)
unset PROD_DATABASE_PUBLIC_URL STAGING_DATABASE_PUBLIC_URL
```

---

## Checklist finale J3

- [ ] Dump prod réalisé (`--data-only`, tables sensibles exclues)
- [ ] DB staging reset + bootstrap depuis `full-schema.sql`
- [ ] Restore data prod réussi (`--single-transaction`)
- [ ] `anonymize-staging.sql` lancé avec succès — sortie : 0 emails prod résiduels
- [ ] API staging redéployée
- [ ] Login admin staging OK
- [ ] `/api/sites` retourne des "Site Staging X" (anonymisés)
- [ ] **`/tmp/prod-data.sql` supprimé** (RGPD)

**Livrable** : staging avec ~50 sites + users + advertisers + vidéos réels mais anonymisés. Prêt pour démos et J4 (split CI/CD).

## Rollback

Tout est isolé. Pour annuler : refaire les étapes 3-5 (reset + bootstrap + admin seed) sans l'étape 4. Prod jamais touchée.

## Cadence recommandée

Refresh staging mensuel (1er du mois) ou avant chaque démo importante. Le runbook complet prend ~20 min.

## Références

- [ADR-091](../adr/ADR-091-environnement-staging.md) — stratégie 3-env
- [Runbook J1](J1-staging-setup.md) — création env staging
- [Runbook J2](J2-cloudflare-pages-dashboard.md) — dashboard Cloudflare
- [anonymize-staging.sql](../../central-server/src/scripts/anonymize-staging.sql) — script SQL
