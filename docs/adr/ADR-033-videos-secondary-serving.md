# ADR-033: Serving /videos-secondary via Nginx + admin-server

**Date** : 2026-03-01
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le pipeline dual-display télécharge les variantes secondaires dans `/home/pi/neopro/videos-secondary/` (deploy-video.js) et stocke le path relatif `videos-secondary/xxx.mp4` dans `configuration.json`. Or ni Nginx ni le admin-server (port 8080) ne servaient ce dossier. Résultat : quand le secondary display tentait de jouer une variante, Nginx retournait `index.html` (fallback SPA) au lieu du fichier vidéo, causant un échec silencieux de `<video>.play()`. Le catch handler dans `play()` supprimait les overlays, laissant la boucle visible.

## Décision

Ajouter une route static `/videos-secondary` dans le admin-server Express (identique à `/videos`) et un bloc `location /videos-secondary/` dans la config Nginx (proxy_pass vers le admin-server sur port 8080, avec cache identique à `/videos/`). Les 3 sources Nginx sont synchronisées : `neopro-hls.conf` (template) et `install.sh` (inline heredoc). 5 smoke tests empêchent la régression : import `SECONDARY_VIDEOS_DIR`, route Express, export helpers, location Nginx template, location Nginx install.sh.

## Alternatives rejetées

- **Symlink `webapp/videos-secondary → ../../videos-secondary`** : rejeté car le dossier `webapp/` est géré par le build Angular et ne contient pas de vidéos — mélanger les responsabilités
- **Servir depuis le Socket.IO server (port 3000)** : rejeté car le admin-server est déjà le serveur de fichiers de référence (normalisation Unicode, CORS)

## Conséquences

- Le secondary display peut charger et jouer les variantes secondaires via `/videos-secondary/xxx.mp4`
- Le cache Nginx s'applique aussi aux variantes secondaires (7j, identique aux vidéos primaires)
- 5 smoke tests supplémentaires (412 total) empêchent la régression
- Les Pi existants nécessitent un `sudo nginx -t && sudo systemctl reload nginx` après mise à jour

## Fichiers impactés

- `raspberry/admin/helpers.js` — ajout `SECONDARY_VIDEOS_DIR` + export
- `raspberry/admin/admin-server.js` — import + route `/videos-secondary` static
- `raspberry/config/nginx/neopro-hls.conf` — bloc `location /videos-secondary/`
- `raspberry/install.sh` — bloc `location /videos-secondary/` dans le heredoc Nginx
- `central-server/src/__tests__/smoke.test.ts` — 5 smoke tests (helpers, admin-server, nginx, install.sh)
