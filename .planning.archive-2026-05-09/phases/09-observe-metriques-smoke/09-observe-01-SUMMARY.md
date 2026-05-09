---
plan_id: '09-observe-01-prometheus-receivers-metric'
phase: 9
plan: 1
status: complete
commit: 5ac40319
subsystem: central-server/metrics
tags: [prometheus, metrics, fire-stick, grafana, observability]
dependency_graph:
  requires: []
  provides: [neopro_receivers_total counter, recordReceiver method, grafana-panel-fire-sticks]
  affects: [metrics.service.ts, socket.service.ts, sites.controller.ts, grafana-overview-cloud]
tech_stack:
  added: []
  patterns: [prometheus-counter, metrics-service-method]
key_files:
  created: []
  modified:
    - central-server/src/services/metrics.service.ts
    - central-server/src/services/socket.service.ts
    - central-server/src/controllers/sites.controller.ts
    - docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json
decisions:
  - 'recordReceiver(disconnected) placed inside the siteId guard in handleDisconnection to only trace Pi agent disconnects (not dashboard/unknown sockets)'
  - 'detected metric fires on every state-sync with non-empty receivers array (not only isFirstSeen), tracking heartbeat cadence'
metrics:
  duration: '~10 min'
  completed: '2026-05-07'
  tasks_completed: 3
  files_modified: 4
---

# Phase 9 Plan 1: Prometheus neopro_receivers_total Summary

Counter `neopro_receivers_total{site_id, status}` exposing Fire Stick receiver transitions (detected/assigned/disconnected) in production via 3 call sites and a Grafana stat panel.

## Delivered

- Counter `neopro_receivers_total{site_id, status}` declared in `metrics.service.ts` (before DB metrics block)
- `recordReceiver(siteId, status)` method with typed union `'detected' | 'assigned' | 'disconnected'`
- Call site A: `socket.service.ts` state-sync handler — fires `detected` when receivers array is non-empty
- Call site B: `sites.controller.ts` updateSiteDisplays — fires `assigned` when at least one display has a `receiver.mac` string
- Call site C: `socket.service.ts` handleDisconnection — fires `disconnected` when a Pi agent (siteId-scoped) disconnects cleanly
- Grafana stat panel "Fire Sticks détectés" (id=10, y=12) added to `neopro-overview-cloud.json`
- `smoke-metrics-observability` passes (1 test, PASS)

## Verification

- `npx tsc --noEmit` → exit 0 (no errors)
- `grep recordReceiver socket.service.ts` → 2 occurrences (detected + disconnected)
- `grep recordReceiver sites.controller.ts` → 1 occurrence (assigned)
- JSON.parse neopro-overview-cloud.json → valid
- `smoke-metrics-observability` → PASS

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `central-server/src/services/metrics.service.ts` — modified (neopro_receivers_total counter + recordReceiver method)
- `central-server/src/services/socket.service.ts` — modified (2 recordReceiver calls)
- `central-server/src/controllers/sites.controller.ts` — modified (1 recordReceiver call + metricsService import)
- `docker/grafana/provisioning/dashboards/json/cloud/neopro-overview-cloud.json` — modified (Fire Sticks panel)
- Commit 5ac40319 verified in git log
