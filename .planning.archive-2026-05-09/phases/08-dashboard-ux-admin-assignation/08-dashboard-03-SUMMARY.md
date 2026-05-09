---
plan_id: '08-dashboard-03-displays-editor-receiver-ux'
phase: 8
status: complete
commit: 6f1f4663
subsystem: central-dashboard
tags: [angular, displays, receiver, firestick, ux, phase8]
dependency_graph:
  requires: [08-dashboard-01, 08-dashboard-02]
  provides: [displays-editor receiver UX]
  affects: [site-settings-tab]
tech_stack:
  patterns:
    [
      position:fixed dropdown,
      ChangeDetectorRef OnPush,
      HostListener outside-click,
      ElementRef getBoundingClientRect,
    ]
key_files:
  modified:
    - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts
decisions:
  - 'position:fixed dropdown (same pattern as .vss__dropdown) to escape overflow:hidden parent containers'
  - '3-state badge via *ngIf conditions (pi_native/assigned/unassigned) instead of ngSwitch for clarity'
  - 'Inline dropdown inside *ngFor row — position:fixed handles visual escaping, *ngIf ensures single instance'
metrics:
  duration: '~10 min'
  completed: '2026-05-07'
  tasks: 2
  files_modified: 1
---

# Phase 8 Plan 03: displays-editor receiver UX Summary

Single-component implementation delivering the full receiver assignment UX for the Ecrans tab.

## Delivered

- `@Input() connectedReceivers: ReceiverInfo[]` on DisplaysEditorComponent
- 3-state badge inline in display row (after `.display-resolution`, before `.btn-remove`):
  - State 1 (index 0 / kind=pi_native): grey span "🖥️ Pi HDMI" — read-only
  - State 2 (firestick assigned): green button "📺 AA:BB…FF ▾" — opens dropdown
  - State 3 (unassigned, index > 0): blue text button "+ Assigner" — opens dropdown
- `position: fixed` dropdown with `getBoundingClientRect()` coordinates — escapes `overflow:hidden`
- `assignReceiver()` maps displays array immutably, emits `displaysChange` with spread copy
- `unassignReceiver()` sets `receiver: null`, emits `displaysChange`
- `@HostListener('document:click')` closes dropdown on outside click
- All state changes call `cdr.markForCheck()` for OnPush compatibility
- `formatMac()` abbreviates MAC to `AA:BB:…FF` for compact display
- `formatLastSeen()` converts ISO timestamp to relative "il y a N min/h/j"
- CSS classes added: `receiver-badge` (3 variants), `receiver-dropdown`, `receiver-mac`, `receiver-lastseen`, `receiver-empty`, `receiver-dropdown-sep`, `receiver-unassign`

## Files Modified

- `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
