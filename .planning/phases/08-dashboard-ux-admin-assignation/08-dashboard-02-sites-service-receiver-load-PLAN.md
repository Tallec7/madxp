---
phase: 08-dashboard-ux-admin-assignation
plan: 02
type: execute
wave: 2
depends_on: [08-dashboard-01-models-receiver-config-PLAN.md]
files_modified:
  - central-dashboard/src/app/core/services/sites.service.ts
  - central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts
  - central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.html
autonomous: true
requirements: [DASHBOARD-01, DASHBOARD-03]
must_haves:
  truths:
    - 'SitesService.getConnectedReceivers(siteId) returns Observable<{receivers: ReceiverInfo[]}>'
    - 'site-settings-tab loads connectedReceivers in ngOnInit in parallel with existing loads'
    - 'connectedReceivers is passed via [connectedReceivers] input to app-displays-editor in template'
    - 'API error silently falls back to connectedReceivers = [] (no crash)'
  artifacts:
    - path: 'central-dashboard/src/app/core/services/sites.service.ts'
      provides: 'getConnectedReceivers() method'
      exports: ['getConnectedReceivers']
    - path: 'central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts'
      provides: 'connectedReceivers field + ngOnInit load'
      contains: 'connectedReceivers'
  key_links:
    - from: 'site-settings-tab.component.ts'
      to: 'GET /api/sites/:id/connected-receivers'
      via: 'sitesService.getConnectedReceivers(this.siteId)'
      pattern: 'getConnectedReceivers'
    - from: 'site-settings-tab.component.html'
      to: 'displays-editor.component.ts'
      via: '[connectedReceivers]="connectedReceivers"'
      pattern: 'connectedReceivers'
---

# Plan 08-02: SitesService + data load in site-settings-tab

## Objective

Add `getConnectedReceivers()` to `SitesService`, load it in `site-settings-tab.component.ts` `ngOnInit`, and pass the result via `[connectedReceivers]` input binding on `<app-displays-editor>` in the template.

Purpose: Bridge between the already-delivered API (`GET /api/sites/:id/connected-receivers`) and the `displays-editor` component that will render the dropdown. Without this wiring, the UX component (Plan 03) has no data source.

Output: Service method + component field + template binding. No UI changes yet.

## Context

`SitesService` at `central-dashboard/src/app/core/services/sites.service.ts` uses `this.api.get<T>(endpoint)` pattern (Observable-based via `ApiService`, not `fetch()`). The pattern for N-display configuration at line 72-78 is the reference.

`site-settings-tab.component.ts` `ngOnInit` (line 175) already loads multiple things sequentially. The receivers load must be added in parallel (not chained) — single call, no polling, error → `connectedReceivers = []`.

The template at line 546-549 passes `[displays]` to `<app-displays-editor>`. Add `[connectedReceivers]` alongside it.

`displays-editor.component.ts` does not yet have a `connectedReceivers` input — Plan 03 adds it. This plan adds the binding in the template; Angular will compile fine because `app-displays-editor` accepts unknown inputs gracefully until Plan 03 is applied. However, to be safe: add the template binding AND check that the Karma test suite still passes after both plans are applied.

## Interfaces (from Plan 01 — needed by this plan)

```typescript
// From central-dashboard/src/app/core/models/index.ts (added in Plan 01)
export interface ReceiverInfo {
  mac: string; // 'AA:BB:CC:DD:EE:FF'
  kind: 'pi_native' | 'firestick' | 'browser';
  lastSeenAt: string; // ISO8601
}
```

## Tasks

<task type="auto" tdd="true">
  <name>Task 1: Add getConnectedReceivers() to SitesService</name>
  <files>central-dashboard/src/app/core/services/sites.service.ts</files>
  <behavior>
    - getConnectedReceivers(siteId: string) returns Observable<{receivers: ReceiverInfo[]}>
    - Uses this.api.get<{receivers: ReceiverInfo[]}> — never fetch()
    - Endpoint: /sites/${siteId}/connected-receivers
    - Method is placed in the "N-display configuration" section (after updateDisplays at line ~78)
    - Import ReceiverInfo from '../models' (or '../models/index') at the top of the file
  </behavior>
  <action>
In `central-dashboard/src/app/core/services/sites.service.ts`:

1. Add `ReceiverInfo` to the import from `'../models'` (or wherever `DisplayConfig` is currently imported from).

2. After `updateDisplays()` (currently at line ~76-78), add:

```typescript
// Phase 8: Fire Stick receiver assignation
getConnectedReceivers(siteId: string): Observable<{ receivers: ReceiverInfo[] }> {
  return this.api.get<{ receivers: ReceiverInfo[] }>(`/sites/${siteId}/connected-receivers`);
}
```

Do NOT use `fetch()`. Do NOT use `HttpClient` directly — always `this.api.get<T>()`.
</action>
<verify>
<automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56 && grep -n "getConnectedReceivers" central-dashboard/src/app/core/services/sites.service.ts</automated>
</verify>
<done> - `getConnectedReceivers` method present in sites.service.ts - Method signature: `getConnectedReceivers(siteId: string): Observable<{ receivers: ReceiverInfo[] }>` - Uses `this.api.get<{receivers: ReceiverInfo[]}>` internally
</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Load connectedReceivers in site-settings-tab + wire template</name>
  <files>
    central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts
    central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.html
  </files>
  <behavior>
    - Component has field: connectedReceivers: ReceiverInfo[] = []
    - ngOnInit calls this.sitesService.getConnectedReceivers(this.siteId) in parallel with existing loads
    - On success: this.connectedReceivers = response.receivers
    - On error: this.connectedReceivers = [] (silent, no notification — Pi offline is normal)
    - Template binding: [connectedReceivers]="connectedReceivers" added on <app-displays-editor>
    - SitesService is injected (check if already injected — it may not be; use SiteSettingsDataService pattern)
    - Import ReceiverInfo from '../../../../core/models'
  </behavior>
  <action>
In `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts`:

1. Add `ReceiverInfo` to the import from `'../../../../core/models'` (same line as `DisplayConfig`).

2. Check if `SitesService` is already injected. If NOT (verify by reading the constructor and imports), import it:

```typescript
import { SitesService } from '../../../../core/services/sites.service';
```

And inject in constructor: `private sitesService: SitesService`.

NOTE: The component uses `SiteSettingsDataService` for most API calls. For the connected-receivers call, either:

- Inject `SitesService` directly (preferred — keeps the new method colocated with its service), OR
- Add a `loadConnectedReceivers(siteId)` wrapper in `SiteSettingsDataService` that delegates to `SitesService`.
  Use direct injection of `SitesService` for simplicity.

3. Add class field in the "Displays N-display" section (near line 126):

```typescript
// Phase 8: Fire Stick receiver assignation
connectedReceivers: ReceiverInfo[] = [];
```

4. In `ngOnInit()`, after the displays loading block (lines ~214-218), add the receiver load call:

```typescript
// Load connected receivers for Fire Stick assignment dropdown
this.sitesService.getConnectedReceivers(this.siteId).subscribe({
  next: (response) => {
    this.connectedReceivers = response.receivers;
  },
  error: () => {
    this.connectedReceivers = []; // Pi offline — dropdown will show empty state
  },
});
```

In `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.html`:

5. Find the `<app-displays-editor>` element (around line 546-549):

```html
<app-displays-editor
  [displays]="siteDisplays"
  (displaysChange)="saveDisplays($event)"
></app-displays-editor>
```

Add `[connectedReceivers]="connectedReceivers"` input:

```html
<app-displays-editor
  [displays]="siteDisplays"
  [connectedReceivers]="connectedReceivers"
  (displaysChange)="saveDisplays($event)"
></app-displays-editor>
```

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56 && grep -n "connectedReceivers" central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.html</automated>
  </verify>
  <done>
    - `connectedReceivers: ReceiverInfo[] = []` field on component class
    - `getConnectedReceivers` call in ngOnInit with success/error handlers
    - `[connectedReceivers]="connectedReceivers"` binding on `<app-displays-editor>` in template
    - TypeScript compiles without errors on these files
  </done>
</task>

## Verification

- `grep -n "getConnectedReceivers" central-dashboard/src/app/core/services/sites.service.ts` → method found
- `grep -n "connectedReceivers" central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts` → field + ngOnInit call found
- `grep -n "connectedReceivers" central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.html` → template binding found
- `npx tsc --project central-dashboard/tsconfig.json --noEmit` exits 0

## Success Criteria

- Opening the Écrans tab for any site calls `GET /api/sites/:id/connected-receivers` once
- If the Pi is offline (API returns error), `connectedReceivers` stays `[]` — no unhandled error
- `[connectedReceivers]` is bound in the template and ready for Plan 03 to consume

## Output

After completion, create `.planning/phases/08-dashboard-ux-admin-assignation/08-dashboard-02-SUMMARY.md` with:

- Files modified: sites.service.ts, site-settings-tab.component.ts, site-settings-tab.component.html
- New method: SitesService.getConnectedReceivers(siteId)
- New field: SiteSettingsTabComponent.connectedReceivers: ReceiverInfo[]
- Template binding added on app-displays-editor
