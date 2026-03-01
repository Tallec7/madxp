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
  freeze+overlay    freeze+overlay      freeze+overlay
  charge vidéo      charge vidéo        charge vidéo
  ...               prêt, attend        prêt, attend
  visible!
  emit(visible:true)
     │
     ├────────────────┬──────────────────┐
     ▼                ▼                  ▼
  (déjà visible)    reveal!             reveal!
                    ~50ms après master
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

## Consequences

- Décalage réduit de ~300ms à ~50ms (latence Socket.IO uniquement)
- 3 nouvelles méthodes : `preloadManualVideo()`, `revealPreloadedVideo()`, `cleanupPreloadState()`
- 2 nouvelles propriétés : `_preloadedManualVideo`, `_preloadedManualPlayer`
- 9 smoke tests ajoutés

## Files Modified

- `raspberry/src/app/services/socket.service.ts` — LoopState interface
- `raspberry/server/services/state.service.js` — initial state
- `raspberry/src/app/components/tv/tv.component.ts` — preload/reveal logic
- `central-server/src/__tests__/smoke.test.ts` — 9 smoke tests
