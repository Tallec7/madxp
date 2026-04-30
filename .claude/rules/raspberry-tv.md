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

## NE JAMAIS FAIRE (smoke test enforced)

### Preview-Slave Sync (ADR-106)

- Déplacer `registerPreviewSlaveOnSocket(io, socket)` depuis `central-server/src/services/socket.service.ts handleConnection()` vers `registerSaasRelay()` (la preview iframe skip `saas-register` pour préserver `getSaasClientCount` — si le listener `tv-preview-register` est gated derrière saas-register, il n'est jamais attaché au socket de la preview → boucle locale par défaut pour toujours, régression #759).
- Retirer le payload `{ siteId }` de l'émission client `tv-preview-register` dans `tv.component.ts initPreviewSlave()` (sans lui le serveur central ne peut pas faire `socket.join(siteId)` → 0 broadcast reçu).
- Retirer la fonction exportée `registerPreviewSlaveOnSocket` de `central-server/src/handlers/saas-relay.handler.ts` (point d'extension public utilisé par socket.service.ts).
- Retirer le handler `tv-preview-tick` de `raspberry/server/socket/handlers.js` ou de `central-server/src/handlers/saas-relay.handler.ts` (heartbeat 1Hz master→preview pour drift correction continue, ADR-106 PR #758).

### Master-Slave Sync

- Synchroniser le slave dual-display par `videoPath` dans `handleMasterLoopState` (toujours sync par `videoIndex`)
- Laisser le slave jouer sa boucle indépendamment du master (le slave doit pauser sa boucle dès `tv-role-assigned` et attendre `tv-loop-state`)
- Jouer une vidéo manuelle sur un display non-primary sans résoudre la variante (toujours passer par `resolveDisplayVariant()` — résout `video.variants?.[displayType]`)
- Émettre `tv-loop-update` avec `isManualMode: true` SEULEMENT après le délai 2×rAF + 200ms dans `play()` (émettre aussi immédiatement)
- Appeler `stopManualVideoAndReturnToLoop()` dans `handleMasterLoopState` CAS 2 sans vérifier `_lastActionReceivedAt` (guard 2s obligatoire)
- Appeler `play()` directement dans le handler `action` côté slave (le slave doit appeler `preloadManualVideo()` et attendre le reveal du master — ADR-034)
- Émettre `manualVideoVisible: true` dans l'émission immédiate de `play()` (seule l'émission delayed doit émettre — ADR-034)
- Oublier `manualVideoVisible: false` dans `emitLoopState()` des transitions de boucle (toujours émettre explicitement `false` — ADR-034)
- Utiliser `manualVideoVisible === false` (strict equality) dans `handleMasterLoopState` CAS 1 (utiliser `!== true` qui couvre false, undefined ET absent)

### Manual Video Transitions

- Ne pas utiliser `getActiveManualPlayer()` pour la NOUVELLE vidéo dans une transition manuel→manuel (utiliser `getInactiveManualPlayer()` — le player actif sert uniquement à capturer le freeze-frame du joueur précédent puis à libérer son décodeur HW)
- Ne pas appeler `showBlackOverlay()` systématiquement dans `play()` (uniquement en fallback si `captureAndShowFreezeFrame()` échoue)
- Ne pas supprimer le debounce dans `play()` de `manual-video.service.ts` (protège le décodeur software contre le spam de commandes)
- Ne pas utiliser le frame pré-capturé (boucle) dans `captureAndShowFreezeFrame(isManualMode=true)` (forcer capture live depuis le player manuel)
- Ne pas oublier `captureAndShowFreezeFrame()` dans `triggerSwitch()` de `video-playback.service.ts` (le early switch path n'a pas de freeze-frame sinon)
- Ne pas appeler `captureAndShowFreezeFrame(false)` ou `captureAndShowFreezeFrame()` (sans argument) dans le `play()` de `manual-video.service.ts` (toujours passer le flag booléen `isManualToManual` pour que la capture soit LIVE depuis le player manuel actif en transition manuel→manuel)
- Ne pas omettre `activeManualPlayer.removeAttribute('src') + load()` en transition manuel→manuel (libère le SharedImage backing du décodeur HW Pi 5 — sans ça, le compositeur Chromium ne peut pas allouer de slot pour le nouveau décodeur, la nouvelle vidéo charge mais ne s'affiche pas → bug click-twice cas d'usage NLF "présentation joueurs". Symptôme journalctl : `SharedImageBackingFactory ... format: (Y_UV, 420, 8unorm), size: 1920x1080` — smoke test enforced)

### Preload & Reveal (ADR-034)

- Afficher freeze-frame ou overlay noir dans `preloadManualVideo()` pour la première vidéo manuelle depuis la boucle (preload silencieux — opacity 0 + muted)
- Ajouter un délai rAF AVANT `style.opacity = '1'` dans `revealPreloadedVideo()` (la révélation visuelle du slave doit être instantanée). En revanche, un rAF DANS le callback `requestVideoFrameCallback` (`hideAfterPaint`) APRÈS le reveal est nécessaire pour cacher freeze-frame/black-overlay APRÈS le paint commit du nouveau player — sans ça, fenêtre 1-frame où `<video>` est transparent → boucle (z=2) flashe à travers.
- Oublier `player.muted = true` dans `preloadManualVideo()` ou `player.muted = false` dans `revealPreloadedVideo()`/`cleanupPreloadState()`
- Oublier `captureAndShowFreezeFrame()` dans la transition manual→manual de `preloadManualVideo()`
- Appeler `play()` directement dans le handler LocalBroadcast `onCommand()` sans vérifier `isSlaveMode` (même pattern que Socket.IO `action`)
- Supprimer `_preloadReady` / `_pendingReveal` du mécanisme preload+reveal (deferred reveal nécessaire sur navigateur web)
- Utiliser `player.muted = false` dans `revealPreloadedVideo()` sans vérifier `player.paused` après (Chrome pause une vidéo unmutée sans interaction utilisateur)

### Commands dedupliqués

- Dupliquer le traitement des commandes `action`/`onCommand` inline dans les handlers Socket.IO et BroadcastChannel (utiliser `handleTvCommand()` centralisé avec guard `isDuplicateCommand()`)
- Revenir à `Subject` pour `command$` dans `local-broadcast.service.ts` (les displays SaaS N > 0 mettent ~5s à charger la config via le resolver HTTP — les commandes émises pendant ce délai sont perdues car le TvComponent n'a pas encore souscrit — le `ReplaySubject(1, 10_000)` buffer la dernière commande et la rejoue aux nouveaux subscribers dans une fenêtre de 10s — smoke test enforced)
- Supprimer le guard `isDuplicateCommand()` de `handleTvCommand()` (double `play()` → race condition → vidéo gelée)

### Display & CSS

- Utiliser `100vw` dans les SCSS des composants TV (`tv.component`, `waiting-screen`, `wrong-port-screen`) — utiliser `100%` à la place
- Utiliser `object-fit: cover` sur les players vidéo TV (`.freeze-canvas`, `.double-buffer-player`, `.manual-player`) — utiliser `object-fit: contain`
- Utiliser `this.hdmiConnected = data.hdmi0` seul dans tv.component.ts (utiliser `data.hdmi0 || data.hdmi1` car le watchdog gère le swap automatique)
- Conditionner `hdmiDetectedAt` à `wasDisconnected` dans tv.component.ts (capturer dès le premier statut HDMI reçu)
- Retourner `'disconnected'` dans `getTvStatusForAnalytics()` quand `tv_power` est `null` (retourner `'unknown'`)

### Socket.IO local

- Initialiser Socket.IO client sans options de reconnexion (`reconnection: true`, `reconnectionDelay`, `reconnectionAttempts: Infinity`)
- Initialiser Socket.IO serveur sans `pingInterval`/`pingTimeout`/`transports`
- Supprimer les handlers lifecycle `disconnect`/`reconnect`/`connect_error` de `socket.service.ts`
- Supprimer `onReconnect()` de `socket.service.ts` ou le re-register `tv-register` dans `tv.component.ts`
- Réduire le timeout preload du double-buffer sous 5000ms

### Remote

- Utiliser `[ngClass]="timeCategory.color"` dans le template remote (utiliser `getTimeCategoryGradientClass()` qui fallback par `id`)
- Supprimer le menu item "Changer de profil" dans la remote

### Tests

- Supprimer les tests hardware-matrix E2E dans `e2e/tests/hardware-matrix.spec.ts`

## Transition Manuel→Manuel (double-buffering)

Cas d'usage cible : **présentation joueurs NLF** — speaker enchaîne 1 vidéo joueur par seconde, certaines durent 1s, d'autres 10s. Aucune frame de la boucle ne doit jamais être visible entre 2 vidéos joueur.

Quand une vidéo manuelle est déjà visible et qu'une nouvelle est déclenchée :

1. **Capture freeze-frame LIVE** depuis `getActiveManualPlayer()` (frame du joueur précédent, z=20 — masque la transition)
2. **Libère le décodeur HW Pi 5** : `activeManualPlayer.pause() + removeAttribute('src') + load()` (sans ça, bug click-twice — le compositeur Chromium ne peut pas allouer un nouveau SharedImage backing tant que l'ancien décodeur tient son slot)
3. La nouvelle vidéo charge sur `getInactiveManualPlayer()` (z-index 10, opacity 0)
4. `loadeddata` (premier frame décodé) → `play()` → 1×rAF → opacity=1 → `swapActiveManualPlayer()` → `hideFreezeFrame()`
5. Debounce 150ms protège contre le spam (rapide consécutifs)

Le user voit : frame figé du joueur précédent (canvas) → joueur suivant qui démarre. Jamais de noir, jamais de boucle, jamais de freeze pré-capturé de la boucle.

Transition boucle→manuel : freeze-frame pré-capturé + `loadeddata` + 1×rAF (inchangé, pas de libération HW car le loop player utilise un autre slot).
