---
phase: 05-detect
plan: 03
subsystem: raspberry
tags: [state, receivers, sync-agent, wiring, whitelist, firestick, cross-cutting]

requires:
  - plan: 05-detect-01
    provides: ReceiversService class (start/stop/getReceivers + 'connected-receivers-changed' emit)
provides:
  - state.service.js _receivers field + getReceivers/setReceivers (defensive copies)
  - getFullState() now includes `receivers` (consumed by initial-sync clients)
  - server.js boots ReceiversService with io wrapper that syncs state.service on each emit
  - Graceful SIGTERM/SIGINT shutdown of ReceiversService
  - sync-agent DEFAULT_ALLOWED_COMMANDS whitelists 'receiver-detected' + 'receiver-disconnected' (Phase 7 pré-requis)
affects: [06-captive, 07-cloud]

tech-stack:
  added: []
  patterns:
    - "io.emit wrapper pour intercepter événements ciblés et mettre à jour le state snapshot (réutilisable)"
    - "Pattern state.service : champ _xxx privé + getter/setter copie défensive + inclusion dans getFullState()"
    - "Whitelist sync-agent ADR-074-style : ajout dans DEFAULT_ALLOWED_COMMANDS avant l'usage handler"

key-files:
  created:
    - raspberry/sync-agent/__tests__/config.test.js
  modified:
    - raspberry/server/services/state.service.js
    - raspberry/server/__tests__/state.service.test.js
    - raspberry/server/server.js
    - raspberry/sync-agent/src/config.js

key-decisions:
  - "Wrapper io.emit (pas event listener) pour intercepter 'connected-receivers-changed' — Socket.IO server n'expose pas .on('emit') donc le wrap est la voie standard"
  - "setReceivers résilient (warn + ignore) plutôt que throw : un payload corrompu ne doit pas crasher le state.service partagé par tout le serveur Pi"
  - "Sync-agent test file créé même sans Jest installable dans la worktree — verify principal = grep + parse source-level (Acceptance criteria du plan)"
  - "Pas de handler agent.js cette phase — whitelist seul, conforme au plan : Phase 7 ajoutera le consommateur cloud"

patterns-established:
  - "io.emit wrapper pour sync state.service ↔ socket emissions (réutilisable pour autres services émetteurs)"
  - "Whitelist-first dans DEFAULT_ALLOWED_COMMANDS avant ajout handler (cf. ADR-074 'rotate_psk')"

requirements-completed: [DETECT-01, DETECT-02, DETECT-03]

duration: 6 min
completed: 2026-05-06
---

# Phase 5 Plan 3: State + Sync-Agent Integration Summary

**Cross-cutting wiring : state.service expose receivers, server.js bootstrappe ReceiversService avec io wrapper qui sync state à chaque emit, sync-agent whitelist receiver-* events pour Phase 7**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-06T11:00:00Z
- **Completed:** 2026-05-06T11:06:00Z
- **Tasks:** 3 (1 TDD: RED + GREEN, 2 auto)
- **Files modified:** 4 (1 created, 3 modified)
- **Commits:** 4 (1 RED + 3 GREEN)

## Accomplishments

- `state.service.js` expose `_receivers` via `getReceivers()` / `setReceivers()` avec copies défensives + validation array (warn-and-ignore sur input invalide)
- `getFullState()` inclut désormais `receivers` → cohérence initiale-sync entre les TV/remote clients connectés
- `server.js` instancie `ReceiversService` au boot, le démarre avec un wrapper `io.emit` qui intercepte `connected-receivers-changed` pour appeler `stateService.setReceivers(data.receivers)`
- Graceful shutdown SIGTERM/SIGINT (try/catch idempotent — `stop()` déjà idempotent par design Plan 01)
- `sync-agent/src/config.js` whitelist `'receiver-detected'` + `'receiver-disconnected'` dans `DEFAULT_ALLOWED_COMMANDS` (pré-requis Phase 7, pattern ADR-074)
- 47/47 tests state.service GREEN (5 nouveaux + 1 assertion getFullState étendue)
- 18 références "receiver" cumulées sur les 3 fichiers (≥ 5 minimum verification)

## Task Commits

1. **Task 1 RED — failing tests** — `45bd492` (test) — 6 failures attendues
2. **Task 1 GREEN — state.service implementation** — `b7285bd` (feat) — 47/47 tests verts
3. **Task 2 — server.js wiring** — `ac0881d` (feat) — `node --check` valide
4. **Task 3 — sync-agent whitelist + tests** — `2ab6da9` (feat) — grep + node parse verifié

**Plan metadata:** _(à venir, ce commit)_

## Files Created/Modified

- **Created:** `raspberry/sync-agent/__tests__/config.test.js` (3 tests Jest pour la whitelist v4.0 Phase 5)
- **Modified:** `raspberry/server/services/state.service.js` (+20 lignes : champ + 2 méthodes + getFullState extension)
- **Modified:** `raspberry/server/__tests__/state.service.test.js` (+65 lignes : 5 nouveaux tests + 1 assertion getFullState)
- **Modified:** `raspberry/server/server.js` (+21 lignes : import + instantiation + io wrapper + SIGTERM/SIGINT)
- **Modified:** `raspberry/sync-agent/src/config.js` (+5 lignes : 2 events whitelist + commentaire)

## Decisions Made

- **io.emit wrapper plutôt qu'event listener serveur** : Socket.IO server n'a pas d'API `.on('emit')`. Le wrapper est le pattern Node-standard pour intercepter des emits ciblés sans toucher au consommateur (`ReceiversService`). Avantage : `ReceiversService` reste agnostique du state.service (testable en isolation, c'est ce que Plan 01 a livré).
- **`setReceivers` résilient (warn + ignore) au lieu de throw** : un payload corrompu (par ex. via une mauvaise sérialisation cloud Phase 7) ne doit pas crasher le state.service partagé. Pattern cohérent avec `updateScore` (gère `null`) et `updateHdmiState` (merge sans throw).
- **Pas de Jest exécuté dans la worktree pour sync-agent** : `dotenv` non installé localement, mais le plan prévoit explicitement une vérification grep + node parse source-level comme acceptance principal. Le test file est livré pour CI une fois deps installées.
- **Pas de handler `agent.js` cette phase** : conforme au plan — whitelist seul, Phase 7 ajoutera le consommateur côté cloud.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **Sync-agent node_modules absent dans la worktree** : `npx jest` côté sync-agent échoue avec `Cannot find module 'dotenv'`. Workaround documenté par le plan (fallback grep + node parse source-level). Le test file est néanmoins livré pour la CI Jenkins/GitHub Actions qui installe les deps.
- **Jest CLI flag deprecation** : `--testPathPattern` (singular) → `--testPathPatterns` (pluriel) sur Jest récent. Sans impact (workaround direct sur la commande).

## User Setup Required

None - aucune configuration externe requise.

## Next Phase Readiness

- **Phase 5 DETECT complète** (3/3 plans : 01 service + 02 cache + 03 wiring).
- **Phase 6 CAPTIVE** prête à démarrer — la détection passive Pi-side est opérationnelle, les events socket émis vers les clients locaux et le state initial-sync est cohérent.
- **Phase 7 CLOUD** : la whitelist sync-agent est en place, il ne reste plus qu'à ajouter le forward `socket.on('connected-receivers-changed', ...)` côté agent.js + un handler côté `central-server` (cf. ADR-074 pattern pour `rotate_psk`).
- **Pas de blocker connu**.

## Verification

- `cd raspberry/server && npx jest --testPathPattern='state.service'` → **47/47 GREEN**
- `node --check raspberry/server/server.js` → **exit 0**
- `grep -q "'receiver-detected'" raspberry/sync-agent/src/config.js && grep -q "'receiver-disconnected'" raspberry/sync-agent/src/config.js` → **exit 0**
- Source-level node parse : DEFAULT_ALLOWED_COMMANDS = 30 items, contains both events → **exit 0**
- `grep -c "receiver" raspberry/server/services/state.service.js raspberry/server/server.js raspberry/sync-agent/src/config.js` = **18 (≥ 5 minimum)**
- `grep -c "socket.on('receiver-" raspberry/sync-agent/src/agent.js` = **0** (conforme : pas de handler cette phase)

## Self-Check: PASSED

- File `raspberry/server/services/state.service.js` modified — _receivers + getReceivers/setReceivers + getFullState extension confirmed via grep
- File `raspberry/server/server.js` modified — ReceiversService import + instantiation + start with io wrapper + SIGTERM/SIGINT confirmed
- File `raspberry/sync-agent/src/config.js` modified — receiver-detected + receiver-disconnected confirmed in DEFAULT_ALLOWED_COMMANDS
- File `raspberry/sync-agent/__tests__/config.test.js` exists on disk
- Commits `45bd492` (RED), `b7285bd` (T1 GREEN), `ac0881d` (T2), `2ab6da9` (T3) confirmed in `git log`
- All 47 state.service Jest tests passing
