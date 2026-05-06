---
phase: 04-data
plan: 01
subsystem: central-server / data-model
tags: [milestone-v4.0, multi-screen, firestick, displays, schema, joi]
requires:
  - PROP-002 displays JSONB column existing on sites
provides:
  - DisplayConfig.receiver (typed kind + mac + last_seen_at)
  - schemas.updateDisplays.receiver Joi validator
  - migration add-display-receiver.sql (idempotent HDMI #0 backfill)
  - full-schema.sql COMMENT documenting receiver shape
affects:
  - sites.displays JSONB shape (extended, backward compatible)
tech-stack:
  added: []
  patterns:
    - JSONB extension via UPDATE + jsonb_agg (no new column / table)
    - Idempotent migration guarded by NOT (e ? 'receiver') AND index = 0
    - Joi nested object with .optional().allow(null) for nullable receiver
key-files:
  created:
    - central-server/src/scripts/migrations/add-display-receiver.sql
    - central-server/src/__tests__/validation/display-receiver.validation.test.ts
  modified:
    - central-server/src/types/index.ts
    - central-server/src/middleware/validation.ts
    - central-server/src/scripts/full-schema.sql
decisions:
  - Extend existing displays JSONB rather than create new table (continuity with PROP-002)
  - HDMI #0 default kind=pi_native (legacy invariant preservation)
  - receiver field optional and nullable (rétro-compat with all existing rows)
metrics:
  duration: ~6min
  completed: 2026-05-06T09:53Z
  tasks_completed: 3
  tests_added: 6
---

# Phase 04 Plan 01: DATA — DisplayConfig receiver schema Summary

JSONB extension on `sites.displays[i]` adding optional `receiver: { kind, mac?, last_seen_at? }` typed strict union (`'pi_native' | 'firestick' | 'browser'`), idempotent migration backfilling HDMI #0 to `pi_native`, plus Joi validator covering 6 accept/reject cases. Foundation data layer for v4.0 Multi-écrans Fire Stick milestone — unblocks DETECT/CAPTIVE/CLOUD/DASHBOARD phases.

## Tasks Executed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Migration backfill HDMI #0 → receiver.pi_native (idempotent) | `afe1823` | done (pre-existing) |
| 2 | Extend TS DisplayConfig type + Joi validator + 6 tests | `908d7ba` | done |
| 3 | Sync full-schema.sql snapshot with new displays COMMENT | `6005000` | done |

## Migration Properties (Task 1)

- File: `central-server/src/scripts/migrations/add-display-receiver.sql`
- Idempotent: `WHERE EXISTS (SELECT 1 ... WHERE index=0 AND NOT (e ? 'receiver'))` — re-run is no-op
- HDMI #0 (index=0) backfilled to `receiver.kind = 'pi_native'`
- Other displays preserved as-is (receiver optional)
- Updates `COMMENT ON COLUMN sites.displays` to document new shape
- No new column, no new table — pure JSONB extension on PROP-002 column

## Type Extension (Task 2)

```typescript
export interface DisplayConfig {
  index: number;
  name: string;
  type: string;
  resolution?: string;
  receiver?: DisplayReceiver | null;  // v4.0 DATA-01
}

export interface DisplayReceiver {
  kind: 'pi_native' | 'firestick' | 'browser';
  mac?: string;          // /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/
  last_seen_at?: string; // ISO 8601
}
```

## Joi Validator Coverage (Task 2 — 6 tests, 6 passing)

| Test | Payload | Expected |
|------|---------|----------|
| 1 | `{ index, name, type }` (no receiver) | accept (rétro-compat) |
| 2 | `receiver: { kind: 'pi_native' }` | accept (minimal) |
| 3 | `receiver: { kind: 'firestick', mac, last_seen_at }` | accept (full) |
| 4 | `receiver: null` | accept (désassignation) |
| 5 | `receiver: { kind: 'chromecast' }` | reject (kind in error) |
| 6 | `receiver: { kind: 'firestick', mac: 'not-a-mac' }` | reject (mac in error) |

Test file: `central-server/src/__tests__/validation/display-receiver.validation.test.ts`

## Snapshot Sync (Task 3)

`central-server/src/scripts/full-schema.sql` updated with `COMMENT ON COLUMN public.sites.displays` documenting new receiver shape and `v4.0 DATA-02` traceability tag. Column remains `jsonb` nullable (receiver is optional). Aligns with CLAUDE.md alerts-dedup convention (full-schema.sql synchronized with each migration).

## Verification

- Joi targeted test suite: 6/6 GREEN (`npx jest validation/display-receiver.validation`)
- Acceptance grep checks: all PASS (jsonb_agg, pi_native, idempotent guard, COMMENT updated, v4.0 DATA-02)
- TS strict: pre-existing unrelated errors in `excel-export.service.ts` and `remotion-render-worker.service.ts` (out-of-scope — not introduced by this plan)
- `npm run test:smoke:smart`: smoke suites fail to bootstrap in this sandbox env (no DB connection) — failures pre-date this plan (verified by re-running on `afe1823` commit before Task 2/3 changes; same 98 failures). Out-of-scope per execution rules.

## Deviations from Plan

None — plan executed exactly as written. No auto-fix triggered (Rules 1-4 not applicable).

## Deferred Issues

- Smoke test bootstrap requires DB connection not available in sandbox env (pre-existing, not caused by this plan). Verification of smoke suites should run in CI / local with DB.
- Pre-existing TS errors in `excel-export.service.ts` (Xlsx.writeBuffer) and `remotion-render-worker.service.ts` (implicit any) — out-of-scope.

## Requirements Satisfied

- **DATA-01**: DisplayConfig.receiver typed strict union `'pi_native' | 'firestick' | 'browser'` + Joi validator covering all accept/reject cases
- **DATA-02**: Idempotent migration backfilling HDMI #0 to `receiver.kind = 'pi_native'`, other displays preserved without manual intervention

## Files Modified

| File | Change |
|------|--------|
| `central-server/src/scripts/migrations/add-display-receiver.sql` | created (Task 1) |
| `central-server/src/types/index.ts` | +DisplayReceiver interface, extended DisplayConfig |
| `central-server/src/middleware/validation.ts` | +receiver subschema in updateDisplays |
| `central-server/src/__tests__/validation/display-receiver.validation.test.ts` | created (6 tests) |
| `central-server/src/scripts/full-schema.sql` | +COMMENT on sites.displays |

## Self-Check: PASSED

- File `central-server/src/scripts/migrations/add-display-receiver.sql`: FOUND
- File `central-server/src/__tests__/validation/display-receiver.validation.test.ts`: FOUND
- File `.planning/phases/04-data/04-data-01-SUMMARY.md`: FOUND (this file)
- Commit `afe1823`: FOUND (Task 1 — migration)
- Commit `908d7ba`: FOUND (Task 2 — TS + Joi + tests)
- Commit `6005000`: FOUND (Task 3 — full-schema snapshot)
