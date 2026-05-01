# Cloudflare Pages — déploiement SaaS raspberry

## Source de vérité

| Fichier                     | Destination déploiement                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `_redirects`                | Copié vers `dist/raspberry/browser/` via `angular.json`                                                                |
| `_headers`                  | Copié vers `dist/raspberry/browser/` via `angular.json`                                                                |
| `functions/[[catchall]].js` | Source — la Function active est `<repo>/functions/[[catchall]].js` (lue à la racine repo par CF Pages git integration) |

## Pourquoi `functions/` à la racine du repo

Cloudflare Pages git integration scanne `functions/` à la racine du **root directory** du projet Pages (configuré côté UI Cloudflare). Le projet CF `neopro` (déployant sur `neopro-exg.pages.dev`) a Root directory = `.` (racine repo), donc CF cherche `./functions/[[catchall]].js`.

Mettre la Function dans `dist/raspberry/functions/` (sibling du build output) ne marche que pour les déploiements **wrangler direct-upload** (`pages deploy <dir>`), pas pour git integration.

La copie historique dans `raspberry/cloudflare/functions/` est conservée comme **source de vérité versionnée par composant** — `functions/` racine est synchronisé manuellement (1 fichier).

Cf. ADR-071 phase 3 (port raspberry).
