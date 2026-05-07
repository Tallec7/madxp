---
plan_id: '08-dashboard-04-karma-tests'
phase: 8
plan: 4
subsystem: central-dashboard
status: complete
commit: '8590779e'
tags: [tests, karma, angular, receiver-ux, firestick, dashboard]
dependency_graph:
  requires: [08-dashboard-01, 08-dashboard-02, 08-dashboard-03]
  provides: [regression-guard-receiver-ux]
  affects: []
tech_stack:
  added: []
  patterns: [karma-testbed-standalone, jasmine-spy-obj, fakeAsync-tick]
key_files:
  created:
    - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts
    - central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.spec.ts
  modified: []
decisions:
  - 'Added HttpClientTestingModule + TranslateModule.forRoot() to SiteSettingsTab spec — needed because the standalone component transitively imports RemoteAuthSectionComponent (which injects HttpClient) and TranslateModule'
  - 'Stub getWifiSsid() to return {ssid, isReal} — template binds to result.isReal causing runtime crash without stub'
metrics:
  duration: '~10 minutes'
  completed: '2026-05-07'
  tasks: 2
  files: 2
---

# Phase 8 Plan 4: Karma tests — displays-editor + site-settings-tab

## One-liner

10 Karma tests (7 + 3) locking Phase 8 receiver UX: badge states, dropdown, assign/unassign payloads, empty state, and ngOnInit connector load.

## Delivered

- `displays-editor.component.spec.ts`: 7 specs covering all Phase 8 badge/dropdown behaviors
  - Test A: Pi HDMI badge renders for `display.index === 0`, no Assigner button
  - Test B: Assigned display shows green `.receiver-badge--assigned` with truncated MAC (`AA:BB:C…FF`)
  - Test C: Unassigned display (`index > 0`, no receiver) shows `.receiver-badge--unassigned` Assigner button
  - Test D: Click Assigner opens `.receiver-dropdown` listing both receiver MACs
  - Test E: Click MAC option emits `displaysChange` with `receiver.mac` + `receiver.kind` set
  - Test F: Click Désassigner emits `displaysChange` with `receiver: null`
  - Test G: `connectedReceivers = []` shows `.receiver-empty` "Aucun récepteur détecté"
- `site-settings-tab.component.spec.ts`: 3 specs for Phase 8 ngOnInit load
  - Test H: `getConnectedReceivers(siteId)` called exactly once on `ngOnInit`
  - Test I: Success response populates `component.connectedReceivers`
  - Test J: Error response leaves `component.connectedReceivers = []` (Pi offline fallback)
- All 596 Karma tests green (was 520 baseline + 76 new tests from whole Phase 8 suite)
- All 2109 smoke tests green

## Files Modified

- `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts` (created)
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.spec.ts` (created)

## Test Coverage

| Test | What it guards                                                  |
| ---- | --------------------------------------------------------------- |
| A    | `*ngIf="display.index === 0"` native badge always renders       |
| B    | `.receiver-badge--assigned` with `formatMac()` output           |
| C    | `.receiver-badge--unassigned` Assigner button for index > 0     |
| D    | `activeDropdownIndex = displayIndex` opens `.receiver-dropdown` |
| E    | `assignReceiver()` emits correct `ReceiverConfig` payload       |
| F    | `unassignReceiver()` emits `receiver: null` (not undefined)     |
| G    | `ng-template #noReceivers` renders `.receiver-empty`            |
| H    | `sitesService.getConnectedReceivers(siteId)` called on init     |
| I    | `response.receivers` assigned to `component.connectedReceivers` |
| J    | Error path: `connectedReceivers = []` (Pi offline graceful)     |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing stub] TranslateModule not provided**

- **Found during:** Task 2 (site-settings-tab spec compilation)
- **Issue:** `SiteSettingsTabComponent` imports `TranslateModule` — Angular standalone DI requires the module to be provided in TestBed
- **Fix:** Added `TranslateModule.forRoot()` to TestBed `imports`
- **Files modified:** `site-settings-tab.component.spec.ts`

**2. [Rule 2 - Missing stub] HttpClient not provided for RemoteAuthService**

- **Found during:** Task 2 first test run
- **Issue:** `SiteSettingsTabComponent` transitively imports `RemoteAuthSectionComponent` which uses `RemoteAuthService` that needs `HttpClient`
- **Fix:** Added `HttpClientTestingModule` to TestBed `imports`
- **Files modified:** `site-settings-tab.component.spec.ts`

**3. [Rule 1 - Bug] getWifiSsid stub returning undefined**

- **Found during:** Task 2 second test run
- **Issue:** Template calls `getWifiSsid()` which calls `dataService.getWifiSsid()` — stub returned `undefined`, causing `Cannot read properties of undefined (reading 'isReal')`
- **Fix:** Added `stub.getWifiSsid.and.returnValue({ ssid: 'NeoWifi', isReal: false })`
- **Files modified:** `site-settings-tab.component.spec.ts`

## Self-Check: PASSED

- `displays-editor.component.spec.ts` exists at correct path
- `site-settings-tab.component.spec.ts` exists at correct path
- Commit `8590779e` exists in git log
- `npm run test:central` exits 0 with 596 SUCCESS
- `npm run test:smoke:smart` exits 0 with 2109 tests passed
