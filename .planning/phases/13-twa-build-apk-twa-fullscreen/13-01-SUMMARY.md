---
phase: 13-twa-build-apk-twa-fullscreen
plan: 01
subsystem: firestick-apk
tags: [twa, firestick, scaffold, smoke, tdd]
requires: []
provides:
  - firestick-apk/twa-manifest.json (TWA-01, TWA-02, TWA-04 source of truth)
  - firestick-apk/package.json (independent semver v0.1.0)
  - firestick-apk/.gitignore (anti-leak keystore + APK)
  - central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts (contract pin)
affects:
  - Plans 02-04 of Phase 13 (cleartext patch, keystore, build orchestrator)
tech-stack:
  added:
    - '@bubblewrap/cli@1.24.1 (devDep, not yet installed — Plan 04 will install)'
  patterns:
    - file-based smoke (fs.readFileSync + JSON.parse, mirror of smoke-receivers-discovery)
    - independent semver per artifact (firestick-apk vs neopro core)
key-files:
  created:
    - firestick-apk/package.json
    - firestick-apk/twa-manifest.json
    - firestick-apk/.gitignore
    - firestick-apk/README.md
    - central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts
  modified: []
decisions:
  - 'packageId locked to bzh.kalonpartners.neopro.firestick (reverse-DNS, BZH org root)'
  - 'Display mode = fullscreen-sticky (Bubblewrap manifest key for Android Immersive Sticky)'
  - 'Cleartext smoke test ships RED in Plan 01 (intentional Wave-0 TDD — Plan 02 lands the XML)'
metrics:
  duration_min: 5
  tasks_completed: 2
  files_created: 5
  completed_date: 2026-05-08
---

# Phase 13 Plan 01: Scaffold firestick-apk Summary

**One-liner:** Firestick TWA APK skeleton with Bubblewrap manifest (host=192.168.4.1, fullscreen-sticky, landscape), independent semver package.json, keystore/APK-blocking .gitignore, and TDD-driven file-based smoke pinning TWA-01/02/04 contracts.

## What shipped

Five files committed, three atomic commits:

| Commit     | Type | Files                                                                               |
| ---------- | ---- | ----------------------------------------------------------------------------------- |
| `36ca1841` | test | `central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts` (RED)              |
| `e535f9b9` | feat | `firestick-apk/{package.json,twa-manifest.json,.gitignore}` (GREEN, 5/6 tests pass) |
| `c50a74b9` | docs | `firestick-apk/README.md` (structure + Vega OS warn + JDK 17 prereq)                |

## Verification

- Smoke `smoke-firestick-apk` runs and reports **5/6 green** (TWA-01, TWA-02, TWA-04, orientation, packageId).
- Test 6 (`cleartext network_security_config.xml`) is intentionally **RED** — the XML lands in Plan 02. This is documented Wave-0 TDD state.
- `git status --porcelain firestick-apk/` is clean (no leaked keystore/APK).
- `jq -r .display firestick-apk/twa-manifest.json` → `fullscreen-sticky`.
- `jq -r .host firestick-apk/twa-manifest.json` → `192.168.4.1`.
- `jq -r .signingKey.alias firestick-apk/twa-manifest.json` → `firestick-release`.

## TDD trace

- **RED**: smoke test committed first (commit `36ca1841`), all 6 tests failed because `firestick-apk/twa-manifest.json` did not exist.
- **GREEN**: scaffold committed (commit `e535f9b9`), 5/6 tests pass. The 6th test (cleartext XML) is the planned Wave-0 RED carry-over for Plan 02.
- **REFACTOR**: not needed — scaffold is data-only.

## Deviations from Plan

None — plan executed exactly as written. Prettier applied table-formatting tweaks on README.md after commit (whitespace alignment only, no content change).

## Deferred Issues

None.

## Next

Plan 02 (`13-02-cleartext-fullscreen-patch`) will:

1. Create `firestick-apk/manifest/network_security_config.xml` with `cleartextTrafficPermitted="true"` for `192.168.4.1` → flips test 6 GREEN.
2. Add `firestick-apk/scripts/patch-android-manifest.sh` (idempotent post-update XML patch).

## Self-Check: PASSED

- All 5 created files present on disk.
- All 3 commits present in `git log`.
- No untracked files in `firestick-apk/`.
- `.gitignore` blocks `*.keystore`, `*.apk`, `dist/`, `build/`, `.keys/`.
