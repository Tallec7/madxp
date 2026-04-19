# ADR-071: Migration du hosting frontend (dashboard + SaaS) vers Cloudflare Pages

**Date** : 2026-04-19
**Statut** : Accepté — cutover en cours (pipeline déployé, DNS non basculé)
**Format** : Léger

---

## Contexte

Le dashboard central (`neopro-admin.kalonpartners.bzh`) et l'app SaaS (`/saas/`) sont hébergés sur Hostinger mutualisé et déployés via FTP (`SamKirkland/FTP-Deploy-Action` avec `dangerous-clean-slate: true`).

À l'échelle actuelle (~10 clients), des 404 intermittents surviennent sur les routes SPA profondes (`/saas/remote?site=…`, `/sites/<uuid>`) — cause : le `.htaccess` SPA-fallback peut être absent ou supprimé après clean-slate FTP (bug connu des dotfiles), et le verify CI ne testait que la racine. Un fix CI ([PR #481](https://github.com/Tallec7/neopro/pull/481)) sécurise l'upload et ajoute du monitoring, mais ne traite pas la racine du problème.

Avec la cible PI-2/PI-3 (100 sites SaaS + 50 admins simultanés), cette archi ne tient pas :

- FTP + clean-slate = fenêtre de downtime 30-60s par release
- Pas de rollback atomique, pas de preview branches
- Pas de CDN edge (latence hors France)
- Apache mutualisé non tunable, logs inaccessibles
- Zéro observabilité front en prod

## Décision

Migrer le hosting frontend (dashboard + SaaS) vers **Cloudflare Pages** :

- Build unifié via [scripts/build-pages.sh](../../scripts/build-pages.sh) qui assemble dashboard + SaaS dans `dist-pages/` avec `_redirects` et `_headers` déclaratifs.
- Workflow [.github/workflows/cloudflare-pages.yml](../../.github/workflows/cloudflare-pages.yml) qui build + deploy à chaque push sur `main` et génère un preview URL par PR.
- Routing SPA déclaratif via [`pages/_redirects`](../../pages/_redirects), plus d'`.htaccess` Apache.
- Security headers + cache-control versionnés dans [`pages/_headers`](../../pages/_headers).
- Deploys atomiques immuables, rollback 1-clic via le dashboard Cloudflare.
- CDN edge global (200+ PoPs), TLS géré.
- DNS `neopro-admin.kalonpartners.bzh` → CNAME vers le projet Pages.

## Alternatives rejetées

- **Rester sur Hostinger + renforcer les verifs CI** : le fix CI (PR #481) réduit le risque mais ne résout ni le downtime, ni la latence, ni l'absence de rollback, ni la préview par PR.
- **Netlify** : équivalent fonctionnel à Cloudflare Pages, mais CDN moins étendu et tarification build-minutes moins favorable au trafic prévu.
- **Vercel** : orienté Next.js/SSR, surcoût injustifié pour du SPA Angular statique.
- **VPS dédié + nginx** : contrôle total mais coût opérationnel (patching, monitoring, TLS renew) non justifié pour du statique.
- **Railway static hosting** : pas de CDN edge global, contrainte géographique.

## Conséquences

- **+** Zéro downtime deploys, rollback instantané, preview branches par PR.
- **+** Latence TTFB divisée par ~3-5 hors France (CDN edge).
- **+** Suppression du risque dotfile/FTP/clean-slate (plus de `.htaccess`, plus de FTP).
- **+** `_redirects` versionné et reviewable en PR (vs `.htaccess` black-box sur serveur).
- **+** Logs d'accès Cloudflare, Web Analytics gratuits.
- **−** Dépendance Cloudflare (vendor lock-in léger, mitigé par portabilité du build statique : `dist-pages/` reste déployable sur n'importe quel static host).
- **−** Coût migration ~1 jour dev + coordination DNS TTL.
- **−** Le `.htaccess` Apache et la logique `raspberry/src/saas-htaccess` deviendront obsolètes (à supprimer post-cutover).

## Cutover — procédure manuelle

Le pipeline code-side est en place. Étapes humaines restantes (à exécuter par un owner du domaine/Cloudflare) :

### 1. Création du projet Cloudflare Pages

Via dashboard Cloudflare :

1. Pages → Create a project → Connect to Git → repo `Tallec7/neopro`
2. Project name : `neopro-admin`
3. Production branch : `main`
4. Build settings :
   - Framework preset : `None`
   - Build command : `bash scripts/build-pages.sh`
   - Build output directory : `dist-pages`
   - Root directory : `/`
   - Environment variables : `NODE_VERSION=22`
5. Save and Deploy → vérifier que la build réussit et que le preview URL `*.pages.dev` sert les routes profondes :
   ```bash
   curl -sI https://<preview>.pages.dev/sites/probe         # attendu : 200
   curl -sI https://<preview>.pages.dev/saas/remote?site=p  # attendu : 200
   curl -sI https://<preview>.pages.dev/saas/tv?site=p      # attendu : 200
   ```

### 2. Secrets GitHub (pour le workflow CF Pages)

Repo Settings → Secrets and variables → Actions :

- `CF_API_TOKEN` : créer un API token Cloudflare avec le template "Edit Cloudflare Workers" restreint au scope `Cloudflare Pages:Edit` sur le compte concerné.
- `CF_ACCOUNT_ID` : visible dans n'importe quelle page du dashboard Cloudflare (sidebar droite).

Le workflow détecte automatiquement la présence des secrets ; tant qu'ils manquent, il se contente de valider le build sans déployer.

### 3. Bascule DNS

1. Dans le projet Pages → Custom domains → `neopro-admin.kalonpartners.bzh`.
2. Cloudflare génère la CNAME cible (format `<project>.pages.dev`).
3. Avant de toucher le DNS : **baisser le TTL à 300s** sur l'enregistrement actuel (Hostinger) et attendre l'ancien TTL (souvent 1h) pour que la bascule soit instantanée.
4. Mettre à jour le CNAME chez le registrar.
5. Vérifier la propagation :
   ```bash
   dig +short neopro-admin.kalonpartners.bzh CNAME
   curl -sI https://neopro-admin.kalonpartners.bzh/          # CF-Ray header présent
   curl -sI https://neopro-admin.kalonpartners.bzh/sites/p   # 200
   curl -sI https://neopro-admin.kalonpartners.bzh/saas/remote?site=p  # 200
   ```

### 4. Nettoyage post-cutover (follow-up PR)

Une fois la prod stable pendant 24-48h sur Cloudflare Pages :

- Supprimer `central-dashboard/.htaccess`, `raspberry/src/saas-htaccess`, l'entrée `.htaccess` dans `central-dashboard/angular.json` (assets).
- Supprimer les jobs `deploy-dashboard` et `deploy-saas` de `.github/workflows/release.yml`.
- Supprimer les secrets `HOSTINGER_FTP_*` du repo.
- Désactiver ou laisser en lecture seule l'espace Hostinger (conserver 30j comme fallback, puis résilier).
- Mettre à jour ce ADR en statut "Accepté — cutover complet".
- Ajouter l'entrée dans `docs/guides/TROUBLESHOOTING.md` (runbook Pages : cache purge, rollback, preview URLs).

## Fichiers impactés

**Ajoutés dans cette itération** :

- `pages/_redirects` — règles SPA fallback (`/saas/*` → `/saas/index.html`, `/*` → `/index.html`).
- `pages/_headers` — security headers + cache-control.
- `scripts/build-pages.sh` — assemble `dist-pages/` à partir des deux builds Angular.
- `.github/workflows/cloudflare-pages.yml` — build + deploy Pages.
- `package.json` — script `build:pages`.
- `.gitignore` — exclure `dist-pages/`.

**À supprimer post-cutover** :

- `central-dashboard/.htaccess`
- `raspberry/src/saas-htaccess`
- `central-dashboard/angular.json` (entrée assets `.htaccess`)
- `.github/workflows/release.yml` — jobs `deploy-dashboard` et `deploy-saas`
- Le workflow `frontend-health.yml` reste utile (probe les routes publiques, quel que soit le host).

## Références

- [PR #481](https://github.com/Tallec7/neopro/pull/481) — fix CI + monitoring qui a révélé la racine du problème
- [TROUBLESHOOTING §45](../guides/TROUBLESHOOTING.md) — runbook incident SPA 404
- Cloudflare Pages docs : https://developers.cloudflare.com/pages/
