# 2026-04-19 — SPA fallback hardening (dashboard + SaaS) + monitoring

**ADR** : [ADR-071](../adr/ADR-071-frontend-hosting-migration-cloudflare-pages.md) (Proposé — migration cible)
**Type** : fix + observability
**Scope** : CI / hosting / frontend

## Contexte

Symptôme prod : `GET /saas/remote?site=<uuid>` et `GET /sites/<uuid>` renvoyaient un 404 intermittent après certains deploys. L'accueil (`/` et `/saas/`) continuait de répondre 200, donc le verify CI disait ✅ alors que les routes SPA profondes étaient cassées.

## Cause racine

Le workflow `release.yml` utilise `SamKirkland/FTP-Deploy-Action` avec `dangerous-clean-slate: true` sur Hostinger. Deux bugs cumulés :

1. Après le clean-slate wipe, l'action sautait parfois l'upload du `.htaccess` (bug dotfile connu) → le dossier `/saas/` se retrouvait sans fallback SPA.
2. Le verify CI ne testait que la racine — un `.htaccess` manquant n'était jamais détecté.

Résultat : Apache cherchait un fichier physique (`remote`, `tv`, `sites`) → 404.

## Fix permanent

### 1. CI `release.yml` — sparadrap robuste

- **Force-upload `.htaccess`** via `curl -T` juste après le FTP clean-slate pour le SaaS. Bypass du bug dotfile.
- **Pré-check** : fail si `.htaccess` absent ou vide dans le build avant l'upload.
- **Deep-route verify** : la CI fail si `/saas/remote?site=ci-probe`, `/saas/tv?site=ci-probe` ou `/sites/ci-probe` ne retournent pas 200.
- `log-level: verbose` sur le FTP pour tracer les uploads en cas de rechute.

### 2. Monitoring continu — nouveau workflow `frontend-health.yml`

Synthetic probe des 5 routes critiques toutes les 10 minutes + après chaque release :

- `/`, `/sites/ci-probe`, `/saas/`, `/saas/remote?site=ci-probe`, `/saas/tv?site=ci-probe`
- Exit non-zéro en cas d'anomalie → email GitHub automatique
- Création/update auto d'un GitHub issue avec label `frontend-health` en cas d'échec récurrent (runbook dans l'issue)

### 3. Documentation

- [TROUBLESHOOTING.md §45](../guides/TROUBLESHOOTING.md) : nouvelle section avec symptômes, résolution, runbook, NE JAMAIS FAIRE
- [ADR-071](../adr/ADR-071-frontend-hosting-migration-cloudflare-pages.md) : décision de migrer vers Cloudflare Pages pour supprimer la racine du problème (FTP + .htaccess)

## Fichiers modifiés

- `.github/workflows/release.yml` — deep-route verify + force-upload .htaccess
- `.github/workflows/frontend-health.yml` — nouveau monitoring cron
- `docs/guides/TROUBLESHOOTING.md` — section §45
- `docs/adr/ADR-071-frontend-hosting-migration-cloudflare-pages.md` — ADR migration
- `docs/adr/README.md` — entrée ADR-071

## Prochaines étapes

Migration vers Cloudflare Pages en cours (ADR-071) : rollback atomique, preview branches, CDN edge, `_redirects` déclaratif versionné → plus d'`.htaccess` ni de FTP.
