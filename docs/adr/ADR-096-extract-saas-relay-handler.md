# ADR-096: Extraction du SaaS relay vers un handler dédié

**Date** : 2026-04-25
**Statut** : Accepté
**Format** : Léger

---

## Contexte

`central-server/src/services/socket.service.ts` atteignait 1263 lignes (>3× la limite de 400 documentée), mélangeant le protocole Pi ↔ Cloud avec la logique SaaS (`registerSaasRelay`, `getSaasConnectedDisplays`, `auditRemoteCommand`, `sweepOrphanSaasStates`, ainsi que la `Map saasStates`). Audit Lead Dev du 2026-04-25 a identifié ce fichier comme P1 (orchestrateur surchargé, dette de garde-fous). 9 handlers Pi avaient déjà été extraits en Phase 7.2 — la logique SaaS restait inlinée.

## Décision

Extraire toute la logique SaaS dans `central-server/src/handlers/saas-relay.handler.ts` (10ème handler), suivant le pattern existant : module avec état privé (Maps `saasStates` + `saasRelayRegistered`) et fonctions exportées (`registerSaasRelay`, `getSaasConnectedDisplays`, `sweepOrphanSaasStates`). `socket.service.ts` conserve des wrappers privés/publics qui délèguent au handler — la surface API du SocketService est inchangée pour les 14 fichiers consommateurs.

## Alternatives rejetées

- **Garder inliné** : rejeté car la limite 400 lignes est largement dépassée et la mixité Pi/SaaS rend la lecture du protocole Pi confuse.
- **Étendre `SocketContext` avec `saasStates` + `saasRelayRegistered`** : rejeté car polluerait l'interface partagée avec des champs spécifiques SaaS qui n'intéressent pas les handlers Pi (heartbeat, config-sync, etc.).
- **Extraction par sous-fonctions sans module dédié** : rejeté car la logique a son propre état Maps qui mérite l'isolation et un cycle de vie clair (reset via `__resetSaasRelayState` pour les tests).

## Conséquences

- **+** `socket.service.ts` passe de 1263 → 991 lignes (-272 lignes, -22 %). Lisibilité et reviewabilité améliorées.
- **+** La logique SaaS est testable en isolation. Helpers `__resetSaasRelayState`, `__getSaasStatesMap`, `__getSaasRelayRegistered` exportés pour les tests existants.
- **+** Les invariants P0 ajoutés dans PR #600 (sweep périodique GC, métrique Prometheus) sont préservés et continuent d'être enforced par les smoke tests.
- **−** 3 smoke tests existants (`smoke-adr-refactoring`, `smoke-socket-realtime`, `smoke-scoreboard-saas`) lisaient `socket.service.ts` via `fs.readFileSync` pour assert la présence des listeners. Mis à jour pour lire le handler file.
- **−** Surface API `getSaasConnectedDisplays` reste publique sur le SocketService (wrapper) pour ne pas casser ses appelants externes (handlers Pi qui notifient les displays).

## Fichiers impactés

- `central-server/src/handlers/saas-relay.handler.ts` — nouveau (359 lignes), contient toute la logique SaaS extraite
- `central-server/src/services/socket.service.ts` — 1263 → 991 lignes, délègue via 3 wrappers
- `central-server/src/services/socket.service.test.ts` — utilise les helpers `__getSaasStatesMap` / `__getSaasRelayRegistered` du handler
- `central-server/src/__tests__/smoke/smoke-adr-refactoring.test.ts` — lit le handler pour assert les 14 patterns
- `central-server/src/__tests__/smoke/smoke-socket-realtime.test.ts` — lit le handler pour les 3 guards memory-leak
- `central-server/src/__tests__/smoke/smoke-scoreboard-saas.test.ts` — lit le handler pour `scoreboard-state-push`
