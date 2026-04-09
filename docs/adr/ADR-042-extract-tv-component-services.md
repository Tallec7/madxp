# ADR-042: Extract tv.component.ts into dedicated services

**Date** : 2026-04-09
**Statut** : Accepté
**Format** : Léger

---

## Contexte

`tv.component.ts` avait atteint 3124 lignes, rendant le raisonnement AI et la maintenance humaine difficiles. Deux services existaient (`DoubleBufferVideoService`, `VideoErrorRecoveryService`) mais n'étaient jamais appelés — toute la logique était dupliquée inline dans le composant.

## Décision

Extraire la logique vidéo dans 3 services dédiés via une architecture callback (les services ne connaissent ni les analytics, ni le socket, ni le master/slave) :

- **DoubleBufferVideoService** — gestion des 4 players HTML5, freeze-frame canvas, overlay noir, transitions
- **VideoErrorRecoveryService** — watchdog, error handling, memory cleanup GPU
- **VideoPlaybackService** (nouveau) — orchestration boucle, playlist pondérée Bresenham, prefetch, métriques transition

Le composant descend de 3124 à ~1500 lignes et ne conserve que : lifecycle Angular, routing commandes Socket.IO/BroadcastChannel, sync master/slave, preload+reveal ADR-034, analytics context, et configuration.

## Alternatives rejetées

- **Extraction partielle (services existants seulement)** : rejeté car la logique d'orchestration boucle (~500 lignes) restait dans le composant
- **Composants Angular enfants** : rejeté car la logique est purement programmatique (pas de template), les services sont plus adaptés

## Conséquences

- Le composant est 2x plus petit et chaque service a une responsabilité unique
- Les smoke tests ont été mis à jour pour grep dans les fichiers services au lieu du composant
- Aucun changement de comportement : refactoring structurel pur

## Fichiers impactés

- `raspberry/src/app/services/double-buffer-video.service.ts` — réécriture complète avec la logique production du composant
- `raspberry/src/app/services/video-error-recovery.service.ts` — réécriture complète avec la logique production du composant
- `raspberry/src/app/services/video-playback.service.ts` — **nouveau**, orchestration boucle extraite
- `raspberry/src/app/components/tv/tv.component.ts` — réduit de 3124 à ~1500 lignes, délègue aux services
- `central-server/src/__tests__/smoke.test.ts` — 7 tests mis à jour pour pointer vers les fichiers services
