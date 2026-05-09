---
plan_id: '08-dashboard-02-sites-service-receiver-load'
phase: 8
plan: 2
status: complete
commit: a6126163
subsystem: central-dashboard
tags: [sites-service, fire-stick, receiver, angular]
dependency_graph:
  requires: [08-dashboard-01-models-receiver-config]
  provides: [getConnectedReceivers-method, connectedReceivers-field, template-binding]
  affects: [site-settings-tab, displays-editor]
tech_stack:
  patterns: [observable-api, silent-error-fallback]
key_files:
  modified:
    - central-dashboard/src/app/core/services/sites.service.ts
    - central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts
    - central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.html
decisions:
  - 'SitesService injected directly into site-settings-tab (not via SiteSettingsDataService) to keep the new method colocated with its service'
metrics:
  duration: '~5min'
  completed: '2026-05-07'
  tasks_completed: 2
  files_modified: 3
---

# Phase 8 Plan 2: SitesService + data load Summary

SitesService.getConnectedReceivers() wired to site-settings-tab ngOnInit with silent error fallback and template binding on app-displays-editor.

## Delivered

- `SitesService.getConnectedReceivers(siteId)` — Observable<{receivers: ReceiverInfo[]}>
- `site-settings-tab`: field `connectedReceivers: ReceiverInfo[] = []`
- `site-settings-tab`: ngOnInit loads receivers in parallel, error → [] (silent, Pi offline is normal)
- Template: `[connectedReceivers]="connectedReceivers"` on `<app-displays-editor>`

## Files Modified

- `central-dashboard/src/app/core/services/sites.service.ts` — added `ReceiverInfo` import + `getConnectedReceivers()` method after `updateDisplays()`
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts` — added `ReceiverInfo` import, `SitesService` import + injection, `connectedReceivers` field, ngOnInit call
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.html` — added `[connectedReceivers]="connectedReceivers"` on `<app-displays-editor>`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- sites.service.ts modified: FOUND (commit a6126163, +6 lines)
- site-settings-tab.component.ts modified: FOUND (commit a6126163, +15 lines)
- site-settings-tab.component.html modified: FOUND (commit a6126163, +1 line)
- TSC --noEmit: PASSED (no output = zero errors)
