---
phase: 05-detect
plan: 02
subsystem: raspberry
tags: [receivers, cache, persistence, atomic-write, offline-first, reboot-resilience]

requires:
  - phase: 05-detect
    plan: 01
    provides: ReceiversService class with passive MAC detection (Map<mac, {kind, lastSeenAt}>)
provides:
  - ReceiversService.loadCache() / saveCache() — atomic write tmp + rename
  - ReceiversService.assignDisplay(mac, displayIndex) / unassignDisplay(mac)
  - Local cache /home/pi/neopro/.receivers-cache.json (version 1) — reboot-resilient mapping MAC↔display
  - _state extended : { kind, lastSeenAt, displayIndex: number|null }
  - _scanLeases() preserves assigned MACs (displayIndex !== null) when offline
affects: [05-detect-03, 06-captive, 07-cloud]

tech-stack:
  added: []
  patterns:
    - "Atomic write : fs.writeFileSync(tmp) + fs.renameSync(tmp -> final) — pas de fs-extra côté raspberry/server (fs natif suffit)"
    - "loadCache au boot AVANT premier _scanLeases (offline-first : restore state sans réseau)"
    - "Tolérance résiliente : ENOENT/JSON corrupt/version mismatch → warn + state vide, jamais throw"
    - "Préservation par assignment : MAC assignée temporairement offline reste dans _state (Fire Stick éteint = recovery au reboot)"

key-files:
  created: []
  modified:
    - raspberry/server/services/receivers.service.js (231 → 384 lignes — +loadCache/saveCache/assignDisplay/unassignDisplay/CACHE_PATH/CACHE_VERSION + _scanLeases preservation)
    - raspberry/server/__tests__/receivers.service.test.js (162 → 365 lignes — +11 tests cache resilience)

key-decisions:
  - "fs natif (pas fs-extra) : raspberry/server n'a pas fs-extra dans ses deps, fs.writeFileSync + renameSync atomiques sont suffisants"
  - "displayIndex: null par défaut sur toute entry (pas undefined) — sérialisation JSON propre, comparaison stricte != null pour preservation"
  - "loadCache appelé dans start(io) AVANT le scan initial — restore offline avant tout I/O réseau"
  - "Préservation _scanLeases : MAC assignée disparue NON supprimée du state (résilience Fire Stick éteint, cf. VISION.md edge case 'Pi off → recovery au reboot')"
  - "Version forward-compat : un cache version 999 est ignoré (warn + state vide), pas de crash"

patterns-established:
  - "Pattern atomic write côté raspberry/server : writeFileSync(tmp) + renameSync(tmp, final) wrappé dans try/catch best-effort (warn, pas de throw)"
  - "Pattern cache resilience : load au boot AVANT scan, save après chaque mutation, version frontmatter pour évolution"

requirements-completed: [DETECT-03]

duration: 12 min
completed: 2026-05-06
---

# Phase 5 Plan 2: Cache Resilience Summary

**ReceiversService cache local résilient — atomic write + reboot recovery, mapping MAC↔display persiste cross-reboot sans appel cloud, MACs assignées offline préservées dans le state.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-06T10:32:00Z (RED commit `943887b`)
- **Completed:** 2026-05-06T10:44:00Z (GREEN commit `3358c88`)
- **Tasks:** 1 (TDD : RED + GREEN)
- **Files modified:** 2 (1 service étendu, 1 test étendu)

## Accomplishments

- `loadCache()` synchrone au boot — hydrate `_state` depuis `/home/pi/neopro/.receivers-cache.json`
- `saveCache()` atomic write (`tmp` + `rename`) — best-effort, log warn si fail (pas de throw)
- `assignDisplay(mac, displayIndex)` / `unassignDisplay(mac)` — mutent + persistent + émettent
- `_state` étendu : `{ kind, lastSeenAt, displayIndex: number | null }`
- `_scanLeases()` préserve les MACs assignées (`displayIndex !== null`) même quand absentes du leases (résilience Fire Stick éteint)
- Tolérance complète : ENOENT, JSON corrupt, version inconnue → warn + state vide, pas de crash
- 21/21 tests Jest verts (10 plan 01 + 11 plan 02)

## Task Commits

1. **Task 1 RED — failing tests** — `943887b` (test) — 11 nouveaux tests qui échouent (`assignDisplay is not a function`)
2. **Task 1 GREEN — implement cache resilience** — `3358c88` (feat) — toutes les méthodes + préservation _scanLeases, 21/21 verts

**Plan metadata:** _(commit final ci-dessous)_

## Files Created/Modified

- `raspberry/server/services/receivers.service.js` (231 → 384 lignes)
  - +`loadCache()`, +`saveCache()`, +`assignDisplay()`, +`unassignDisplay()`
  - +`CACHE_PATH` (env `NEOPRO_ROOT` or `/home/pi/neopro`) + `CACHE_VERSION=1`
  - `_state` value étendu avec `displayIndex`
  - `_scanLeases()` preserve les MACs assignées
  - `start(io)` appelle `loadCache()` AVANT le premier scan
- `raspberry/server/__tests__/receivers.service.test.js` (162 → 365 lignes)
  - +11 tests : 4 loadCache (ENOENT/corrupt/valid/version mismatch), 3 assign/unassign, 1 saveCache atomic order, 1 reboot scenario, 2 _scanLeases preservation

## Decisions Made

- **fs natif vs fs-extra** : raspberry/server n'a pas fs-extra dans ses deps (utilisé côté sync-agent uniquement). `fs.writeFileSync` + `fs.renameSync` sont synchrones et atomiques sur Linux — suffisants pour ce cache léger.
- **Pas de chmod 600** : le cache contient un mapping MAC↔displayIndex, pas de secret. Permissions par défaut 644 OK (cohérent avec l'absence de PSK / token).
- **Préservation par assignment, pas par OUI kind** : la condition `displayIndex !== null` est le seul critère pour garder une entry offline. Une MAC `firestick` non-assignée disparue est supprimée comme une `browser` — le rôle métier (assigné = écran configuré) prime sur le hardware kind.
- **forward-compat version** : si un futur cache `v2` est présent sur un Pi rollback en `v1`, on ignore + warn plutôt que de crasher → continuité de service.

## Deviations from Plan

None - plan executed exactly as written. TDD flow strict (RED `943887b` → GREEN `3358c88`), zéro fix de bug en cours de route, aucune dépendance ajoutée.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

- **Mock fs.readFileSync conflict** : la mock initiale renvoyait `''` pour TOUS les paths, ce qui faisait passer `loadCache()` en mode "JSON corrupt" silencieusement et perturbait les tests existants. Fixé en faisant le mock par défaut throw ENOENT pour `*.receivers-cache.json` et `''` pour les autres paths (compat tests plan 01).

## User Setup Required

None — le cache se crée automatiquement au premier `assignDisplay()`. Pas de migration, pas de provisioning manuel.

## Next Phase Readiness

- **Plan 05-detect-03** (state.service + sync-agent integration) déblocable. Le pattern `assignDisplay/unassignDisplay` est l'API que le state.service consommera côté server.js boot et que le sync-agent relayera vers le cloud.
- **Phase 7 CLOUD** prête : le cache local sera hydraté par socket events `receiver-assigned` depuis le cloud (source de vérité).
- **Pas de blocker connu**. Le cache est strictement Pi-side, zéro dépendance réseau.

## Self-Check: PASSED

- File `raspberry/server/services/receivers.service.js` exists on disk (vérifié)
- File `raspberry/server/__tests__/receivers.service.test.js` exists on disk (vérifié)
- Commits `943887b` (RED) et `3358c88` (GREEN) confirmés dans `git log --oneline`
- 21/21 tests Jest passing (`cd raspberry/server && npx jest --testPathPattern='receivers.service' --no-coverage`)
- Tous les acceptance grep checks OK : `loadCache`, `saveCache`, `assignDisplay|unassignDisplay`, `\.receivers-cache\.json`, `renameSync`, `CACHE_VERSION`
- Test count : 21 (≥18 requis)
