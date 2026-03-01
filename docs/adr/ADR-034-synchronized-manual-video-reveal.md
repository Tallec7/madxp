# ADR-034: Synchronized Manual Video Reveal

## Status

Accepted

## Context

Les vidéos manuelles (déclenchées par télécommande/dashboard) ne sont pas synchronisées entre l'écran primaire (HDMI-0), secondaire (HDMI-1) et le PC navigateur.

**Cause racine** : Tous les écrans reçoivent l'événement `action` simultanément via `io.emit()` et appellent `play()` indépendamment. Les temps de chargement diffèrent car :

- Les fichiers sont différents (primary vs secondary variant)
- Les plateformes ont des performances différentes (Pi vs PC)

Résultat : décalage de 150ms à 450ms entre les révélations.

## Decision

Le **master** (HDMI-0) donne le signal de révélation aux **slaves** (HDMI-1, PC).

### Nouveau champ LoopState

```typescript
manualVideoVisible: boolean; // ADR-034
```

### Flux

```
Dashboard: "jouer vidéo X"
     │
     ▼
  Server: io.emit('action', X)
     │
     ├────────────────┬──────────────────┐
     ▼                ▼                  ▼
  MASTER            SLAVE (HDMI-1)     SLAVE (PC)
  play(X)           preloadManualVideo  preloadManualVideo
  freeze+overlay    silent (opacity 0)  silent (opacity 0)
  charge vidéo      charge vidéo        charge vidéo
  ...               prêt, attend        prêt, attend
                    (boucle visible)    (boucle visible)
  visible!
  emit(visible:true)
     │
     ├────────────────┬──────────────────┐
     ▼                ▼                  ▼
  (déjà visible)    reveal instant!     reveal instant!
                    ~10ms après master
```

### Émissions master dans play()

1. **Immédiate** (avant chargement) : `manualVideoVisible: false` — slaves doivent preload
2. **Delayed** (après 2×rAF + 200ms) : `manualVideoVisible: true` — slaves doivent reveal

### Sous-cas handleMasterLoopState CAS 1

| Sous-cas | Condition                                          | Action slave                        |
| -------- | -------------------------------------------------- | ----------------------------------- |
| 1a       | `manualVideoVisible === false`                     | `preloadManualVideo()` (safety net) |
| 1b       | `manualVideoVisible === true` + preload en attente | `revealPreloadedVideo()`            |
| 1c       | `manualVideoVisible === true` + pas de preload     | `play()` direct (backward compat)   |

## Backward Compatibility

- **Vieux slaves** (sans preload) : ignorent `manualVideoVisible`, continuent avec `play()` sur `action`
- **Vieux masters** (sans `manualVideoVisible`) : champ absent → sous-cas 1c → `play()` direct

## Évolutions post-implémentation

### v3.89.3 — Preload silencieux + Reveal instantané

**Problème 1** : `preloadManualVideo()` affichait freeze-frame + overlay noir immédiatement → "double-flash" visible sur le slave avant la révélation.

**Fix** : Preload silencieux — la vidéo charge en opacity 0, muted. La boucle continue de jouer normalement en dessous. Pas de freeze-frame ni d'overlay sauf pour les transitions manual→manual.

**Problème 2** : `revealPreloadedVideo()` avait son propre délai 2×rAF + 200ms → latence additionnelle de ~200ms sur le slave.

**Fix** : Reveal instantané — opacity 1 + unmute immédiat. Le délai 2×rAF + 200ms est uniquement côté master dans `play()`.

**Problème 3** : Transition manual→manual — quand on remplace une vidéo manuelle visible par une autre, cacher le player expose la boucle brièvement.

**Fix** : Détection manual→manual (`targetPlayer.style.opacity === '1' && !targetPlayer.paused`) → capture freeze-frame pour couvrir le gap.

## Consequences

- Décalage réduit de ~300ms à ~10ms (latence Socket.IO uniquement)
- 3 nouvelles méthodes : `preloadManualVideo()`, `revealPreloadedVideo()`, `cleanupPreloadState()`
- 2 nouvelles propriétés : `_preloadedManualVideo`, `_preloadedManualPlayer`
- Preload silencieux (opacity 0, muted) — pas de flash visible
- Reveal instantané — pas de délai supplémentaire côté slave
- Transition manual→manual avec freeze-frame conditionnel
- 13 smoke tests (9 initiaux + 4 pour v3.89.3)

## Files Modified

- `raspberry/src/app/services/socket.service.ts` — LoopState interface
- `raspberry/server/services/state.service.js` — initial state
- `raspberry/src/app/components/tv/tv.component.ts` — preload/reveal logic
- `central-server/src/__tests__/smoke.test.ts` — 9 smoke tests
