# ADR-070: Migration PostgreSQL Supabase → Railway + stratégie de backup triangulaire

**Date** : 2026-04-19
**Statut** : Accepté
**Décideurs** : Guillaume (Tech Lead)
**Supersède** : [ADR-003](ADR-003-postgresql-supabase.md)

---

## Contexte

La base de données MadXP était historiquement hébergée sur **Supabase Free** (cf. ADR-003, Oct 2024). En avril 2026, 3 frictions rendent cette solution inadéquate :

1. **Latence cross-region** : Supabase EU-West-2 (London) + Railway central-server EU-West-1 (Amsterdam) → ~166 ms DB round-trip (dégrade l'UX dashboard).
2. **Coûts cachés** : le Free plan pousse vers Pro (25 €/mois) dès qu'on veut backup auto ou pooling configurable.
3. **Dépendance sur des features Supabase non utilisées** : Auth (remplacé par JWT maison), RLS (remplacé par middleware applicatif), Storage (FTP Hostinger), Realtime (Socket.IO). Le seul besoin réel = Postgres vanilla.

État au moment de la décision :

- DB size : **71 MB** (9 sites, 6 users, 438 vidéos, 5656 video_plays, 12918 metrics, 24851 alerts, 107 audit_logs, 15 config_profiles).
- Railway Hobby = **5 $/mois** inclus, Postgres natif supporté.
- Contrainte : le plan Hobby **n'inclut pas de backup automatique** → il faut construire une stratégie de sauvegarde out-of-band.

## Décision

### 1. Migration Supabase → Railway PostgreSQL 18

- Héberger Postgres prod dans le projet Railway existant (service `postgres-prod`), accessible depuis `central-server` via l'**URL interne** (`postgres-prod.railway.internal:5432`) — egress gratuit, latence **9-12 ms**.
- Cutover **one-shot** (pas de dual-write) : 71 MB × 13 MB custom dump = **~3 min de downtime maîtrisé**.
- Conserver Supabase en **read-only hot standby 14 jours** après cutover (rollback possible).

### 2. Stratégie de backup triangulaire

Railway Hobby n'a pas de backup auto → on reconstruit la chaîne :

```
Railway postgres-prod  ──pg_dump daily 03:00 UTC──▶  Hostinger FTP /db-backups/ (30j retention)
                                                   ╲
                                                    ▶  Supabase (hot standby, wipe + restore)
                                                       └─── checksums diff Railway vs Supabase ───┐
                                                                                                   ▼
                                                                                             exit 1 si mismatch
```

Implémenté dans [`.github/workflows/db-backup.yml`](../../.github/workflows/db-backup.yml). 3 rôles distincts :

- **Hostinger FTP** : archive froide (compliance, restauration J-30).
- **Supabase mirror** : rollback rapide si Railway tombe (J-1 max, 2 min de switch `DATABASE_URL`).
- **Checksum diff** : détecte silencieusement la corruption / régression du workflow lui-même.

### 3. Garde-fous anti-régression (bugs vus en production)

Le workflow contient 3 garde-fous validés par des runs échoués avant stabilisation :

| Garde-fou                               | Bug intercepté                                                     | Code                                          |
| --------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| **Dump size ≥ 1 MB**                    | pg_dump produit un fichier vide → FTP écraserait un bon backup     | `if [ "$SIZE" -lt 1000000 ]; then exit 1`     |
| **Count tables critiques ≥ 4**          | Restore silencieusement partiel côté Supabase (search_path, perms) | `SELECT count(*) FROM pg_tables WHERE ... <4` |
| **Checksum Railway vs Supabase strict** | Dérive données / mirror corrompu                                   | `diff railway.txt supabase.txt → exit 1`      |

Toutes les sorties `|| true` qui pourraient masquer un échec sont proscrites dans les étapes critiques.

## Alternatives rejetées

- **Supabase Pro (25 €/mois)** : règle le backup auto mais pas la latence cross-region, et paie pour des features inutilisées (Auth, Storage, Realtime).
- **Railway PRO + backup auto (20 $/mois)** : surcoût x4 pour une DB de 71 MB. Rediscutable au-delà de 1 GB ou 50 sites Pi.
- **Neon / Crunchy / AWS RDS** : egress payant depuis Railway, complexité d'un 3e fournisseur pour un gain marginal.
- **Backup local (cron macOS)** : fragile (machine éteinte = pas de backup), pas auditable, pas de hot standby.
- **Replication logique Railway → Supabase en continu** : over-engineered pour 71 MB ; un dump+restore quotidien suffit à garantir RPO = 24h.

## Conséquences

### Positives

- **Latence DB divisée par 18** (166 ms → 9 ms) via URL interne Railway.
- **Budget DB stable à 5 $/mois** (vs 25 €/mois Supabase Pro projeté).
- **3 copies des données** en permanence (prod Railway + FTP J-30 + mirror Supabase J-1).
- **Rollback en 2 min** si Railway tombe : switch `DATABASE_URL` vers Supabase.
- **Audit trail CI-auditable** : chaque backup laisse une trace dans GitHub Actions avec status + logs.

### Négatives / risques

- **Dépendance GitHub Actions** : si GH Actions tombe, plus de backup. Mitigation : alerting natif (GitHub email sur workflow failure).
- **Supabase-specific edge cases** dans le mirror : extensions schema, `supabase_migrations` schema → tous fixés, mais c'est un code path fragile à maintenir.
- **RPO 24h** : un crash à 02:59 UTC perd ≤ 24h de données. Acceptable pour l'usage actuel (métriques + logs), à ré-évaluer si on stocke du transactionnel critique (paiements).
- **Coût cognitif** : 3 systèmes à comprendre au lieu d'un. Compensé par le runbook + ce ADR.

## Monitoring / supervision

- **Workflow failure** : GitHub envoie un email automatique à l'utilisateur qui a triggé le dernier run (ou au commit author pour le schedule).
- **Dashboard Actions** : https://github.com/Tallec7/madxp/actions/workflows/db-backup.yml → check daily.
- **Runbook de restauration** : [PROP-013-RUNBOOK.md § Rollback](../proposals/PROP-013-RUNBOOK.md)

**Règle opérationnelle** : si 2 runs consécutifs échouent, investiguer immédiatement — on est en RPO > 48h.

## Fichiers impactés

- `.github/workflows/db-backup.yml` — workflow GitHub Actions (nouveau)
- `docs/proposals/PROP-013-migrate-postgres-supabase-to-railway.md` — plan migration
- `docs/proposals/PROP-013-RUNBOOK.md` — runbook exécution + phases
- `.claude/rules/context.md` — stack DB (Supabase → Railway)
- `docs/adr/ADR-003-postgresql-supabase.md` — marqué Déprécié
- `docs/guides/TROUBLESHOOTING.md` — section backup workflow
- `docs/changelog/CHANGELOG.md` — entrée migration
- `central-server` env vars Railway : `DATABASE_URL` → URL interne `postgres-prod.railway.internal`
- Secrets GitHub : `RAILWAY_PROD_URL`, `SUPABASE_URL`, `HOSTINGER_FTP_*`

## Liens

- [PROP-013](../proposals/PROP-013-migrate-postgres-supabase-to-railway.md)
- [PROP-013 Runbook](../proposals/PROP-013-RUNBOOK.md)
- [ADR-003](ADR-003-postgresql-supabase.md) (déprécié)
- [ADR-015](ADR-015-railway-hobby-constraints.md)
