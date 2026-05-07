---
phase: 07-cloud-api-sync-agent
plan: '01'
subsystem: central-server
tags: [cloud, receivers, firestick, socket-io, rest-api, tdd]
dependency_graph:
  requires: []
  provides:
    [
      GET /api/sites/:id/connected-receivers,
      ReceiverInfo interface,
      socketService.getConnectedReceivers,
    ]
  affects:
    [
      central-server/src/services/socket.service.ts,
      central-server/src/controllers/sites.controller.ts,
      central-server/src/routes/sites.routes.ts,
    ]
tech_stack:
  added: []
  patterns: [in-memory Map volatile state, state-sync relay extension, TDD green tests]
key_files:
  created:
    - central-server/src/__tests__/sites-connected-receivers.test.ts
  modified:
    - central-server/src/services/socket.service.ts
    - central-server/src/controllers/sites.controller.ts
    - central-server/src/routes/sites.routes.ts
decisions:
  - 'ReceiverInfo interface exported from socket.service.ts (co-located with Map implementation)'
  - '__setReceiversForTest() test-only helper added (__ prefix signals non-production API)'
  - 'Route uses authenticate + requireRole(admin,operator) + adminRateLimit + validateParams pattern (identical to /:id/displays)'
  - 'Logger.info on first siteId seen only (avoids noisy repeated logs on every state-sync)'
metrics:
  duration: '~20 min'
  completed_date: '2026-05-07'
  tasks_completed: 3
  files_changed: 4
---

# Phase 7 Plan 01: Connected Receivers Map — Summary

Route REST `GET /api/sites/:id/connected-receivers` exposant les MACs auto-détectées par le Pi via in-memory Map alimentée par l'extension du handler `state-sync`.

## What Was Built

- **SocketService** : `ReceiverInfo` interface exportée, champ `receiversBySite: Map<string, ReceiverInfo[]>`, extraction depuis `state-sync` (3 lignes ajoutées au relay ADR-059 existant), méthode publique `getConnectedReceivers(siteId)` triée par `lastSeenAt` desc, helper test `__setReceiversForTest()`
- **Controller** : `getConnectedReceivers` exporté dans `sites.controller.ts`, import `socketService` top-level (pattern identique aux autres controllers)
- **Route** : `GET /:id/connected-receivers` dans `sites.routes.ts` avec `authenticate + requireRole('admin','operator') + adminRateLimit + validateParams(paramSchemas.id)` — placée avant `/:id/displays`
- **Tests** : 3/3 Jest verts : tri desc par lastSeenAt, siteId inconnu → [], no auth → 401

## Commits

| Hash       | Description                                                                     |
| ---------- | ------------------------------------------------------------------------------- |
| `85fa97fb` | feat(07-cloud-01): SocketService — Map receivers + extraction depuis state-sync |
| `99be85f0` | feat(07-cloud-01): route GET /:id/connected-receivers + controller              |
| `1a6418d8` | test(07-cloud-01): Jest tests for GET /api/sites/:id/connected-receivers        |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `central-server/src/services/socket.service.ts` modified with Map + interface + methods
- [x] `central-server/src/controllers/sites.controller.ts` modified with getConnectedReceivers
- [x] `central-server/src/routes/sites.routes.ts` modified with route
- [x] `central-server/src/__tests__/sites-connected-receivers.test.ts` created with 3 tests
- [x] Commits 85fa97fb, 99be85f0, 1a6418d8 in git log
- [x] 3943 tests pass (all suites, no regressions)

## Self-Check: PASSED
