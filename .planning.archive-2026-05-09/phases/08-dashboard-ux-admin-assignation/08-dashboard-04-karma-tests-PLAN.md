---
phase: 08-dashboard-ux-admin-assignation
plan: 04
type: execute
wave: 4
depends_on:
  - 08-dashboard-01-models-receiver-config-PLAN.md
  - 08-dashboard-02-sites-service-receiver-load-PLAN.md
  - 08-dashboard-03-displays-editor-receiver-ux-PLAN.md
files_modified:
  - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts
  - central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.spec.ts
autonomous: true
requirements: [DASHBOARD-01, DASHBOARD-02, DASHBOARD-03]
must_haves:
  truths:
    - 'displays-editor spec covers all 3 badge state render conditions'
    - 'displays-editor spec verifies assign emits correct payload (receiver.mac set)'
    - 'displays-editor spec verifies unassign emits receiver: null for that display'
    - 'displays-editor spec verifies empty connectedReceivers shows empty state text'
    - 'site-settings-tab spec verifies getConnectedReceivers is called in ngOnInit'
    - 'npm run test:central exits 0 with all Phase 8 specs passing'
  artifacts:
    - path: 'central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts'
      provides: 'Karma tests for 3-state badge + assign/unassign + empty state'
      contains: 'connectedReceivers'
    - path: 'central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.spec.ts'
      provides: 'Karma test for getConnectedReceivers call in ngOnInit'
      contains: 'getConnectedReceivers'
  key_links:
    - from: 'displays-editor.component.spec.ts'
      to: 'displays-editor.component.ts'
      via: 'TestBed.configureTestingModule({ imports: [DisplaysEditorComponent] })'
      pattern: 'DisplaysEditorComponent'
---

# Plan 08-04: Karma tests — displays-editor + site-settings-tab

## Objective

Write Karma/TestBed tests for the Phase 8 receiver UX. Cover the three badge states, assign/unassign payloads, empty state, and the ngOnInit data load in `site-settings-tab`.

Purpose: Lock the behavior so future changes cannot silently break receiver assignment without a test failure. Required by project rule: "bug fixé → un test regression guard".

Output: `displays-editor.component.spec.ts` (new or extended) + `site-settings-tab.component.spec.ts` (extended) with targeted Phase 8 specs.

## Context

`DisplaysEditorComponent` is a standalone Angular component — Karma tests use `TestBed.configureTestingModule({ imports: [DisplaysEditorComponent] })`.

`SiteSettingsTabComponent` has many dependencies (DataService, NotificationService, etc.) — stub them in the Phase 8 spec additions. Focus tests on: does `ngOnInit` call `sitesService.getConnectedReceivers(this.siteId)` and handle the response?

Check if a spec file already exists for `displays-editor` — if yes, add a `describe('Phase 8 — Receiver UX')` block. If not, create the full spec file.

## Interfaces contract (for test data)

```typescript
const mockReceivers: ReceiverInfo[] = [
  { mac: 'AA:BB:CC:DD:EE:FF', kind: 'firestick', lastSeenAt: new Date().toISOString() },
  {
    mac: '11:22:33:44:55:66',
    kind: 'firestick',
    lastSeenAt: new Date(Date.now() - 120000).toISOString(),
  },
];

const displayUnassigned: DisplayConfig = {
  index: 1,
  name: 'TV Buvette',
  type: 'tv',
  resolution: '1920x1080',
};
const displayAssigned: DisplayConfig = {
  index: 1,
  name: 'TV Buvette',
  type: 'tv',
  resolution: '1920x1080',
  receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: new Date().toISOString() },
};
const displayNative: DisplayConfig = { index: 0, name: 'TV', type: 'tv', resolution: '1920x1080' };
```

## Tasks

<task type="auto" tdd="true">
  <name>Task 1: Karma tests for DisplaysEditorComponent Phase 8</name>
  <files>central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts</files>
  <behavior>
    - Test A: display.index=0 → badge with text containing 'Pi HDMI' is present, no Assigner button
    - Test B: display with receiver.kind='firestick' and mac → green badge contains truncated MAC (first 6 chars + '…')
    - Test C: display.index>0 with no receiver → '+ Assigner' button is present
    - Test D: click [+ Assigner] on unassigned display → dropdown becomes visible with receiver MACs listed
    - Test E: click a MAC in dropdown → displaysChange emits array where target display has receiver.mac set
    - Test F: click '— Désassigner' → displaysChange emits array where target display has receiver: null
    - Test G: connectedReceivers=[] → dropdown shows 'Aucun récepteur détecté' text
  </behavior>
  <action>
Check if `displays-editor.component.spec.ts` already exists. If it exists, append a `describe('Phase 8 — Receiver UX', ...)` block. If it does NOT exist, create the full spec file.

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DisplaysEditorComponent } from './displays-editor.component';
import { DisplayConfig, ReceiverInfo } from '../../../../../core/models';

describe('DisplaysEditorComponent — Phase 8 Receiver UX', () => {
  let fixture: ComponentFixture<DisplaysEditorComponent>;
  let component: DisplaysEditorComponent;

  const mockReceivers: ReceiverInfo[] = [
    { mac: 'AA:BB:CC:DD:EE:FF', kind: 'firestick', lastSeenAt: new Date().toISOString() },
    {
      mac: '11:22:33:44:55:66',
      kind: 'firestick',
      lastSeenAt: new Date(Date.now() - 120000).toISOString(),
    },
  ];

  const displayNative: DisplayConfig = {
    index: 0,
    name: 'TV',
    type: 'tv',
    resolution: '1920x1080',
  };
  const displayUnassigned: DisplayConfig = {
    index: 1,
    name: 'TV Buvette',
    type: 'tv',
    resolution: '1920x1080',
  };
  const displayAssigned: DisplayConfig = {
    index: 1,
    name: 'TV Buvette',
    type: 'tv',
    resolution: '1920x1080',
    receiver: {
      kind: 'firestick',
      mac: 'AA:BB:CC:DD:EE:FF',
      last_seen_at: new Date().toISOString(),
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DisplaysEditorComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(DisplaysEditorComponent);
    component = fixture.componentInstance;
  });

  it('Test A: display index 0 shows Pi HDMI badge (read-only)', () => {
    component.displays = [displayNative];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Pi HDMI');
    // No Assigner button for index 0
    const assignerBtn = el.querySelector('button.receiver-badge--unassigned');
    expect(assignerBtn).toBeNull();
  });

  it('Test B: display with firestick receiver shows truncated MAC badge', () => {
    component.displays = [displayAssigned];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // 'AA:BB:C…FF' — first 6 chars of MAC + … + last 2
    expect(el.textContent).toContain('AA:BB');
    const badge = el.querySelector('button.receiver-badge--assigned');
    expect(badge).toBeTruthy();
  });

  it('Test C: unassigned display (index > 0) shows Assigner button', () => {
    component.displays = [displayUnassigned];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const assignerBtn = el.querySelector('button.receiver-badge--unassigned');
    expect(assignerBtn).toBeTruthy();
    expect(assignerBtn!.textContent).toContain('Assigner');
  });

  it('Test D: clicking Assigner button opens dropdown with receiver MACs', () => {
    component.displays = [displayUnassigned];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector(
      'button.receiver-badge--unassigned',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    const dropdown = fixture.nativeElement.querySelector('.receiver-dropdown');
    expect(dropdown).toBeTruthy();
    expect(dropdown!.textContent).toContain('AA:BB:CC:DD:EE:FF');
  });

  it('Test E: clicking a MAC in dropdown emits displaysChange with receiver assigned', () => {
    component.displays = [displayUnassigned];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();
    // Open dropdown
    const btn = fixture.nativeElement.querySelector(
      'button.receiver-badge--unassigned',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    let emitted: DisplayConfig[] | undefined;
    component.displaysChange.subscribe((val: DisplayConfig[]) => (emitted = val));

    // Click first option in dropdown
    const options = fixture.nativeElement.querySelectorAll('.receiver-dropdown .template-option');
    expect(options.length).toBeGreaterThan(0);
    (options[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted).toBeDefined();
    const assigned = emitted!.find((d) => d.index === 1);
    expect(assigned?.receiver?.mac).toBe('AA:BB:CC:DD:EE:FF');
    expect(assigned?.receiver?.kind).toBe('firestick');
  });

  it('Test F: clicking Désassigner emits displaysChange with receiver: null', () => {
    component.displays = [displayAssigned];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();
    // Open dropdown via assigned badge
    const btn = fixture.nativeElement.querySelector(
      'button.receiver-badge--assigned',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    let emitted: DisplayConfig[] | undefined;
    component.displaysChange.subscribe((val: DisplayConfig[]) => (emitted = val));

    const unassignBtn = fixture.nativeElement.querySelector(
      '.receiver-unassign',
    ) as HTMLButtonElement;
    expect(unassignBtn).toBeTruthy();
    unassignBtn.click();
    fixture.detectChanges();

    expect(emitted).toBeDefined();
    const unassigned = emitted!.find((d) => d.index === 1);
    expect(unassigned?.receiver).toBeNull();
  });

  it('Test G: empty connectedReceivers shows empty state message', () => {
    component.displays = [displayUnassigned];
    component.connectedReceivers = [];
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector(
      'button.receiver-badge--unassigned',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Aucun récepteur détecté');
  });
});
```

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56 && npx karma start central-dashboard/karma.conf.js --single-run 2>&1 | grep -E "Phase 8|FAILED|ERROR|SUCCESS" | tail -20</automated>
  </verify>
  <done>
    - All 7 tests (A-G) defined in spec file
    - Tests use TestBed.configureTestingModule with imports: [DisplaysEditorComponent] (standalone)
    - Tests cover all 3 badge states + assign + unassign + empty state
    - No existing tests broken
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Karma test for site-settings-tab ngOnInit receiver load</name>
  <files>central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.spec.ts</files>
  <behavior>
    - Test H: ngOnInit calls sitesService.getConnectedReceivers(siteId) exactly once
    - Test I: when getConnectedReceivers returns receivers, component.connectedReceivers is populated
    - Test J: when getConnectedReceivers errors, component.connectedReceivers stays []
  </behavior>
  <action>
Locate `site-settings-tab.component.spec.ts`. The file likely already exists with many tests. Find the existing stubs/spies setup. Add a `describe('Phase 8 — connectedReceivers load', ...)` block.

If `SitesService` is not already stubbed in the spec, add a spy for `getConnectedReceivers` to the existing mock setup. Use `of()` / `throwError()` from `rxjs` for the stub returns.

Example block to append:

```typescript
import { of, throwError } from 'rxjs';
import { ReceiverInfo } from '../../../../core/models';

// Inside the main describe block, add:
describe('Phase 8 — connectedReceivers load in ngOnInit', () => {
  const mockReceivers: ReceiverInfo[] = [
    { mac: 'AA:BB:CC:DD:EE:FF', kind: 'firestick', lastSeenAt: new Date().toISOString() },
  ];

  it('Test H: getConnectedReceivers is called once on ngOnInit', () => {
    // Arrange: spy on sitesService.getConnectedReceivers (or the injected service)
    const sitesServiceSpy = TestBed.inject(SitesService) as jasmine.SpyObj<SitesService>;
    sitesServiceSpy.getConnectedReceivers = jasmine
      .createSpy()
      .and.returnValue(of({ receivers: mockReceivers }));

    // Act
    fixture.componentInstance.siteId = 'test-site-id';
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    // Assert
    expect(sitesServiceSpy.getConnectedReceivers).toHaveBeenCalledOnceWith('test-site-id');
  });

  it('Test I: on success, connectedReceivers is populated', () => {
    const sitesServiceSpy = TestBed.inject(SitesService) as jasmine.SpyObj<SitesService>;
    sitesServiceSpy.getConnectedReceivers = jasmine
      .createSpy()
      .and.returnValue(of({ receivers: mockReceivers }));

    fixture.componentInstance.siteId = 'test-site-id';
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.connectedReceivers.length).toBe(1);
    expect(fixture.componentInstance.connectedReceivers[0].mac).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('Test J: on API error, connectedReceivers stays []', () => {
    const sitesServiceSpy = TestBed.inject(SitesService) as jasmine.SpyObj<SitesService>;
    sitesServiceSpy.getConnectedReceivers = jasmine
      .createSpy()
      .and.returnValue(throwError(() => new Error('Network error')));

    fixture.componentInstance.siteId = 'test-site-id';
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.connectedReceivers).toEqual([]);
  });
});
```

IMPORTANT: Adapt the spy setup to match however SitesService is provided in the existing spec (it may be provided as a class with jasmine.createSpyObj, or via a custom stub). Read the existing spec's `providers` array before adding code to ensure consistency.

If `SitesService` is not in the existing providers, add it:

```typescript
{ provide: SitesService, useValue: jasmine.createSpyObj('SitesService', ['getConnectedReceivers', 'getDisplays', 'updateDisplays']) }
```

  </action>
  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56 && npx karma start central-dashboard/karma.conf.js --single-run 2>&1 | grep -E "Phase 8|connectedReceivers|FAILED|ERROR|executed" | tail -20</automated>
  </verify>
  <done>
    - Tests H, I, J defined in site-settings-tab spec
    - Tests verify getConnectedReceivers call + success path + error fallback
    - No existing site-settings-tab tests broken
    - npm run test:central exits 0
  </done>
</task>

## Verification

- `grep -n "Phase 8\|connectedReceivers\|Assigner\|Désassigner" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts | wc -l` → > 10 lines
- `grep -n "getConnectedReceivers" central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.spec.ts` → tests found
- `npm run test:central` exits 0 (all 520+ existing tests still pass, plus new Phase 8 tests)

## Success Criteria

- 10 new Karma tests total (7 in displays-editor spec + 3 in site-settings-tab spec)
- All new tests green
- No regressions in existing test suite (520 baseline tests still pass)
- The regression guard is in place: if `assignReceiver()` is removed, Test E fails; if `unassignReceiver()` is removed, Test F fails; if ngOnInit load is removed, Test H fails

## Output

After completion, create `.planning/phases/08-dashboard-ux-admin-assignation/08-dashboard-04-SUMMARY.md` with:

- Files created/modified: displays-editor.component.spec.ts, site-settings-tab.component.spec.ts
- Tests added: 7 in displays-editor + 3 in site-settings-tab = 10 total
- Coverage: badge states A/B/C, dropdown open D, assign E, unassign F, empty state G, ngOnInit load H/I/J
- Test command: npm run test:central
