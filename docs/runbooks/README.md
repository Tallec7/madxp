# Runbooks Neopro

Procédures pas-à-pas pour les opérations infra/ops non-automatisées. Un runbook = checklist actionnable, pas un design doc.

## Plan NOW (staging setup — avril 2026)

| #   | Runbook                                                                   | Objectif                                                                                              | Statut      |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| J1  | [Staging setup](J1-staging-setup.md)                                      | Créer Railway `central-server-staging` + DB + domaine `api-staging.kalonpartners.bzh` (Hostinger DNS) | ✅ exécuté  |
| J2  | [Cloudflare Pages dashboard](J2-cloudflare-pages-dashboard.md)            | Dashboard `neopro-exg.pages.dev` sur Cloudflare Pages + PR previews (Option A, sans custom domain)    | ✅ exécuté  |
| J3  | [Anonymized prod dump](J3-anonymized-prod-dump.md)                        | Script anonymisation + restore hebdo                                                                  | ✅ exécuté  |
| J4  | [Split CI/CD + branch protection](J4-cicd-split-and-branch-protection.md) | staging auto + prod gated review + protect main                                                       | ✅ exécuté  |
| J5  | [Onboarding Gabin](J5-onboarding-gabin.md)                                | Accès, docs, TEAM.md                                                                                  | ⏸️ stand-by |

## Ops récurrentes

| Runbook                                                             | Objectif                                                       | Statut   |
| ------------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| [OPS-01 Rollback prod](OPS-01-rollback-prod.md)                     | Revenir à la version N-1 en cas d'incident post-deploy         | ✅ écrit |
| [OPS-02 Restore DB depuis backup](OPS-02-restore-db-from-backup.md) | Test mensuel du restore Supabase → staging (validation backup) | ✅ écrit |
| [OPS-03 Rotate JWT_SECRET](OPS-03-rotate-jwt-secret.md)             | Hygiène trimestrielle ou rotation d'urgence (compromission)    | ✅ écrit |
| [OPS-04 Incident Pi offline massif](OPS-04-pi-offline-massif.md)    | Triage + comms quand ≥ 5 Pi offline simultanément              | ✅ écrit |

## Logs ops

| Log                                        | Description                                 |
| ------------------------------------------ | ------------------------------------------- |
| [RESTORE-TEST-LOG.md](RESTORE-TEST-LOG.md) | Tracking mensuel des tests restore (OPS-02) |
| [JWT-ROTATION-LOG.md](JWT-ROTATION-LOG.md) | Tracking des rotations JWT_SECRET (OPS-03)  |
| [INCIDENT-LOG.md](INCIDENT-LOG.md)         | Historique incidents prod (OPS-01, OPS-04)  |

## Scripts associés

| Script                                                                 | Rôle                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`scripts/setup-e2e-staging.sh`](../../scripts/setup-e2e-staging.sh)   | Crée le compte E2E staging + secrets GitHub (one-shot)         |
| [`scripts/pre-prod-checklist.sh`](../../scripts/pre-prod-checklist.sh) | Vérifie staging avant tag prod (à lancer avant chaque release) |

## Calendrier

Voir [CALENDAR.md](CALENDAR.md) pour les fréquences (mensuel restore, trimestriel rotate JWT).

## Automatisations associées

| Workflow GitHub                                                      | Cron      | Rôle                                          |
| -------------------------------------------------------------------- | --------- | --------------------------------------------- |
| [`db-backup.yml`](../../.github/workflows/db-backup.yml)             | 03:00 UTC | Dump prod → Hostinger FTP + Supabase mirror   |
| [`e2e-staging.yml`](../../.github/workflows/e2e-staging.yml)         | 04:00 UTC | Playwright nightly contre staging (gate auto) |
| [`migration-check.yml`](../../.github/workflows/migration-check.yml) | sur PR    | Idempotence migrations SQL                    |
| [`release.yml`](../../.github/workflows/release.yml)                 | sur tag   | Deploy prod gated GitHub Environment          |

## Référence

- [ADR-091](../adr/ADR-091-environnement-staging.md) — stratégie 3-env
