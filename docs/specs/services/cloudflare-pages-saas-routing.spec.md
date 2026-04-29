---
status: actif
last-update: 2026-04-29
domain: hosting
---

# Cloudflare Pages — Routing SaaS sous /saas/

## Pourquoi cette spec

Cloudflare Pages **n'honore pas** la règle wildcard `_redirects` `/saas/* /saas/index.html 200` pour les sous-paths nested SPAs. Bug plateforme connu, pas de workaround côté `_redirects` seul.

Conséquence : un user qui visite `https://neopro-admin.kalonpartners.bzh/saas/remote?site=X` se voit servir le HTML du dashboard (avec `<base href="/">`), pas le SaaS — toutes les ressources (chunks JS, assets) chargent depuis le mauvais base et plantent en MIME error.

## Règles métier

### Routes SaaS supportées (cf. `raspberry/src/app/app.routes.ts`)

- `/saas/` (root)
- `/saas/login`
- `/saas/remote`
- `/saas/tv` (redirect → `/saas/display/0`)
- `/saas/secondary` (redirect → `/saas/display/1`)
- `/saas/display/0..3`

### Workaround : route stubs statiques

- Le script `scripts/cloudflare-saas-route-stubs.sh` est exécuté en fin de `build:cloudflare:prod` (npm script).
- Il crée des copies physiques de `dist/central-dashboard/browser/saas/index.html` à chaque path de route ci-dessus.
- Cloudflare sert alors un fichier réel pour chaque deep-link → router Angular SaaS prend le relais côté client.

### Si une nouvelle route SaaS est ajoutée

**Mettre à jour `scripts/cloudflare-saas-route-stubs.sh` dans la même PR.** Sans ça, la nouvelle route servira le HTML dashboard (404 styled) au lieu du SaaS.

### Verify CI content-aware

Le step "Verify deployment" du job `deploy-frontend-cloudflare` dans `release.yml` ne vérifie plus uniquement le status HTTP 200, mais aussi que le HTML servi sous `/saas/*` contient `<base href="/saas/">` (pas `/`). Sans cette assertion, un faux positif peut passer en prod (cf. incident bascule prod 2026-04-29).

## Cas d'edge connus

- **Routes dynamiques `display/:n` au-delà de 3** : non couvertes. Si un client utilise plus de 4 displays, il faudra étendre la boucle dans le script (ou migrer vers Pages Functions middleware).
- **Routes futures non énumérées** : invisible jusqu'à ce qu'un user hit l'URL en prod. Mitigation : ajouter une assertion dans le content-aware verify pour chaque nouvelle route.

## Référence

- [ADR-071](../../adr/ADR-071-frontend-hosting-migration-cloudflare-pages.md)
- [Script](../../../scripts/cloudflare-saas-route-stubs.sh)
- [Routes SaaS](../../../raspberry/src/app/app.routes.ts)
