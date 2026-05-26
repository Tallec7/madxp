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

| Item                 | Résultat                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Railway PG version   | 18.3 (compatible ascendant dump PG 17)                                                                                                |
| Durée restore        | ~2min 18s (dump 13 MB)                                                                                                                |
| Erreurs résiduelles  | 15 (toutes Supabase-specific bénignes : event triggers `extensions.grant_*`, `pg_graphql`, `supabase_vault` — non utilisés par MadXP) |
| Tables restaurées    | 57 / 57                                                                                                                               |
| Functions restaurées | 29                                                                                                                                    |
| DB size finale       | 53 MB (vs 71 MB source — delta = metadata Supabase supprimée)                                                                         |

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

1. https://railway.app → projet MadXP
2. `+ New` → `Database` → `Add PostgreSQL`
3. Renommer le service → `postgres-staging`
4. Postgres version : choisir **17** (match source)

Option B — via CLI :

```bash
railway login
railway link  # sélectionner le projet MadXP
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

1. ~~Me donner le `DATABASE_URL` Railway staging~~ ✅ fait
2. ~~Date fenêtre cutover production~~ ✅ exécutée 2026-04-19
3. ~~Confirmer plan Railway (Hobby vs Pro)~~ ✅ Hobby retenu

---

## Phase 2 — Cutover production exécuté ✅ (2026-04-19 ~10h30 UTC)

### Résultats

| Étape                                    | Durée   | Résultat                                                            |
| ---------------------------------------- | ------- | ------------------------------------------------------------------- |
| Snapshot checksums Supabase (source)     | ~5 s    | 8 tables, hashes capturés                                           |
| `pg_dump` Supabase → dump custom         | ~13 s   | 13 MB                                                               |
| Wipe + prepare `postgres-prod` (Railway) | ~3 s    | Extensions `uuid-ossp`, `pgcrypto`, `pg_stat_statements` installées |
| `pg_restore` → Railway postgres-prod     | ~8 s    | 15 erreurs résiduelles (Supabase triggers bénignes)                 |
| Snapshot checksums Railway (dest)        | ~2 s    | 8 tables identiques                                                 |
| Diff source ↔ dest                       | instant | ✅ **CHECKSUMS MATCH 100%**                                         |
| Bascule `DATABASE_URL` central-server    | ~30 s   | Redeploy auto Railway                                               |
| Health check `/health`                   | ~1 min  | `{"database": "healthy", "latencyMs": 9}`                           |

### Métriques post-cutover

- **Latence DB** : 166 ms (Supabase EU-West-2) → **9 ms** (Railway interne) — x18
- **Circuit breaker** : CLOSED
- **Pi heartbeats** : frais (< 2 min)
- **Supabase** : figé en read-only à 10:34:59 UTC (clean cutover, ~3-4 min de fenêtre de données perdues)

### Rollback possible jusqu'à

**2026-05-03** (J+14) — Supabase tenu en hot standby via mirror quotidien.

Procédure rollback :

1. Railway Variables → `central-server` → `DATABASE_URL` = URL Supabase
2. Redeploy → health 200
3. Investiguer Railway à froid

---

## Phase 3 — Stratégie de backup triangulaire ✅ (2026-04-19)

### Chaîne en place

```
Railway postgres-prod  ──pg_dump daily 03:00 UTC──▶  Hostinger FTP /db-backups/ (30j retention)
                                                   ╲
                                                    ▶  Supabase (wipe + restore + checksum diff)
```

Implémenté dans [`.github/workflows/db-backup.yml`](../../.github/workflows/db-backup.yml).

### Validation end-to-end (run #4, 2026-04-19 11:19 UTC)

| Étape                          | Durée          |
| ------------------------------ | -------------- |
| Install PostgreSQL 18 + lftp   | 20 s           |
| Dump Railway                   | 38 s           |
| Upload Hostinger FTP           | 9 s            |
| Mirror Supabase (wipe+restore) | 2 min 3 s      |
| Verify checksums               | 3 s            |
| **Total**                      | **3 min 16 s** |

### Garde-fous anti-régression

Tous les bugs rencontrés pendant la mise au point sont désormais interceptés :

| Bug rencontré                              | Garde-fou actuel                                         |
| ------------------------------------------ | -------------------------------------------------------- |
| pg_dump PG16 vs server PG18                | `echo "/usr/lib/postgresql/18/bin" >> $GITHUB_PATH`      |
| Hostinger FTP cert mismatch                | `set ssl:verify-certificate no`                          |
| `cls --date-format` invalide               | Retrait complet, purge via `grep` sur `cls -l`           |
| Supabase `schema_migrations` duplicate key | `DROP SCHEMA supabase_migrations CASCADE` ajouté au wipe |
| Restore silencieusement partiel            | `SELECT count(*) FROM pg_tables ... < 4 → exit 1`        |
| Checksum Supabase avec search_path bancal  | SQL schema-qualifié (`public.sites`) + `SET search_path` |

### Supervision

- **Failure email GitHub** : notifié automatiquement sur workflow_dispatch ou schedule failure
- **Dashboard** : https://github.com/Tallec7/neopro/actions/workflows/db-backup.yml
- **Règle ops** : 2 échecs consécutifs = RPO > 48h → investiguer immédiatement (cf. [TROUBLESHOOTING § Workflow db-backup](../guides/TROUBLESHOOTING.md#workflow-db-backup-github-actions-échoue-post-migration-railway))

---

## Phase 4 — Sunset Supabase (J+14, 2026-05-03)

- [ ] Vérifier que le workflow a tourné 14 jours consécutifs sans échec critique
- [ ] Basculer `SUPABASE_URL` en mode **décommissionnable** (arrêt du mirror)
- [ ] Décider : garder le projet Supabase en freeze pour compliance ou le supprimer
- [ ] Retirer références `pooler.supabase.com` dans le code (`updates.controller.ts:385` packageUrl check)
- [ ] Mettre ce runbook en `Archived`
