---
paths:
  - 'raspberry/src/app/components/tv/**'
  - 'raspberry/src/app/components/score-overlay/**'
  - 'raspberry/src/app/services/double-buffer*'
  - 'raspberry/src/app/services/video-error*'
  - 'raspberry/src/app/services/recording-state*'
  - 'raspberry/server/server.js'
---

# Double-Buffer Vidéo (TV Component)

## Architecture des couches (z-index)

```
z-index 20: Canvas freeze-frame (pré-capturé toutes les 500ms)
z-index 10: Player manuel (vidéos déclenchées manuellement)
z-index 5:  Black overlay (bloque la boucle pendant transitions)
z-index 1-2: Players boucle A/B (alternent pour la boucle)
```

## Optimisations critiques pour Pi

**⚠️ NE PAS faire** (cause des saccades sur Pi) :

- Préchargement trop tôt pendant la lecture (décodeur hardware ne supporte pas 2 vidéos parallèles)
- Transition CSS opacity (repaints causent saccades)
- Capture live dans `onVideoEnded()` (frame buffer déjà libéré sur Chromium/Pi)
- `display: none` sur le freeze canvas (cause reflow layout complet)
- Timer fixe pour cacher le freeze-frame (le décodeur GPU peut être plus lent que prévu)
- Cleanup du player inactif si la vidéo active est courte < 5s (race avec le preload)
- Jouer une étape de boucle sans `video.path` (cause écran noir)

**À faire** :

- Pré-capture périodique toutes les 500ms via `startLastFrameCapture()`
- `opacity: 0/1` uniquement (pas `display: none/block`) pour le freeze canvas
- Listener `timeupdate` throttlé 200ms pour early preload (1.5s avant fin) et early switch (0.5s)
- Attendre `canplaythrough` + polling `readyState` avant de jouer (pas `canplay`)
- Détection de frame réel dans `switchPlayers()` (readyState >= 4 + currentTime > 0 + timeupdate)
- z-index `2` pour le nouveau player pendant transition, ramené à `1` après
- Filtrer les étapes sans `video.path` dans `startSeamlessLoop()` + guard dans `playOnActivePlayer()`/`preloadOnInactivePlayer()`

## Stratégie transition boucle

```
Pendant lecture:
  setInterval(500ms) → captureLastFrame() → canvas
  timeupdate (throttle 200ms):
    50% → warmDiskCache() (fetch 3 prochaines)
    1.5s avant fin → preloadOnInactivePlayer()
    0.5s avant fin → triggerSwitch() (early switch)
À ended (fallback):
  1. captureAndShowFreezeFrame() (opacity, PAS display)
  2. preloadOnInactivePlayer() → charge suivante
  3. Attend canplaythrough + polling readyState>=3 /50ms (timeout 1.5s)
  4. switchPlayers(): nouveau visible → play → détection frame réel → cache ancien
Après switch:
  5. cleanupInactivePlayer() (skip si vidéo active < 5s)
```

## Reprise boucle après vidéo manuelle

- `play()` sauvegarde `currentLoopIndex` dans `_savedLoopIndex` avant `isManualMode = true`
- `onManualEnded()` passe `_savedLoopIndex + 1` à `startSeamlessLoop()` pour reprendre à la vidéo suivante
- `startSeamlessLoop(resumeIndex?)` clampe l'index via modulo — ne jamais hardcoder `0`
- Seuls `performFullReset()` (dernier recours) et un appel sans argument (changement de phase) démarrent à l'index 0

## Système de récupération d'erreurs

| Erreurs consécutives | Action                       |
| -------------------- | ---------------------------- |
| < 3                  | Skip vidéo (1s delay)        |
| >= 3                 | Full Reset (3s GPU cooldown) |

- Watchdog vérifie toutes les 10s que la vidéo progresse
- Memory cleanup toutes les 30 min OU après 50 vidéos
- Canvas réduit à 720p (économise ~4.5MB)

## Synchronisation TV Master-Slave (v3.8.0+)

Permet de synchroniser plusieurs instances TV (kiosk + navigateur) sur la même boucle vidéo via Socket.IO local (port 3000).

**Pourquoi Socket.IO ?** Le kiosk Chromium est un processus séparé → BroadcastChannel ne fonctionne pas entre processes. Tout passe par le serveur local.

**Architecture** :

- Premier TV connecté = **master**, suivants = **slaves**
- Master émet `tv-loop-update` à chaque changement de vidéo (boucle ET vidéo manuelle)
- Slaves reçoivent `tv-loop-state`, trouvent la vidéo **par index** (PAS par path), jouent + seek au temps approximatif
- Si master déconnecte → promotion automatique du slave le plus ancien
- **Analytics désactivées pour les slaves** : `if (!this.isSlaveMode)` avant tout `track*()`
- **Sync par index** : le slave utilise `videoIndex` car les variants secondaires ont des chemins différents du master

**Race condition master-slave (ADR-033)** :

Quand l'utilisateur déclenche une vidéo manuelle, le serveur broadcaste `action` à ALL (master+slave). Le slave traite l'action et lance `play()`. Mais un `tv-loop-state` stale (émis AVANT l'action par le master, avec `isManualMode: false`) peut arriver au slave APRÈS. `handleMasterLoopState` CAS 2 appelle alors `stopManualVideoAndReturnToLoop()` → le slave revient à la boucle alors qu'il devrait jouer la vidéo manuelle.

**Protection (deux corrections complémentaires)** :

1. **Master** : émet `tv-loop-update` avec `isManualMode: true` IMMÉDIATEMENT dans `play()` (pas seulement après 200ms)
2. **Slave** : `_lastActionReceivedAt = Date.now()` dans le handler `action`. Dans `handleMasterLoopState` CAS 2, ignore les `tv-loop-state` non-manual reçus dans les 2s suivant une action (guard anti-stale). Compteur `staleLoopStateCount` incrémenté à chaque occurrence pour monitoring.

**Fichiers** :

- `raspberry/server/server.js` — tvInstances Map, promoteSlave(), handlers
- `raspberry/src/app/components/tv/tv.component.ts` — tvRole, isSlaveMode, emitLoopState(), handleMasterLoopState(), \_lastActionReceivedAt
- `raspberry/src/app/services/video-playback.service.ts` — startSeamlessLoop() slave guard, onVideoEnded() slave freeze (ADR-042)
- `raspberry/src/app/services/double-buffer-video.service.ts` — players, freeze-frame, overlays (ADR-042)
- `raspberry/src/app/services/video-error-recovery.service.ts` — watchdog, memory cleanup (ADR-042)

## ScoreOverlayComponent (ADR-041)

Composant standalone extrait de `TvComponent` — gère tout l'affichage overlay match :

- **Score overlay** : thèmes broadcast (ESPN/BeIN) et minimal, 6 positions CSS
- **Timer** : standalone ou intégré au score, compteur local synchronisé chaque seconde
- **Goal animation** : 3 styles (popup, fullscreen, slide) + son optionnel
- **Breaking news** : bandeau défilant avec timeout
- **Secondary display** : bandeau score horizontal + goal flash plein écran

**Architecture** :

- Écoute directement Socket.IO (`score-update`, `score-reset`, `options-update`, `breaking-news`, `timer-update`) et BroadcastChannel (mêmes événements locaux)
- `TvComponent` accède au score via `@ViewChild(ScoreOverlayComponent)` + getters proxy `currentScore` / `showScoreOverlay`
- Reçoit `[configuration]` et `[displayType]` en `@Input()` depuis `TvComponent`
- `ViewEncapsulation.None` (styles globaux nécessaires pour les overlays `position: fixed`)

**Fichiers** :

- `raspberry/src/app/components/score-overlay/score-overlay.component.ts` — logique (326 lignes)
- `raspberry/src/app/components/score-overlay/score-overlay.component.html` — template (216 lignes)
- `raspberry/src/app/components/score-overlay/score-overlay.component.scss` — styles (723 lignes)

## RecordingStateService (v3.8.0+)

Contrôle hybride (auto + manuel) de l'enregistrement analytics.

- **Au boot : OFF** — aucune donnée analytics enregistrée
- **Auto ON** quand la Remote change de phase (`neutral` → `before`/`during`/`after`)
- **Auto OFF** quand retour en `neutral` + timeout 15 min
- **Override manuel** : bouton REC sur la télécommande
- **Guards** : `AnalyticsService` et `SponsorAnalyticsService` vérifient `recordingState.isRecording` avant de tracker
- **Propagation** : BroadcastChannel (onglets locaux) + Socket.IO (serveur local + cloud)

**Fichier** : `raspberry/src/app/services/recording-state.service.ts`
