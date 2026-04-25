# Environnements & Delivery System Neopro

> Source de vérité : qui déploie quoi, où, comment. À tenir à jour à chaque modif d'infra ou de workflow CI/CD.

**Dernière mise à jour** : 25 Avril 2026 (Sprint 0+1+2 + hotfix Dockerfile #595 — programme delivery system audit CTO)

---

## 1. Vue d'ensemble

```
┌──────────────┐  push   ┌──────────────┐  merge  ┌──────────────┐  tag    ┌──────────────┐
│  Dev local   │ ──PR──► │   Staging    │ ──main──► │  Pre-prod   │ ──manuel─► │     Prod    │
│  dev:seed    │  + CI   │  api-staging │ + Gabin  │  (= staging  │  GitHub  │  Railway     │
│              │  + smoke│  + 1 Pi NLF* │  validé  │   stable)    │  Env gate│  + Hostinger │
└──────────────┘         └──────────────┘          └──────────────┘          └──────────────┘
                                ▲                                                      │
                                └─── dump prod scrubé hebdo ──────────────────────────┘
```

\* Pi staging permanent à provisionner — Sprint 1.

---

## 2. Mapping env × ressources

| Env           | API                                        | DB                                   | Dashboard                                  | SaaS                         | Pi cible                  | Branche source                    |
| ------------- | ------------------------------------------ | ------------------------------------ | ------------------------------------------ | ---------------------------- | ------------------------- | --------------------------------- |
| **Dev local** | `localhost:3001` (`npm run dev:seed`)      | PG local seed (port 5432)            | `localhost:4300`                           | `localhost:4200` (mode saas) | Pi local de test          | n'importe                         |
| **Staging**   | `api-staging.kalonpartners.bzh`            | PG Railway staging                   | Cloudflare Pages (auto sur `main`)         | Cloudflare Pages `/saas/`    | À provisionner (Sprint 1) | `main` (auto)                     |
| **Prod**      | `neopro-central-production.up.railway.app` | PG Railway prod (port 5432, ADR-070) | Hostinger `neopro-admin.kalonpartners.bzh` | Hostinger `/saas/`           | Flotte 50+ Pi clients     | tag sémantique (semantic-release) |

**URLs prod canoniques** :

- API : `https://neopro-central-production.up.railway.app`
- Dashboard : `https://neopro-admin.kalonpartners.bzh` (⚠️ `admin-neopro` est NXDOMAIN)
- SaaS : `https://neopro-admin.kalonpartners.bzh/saas/`
- Vidéos FTP : `https://kalonpartners.bzh/neopro-video/`

---

## 3. Plateformes externes (récap)

| Plateforme           | Rôle                                                              | Critique ?                         |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| **Railway**          | API prod + DB prod + DB staging + API staging                     | 🔴 Oui (cœur métier)               |
| **Hostinger**        | Dashboard prod + SaaS prod (FTP) + backup DB FTP + storage vidéos | 🟠 Important (frontend + backups)  |
| **Cloudflare Pages** | Frontend staging (dashboard + saas)                               | 🟡 Non bloquant (rebuild possible) |
| **GitHub Pages**     | Scripts d'install Pi (`raspberry/scripts/setup.sh`)               | 🟡 Non bloquant                    |

**Plateformes retirées (Sprint 0 cleanup, Avril 2026)** :

- ❌ Render.com (legacy démo Socket.IO `neopro.onrender.com` — `render.yaml` supprimé)
- ❌ Supabase (mirror DB hot-standby — étape `db-backup.yml` retirée, secret peut rester pour réactivation future)

---

## 4. Pipelines CI/CD

### 4.1 — `ci.yml` (sur PR + push main/develop)

Jobs en parallèle :

1. **central-server** — lint, typecheck, tests Jest (2728), **smoke tests (1655)**, build, upload coverage
2. **central-dashboard** — lint, tests Karma (520), build prod, upload coverage
3. **sync-agent** — tests Jest (raspberry/sync-agent)
4. **webapp** — lint raspberry, build raspberry config
5. **coverage** — agrégation Codecov

**Gate à venir (Sprint 2)** : `migration-check.yml` — bloque si migration `.sql` non rejouable.

### 4.2 — `release.yml` (sur push main)

semantic-release → version bump → build raspberry archive → release GitHub → 3 deploys parallèles :

- `deploy-dashboard` — FTP Hostinger root, vérif SPA fallback
- `deploy-saas` — FTP Hostinger `/saas/`, vérif `.htaccess` + deep routes
- `deploy-railway` — bump `__manual_deploy_only__/trigger.md` + commit (hack à supprimer Sprint 2)

Tous les 3 jobs gates par GitHub Environment `production` (required reviewer).

### 4.3 — `db-backup.yml` (cron 03:00 UTC quotidien)

`pg_dump` Railway prod → upload Hostinger FTP `/public_html/neopro-video/db-backups/` → purge >30j.
**Mirror Supabase + checksums supprimés Sprint 0.**

### 4.4 — `frontend-health.yml` (cron \*/10 min + post-release)

Probes SPA deep routes sur `neopro-admin.kalonpartners.bzh` — détecte `.htaccess` cassé après FTP clean-slate.

### 4.5 — `railway-restart.yml` (cron dimanche 04:00 UTC)

⚠️ **Workaround memory leak non investigué** — issue ouverte Sprint 0, à supprimer après 14j observation.

### 4.6 — `publish-install-scripts.yml` (sur push main, paths `raspberry/scripts/`)

Publie `setup.sh` et configs Pi sur GitHub Pages → `https://kalonpartners.github.io/neopro/`.

### 4.7 — `weekly-report.yml` (cron vendredi 16:00 UTC)

Rapport hebdo PR + commits → mail.

---

## 5. Secrets critiques

> Source de vérité **GitHub Secrets** + backup chiffré offline (Sprint 1 — 1Password vault recommandé).

| Secret                       | Usage                                                                                            | Rotation                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `RAILWAY_TOKEN`              | CLI Railway (restart, deploy)                                                                    | Annuelle                                                           |
| `RAILWAY_PROD_URL`           | DB dump                                                                                          | Sur compromission                                                  |
| `HOSTINGER_FTP_*`            | Deploy dashboard/saas + backup DB                                                                | Annuelle                                                           |
| `RELEASE_TOKEN`              | semantic-release push tags + commits trigger                                                     | Annuelle                                                           |
| `CODECOV_TOKEN`              | Upload coverage                                                                                  | Optionnel                                                          |
| `HOTSPOT_PSK_ENCRYPTION_KEY` | Chiffrement PSK Pi (ADR-074) — **CRITIQUE : si perdu, toute la flotte hotspot est inutilisable** | Jamais (sauf compromission, avec re-chiffrement de toute la table) |
| `JWT_SECRET`                 | Signature tokens auth                                                                            | Tous les 6 mois (avec invalidation sessions)                       |

**`SUPABASE_URL`** retiré de l'usage actif (Sprint 0). Conservé GitHub Secrets si réactivation future.

---

## 6. Flow de validation Gabin avant prod (Sprint 1)

1. PR ouverte → CI passe → label `needs-gabin` ou `tech-only`
2. Si `needs-gabin` → mention Slack équipe / message direct Gabin → Gabin teste sur staging (URL dans description PR)
3. Gabin appose label `gabin-validated` ou commente
4. Merge main → release auto sur staging (Cloudflare Pages + Railway staging)
5. **Tag prod manuel** via GitHub Environment `production` — required reviewer
6. Frontend-health probe automatique post-deploy

Détails : voir `CONTRIBUTING.md` (Sprint 1).

---

## 7. À revisiter (chantiers différés)

À déclencher uniquement si trigger métier :

- **Migration Cloudflare Pages prod** (supprime FTP-Deploy + retry + force `.htaccess` + ~200 lignes YAML). Trigger : prochain incident FTP Hostinger.
- **Preview env Railway par PR**. Trigger : volume PR > 5/semaine.
- **Feature flags maison** (table `feature_flags` PG). Trigger : besoin réel kill switch sans redeploy.
- **Migration Karma → Vitest**. Trigger : Karma marqué EOL upstream.
- **Investigation memory leak Railway** (workflow `railway-restart.yml`). Trigger : issue active Sprint 0.

---

## 8. Référence rapide

| Question                                     | Réponse                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Comment déployer en prod ?                   | Push `main` → semantic-release → tag → approuver GitHub Environment `production` |
| Comment rollback prod ?                      | Railway dashboard → Deployments → Redeploy version précédente                    |
| Où est le backup DB le plus récent ?         | Hostinger FTP `/public_html/neopro-video/db-backups/neopro_YYYYMMDD_HHMMSS.dump` |
| Comment tester en local avec data réaliste ? | `npm run dev:seed`                                                               |
| Comment lancer les tests régression ?        | `npm run test:smoke:smart` (rapide) ou `npm run test:smoke` (complet)            |
| Qui peut tagger en prod ?                    | GitHub Environment `production` reviewers (super_admin de l'équipe)              |
| URL admin prod ?                             | `neopro-admin.kalonpartners.bzh` (PAS `admin-neopro`)                            |

---

## 9. Glossaire

- **Pre-prod** : pas un nouvel env, juste un état de staging stable (smoke E2E vert + Gabin validé) avant tag prod.
- **Canary** : cohorte 5 Pi recevant l'OTA J-3 avant flotte (à formaliser Sprint 2+).
- **Hot-standby** : terme retiré du vocabulaire — Supabase mirror supprimé Sprint 0.
