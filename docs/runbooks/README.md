# Runbooks Neopro

Procédures pas-à-pas pour les opérations infra/ops non-automatisées. Un runbook = checklist actionnable, pas un design doc.

## Plan NOW (staging setup — avril 2026)

| #   | Runbook                                                                   | Objectif                                                                                              | Statut        |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| J1  | [Staging setup](J1-staging-setup.md)                                      | Créer Railway `central-server-staging` + DB + domaine `api-staging.kalonpartners.bzh` (Hostinger DNS) | 🟡 à exécuter |
| J2  | [Cloudflare Pages dashboard](J2-cloudflare-pages-dashboard.md)            | Dashboard `neopro-exg.pages.dev` sur Cloudflare Pages + PR previews (Option A, sans custom domain)    | 🟡 à exécuter |
| J3  | [Anonymized prod dump](J3-anonymized-prod-dump.md)                        | Script anonymisation + restore hebdo                                                                  | ✅ exécuté    |
| J4  | [Split CI/CD + branch protection](J4-cicd-split-and-branch-protection.md) | staging auto + prod gated review + protect main                                                       | ✅ exécuté    |
| J5  | [Onboarding Gabin](J5-onboarding-gabin.md)                                | Accès, docs, TEAM.md                                                                                  | 🟡 à exécuter |

## Ops récurrentes (à écrire post-J5)

- Restore DB depuis backup (test mensuel)
- Rotate JWT_SECRET
- Rollback déploiement prod
- Incident critique (ex. Pi offline massif)

## Référence

- [ADR-091](../adr/ADR-091-environnement-staging.md) — stratégie 3-env
