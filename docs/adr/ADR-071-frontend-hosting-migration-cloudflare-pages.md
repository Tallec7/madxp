# ADR-071: Migration du hosting frontend (dashboard + SaaS) vers Cloudflare Pages

**Date** : 2026-04-19 (mis à jour 2026-04-29)
**Statut** : Accepté — phase 1 (staging) livrée J2 ADR-091, phase 2 (scaffolding prod) livrée 2026-04-29, bascule DNS planifiée post-validation
**Format** : Léger

---

## Contexte

Le dashboard central (`neopro-admin.kalonpartners.bzh`) et l'app SaaS (`/saas/`) sont hébergés sur Hostinger mutualisé et déployés via FTP (`SamKirkland/FTP-Deploy-Action` avec `dangerous-clean-slate: true`).

À l'échelle actuelle (~10 clients), des 404 intermittents surviennent sur les routes SPA profondes (`/saas/remote?site=…`, `/sites/<uuid>`) — cause : le `.htaccess` SPA-fallback peut être absent ou supprimé après clean-slate FTP (bug connu des dotfiles), et le verify CI ne testait que la racine.

Avec la cible PI-2/PI-3 (100 sites SaaS + 50 admins simultanés), cette archi ne tient pas :

- FTP + clean-slate = fenêtre de downtime 30-60s par release
- Pas de rollback atomique, pas de preview branches
- Pas de CDN edge (latence hors France)
- Apache mutualisé non tunable, logs inaccessibles
- Zéro observabilité front en prod

## Décision

Migrer le hosting frontend (dashboard + SaaS) vers **Cloudflare Pages** :

- Push-to-deploy via Git (build cmd `npm run build:central && npm run build:saas`, output unifié vers `dist/` avec `/saas/` en sous-dossier).
- Routing SPA déclaratif via `_redirects` (`/saas/* /saas/index.html 200`, `/* /index.html 200`) versionné, plus de `.htaccess`.
- Deploys atomiques immuables, rollback 1-clic, preview par PR.
- CDN edge global, TLS géré.
- Intégration Sentry front + synthetic checks (UptimeRobot) sur routes profondes.

Conserver le DNS `neopro-admin.kalonpartners.bzh` via CNAME vers Pages, bascule progressive avec TTL court.

**Sparadrap court-terme** (déjà appliqué, ADR antérieur au présent) : dans `.github/workflows/release.yml` — force-upload `.htaccess` via curl après FTP, vérification deep-route `/saas/remote?site=ci-probe` et `/sites/ci-probe` en 200 avant de valider le deploy.

**Déclencheur de migration** : dès qu'on dépasse 30 sites SaaS actifs OU qu'un incident de deploy impacte les users en prod.

## Alternatives rejetées

- **Rester sur Hostinger + renforcer les verifs CI** : rejeté car ne résout pas le downtime, la latence, ni le rollback. Ne fait que déplacer le problème.
- **Netlify** : équivalent fonctionnel à Cloudflare Pages, mais CDN moins étendu et tarification build-minutes moins favorable au trafic prévu.
- **Vercel** : orienté Next.js/SSR, surcoût injustifié pour du SPA Angular statique.
- **VPS dédié + nginx** : contrôle total mais coût opérationnel (patching, monitoring, TLS renew) non justifié pour du statique.
- **Railway static hosting** : pas de CDN edge global, contrainte géographique.

## Conséquences

- **+** Zéro downtime deploys, rollback instantané, preview branches par PR.
- **+** Latence TTFB divisée par ~3-5 hors France (CDN edge).
- **+** Suppression du risque dotfile/FTP/clean-slate.
- **+** `_redirects` versionné et reviewable en PR (vs `.htaccess` black-box sur serveur).
- **−** Dépendance Cloudflare (vendor lock-in léger, mitigé par portabilité du build statique).
- **−** Coût migration ~1-2 jours dev + coordination DNS TTL.
- **−** Le `.htaccess` Apache et la logique `raspberry/src/saas-htaccess` deviendront obsolètes (à supprimer post-migration).

## Fichiers impactés

- `.github/workflows/release.yml` — remplacer jobs `deploy-dashboard` et `deploy-saas` par un trigger Pages (ou simplement laisser Pages suivre `main`).
- `central-dashboard/.htaccess` — à supprimer après migration.
- `raspberry/src/saas-htaccess` — à supprimer après migration (mode SaaS uniquement ; le Pi continue d'utiliser son propre `.htaccess` local).
- `central-dashboard/angular.json` — retirer l'entrée `.htaccess` des assets.
- Nouveau fichier `public/_redirects` (ou `dist/_redirects` injecté en build) avec les règles SPA.
- Nouveau fichier `public/_headers` pour CSP, HSTS, cache-control versionné.
- Documentation : `docs/technical/ARCHITECTURE.md` — section hosting frontend à mettre à jour.

## Mise en œuvre

### Phase 1 — Staging (✅ livrée — J2 ADR-091)

- Projet Cloudflare Pages `neopro-dashboard` actif sur `neopro-exg.pages.dev`
- `_redirects` + `_headers` versionnés dans `central-dashboard/cloudflare/`
- Preview deployments PR activés
- E2E nightly (`.github/workflows/e2e-staging.yml`) ciblent staging Cloudflare

### Phase 2 — Scaffolding prod (✅ livrée 2026-04-29)

- `raspberry/cloudflare/_redirects` + `_headers` créés (équivalent SaaS).
- `angular.json` : configurations `saas` + `saas-staging` recopient `cloudflare/_*` dans le build output.
- `.github/workflows/release.yml` : deux nouveaux jobs `deploy-dashboard-cloudflare` + `deploy-saas-cloudflare` (action `cloudflare/wrangler-action@v3`, `pages deploy`).
- **Feature flag** : `vars.HOSTING` (GitHub Environment `production`).
  - `HOSTING != 'cloudflare'` (défaut) → jobs Hostinger lftp actifs (régime actuel).
  - `HOSTING == 'cloudflare'` → jobs Cloudflare actifs, jobs Hostinger skippés.
  - Permet de basculer/rollback en flippant la variable, sans patch CI.
- Override SaaS public URL (custom domain post-NS migration) : `vars.SAAS_PUBLIC_BASE_URL`.

### Phase 3 — Bascule DNS prod (à planifier)

Pré-requis humains :

1. Migration NS de la zone `kalonpartners.bzh` vers Cloudflare.
2. Création des projets Cloudflare Pages `neopro-dashboard-prod` + `neopro-saas-prod`.
3. Custom domains `neopro-admin.kalonpartners.bzh` (et URL SaaS) attachés aux projets.
4. Secrets GitHub `production` : `CLOUDFLARE_API_TOKEN` (scope Pages:Edit), `CLOUDFLARE_ACCOUNT_ID`.
5. Variable GitHub `production` : `HOSTING=cloudflare` (active la bascule).
6. Soak window 7 jours minimum avant phase 4.

### Phase 4 — Décommission Hostinger frontend (post-soak)

Hors scope de cette PR (sera couvert par un commit séparé une fois la phase 3 stable) :

- Suppression `central-dashboard/.htaccess`, `raspberry/src/saas-htaccess` et entrées `assets` associées dans `angular.json`.
- Suppression jobs `deploy-dashboard` + `deploy-saas` (lftp) et secrets `HOSTINGER_FTP_*`.
