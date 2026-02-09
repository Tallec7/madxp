---
paths:
  - "raspberry/src/app/components/tv/**"
  - "raspberry/src/app/services/double-buffer*"
  - "raspberry/src/app/services/video-error*"
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
- Préchargement pendant la lecture (décodeur hardware ne supporte pas 2 vidéos parallèles)
- Listener `timeupdate` (même throttlé, cause des micro-freezes)
- Transition CSS opacity (repaints causent saccades)
- Capture live dans `onVideoEnded()` (frame buffer déjà libéré sur Chromium/Pi)
- `display: none` sur le freeze canvas (cause reflow layout complet)

**À faire** :
- Pré-capture périodique toutes les 500ms via `startLastFrameCapture()`
- `opacity: 0/1` uniquement (pas `display: none/block`) pour le freeze canvas
- Préchargement au `ended` seulement (une seule vidéo décode à la fois)
- Attendre `canplaythrough` avant de jouer (pas `canplay`)
- Délai 300ms dans `switchPlayers()` (VideoCore VI/VII nécessite 200-400ms pour compositor)
- z-index `2` pour le nouveau player pendant transition, ramené à `1` après

## Stratégie transition boucle

```
Pendant lecture: setInterval(500ms) → captureLastFrame() → canvas
À ended:
  1. captureAndShowFreezeFrame() (opacity, PAS display)
  2. preloadOnInactivePlayer() → charge suivante
  3. Attend canplaythrough (timeout 3s)
  4. switchPlayers(): nouveau visible → play → 2×rAF + 300ms → cache ancien
```

## Système de récupération d'erreurs

| Erreurs consécutives | Action |
|---------------------|--------|
| < 3 | Skip vidéo (1s delay) |
| >= 3 | Full Reset (3s GPU cooldown) |

- Watchdog vérifie toutes les 10s que la vidéo progresse
- Memory cleanup toutes les 30 min OU après 50 vidéos
- Canvas réduit à 720p (économise ~4.5MB)
