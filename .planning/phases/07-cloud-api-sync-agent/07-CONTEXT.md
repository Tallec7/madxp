# Phase 7 — CLOUD — Decisions Context

**Phase goal:** Le cloud expose les MACs détectées par le Pi et propage les assignations en source de vérité.
**Created:** 2026-05-07
**Status:** Ready for planning

---

## Decisions Locked

### Zone A — Source de données pour `GET /api/sites/:id/connected-receivers`

**Decision: in-memory `Map<siteId, ReceiverInfo[]>` dans `socket.service.ts`**

- Un `Map<siteId, ReceiverInfo[]>` privé dans `SocketService`, alimenté à chaque `state-sync` entrant depuis le Pi.
- La route API `GET /connected-receivers` lit cette Map.
- Volatilité acceptée : Railway restart → Map vide → rechargée au prochain `state-sync` du Pi (~10-30s après reconnexion). Acceptable pour le use-case dashboard.
- Pas de table DB dédiée : les receivers non-assignés n'ont pas de display pour les accueillir dans le JSONB. Coût/bénéfice défavorable en Phase 7.
- Historique (`last_seen_at` sur plusieurs jours) est v4.1+, pas Phase 7.

### Zone B — Canal Pi → cloud pour les receiver events

**Decision: extraction depuis `state-sync` existant, pas d'events séparés**

- Le `state-sync` contient déjà `receivers: ReceiverInfo[]` (via `stateService.getFullState()` sur le Pi).
- Le handler `state-sync` dans `socket.service.ts` extrait le champ `receivers` **avant** le relay vers le room dashboard et met à jour la Map interne.
- Changement minimal : ~3 lignes dans le handler `state-sync` existant.
- Les events `receiver-detected` / `receiver-disconnected` restent dans la whitelist sync-agent (déjà fait en Phase 5) mais ne sont **pas utilisés** en Phase 7 — réservés Phase 9 (granularité Prometheus).
- Pas de nouveau handler dans `agent.js` pour cette phase.

### Zone C — Push cloud → Pi après assignation MAC

**Decision: `commandQueueService.sendOrQueue` après PATCH displays**

- Après `updateSiteDisplays` (PATCH `/api/sites/:id/displays`), le controller émet `commandQueueService.sendOrQueue(siteId, 'receiver_assignment_updated', { displays })`.
- Payload = tableau complet des displays (cohérent avec le pattern `update_config`).
- Le Pi reçoit via `command-dispatch.js` → handler `receiver_assignment_updated` → appelle `receiversService.assignDisplay(mac, displayIndex)` + sauvegarde cache local.
- Pourquoi pas `displays-changed` socket event : cet event est ciblé dashboard Angular, pas Pi. Le Pi écoute les `command` — c'est le pattern établi (cf. `rotate_psk`, `update_config`, `update_hotspot`).
- La commande `receiver_assignment_updated` doit être ajoutée à `DEFAULT_ALLOWED_COMMANDS` dans `sync-agent/src/config.js`.

---

## Code Context (reusable assets)

### Central-server (cloud)

| File                                      | What's reusable                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `src/middleware/validation.ts:139`        | `updateDisplays` Joi schema accepte déjà `receiver` — **rien à changer** |
| `src/repositories/site.repository.ts:828` | `getReceiverForDisplay` + `setReceiver` — disponibles                    |
| `src/controllers/sites.controller.ts:450` | `updateSiteDisplays` — à étendre avec emit command après save            |
| `src/routes/sites.routes.ts:357`          | `PATCH /:id/displays` — route existante, **pas de nouvelle route PATCH** |
| `src/services/socket.service.ts:554`      | Handler `state-sync` existant — à étendre pour extraction receivers      |
| `src/services/command-queue.service.ts`   | `sendOrQueue(siteId, command, payload)` — pattern à reproduire           |

### Sync-agent (Pi)

| File                                 | What's reusable                                                       |
| ------------------------------------ | --------------------------------------------------------------------- |
| `sync-agent/src/config.js:16`        | `DEFAULT_ALLOWED_COMMANDS` — ajouter `receiver_assignment_updated`    |
| `sync-agent/src/command-dispatch.js` | Pattern handler commande — ajouter case `receiver_assignment_updated` |

### Raspberry/server (Pi local)

| File                                       | What's reusable                                                     |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `server/services/receivers.service.js:222` | `assignDisplay(mac, displayIndex)` — méthode existante              |
| `server/services/receivers.service.js`     | Cache local `.receivers-cache.json` — déjà géré par `assignDisplay` |

---

## What's Already Done (skip in planning)

- ✅ Joi `updateDisplays` accepte `receiver` (validation.ts:146-150) — **Phase 4**
- ✅ Whitelist `receiver-detected` / `receiver-disconnected` (config.js:54) — **Phase 5**
- ✅ `setReceiver` / `getReceiverForDisplay` dans repository — **Phase 4**
- ✅ `receivers` dans `getFullState()` → inclus dans `state-sync` — **Phase 5**
- ✅ `assignDisplay()` dans `receivers.service.js` — **Phase 5**

---

## Phase Boundary (FIXED)

Phase 7 livre **exactement** :

1. `GET /api/sites/:id/connected-receivers` (lit la Map in-memory)
2. `PATCH /api/sites/:id/displays` persiste `receiver` + émet `receiver_assignment_updated` au Pi
3. `state-sync` handler extrait + stocke receivers dans Map
4. `command-dispatch.js` handler `receiver_assignment_updated` → `assignDisplay` + cache

**Hors scope Phase 7 :**

- Métriques Prometheus (Phase 9)
- Suite smoke `smoke-receivers-discovery` (Phase 9)
- Dashboard UX dropdown (Phase 8)
- `receiver-detected` / `receiver-disconnected` events handling (Phase 9)
