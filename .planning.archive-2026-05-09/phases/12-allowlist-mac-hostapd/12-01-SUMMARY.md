---
phase: 12-allowlist-mac-hostapd
plan: 01
subsystem: monitoring
tags: [prometheus, winston, socket.io, metrics, firestick, receivers]

# Dependency graph
requires:
  - phase: 09-observe-metriques-smoke
    provides: receiversBySite Map + smoke-receivers-discovery test suite + recordReceiver pattern
  - phase: 05-detect
    provides: receivers.service.js Pi-side + ReceiverInfo interface
provides:
  - Counter neopro_hotspot_unknown_firestick_total{site_id} sur /metrics
  - Log Winston warn avec siteId+mac+lastSeenAt a la premiere detection
  - Dedup process-scope Map<siteId, Set<mac>> dans socket.service.ts
  - 9 nouveaux smoke tests dans smoke-receivers-discovery.test.ts
affects: [13-alerts-disconnect, grafana-dashboards, observability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Counter Prometheus sans label mac (high-cardinality guard) — label site_id uniquement'
    - 'Dedup process-scope Map<siteId, Set<mac>> dans le handler state-sync pour eviter le spam'
    - 'TDD RED→GREEN: smoke assertions ecrites avant implementation, verifiees en echec puis en succes'

key-files:
  created:
    - .planning/phases/12-allowlist-mac-hostapd/12-01-SUMMARY.md
  modified:
    - central-server/src/services/metrics.service.ts
    - central-server/src/services/socket.service.ts
    - central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts

key-decisions:
  - '12-01: label site_id uniquement sur neopro_hotspot_unknown_firestick_total — mac comme label = cardinalite elevee refusee'
  - '12-01: dedup Map<siteId, Set<mac>> scope process dans socket.service.ts — reset au reboot Railway acceptable (granularite session process)'
  - '12-01: kind=browser (telephones benevoles) jamais compte — seuls kind=firestick && displayIndex===null sont detectes'
  - '12-01: smoke tests ecrites AVANT implementation (TDD) pour figer les contrats de wiring'

patterns-established:
  - 'Pattern dedup state-sync: Map<siteId, Set<mac>> added beside receiversBySite — meme section private members'
  - 'Pattern recorder Phase 12: recordHotspotUnknownFirestick(siteId) immediatement apres recordReceiver()'

requirements-completed: [OBSERVE-01, OBSERVE-02]

# Metrics
duration: 25min
completed: 2026-05-08
---

# Phase 12 Plan 01: Server Unknown Firestick Metric Summary

**Counter Prometheus `neopro_hotspot_unknown_firestick_total{site_id}` + log Winston warn pour les Fire Sticks non assignes detectes sur le hotspot, avec dedup (siteId, mac) process-scope pour eviter le spam a chaque tick state-sync**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-08T06:55:21Z
- **Completed:** 2026-05-08T07:20:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Counter `neopro_hotspot_unknown_firestick_total{site_id}` expose sur `/metrics` — observable depuis Grafana
- Log Winston `warn` avec `siteId`, `mac`, `lastSeenAt` emis a la premiere detection par session process
- Dedup `Map<string, Set<string>>` dans socket.service.ts — le Counter n'est incremente qu'UNE FOIS par (siteId, mac) meme si state-sync arrive toutes les 10s
- 9 nouveaux smoke tests verts dans `smoke-receivers-discovery.test.ts` (21 total — 12 existants + 9 nouveaux)

## Task Commits

1. **Task 1: Counter + recorder + smoke guard** - `17669b0b` (feat)
2. **Task 2: state-sync hook + dedup Map + Winston warn** - `3a6fc7ee` (feat)

## Files Created/Modified

- `central-server/src/services/metrics.service.ts` — Counter `hotspotUnknownFirestickTotal` + methode `recordHotspotUnknownFirestick(siteId)`
- `central-server/src/services/socket.service.ts` — Map `unknownFirestickSeenBySite` + detection dans `socket.on('state-sync')` handler
- `central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts` — 9 assertions Phase 12 OBSERVE dans un nouveau describe block

## Decisions Made

- Label `site_id` uniquement (pas `mac`) — un label par Fire Stick = cardinalite O(flotte \* N_firesticks) → refus; le `mac` reste dans le log Winston
- Dedup scope process (pas Redis) — acceptable car un redemarrage Railway remet le compteur a zero avec une nouvelle session; la granularite est "Fire Stick inconnu depuis le dernier boot cloud"
- `kind === 'browser'` (telephones benevoles) jamais compte — le hotspot reste ouvert pour eux, seuls les Fire Sticks oublies en assignation doivent alerter
- TDD: smoke tests ecrits en RED avant l'implementation pour garantir que les assertions figuent le contrat observable, pas le code interne

## Deviations from Plan

None - plan execute exactement comme ecrit.

## Issues Encountered

- `ts-jest` absent du worktree (pas de `node_modules/`): cree un symlink `central-server/node_modules -> main-repo/central-server/node_modules` pour lancer les tests depuis la worktree.
- Pre-existing lint warnings (`any`) dans socket.service.ts (23 warnings existant avant la PR) — aucun introduce par cette PR, hors perimetre (scope boundary rule).

## User Setup Required

None - no external service configuration required. La metrique apparait automatiquement sur `/metrics` a la prochaine detection d'un Fire Stick non assigne.

## Next Phase Readiness

- Counter `neopro_hotspot_unknown_firestick_total` pret pour ajout d'un panel Grafana dans "NeoPro Blind Spots"
- Phase 12 Plan 02 (allowlist MAC hostapd): peut brancher sur ce Counter pour corroboler les rejections hostapd avec les Fire Sticks inconnus

---

_Phase: 12-allowlist-mac-hostapd_
_Completed: 2026-05-08_
