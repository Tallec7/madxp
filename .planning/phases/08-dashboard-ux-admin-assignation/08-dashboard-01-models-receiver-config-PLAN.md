---
phase: 08-dashboard-ux-admin-assignation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-dashboard/src/app/core/models/index.ts
autonomous: true
requirements: [DASHBOARD-01, DASHBOARD-02, DASHBOARD-03]
must_haves:
  truths:
    - 'ReceiverConfig interface exists and is exported from core/models/index.ts'
    - 'ReceiverInfo interface exists and is exported from core/models/index.ts'
    - 'DisplayConfig has receiver?: ReceiverConfig | null optional field'
  artifacts:
    - path: 'central-dashboard/src/app/core/models/index.ts'
      provides: 'ReceiverConfig, ReceiverInfo interfaces + extended DisplayConfig'
      contains: 'ReceiverConfig'
  key_links:
    - from: 'central-dashboard/src/app/core/models/index.ts'
      to: 'displays-editor.component.ts'
      via: 'import { DisplayConfig, ReceiverConfig, ReceiverInfo }'
      pattern: 'ReceiverConfig'
---

# Plan 08-01: Models — ReceiverConfig + ReceiverInfo interfaces

## Objective

Add `ReceiverConfig` and `ReceiverInfo` TypeScript interfaces to `core/models/index.ts` and extend `DisplayConfig` with the optional `receiver` field.

Purpose: Establish the shared type contracts that Plans 02 and 03 depend on. Without these types, the service method and component input cannot be typed correctly.

Output: Two new exported interfaces and one extended interface in `core/models/index.ts`.

## Context

`DisplayConfig` at line 176 of `core/models/index.ts` currently has four fields: `index`, `name`, `type`, `resolution?`. Phase 8 adds receiver assignment to displays. The type extension must be backward-compatible (optional field, nullable).

The API `GET /api/sites/:id/connected-receivers` (already delivered in Phase 7) returns `{ receivers: ReceiverInfo[] }`. The `displays` JSONB column in the DB now accepts `receiver` in each display entry (Phase 4 + Phase 7 Joi schema already allows it).

## Tasks

<task type="auto" tdd="true">
  <name>Task 1: Add ReceiverConfig, ReceiverInfo, extend DisplayConfig</name>
  <files>central-dashboard/src/app/core/models/index.ts</files>
  <behavior>
    - ReceiverConfig has exactly: kind ('pi_native' | 'firestick' | 'browser'), mac? (string), last_seen_at? (string ISO8601)
    - ReceiverInfo has exactly: mac (string), kind ('pi_native' | 'firestick' | 'browser'), lastSeenAt (string ISO8601)
    - DisplayConfig receiver field is optional and nullable: receiver?: ReceiverConfig | null
    - All three types are exported (export interface)
    - No existing interface is broken — DisplayConfig fields index/name/type/resolution remain unchanged
  </behavior>
  <action>
In `central-dashboard/src/app/core/models/index.ts`, immediately AFTER the existing `DisplayConfig` interface (currently at line 176-181), insert the following two new interfaces and extend DisplayConfig:

1. MODIFY the existing `DisplayConfig` export to add the optional receiver field:

```typescript
/** N-display configuration entry (PROP-002 Phase 5H) */
export interface DisplayConfig {
  index: number;
  name: string;
  type: string; // 'tv', 'secondary', 'led-banner', 'totem', etc.
  resolution?: string; // e.g. '1920x1080', '1920x384'
  receiver?: ReceiverConfig | null; // Phase 8: Fire Stick / Pi native assignment
}
```

2. ADD after DisplayConfig:

```typescript
/** Receiver assigned to a display slot (Phase 8 — Fire Stick assignation) */
export interface ReceiverConfig {
  kind: 'pi_native' | 'firestick' | 'browser';
  mac?: string; // MAC address when kind is firestick or browser
  last_seen_at?: string; // ISO8601 — last time receiver was seen by Pi
}

/** Receiver detected by the Pi sync-agent — returned by GET /api/sites/:id/connected-receivers */
export interface ReceiverInfo {
  mac: string; // 'AA:BB:CC:DD:EE:FF'
  kind: 'pi_native' | 'firestick' | 'browser';
  lastSeenAt: string; // ISO8601
}
```

Insert ReceiverConfig BEFORE DisplayConfig in file order since DisplayConfig references it. Move the ReceiverConfig block to appear before DisplayConfig's closing brace reference is used. Concretely:

- Insert ReceiverConfig immediately before the DisplayConfig block
- Insert ReceiverInfo immediately after the DisplayConfig block
- Add `receiver?: ReceiverConfig | null;` as last field of DisplayConfig
  </action>
  <verify>
  <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/nifty-ellis-756b56 && npx tsc --project central-dashboard/tsconfig.json --noEmit 2>&1 | grep -E "models/index|ReceiverConfig|ReceiverInfo|DisplayConfig" | head -20; echo "Exit: $?"</automated>
  </verify>
  <done> - `export interface ReceiverConfig` present in index.ts with kind/mac/last_seen_at - `export interface ReceiverInfo` present in index.ts with mac/kind/lastSeenAt - `DisplayConfig` has `receiver?: ReceiverConfig | null` - TypeScript compilation of central-dashboard produces no errors on models/index.ts
  </done>
  </task>

## Verification

- `grep -n "ReceiverConfig\|ReceiverInfo" central-dashboard/src/app/core/models/index.ts` returns both interfaces
- `grep -n "receiver\?" central-dashboard/src/app/core/models/index.ts` shows the optional field on DisplayConfig
- `npx tsc --project central-dashboard/tsconfig.json --noEmit` exits 0 (no new TS errors)

## Success Criteria

- Both interfaces exported from `core/models/index.ts`
- DisplayConfig backward-compatible (all existing code compiles — receiver is optional)
- Plan 02 can import `ReceiverInfo` without modifying models again

## Output

After completion, create `.planning/phases/08-dashboard-ux-admin-assignation/08-dashboard-01-SUMMARY.md` with:

- Files modified: `central-dashboard/src/app/core/models/index.ts`
- Interfaces added: `ReceiverConfig`, `ReceiverInfo`
- DisplayConfig change: `receiver?: ReceiverConfig | null` added
