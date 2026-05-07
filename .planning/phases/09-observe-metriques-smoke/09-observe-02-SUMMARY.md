---
plan_id: '09-observe-02-smoke-receivers-discovery'
phase: 9
plan: 2
subsystem: smoke-tests
status: complete
commit: 620d8aa9
tags: [smoke, fire-stick, receivers, regression-guard]
dependency_graph:
  requires: []
  provides: [smoke-receivers-discovery-suite]
  affects: [central-server/__tests__/smoke, central-server/scripts/smart-smoke]
tech_stack:
  added: []
  patterns: [file-level-smoke-test]
key_files:
  created:
    - central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts
  modified:
    - central-server/src/scripts/smart-smoke.sh
decisions:
  - 'Pi receivers.service.js found at raspberry/server/services/ (not raspberry/src/app/services/), test covers both paths plus raspberry/server/src/services/'
  - '12 assertions produced (11 contracts + 1 extra path variant in receivers.service check)'
metrics:
  duration: 233s
  completed_date: '2026-05-07'
  tasks_completed: 2
  files_changed: 2
---

# Phase 9 Plan 2: smoke-receivers-discovery Summary

One-liner: File-level smoke suite pinning 11 Fire Stick wiring contracts (sync-agent, API route, dashboard models, nginx, dnsmasq, Pi service, socket Map) with smart-smoke.sh mapping.

## Delivered

- `central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts` — 12 assertions across 11 contracts, all PASS
- Smart-smoke mapping: `receivers\.service|ReceiverInfo|connected-receivers|receiver_assignment|dnsmasq\.conf=smoke-receivers-discovery`

## Contracts Pinned

1. sync-agent whitelist: `receiver_assignment_updated` in `raspberry/sync-agent/src/config.js` DEFAULT_ALLOWED_COMMANDS
2. API route: `connected-receivers` in `central-server/src/routes/sites.routes.ts`
3. Model: `ReceiverInfo` exported from `central-dashboard/src/app/core/models/index.ts`
4. Model: `ReceiverConfig` exported from `central-dashboard/src/app/core/models/index.ts`
5. Model: `DisplayConfig.receiver` field present in `models/index.ts` (Phase 8)
6. Service: `getConnectedReceivers` in `central-dashboard/src/app/core/services/sites.service.ts`
7. nginx: `/api/captive/whoami` location block in `raspberry/config/nginx/neopro-base.conf`
8. dnsmasq: `firetvcaptiveportal.com` DNS hijack in `raspberry/config/systemd/dnsmasq.conf`
9. dnsmasq: `spectrum.s3.amazonaws.com` DNS hijack in `raspberry/config/systemd/dnsmasq.conf`
10. Pi receivers.service.js exists at `raspberry/server/services/receivers.service.js`
11. socket.service.ts: `receiversBySite` Map declared + `getConnectedReceivers` method (2 separate assertions)

## Commits

| Hash     | Message                                                                                |
| -------- | -------------------------------------------------------------------------------------- |
| 620d8aa9 | test(smoke): add smoke-receivers-discovery suite — pins 11 Fire Stick wiring contracts |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one minor adjustment:

**1. [Rule 1 - Correctness] Pi receivers.service.js path adjusted**

- **Found during:** Pre-task verification
- **Issue:** Plan listed `raspberry/server/src/services/receivers.service.js` as a fallback path, but the actual file is at `raspberry/server/services/receivers.service.js` (no `src/` subdirectory)
- **Fix:** Added `raspberry/server/services/receivers.service.js` as a path variant in the `exists()` OR expression alongside the other candidates
- **Impact:** Test still passes correctly (12 assertions, 0 failures)

## Self-Check: PASSED

- smoke-receivers-discovery.test.ts: FOUND
- smart-smoke.sh mapping: FOUND
- commit 620d8aa9: FOUND
- Full smoke: 61 suites, 2121 tests — all PASS, no regressions
