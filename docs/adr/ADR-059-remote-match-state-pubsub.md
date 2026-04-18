# ADR-059: Pub/sub état match — Pi autoritaire, broadcast continu

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Léger
**Phase** : 2 du plan refonte télécommande (cf. ADR-058 Phase 1)

---

## Contexte

Aujourd'hui, chaque télécommande envoie des **états absolus** (score=3-2, phase='during', timer=12:34) au Pi, qui applique directement. Avec plusieurs remotes actifs simultanément (staff A sur son tel, staff B sur tablette), un ordre de message déstructuré produit des sauts d'état (A voit 3-2, B voit 2-2, le Pi oscille). Pas de source de vérité partagée côté clients.

## Décision

Faire du **Pi la source de vérité**. Les remotes n'envoient plus des états, mais des **commandes** (`increment_score`, `set_phase`, `start_timer`) avec un numéro de séquence. Le Pi applique, puis broadcaste un événement **`state-sync`** à tous les remotes connectés contenant l'état complet (score, phase, timer, boucle active, vidéo en cours, timestamp serveur). Les remotes réconcilient leur UI optimiste avec chaque `state-sync`. ACK Socket.IO + séquence number pour détecter les pertes et rejouer.

## Alternatives rejetées

- **CRDT côté clients** : overkill pour un état partagé simple (1 match, 5-10 clients max). Ajoute une complexité de merge conflicts que la centralisation Pi évite.
- **Central-server comme source de vérité** : rejeté — introduit une dépendance cloud pour piloter un match local, incompatible avec le mode offline (ADR-060 fallback LAN).
- **Polling périodique** : latence inacceptable pour un match en direct (score change à la seconde).

## Conséquences

- Latence perçue faible (optimistic UI) + convergence garantie (state-sync).
- Le Pi devient un **bus de messages** en plus de son rôle actuel — charge CPU négligeable mais nouveau point de défaillance : si le Pi crash, tous les remotes perdent l'état (mitigé par ADR-060 fallback).
- Protocole breaking change : coexistence legacy/new via ADR-061.

## Fichiers implémentés

- `raspberry/server/socket/state-broadcaster.js` (nouveau) — émet `state-sync` après chaque mutation.
- `raspberry/server/services/state.service.js` — `incrementScore()` / `decrementScore()` ajoutés.
- `raspberry/server/socket/handlers.js` — 9 handlers `command/*` + appel `broadcaster.broadcast()`.
- `raspberry/sync-agent/src/agent.js` — relay `command/*` DOWN + `state-sync` UP via `localSocket.getSocket()`.
- `central-server/src/controllers/remote.controller.ts` — 9 nouveaux types + émission room.
- `central-server/src/services/socket.service.ts` — relay `state-sync` Pi → room + SaaS relay.
- `central-server/src/services/metrics.service.ts` — `recordMatchCommand()` + `recordStateSyncRelay()`.
- `central-dashboard/src/app/core/services/remote.service.ts` — `MatchCommandType`, `MatchStateSync`, `sendMatchCommand()`.
- `central-dashboard/src/app/core/services/socket.service.ts` — listener `state-sync`.
- `central-dashboard/src/app/features/remote/services/remote-score.service.ts` — optimistic UI + `syncFromState()`.
- `central-dashboard/src/app/features/remote/services/remote-timer.service.ts` — commandes granulaires + `syncFromState()`.
- `central-dashboard/src/app/features/remote/cloud-remote.component.ts` — abonnement `state-sync` → réconciliation score/timer/phase.

## Garde-fous anti-régression

- Smoke test : présence de l'événement `state-sync` dans `handlers.js` + handler côté remote.
- Test d'intégration : 2 remotes concurrents → convergence en <500ms après commande.
