---
phase: 13-twa-build-apk-twa-fullscreen
plan: 02
subsystem: firestick-apk
tags: [twa, firestick, cleartext, android, smoke]
requires:
  - firestick-apk/twa-manifest.json (Plan 01)
  - central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts (Plan 01, RED test 6)
provides:
  - firestick-apk/manifest/network_security_config.xml (cleartext allow-list, 3 domains)
  - firestick-apk/scripts/patch-android-manifest.sh (idempotent post-update XML patch)
  - README §Cleartext HTTP (why + run order Plan 04 will implement)
affects:
  - Plan 04 (build orchestrator) — will call this script between `bubblewrap update` and `bubblewrap build`
tech-stack:
  added: []
  patterns:
    - 'Idempotent shell patch (grep-then-sed guard)'
    - 'Paranoid pre-flight check before destructive sed (display=fullscreen-sticky preserved)'
key-files:
  created:
    - firestick-apk/manifest/network_security_config.xml
    - firestick-apk/scripts/patch-android-manifest.sh
  modified:
    - firestick-apk/README.md
decisions:
  - '13-02: Restrictive 3-domain allow-list (192.168.4.1 + 2 captive hijack targets) instead of `usesCleartextTraffic="true"` blanket — aligned with .claude/rules/raspberry.md (DNS hijack restricted)'
  - '13-02: Idempotency via `grep -q ... networkSecurityConfig` guard before `sed` injection — re-runs are safe after every `bubblewrap update`'
  - '13-02: Paranoid guard refuses to patch if twa-manifest.json display field is not `fullscreen-sticky` — protects TWA-02 contract from silent regression'
  - '13-02: macOS BSD sed compat via `sed -i.bak` + `rm -f *.bak` (works on Mac/Linux without GNU sed dependency)'
metrics:
  duration_min: 4
  tasks_completed: 2
  files_created: 2
  files_modified: 1
  completed_date: 2026-05-08
---

# Phase 13 Plan 02: Cleartext + Fullscreen Patch Summary

**One-liner:** Cleartext HTTP allow-list XML (3-domain restrictive) plus idempotent post-`bubblewrap update` patch script that injects `android:networkSecurityConfig` into AndroidManifest.xml while paranoid-guarding `fullscreen-sticky` — closes Pitfall 1 from research and flips smoke 5/6 → 6/6 green.

## What shipped

Two atomic commits:

| Commit     | Type | Files                                                                                     |
| ---------- | ---- | ----------------------------------------------------------------------------------------- |
| `48c10d9c` | feat | `firestick-apk/manifest/network_security_config.xml`, `scripts/patch-android-manifest.sh` |
| `35eb1e1d` | docs | `firestick-apk/README.md` (§Cleartext HTTP added before §References)                      |

Note: commit `33df7170 feat(13-03)` from a parallel session (Plan 03 keystore) interleaved between the two task commits — no file conflict, separate scope.

## Verification

- `cd central-server && npx jest --testPathPattern='smoke-firestick-apk' --no-coverage --forceExit` → **6/6 green** (was 5/6 in Plan 01).
- `grep -c 'cleartextTrafficPermitted="true"' firestick-apk/manifest/network_security_config.xml` → 2 (base-config + domain-config).
- `grep -q '192.168.4.1' ...` → match, `grep -q 'firetvcaptiveportal.com' ...` → match.
- `test -x firestick-apk/scripts/patch-android-manifest.sh` → executable.
- Script first lines contain `set -euo pipefail` (fail-fast).
- Script contains both guards: `grep -q 'android:networkSecurityConfig=...'` (idempotency) and `grep -q "fullscreen-sticky"` (TWA-02 paranoid).
- `grep '"display"' firestick-apk/twa-manifest.json` → `"display": "fullscreen-sticky",` (preserved, not regressed).
- README contains `## Cleartext HTTP`, `patch-android-manifest.sh`, `idempotent`, `ERR_CLEARTEXT_NOT_PERMITTED`, `fullscreen-sticky`.

## Idempotency proof

The script can be re-run after every `bubblewrap update` with the same outcome:

1. **First run** after fresh `bubblewrap update`: copies XML → `app/src/main/res/xml/`, then `grep -q` finds nothing → `sed` injects `android:networkSecurityConfig` → re-`grep` confirms.
2. **Second run** (same state): copies XML again (overwrite identical content), then `grep -q` finds the attribute → logs "already present (idempotent skip)".
3. **Pre-flight failure modes**: missing `app/src/main/AndroidManifest.xml` → fails fast with "Run 'bubblewrap update' before patching"; `display ≠ fullscreen-sticky` → fails fast before touching anything (TWA-02 protection).

## Deviations from Plan

None — plan executed exactly as written. Pre-commit hook (lint-staged + prettier) reformatted the staged README.md before the docs commit (whitespace only, no content change).

## Deferred Issues

None.

## Next

Plan 03 (keystore generation script) is already in flight via parallel session (commit `33df7170`). Plan 04 (build orchestrator) will:

1. Call `bubblewrap update --skipVersionUpgrade`.
2. Call `bash scripts/patch-android-manifest.sh` (this plan's output).
3. Call `bubblewrap build --skipPwaValidation`.
4. Rename + move to `dist/neopro-firestick-v{version}.apk`.
5. Run `apksigner verify` + `aapt dump badging` smoke.

## Self-Check: PASSED

- `firestick-apk/manifest/network_security_config.xml` — exists, contains both `cleartextTrafficPermitted="true"` and `192.168.4.1`.
- `firestick-apk/scripts/patch-android-manifest.sh` — exists, executable (mode 100755).
- `firestick-apk/README.md` — contains §Cleartext HTTP section.
- Commit `48c10d9c` — found in `git log`.
- Commit `35eb1e1d` — found in `git log`.
- `firestick-apk/twa-manifest.json` `display` field still `fullscreen-sticky` (not regressed).
- Smoke 6/6 green.
- No write outside `firestick-apk/` (verified: only paths committed are `firestick-apk/manifest/*`, `firestick-apk/scripts/*`, `firestick-apk/README.md`).
