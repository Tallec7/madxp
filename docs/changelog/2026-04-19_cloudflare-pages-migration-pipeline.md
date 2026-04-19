# 2026-04-19 — Pipeline Cloudflare Pages (migration frontend)

**ADR** : [ADR-071](../adr/ADR-071-frontend-hosting-migration-cloudflare-pages.md)
**Type** : feat
**Scope** : CI / hosting / frontend

## Contexte

Le fix CI [PR #481](https://github.com/Tallec7/neopro/pull/481) sécurise le deploy Hostinger actuel (force-upload `.htaccess`, deep-route verify, monitoring continu). Mais il ne traite pas la racine du problème : FTP + `.htaccess` + clean-slate sur hosting mutualisé ne passera pas à l'échelle (100 sites SaaS, 50 admins).

ADR-071 acte la migration vers **Cloudflare Pages**. Cette PR livre toute la partie code-side du pipeline ; la bascule DNS et la création du projet Pages restent des étapes humaines documentées dans l'ADR.

## Changements

### Nouveaux fichiers

- `pages/_redirects` — fallback SPA déclaratif (`/saas/*` → `/saas/index.html`, `/*` → `/index.html`), remplace `.htaccess`.
- `pages/_headers` — security headers (HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) + cache-control versionné (`no-cache` sur les index, `immutable` sur les assets hashés).
- `scripts/build-pages.sh` — assemble dashboard + SaaS dans `dist-pages/` avec sanity checks.
- `.github/workflows/cloudflare-pages.yml` — build + deploy à chaque push sur `main` et preview par PR. Détecte l'absence des secrets `CF_API_TOKEN` / `CF_ACCOUNT_ID` et se contente de valider le build tant que la cutover DNS n'est pas faite.

### Modifs

- `package.json` — script `build:pages`.
- `.gitignore` — ignore `dist-pages/`.
- `docs/adr/ADR-071` — statut passe à "Accepté — cutover en cours" avec checklist manuelle détaillée (création projet Pages, secrets, bascule DNS, nettoyage post-cutover).

## Cutover (manuel, documenté dans ADR-071 §Cutover)

1. Créer projet Pages `neopro-admin` dans Cloudflare (build cmd `bash scripts/build-pages.sh`, output `dist-pages`).
2. Ajouter secrets `CF_API_TOKEN` et `CF_ACCOUNT_ID` au repo.
3. Vérifier preview URL `*.pages.dev` sert les routes profondes.
4. Bascule DNS CNAME → projet Pages (après avoir réduit le TTL à 300s).
5. 24-48h plus tard : PR de nettoyage (suppression `.htaccess`, jobs `deploy-dashboard` / `deploy-saas` de `release.yml`, secrets `HOSTINGER_FTP_*`).

## Coexistence pendant la cutover

- `release.yml` continue de déployer sur Hostinger (legacy path) → aucun downtime.
- `cloudflare-pages.yml` valide le build sans déployer tant que les secrets CF sont absents.
- `frontend-health.yml` reste actif : il teste les routes publiques indépendamment du host.

## Suivi

Post-cutover : follow-up PR pour supprimer le code legacy et mettre à jour le statut ADR-071 en "Accepté — cutover complet".
