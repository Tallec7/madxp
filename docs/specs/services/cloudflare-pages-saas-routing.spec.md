---
status: actif
last-update: 2026-04-29
domain: hosting
---

# Cloudflare Pages — Routing SaaS sous /saas/

## En une phrase

Quand un user visite `https://neopro-admin.kalonpartners.bzh/saas/<route>`, Cloudflare Pages doit servir le HTML de l'app SaaS (avec `<base href="/saas/">`) et pas celui du dashboard, pour que le router Angular SaaS prenne le relais côté client.

## Périmètre

Couvre le routing edge des deep-links SaaS sur Cloudflare Pages prod (`neopro-frontend-prod`). Inclut :

- ✅ Génération du build combiné dashboard + SaaS sous `/saas/` (script `build:cloudflare:prod`)
- ✅ Création des route stubs statiques pour chaque deep-link SaaS connu (script `cloudflare-saas-route-stubs.sh`)
- ✅ Verify CI content-aware (assertion `<base href="/saas/">` sur les routes SaaS)
- ❌ Hors scope : routing dashboard (`/`, `/sites/...`) et SPA fallback dashboard
- ❌ Hors scope : Pi local (sert ses fichiers via nginx, pas Cloudflare)

## Règles métier

### Routes SaaS supportées (cf. `raspberry/src/app/app.routes.ts`)

- `/saas/` (root)
- `/saas/login`
- `/saas/remote`
- `/saas/tv` (redirect Angular → `/saas/display/0`)
- `/saas/secondary` (redirect Angular → `/saas/display/1`)
- `/saas/display/0..3`

### Workaround route stubs statiques

Cloudflare Pages **n'honore pas** la règle `_redirects` `/saas/* /saas/index.html 200` pour les sous-paths nested SPAs. Bug plateforme connu, pas de workaround côté `_redirects` seul.

Solution : `scripts/cloudflare-saas-route-stubs.sh` est exécuté en fin de `build:cloudflare:prod`. Il crée des copies physiques de `dist/central-dashboard/browser/saas/index.html` à chaque path de route ci-dessus. Cloudflare sert alors un fichier réel pour chaque deep-link.

### Si une nouvelle route SaaS est ajoutée

**Mettre à jour `scripts/cloudflare-saas-route-stubs.sh` dans la même PR.** Sans ça, la nouvelle route servira le HTML dashboard (404 styled) au lieu du SaaS.

## Comportements observables

- `curl -sL https://neopro-admin.kalonpartners.bzh/saas/remote?site=X` retourne du HTML contenant `<base href="/saas/">` et `<title>MadXP</title>`.
- `curl -sL .../saas/tv?site=X`, `.../saas/login`, `.../saas/display/0..3` idem.
- `curl -sL https://neopro-admin.kalonpartners.bzh/sites/<uuid>` retourne le HTML dashboard avec `<base href="/">` et `<title>NEOPRO - Dashboard Central</title>`.
- Le verify CI (step `Verify deployment` du job `deploy-frontend-cloudflare`) échoue si `assert_saas_html()` ne trouve pas `<base href="/saas/">` sur les routes SaaS.
- Cloudflare retourne 308 redirect sur `/saas/<route>` (sans slash) → `/saas/<route>/` (avec slash) à cause des index.html stubs ; le browser et `curl -L` suivent transparently.

## Cas d'edge connus

- **Routes dynamiques `display/:n` au-delà de 3** : non couvertes. Si un client utilise plus de 4 displays, étendre la boucle dans le script (ou migrer vers Pages Functions middleware).
- **Routes futures non énumérées** : invisibles jusqu'à ce qu'un user hit l'URL en prod. Mitigation : ajouter une assertion content-aware dans le verify CI pour chaque nouvelle route.
- **Cache CDN stale** : après deploy, certains chunks ou index.html peuvent être servis depuis l'edge cache pendant quelques minutes. Cloudflare invalide automatiquement après deploy mais propagation peut prendre ~30s (cf. `sleep 30` dans verify CI).
- **iframe TV preview Remote V2** : doit utiliser `document.baseURI`, pas `window.location.origin`, pour respecter `<base href="/saas/">` (cf. fix PR #740).

## Ce qui n'est PAS

- ❌ Pas un proxy ou un Worker — Cloudflare Pages sert uniquement des fichiers statiques.
- ❌ Pas une migration NS de la zone `kalonpartners.bzh` — la zone reste chez Hostinger (WordPress + FTP vidéos), seul le sous-domaine `neopro-admin` est CNAME vers Cloudflare.
- ❌ Pas un remplacement de la route Angular côté client — le router Angular SaaS prend le relais après le chargement du HTML correct.
- ❌ Pas de contrat sur les routes du Pi local — le Pi sert ses fichiers via nginx avec un setup totalement séparé.

## Référence

- [ADR-071](../../adr/ADR-071-frontend-hosting-migration-cloudflare-pages.md)
- [Script](../../../scripts/cloudflare-saas-route-stubs.sh)
- [Routes SaaS](../../../raspberry/src/app/app.routes.ts)
