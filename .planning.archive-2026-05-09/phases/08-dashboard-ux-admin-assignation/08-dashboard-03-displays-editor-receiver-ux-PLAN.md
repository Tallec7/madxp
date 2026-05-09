---
phase: 08-dashboard-ux-admin-assignation
plan: 03
type: execute
wave: 3
depends_on:
  - 08-dashboard-01-models-receiver-config-PLAN.md
  - 08-dashboard-02-sites-service-receiver-load-PLAN.md
files_modified:
  - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts
autonomous: true
requirements: [DASHBOARD-01, DASHBOARD-02, DASHBOARD-03]
must_haves:
  truths:
    - "Display row index 0 (Pi native) shows grey badge '🖥️ Pi HDMI' — read-only, no action button"
    - "Display with receiver.kind='firestick' shows green badge '📺 AA:BB…FF' + toggle button ▾"
    - "Display with no receiver (index > 0) shows '[+ Assigner]' blue text button"
    - 'Clicking [+ Assigner] or toggle opens a dropdown with ReceiverInfo[] entries'
    - 'Clicking a MAC in the dropdown emits displaysChange with receiver assigned to that display'
    - "The '— Désassigner' option in dropdown emits displaysChange with receiver: null for that display"
    - 'Dropdown closes on outside click'
    - "Dropdown shows 'Aucun récepteur détecté (Pi hors-ligne ?)' when connectedReceivers is empty"
    - 'Dropdown positioned position:fixed to escape overflow:hidden containers'
  artifacts:
    - path: 'central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts'
      provides: '3-state badge + assign/unassign dropdown'
      contains: 'connectedReceivers'
  key_links:
    - from: 'displays-editor.component.ts badge'
      to: 'displaysChange EventEmitter'
      via: 'assignReceiver() / unassignReceiver() → displaysChange.emit([...this.displays])'
      pattern: 'displaysChange.emit'
    - from: 'dropdown open()'
      to: 'position:fixed coordinates'
      via: 'getBoundingClientRect() on trigger button → dropdownTop/dropdownLeft'
      pattern: 'getBoundingClientRect'
---

# Plan 08-03: displays-editor — 3-state badge + assign/unassign dropdown

## Objective

Extend `DisplaysEditorComponent` with the full receiver UX: `@Input() connectedReceivers`, 3-state inline badge per display row, custom `position:fixed` dropdown for assignment, and emit `displaysChange` on assign/unassign.

Purpose: This is the core user-facing feature — the super_admin selects a detected MAC from a dropdown and the display is assigned. No free-text input. Reversible via the "Désassigner" option.

Output: Complete receiver UX in a single self-contained standalone component.

## Context

`DisplaysEditorComponent` is standalone, uses `ChangeDetectionStrategy.OnPush`. It already has:

- `@Input() displays: DisplayConfig[]`
- `@Output() displaysChange = new EventEmitter<DisplayConfig[]>()`
- `.template-menu` CSS class (white bg, border `#e2e8f0`, shadow, border-radius 8px) — **reuse this style for the receiver dropdown**
- `imports: [CommonModule, FormsModule]`

Add `ElementRef` and `ChangeDetectorRef` injections for dropdown positioning and OnPush compatibility.

The dropdown must use `position: fixed` (same pattern as `.vss__dropdown` in `video-search-select.component.ts`) to escape `overflow: hidden` in the parent settings card. Coordinates computed from `getBoundingClientRect()` on the trigger button.

## Interfaces (from Plan 01)

```typescript
interface ReceiverConfig {
  kind: 'pi_native' | 'firestick' | 'browser';
  mac?: string;
  last_seen_at?: string;
}

interface ReceiverInfo {
  mac: string;
  kind: 'pi_native' | 'firestick' | 'browser';
  lastSeenAt: string;
}

interface DisplayConfig {
  index: number;
  name: string;
  type: string;
  resolution?: string;
  receiver?: ReceiverConfig | null; // Phase 8
}
```

## Tasks

<task type="auto">
  <name>Task 1: Add @Input connectedReceivers + inject ElementRef/ChangeDetectorRef</name>
  <files>central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts</files>
  <action>
In the component class, add:

1. Update import line at top of file:

```typescript
import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ElementRef,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
```

2. Update models import to include ReceiverConfig and ReceiverInfo:

```typescript
import { DisplayConfig, ReceiverConfig, ReceiverInfo } from '../../../../../core/models';
```

3. Add new class fields after the existing `@Output() displaysChange`:

```typescript
@Input() connectedReceivers: ReceiverInfo[] = [];

// Receiver dropdown state
activeDropdownIndex: number | null = null;
dropdownTop = 0;
dropdownLeft = 0;
```

4. Inject in constructor:

```typescript
constructor(
  private elementRef: ElementRef,
  private cdr: ChangeDetectorRef
) {}
```

Note: `DisplaysEditorComponent` currently has no constructor — add one.
</action>
<verify>
<automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56 && grep -n "connectedReceivers\|ElementRef\|ChangeDetectorRef\|activeDropdownIndex" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts | head -20</automated>
</verify>
<done> - @Input() connectedReceivers: ReceiverInfo[] = [] present - ElementRef and ChangeDetectorRef injected in constructor - activeDropdownIndex, dropdownTop, dropdownLeft fields present - HostListener imported
</done>
</task>

<task type="auto">
  <name>Task 2: Implement 3-state badge + dropdown in template + styles + methods</name>
  <files>central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts</files>
  <action>
This task modifies the component template, styles, and adds methods. Make all changes in a single pass.

### A) Template changes

In the `.display-row` `*ngFor` block, insert the receiver badge/button AFTER `.display-resolution` and BEFORE `.btn-remove` / `.display-locked`:

```html
<!-- Receiver badge — Phase 8 -->
<!-- State 1: Pi native (index 0 or kind=pi_native) -->
<span
  class="receiver-badge receiver-badge--native"
  *ngIf="display.index === 0 || display.receiver?.kind === 'pi_native'"
  title="Ecran principal — connecté directement au Pi"
  >🖥️ Pi HDMI</span
>

<!-- State 2: Fire Stick assigned -->
<ng-container
  *ngIf="display.index !== 0 && display.receiver?.kind === 'firestick' && display.receiver?.mac"
>
  <button
    class="receiver-badge receiver-badge--assigned"
    (click)="openReceiverDropdown($event, display.index)"
    [attr.data-display-index]="display.index"
    title="{{ display.receiver?.mac }}"
  >
    📺 {{ formatMac(display.receiver!.mac!) }} ▾
  </button>
</ng-container>

<!-- State 3: Unassigned (index > 0, no receiver or receiver is null) -->
<button
  class="receiver-badge receiver-badge--unassigned"
  *ngIf="display.index !== 0 && !display.receiver?.mac"
  (click)="openReceiverDropdown($event, display.index)"
  [attr.data-display-index]="display.index"
>
  + Assigner
</button>

<!-- Receiver dropdown (position:fixed, portaled via ngIf) -->
<div
  class="receiver-dropdown template-menu"
  *ngIf="activeDropdownIndex === display.index"
  [style.top.px]="dropdownTop"
  [style.left.px]="dropdownLeft"
>
  <ng-container *ngIf="connectedReceivers.length > 0; else noReceivers">
    <button
      class="template-option"
      *ngFor="let r of connectedReceivers"
      (click)="assignReceiver(display.index, r)"
    >
      <span class="receiver-mac">{{ r.mac }}</span>
      <span class="receiver-lastseen"> — {{ formatLastSeen(r.lastSeenAt) }}</span>
    </button>
    <hr *ngIf="display.receiver?.mac" class="receiver-dropdown-sep" />
    <button
      class="template-option receiver-unassign"
      *ngIf="display.receiver?.mac"
      (click)="unassignReceiver(display.index)"
    >
      — Désassigner
    </button>
  </ng-container>
  <ng-template #noReceivers>
    <span class="receiver-empty">Aucun récepteur détecté (Pi hors-ligne ?)</span>
  </ng-template>
</div>
```

### B) Methods to add

```typescript
// --- Receiver UX (Phase 8) ---

formatMac(mac: string): string {
  // 'AA:BB:CC:DD:EE:FF' → 'AA:BB:C…FF'
  if (!mac || mac.length < 8) return mac;
  return mac.substring(0, 6) + '…' + mac.substring(mac.length - 2);
}

formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  return `il y a ${Math.floor(hrs / 24)}j`;
}

openReceiverDropdown(event: Event, displayIndex: number): void {
  event.stopPropagation();
  if (this.activeDropdownIndex === displayIndex) {
    this.activeDropdownIndex = null;
    this.cdr.markForCheck();
    return;
  }
  const btn = event.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  this.dropdownTop = rect.bottom + 4;
  this.dropdownLeft = rect.left;
  this.activeDropdownIndex = displayIndex;
  this.cdr.markForCheck();
}

assignReceiver(displayIndex: number, receiver: ReceiverInfo): void {
  this.displays = this.displays.map(d => {
    if (d.index !== displayIndex) return d;
    return {
      ...d,
      receiver: {
        kind: receiver.kind,
        mac: receiver.mac,
        last_seen_at: receiver.lastSeenAt,
      } as ReceiverConfig,
    };
  });
  this.activeDropdownIndex = null;
  this.displaysChange.emit([...this.displays]);
  this.cdr.markForCheck();
}

unassignReceiver(displayIndex: number): void {
  this.displays = this.displays.map(d => {
    if (d.index !== displayIndex) return d;
    return { ...d, receiver: null };
  });
  this.activeDropdownIndex = null;
  this.displaysChange.emit([...this.displays]);
  this.cdr.markForCheck();
}

@HostListener('document:click', ['$event'])
onDocumentClick(event: Event): void {
  if (this.activeDropdownIndex === null) return;
  if (!this.elementRef.nativeElement.contains(event.target)) {
    this.activeDropdownIndex = null;
    this.cdr.markForCheck();
  }
}
```

### C) Styles to add (append to existing styles array)

```css
/* Receiver badges (Phase 8) */
.receiver-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  white-space: nowrap;
  cursor: default;
  border: none;
  font-weight: 500;
}

.receiver-badge--native {
  background: #e2e8f0;
  color: #64748b;
}

.receiver-badge--assigned {
  background: #dcfce7;
  color: #166534;
  cursor: pointer;
  border: 1px solid #86efac;
}

.receiver-badge--assigned:hover {
  background: #bbf7d0;
}

.receiver-badge--unassigned {
  background: transparent;
  color: #3b82f6;
  cursor: pointer;
  text-decoration: underline;
  padding: 0.125rem 0.25rem;
}

.receiver-badge--unassigned:hover {
  color: #2563eb;
}

/* Receiver dropdown */
.receiver-dropdown {
  position: fixed;
  z-index: 9999;
  min-width: 260px;
  max-width: 360px;
  margin-top: 0;
}

.receiver-mac {
  font-family: monospace;
  font-size: 0.8rem;
}

.receiver-lastseen {
  color: #94a3b8;
  font-size: 0.75rem;
}

.receiver-empty {
  display: block;
  padding: 0.5rem 0.75rem;
  color: #94a3b8;
  font-size: 0.8125rem;
  font-style: italic;
}

.receiver-dropdown-sep {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 0.25rem 0;
}

.receiver-unassign {
  color: #dc2626 !important;
}

.receiver-unassign:hover {
  background: #fef2f2 !important;
}
```

### IMPORTANT — ordering in template

The receiver dropdown `<div>` uses `position: fixed` coordinates but is placed INSIDE the `*ngFor` row. This is intentional: `*ngIf="activeDropdownIndex === display.index"` ensures only one instance is rendered at a time. The `position: fixed` ensures it visually escapes the flex row boundaries.

Do NOT move it outside the `*ngFor` — that would break the `*ngIf` logic.
</action>
<verify>
<automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56 && npx tsc --project central-dashboard/tsconfig.json --noEmit 2>&1 | grep -i "displays-editor" | head -10; echo "TS exit: $?"</automated>
</verify>
<done> - All 3 badge states present in template with correct \*ngIf conditions - formatMac(), formatLastSeen(), openReceiverDropdown(), assignReceiver(), unassignReceiver() methods implemented - @HostListener('document:click') closes dropdown on outside click - Dropdown uses position:fixed with dropdownTop/dropdownLeft from getBoundingClientRect() - displaysChange.emit([...this.displays]) called with immutable copy on assign and unassign - cdr.markForCheck() called on every state change (OnPush compatibility) - Styles for all badge states and dropdown present - TypeScript compilation produces no errors on this file
</done>
</task>

## Verification

- `grep -n "formatMac\|assignReceiver\|unassignReceiver\|activeDropdownIndex\|position: fixed" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` returns all expected methods and style
- `grep -n "connectedReceivers" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` returns `@Input()` declaration and usage in template
- `npx tsc --project central-dashboard/tsconfig.json --noEmit` exits 0
- `npm run test:central` passes (Karma baseline not broken)

## Success Criteria

- Super_admin opens Écrans tab → each display row shows the correct badge state
- Clicking [+ Assigner] on an unassigned display opens dropdown with auto-detected MACs
- Clicking a MAC in dropdown calls `saveDisplays()` (via displaysChange emit) with receiver assigned
- Clicking "— Désassigner" calls `saveDisplays()` with `receiver: null`
- Clicking outside closes the dropdown without saving
- Empty connectedReceivers → dropdown shows "Aucun récepteur détecté (Pi hors-ligne ?)"
- Display index 0 shows grey "🖥️ Pi HDMI" badge — no action button

## Output

After completion, create `.planning/phases/08-dashboard-ux-admin-assignation/08-dashboard-03-SUMMARY.md` with:

- Files modified: displays-editor.component.ts
- New @Input: connectedReceivers: ReceiverInfo[]
- New methods: formatMac, formatLastSeen, openReceiverDropdown, assignReceiver, unassignReceiver
- Dropdown pattern: position:fixed, ElementRef.getBoundingClientRect(), HostListener outside-click
- CSS classes added: receiver-badge (3 variants), receiver-dropdown, receiver-mac, receiver-empty
