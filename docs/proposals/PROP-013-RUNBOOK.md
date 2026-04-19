# PROP-013 — Runbook migration Supabase → Railway

**Dernière mise à jour** : 2026-04-19

## Phase 0 — Audit & dry-run (exécuté)

### Mesures

| Item                                                      | Valeur                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Version Postgres source                                   | **17.6** (Supabase) — NB : PROP-013 indiquait 15, corrigé                                                                             |
| Taille DB                                                 | **71 MB**                                                                                                                             |
| Dump size (custom format, schémas applicatifs uniquement) | **13 MB**                                                                                                                             |
| Durée pg_dump local → Supabase                            | **~13 secondes**                                                                                                                      |
| Extensions requises                                       | `uuid-ossp`, `pgcrypto`, `pg_stat_statements`, `plpgsql`                                                                              |
| Extensions Supabase-only (exclues)                        | `pg_graphql` (0 usage code), `supabase_vault` (0 secrets)                                                                             |
| Schémas exclus du dump                                    | `auth`, `storage`, `realtime`, `graphql`, `graphql_public`, `vault`, `supabase_functions`, `extensions`, `pgsodium`, `pgsodium_masks` |

### Row counts & checksums de référence (snapshot 2026-04-19 ~11h30 UTC)

| Table           | Rows  | Checksum MD5(string_agg(id))       |
| --------------- | ----- | ---------------------------------- |
| sites           | 9     | `d57a9253a2ec2e05dc3793508ed6589c` |
| users           | 6     | `6e70d412d56cd4978fe0b845b1bcb983` |
| videos          | 438   | `95ccbb8120a7fdba2cad1d6beec07d67` |
| video_plays     | 5656  | `de6c37541195cef516d79c3a5bcabad1` |
| metrics         | 12918 | `f461442c85af750c0582713bf4f8032a` |
| alerts          | 24851 | `49cbc77df2ec2a85db57c3cb63e5e1da` |
| audit_logs      | 107   | `1d0c19344712182cf149cc768fdc7925` |
| config_profiles | 15    | `3b82c3c5a8b49da5d87d7c7520294409` |

> Ces checksums ne sont valables que si aucun write n'a lieu entre le snapshot et le dump final. Pour le cutover, **re-capturer juste avant passage en read-only**.

### Top tables par taille

alerts (12 MB) · metrics (12 MB) · video_plays (11 MB) · videos (8.6 MB) · remotion_render_jobs (7.2 MB)

### Verdict Phase 0

- Migration **triviale** vu la taille (71 MB total).
- Downtime cutover estimé : **<2 min** (dump 13s + restore ~5s + bascule DATABASE_URL).
- Aucun blocker identifié.

### Dump de référence

Fichier local : `/tmp/neopro-migration/neopro_20260419_1130.dump` (13 MB) — à **détruire** après validation staging (contient toute la donnée prod).

---

## Phase 1 — Staging validé ✅ (2026-04-19)

### Résultats restore sur Railway staging

| Item                 | Résultat                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Railway PG version   | 18.3 (compatible ascendant dump PG 17)                                                                                                 |
| Durée restore        | ~2min 18s (dump 13 MB)                                                                                                                 |
| Erreurs résiduelles  | 15 (toutes Supabase-specific bénignes : event triggers `extensions.grant_*`, `pg_graphql`, `supabase_vault` — non utilisés par Neopro) |
| Tables restaurées    | 57 / 57                                                                                                                                |
| Functions restaurées | 29                                                                                                                                     |
| DB size finale       | 53 MB (vs 71 MB source — delta = metadata Supabase supprimée)                                                                          |

### Checksums validés (identiques 100%)

| Table           | Rows  | Source MD5    | Railway MD5   | Match |
| --------------- | ----- | ------------- | ------------- | ----- |
| sites           | 9     | `d57a9253...` | `d57a9253...` | ✅    |
| users           | 6     | `6e70d412...` | `6e70d412...` | ✅    |
| videos          | 438   | `95ccbb81...` | `95ccbb81...` | ✅    |
| video_plays     | 5656  | `de6c3754...` | `de6c3754...` | ✅    |
| metrics         | 12918 | `f461442c...` | `f461442c...` | ✅    |
| alerts          | 24851 | `49cbc77d...` | `49cbc77d...` | ✅    |
| audit_logs      | 107   | `1d0c1934...` | `1d0c1934...` | ✅    |
| config_profiles | 15    | `3b82c3c5...` | `3b82c3c5...` | ✅    |

### Procédure validée pour le cutover

Avant chaque restore sur Railway, exécuter :

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, public;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
GRANT USAGE ON SCHEMA extensions TO public;
```

Puis :

```bash
pg_restore --no-owner --no-acl \
  --no-comments --no-publications --no-subscriptions --no-security-labels \
  -d "$RAILWAY_URL" neopro_<timestamp>.dump
```

### Reste à faire avant cutover (Phase 2)

1. **Validation applicative** — lancer central-server en local avec `DATABASE_URL=$RAILWAY_STAGING_URL` et vérifier :
   - Boot API sans erreur
   - `/health` 200
   - Login dashboard fonctionne (JWT lu depuis `users`)
   - Charger un site detail (lecture `sites`, `metrics`, `alerts`)

2. **Charge simulée 24-48h** — optionnel mais recommandé pour valider RAM/CPU Railway Hobby

3. **Provisionner `postgres-prod`** — 2e service Railway distinct (ne pas réutiliser staging)

---

## Anciennes étapes Phase 1 (conservées pour historique)

### Étape 1.1 — Créer service Postgres staging dans le projet Railway

Option A — via dashboard web :

1. https://railway.app → projet Neopro
2. `+ New` → `Database` → `Add PostgreSQL`
3. Renommer le service → `postgres-staging`
4. Postgres version : choisir **17** (match source)

Option B — via CLI :

```bash
railway login
railway link  # sélectionner le projet Neopro
railway add --database postgres
```

### Étape 1.2 — Récupérer DATABASE_URL staging

Dans le service Postgres staging :

- Variables → copier `DATABASE_URL` (ou `DATABASE_PUBLIC_URL` pour accès depuis ta machine)
- Le format : `postgresql://postgres:PWD@HOST.railway.app:PORT/railway`

### Étape 1.3 — Me donner le DATABASE_URL staging

Colle-moi la string complète (je la mets en variable temporaire, pas dans le repo). Je lance alors :

```bash
# Restore dump (10-30s attendus)
/opt/homebrew/opt/postgresql@17/bin/pg_restore \
  --no-owner --no-acl --clean --if-exists \
  -d "$RAILWAY_STAGING_URL" \
  /tmp/neopro-migration/neopro_20260419_1130.dump

# Vérifier checksums identiques
psql "$RAILWAY_STAGING_URL" -f /tmp/neopro-migration/verify-checksums.sql

# Smoke tests contre staging
DATABASE_URL="$RAILWAY_STAGING_URL" npm run test:smoke:smart
```

### Étape 1.4 — Production Railway (après validation staging)

Créer un 2e service `postgres-prod` (ou renommer staging en prod si validation OK).

- Plan : **Hobby** suffit (DB 71 MB, RAM ~512 MB nécessaire avec pool max 5)
- Activer backups auto Railway
- Notifier upgrade → Pro si latence dégradée en charge

---

## Scripts préparés

Je crée ces fichiers dans `/tmp/neopro-migration/` :

- `verify-checksums.sql` — relance les MD5 pour comparer avec la table ci-dessus
- `cutover.sh` — script cutover automatisé (exécutable par toi après Phase 1)

---

## Décisions restantes

1. **Me donner le `DATABASE_URL` Railway staging** dès que provisionné
2. Date fenêtre cutover production
3. Confirmer plan Railway (Hobby vs Pro)
