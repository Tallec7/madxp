# ADR-033: Secondary variant serving, path, and race condition fixes

**Date** : 2026-03-01
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le pipeline dual-display présentait trois bugs distincts empêchant le secondary display de jouer les variantes :

1. **Serving manquant** : Ni Nginx ni le admin-server ne servaient `/videos-secondary/`. Le fallback SPA de Nginx retournait `index.html` au lieu du fichier vidéo → échec silencieux de `<video>.play()`.

2. **Path erroné dans la config** : `deploySecondaryVariant()` construisait `secondaryRelativePath` en remplaçant `videos/` par `videos-secondary/` dans le chemin du fichier primaire. Or le fichier secondaire a son propre nom (`finalFilename`), différent du fichier primaire. Résultat : la config pointait vers un fichier inexistant → écran noir.

3. **Race condition master-slave** : Quand l'utilisateur déclenche une vidéo manuelle, le slave reçoit l'event `action` et démarre la lecture. Mais un `tv-loop-state` stale (émis par le master AVANT l'action, avec `isManualMode: false`) peut arriver au slave APRÈS, déclenchant `handleMasterLoopState` CAS 2 qui appelle `stopManualVideoAndReturnToLoop()` → le slave revient à la boucle.

## Décision

### Bug 1 — Serving

Ajouter une route static `/videos-secondary` dans le admin-server Express et un bloc `location /videos-secondary/` dans Nginx. 5 smoke tests empêchent la régression.

### Bug 2 — Path

Remplacer `relativePath.replace(/^videos\//, 'videos-secondary/')` par `path.dirname(relativePath).replace(/^videos/, 'videos-secondary') + '/' + finalFilename` dans `deploySecondaryVariant()`. 2 smoke tests empêchent la régression.

### Bug 3 — Race condition (deux corrections complémentaires)

- **Fix A (master)** : Émettre `tv-loop-update` avec `isManualMode: true` IMMÉDIATEMENT dans `play()` (à côté de `isManualMode = true`), pas seulement après le délai 2×rAF + 200ms. Réduit la fenêtre de vulnérabilité.
- **Fix B (slave)** : Ajouter `_lastActionReceivedAt = Date.now()` dans le handler `action`. Dans `handleMasterLoopState` CAS 2, ignorer les `tv-loop-state` avec `isManualMode: false` reçus dans les 2s suivant une action locale (guard anti-stale). 3 smoke tests empêchent la régression.

## Alternatives rejetées

- **Symlink `webapp/videos-secondary → ../../videos-secondary`** : mélange les responsabilités webapp/vidéos
- **Désactiver `tv-loop-state` pendant le mode manuel** : casserait le sync normal master→slave
- **Ajouter un numéro de séquence** dans les messages : surcharge de complexité pour un problème résolu par le timestamp guard

## Conséquences

- Le secondary display peut charger, jouer et synchroniser les variantes secondaires
- 10 smoke tests supplémentaires (417 total) empêchent la régression
- Les Pi existants nécessitent un redéploiement Angular + `sudo systemctl reload nginx`

## Fichiers impactés

- `raspberry/admin/helpers.js` — ajout `SECONDARY_VIDEOS_DIR` + export
- `raspberry/admin/admin-server.js` — import + route `/videos-secondary` static
- `raspberry/config/nginx/neopro-hls.conf` — bloc `location /videos-secondary/`
- `raspberry/install.sh` — bloc `location /videos-secondary/` dans le heredoc Nginx
- `raspberry/sync-agent/src/commands/deploy-video.js` — `secondaryRelativePath` utilise `finalFilename`
- `raspberry/src/app/components/tv/tv.component.ts` — émission immédiate master + guard slave
- `central-server/src/__tests__/smoke.test.ts` — 10 smoke tests (serving + path + race condition)
