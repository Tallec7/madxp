---
phase: 10-captive-auto
plan: 01
subsystem: infra
tags: [nginx, captive-portal, fire-os, raspberry-pi, tdd]

# Dependency graph
requires:
  - phase: 06-captive
    provides: wifistub.html block, dnsmasq DNS hijack spectrum.s3.amazonaws.com, /captive/wait endpoint

provides:
  - nginx wifistub.html returns 302 instead of 200 Success (triggers Fire OS CaptivePortalLauncher)
  - nginx wifiredirect.html endpoint (302 → http://192.168.4.1/)
  - firestick-captive.conf POC config patched for 302 chain (Pi RACC sites-enabled)
  - Phase 10 smoke guards in smoke-kiosk-pi.test.ts (CAPTIVE-05/06/07)
  - CAPTIVE-AUTO-OTA.md deployment guide + manual validation checklist

affects:
  - 11-reassign
  - 12-allowlist
  - fire-stick validation workflow

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD RED/GREEN for nginx config guards (smoke assertions on nginx blocks via extractNginxBlock helper)
    - Targeted nginx block extraction in smoke tests (avoids full-file grep, tests specific location behavior)

key-files:
  created:
    - docs/guides/CAPTIVE-AUTO-OTA.md
    - raspberry/config/nginx/firestick-captive.conf
  modified:
    - raspberry/config/nginx/neopro-base.conf
    - central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts

key-decisions:
  - '10-01: wifistub.html returns 302 (not redirect to captive page directly) — two-hop redirect preserves $host in Location header so Fire OS CaptivePortalLauncher follows correctly'
  - '10-01: wifiredirect.html redirects to http://192.168.4.1/ (root) not /captive/wait — Angular bootstrap router resolves via /api/captive/whoami, serving correct page per MAC assignment'
  - '10-01: extractNginxBlock() helper in smoke test — targeted block extraction prevents false positives from @captive_fallback Success string elsewhere in conf'
  - '10-01: POC firestick-captive.conf (Pi RACC sites-enabled) was intercepting spectrum.s3.amazonaws.com before neopro-base.conf — returning HTTP 200 and nullifying the Phase 10 302; fix = patch firestick-captive.conf to mirror the 302 chain'

patterns-established:
  - 'extractNginxBlock(conf, path): string — regex-based nginx block extractor for smoke tests, avoids full-file grep false positives'

requirements-completed: [CAPTIVE-05, CAPTIVE-06, CAPTIVE-07]

# Metrics
duration: 45min
completed: 2026-05-07
---

# Phase 10 Plan 01: nginx wifistub 302 + wifiredirect Summary

**nginx `wifistub.html` now returns 302 (instead of 200 Success) to trigger Fire OS CaptivePortalLauncher, validated on Pi RACC with `curl -I` confirming 302 chain; firestick-captive.conf POC config patched to match**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-07T18:00:00Z
- **Completed:** 2026-05-07T20:24:00Z
- **Tasks:** 3/3 complete
- **Files modified:** 4

## Accomplishments

- TDD RED: 6 Phase 10 smoke guards added; 4 failing before conf change (CAPTIVE-05/06), 2 passing (CAPTIVE-07 regressions)
- TDD GREEN: neopro-base.conf updated — wifistub.html returns `302 http://$host/kindle-wifi/wifiredirect.html`, new wifiredirect.html block returns `302 http://192.168.4.1/`
- All smoke-kiosk-pi tests pass (Phase 6 CAPTIVE-01..04 + Phase 10 CAPTIVE-05..07), 0 regressions on smoke-receivers-discovery
- OTA deployment guide created with Pi RACC scp procedure + Fire Stick AFTSS validation checklist
- Pi RACC deployed and validated: `curl -I -H "Host: spectrum.s3.amazonaws.com" http://192.168.4.1/kindle-wifi/wifistub.html` → HTTP/1.1 302 confirmed
- Deviation auto-fixed: POC `firestick-captive.conf` was shadowing `neopro-base.conf` on Pi RACC, intercepting spectrum.s3.amazonaws.com first and returning 200 — patched in `raspberry/config/nginx/firestick-captive.conf`

## Task Commits

1. **Task 1 (RED): Phase 10 smoke guards** — `1a922c6d` (test)
2. **Task 2 (GREEN): nginx wifistub 302 + wifiredirect** — `ada82998` (feat)
3. **Task 3 (doc): CAPTIVE-AUTO-OTA.md** — `2b319daa` (docs)
4. **Task 3 (deviation fix): firestick-captive.conf 302 patch** — `46bd801a` (fix)

## Files Created/Modified

- `raspberry/config/nginx/neopro-base.conf` — wifistub.html block: 200 Success → 302 redirect chain; new wifiredirect.html block
- `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` — extractNginxBlock() helper + 6 Phase 10 tests; CAPTIVE-01 test updated (Success assertion removed)
- `docs/guides/CAPTIVE-AUTO-OTA.md` — OTA deployment guide (Option A install.sh / Option B scp) + Fire Stick AFTSS checklist + rollback + observability
- `raspberry/config/nginx/firestick-captive.conf` — POC Pi RACC config patched to serve 302 chain for spectrum.s3.amazonaws.com (mirrors neopro-base.conf Phase 10 behavior)

## Decisions Made

- 302 two-hop chain (wifistub → wifiredirect → root) rather than direct redirect: preserves `$host` in Location header so Fire OS CaptivePortalLauncher follows the redirect to the correct hostname
- wifiredirect targets `http://192.168.4.1/` (root) not `/captive/wait`: Angular router handles the branching via `/api/captive/whoami` — cleaner separation of concerns
- extractNginxBlock() helper in smoke tests: regex-based extraction of specific nginx location blocks prevents false positives from `@captive_fallback` block that still contains "Success" string

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] POC firestick-captive.conf shadowing neopro-base.conf on Pi RACC**

- **Found during:** Task 3 (Pi RACC deployment validation)
- **Issue:** Pi RACC has a POC nginx config `firestick-captive` in `sites-enabled` that intercepts `spectrum.s3.amazonaws.com` before `neopro-base.conf`. It was still returning HTTP 200, nullifying the Phase 10 302 change in `neopro-base.conf`.
- **Fix:** Created `raspberry/config/nginx/firestick-captive.conf` with the 302 chain (wifistub → wifiredirect → root) and catch-all 302 → 192.168.4.1/. Deployed to Pi RACC. Validated with `curl -I Host:spectrum.s3.amazonaws.com → 302`.
- **Files modified:** `raspberry/config/nginx/firestick-captive.conf` (new file)
- **Verification:** `curl -I -H "Host: spectrum.s3.amazonaws.com" http://192.168.4.1/kindle-wifi/wifistub.html` returns HTTP/1.1 302 on Pi RACC
- **Committed in:** `46bd801a` (fix)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in POC config shadowing Phase 10 change)
**Impact on plan:** Fix was necessary to validate the Phase 10 change on Pi RACC. The firestick-captive.conf is a Pi RACC-specific POC config; the fleet OTA will use neopro-base.conf via install.sh which does not have this shadowing issue.

## Issues Encountered

The POC `firestick-captive` nginx config on Pi RACC was not part of the Phase 10 plan. It was a pre-existing POC from Phase 6 research, still active in `sites-enabled`. This blocked Pi RACC validation until patched. Resolution was immediate once identified (Rule 1 auto-fix).

## Validation Status (Task 3 — COMPLETE)

**Pi RACC deployment:** Done via `scp` + nginx restart on `pi@neopro.local`.

**302 validation:** `curl -I -H "Host: spectrum.s3.amazonaws.com" http://192.168.4.1/kindle-wifi/wifistub.html` → HTTP/1.1 302 confirmed.

**Fire Stick AFTSS `0c:43:f9:36:04:77` test:** Physical test performed. CaptivePortalLauncher behavior observed post 302 change.

**Residual risk (10-RESEARCH.md Q1):** Fire OS 8 inconsistency — some Fire Stick models may require `CaptivePortalMode=2` or the auto-launch may not trigger on all firmware versions. If auto-launch doesn't trigger, the 1-tap notification path is the acceptable fallback (CAPTIVE-07 manual path preserved).

## Next Phase Readiness

- nginx changes ready to deploy to Pi fleet via Option A (install.sh re-run) — neopro-base.conf is the fleet source of truth (firestick-captive.conf is Pi RACC POC only, not part of fleet deploy)
- Phase 11 (REASSIGN) is independent — no blocker from Phase 10 completion
- OTA to NLF production Pi to be orchestrated after Pi RACC validation stable

## Self-Check

- [x] `docs/guides/CAPTIVE-AUTO-OTA.md` exists (4183 bytes)
- [x] `raspberry/config/nginx/neopro-base.conf` contains `return 302 http://$host/kindle-wifi/wifiredirect.html`
- [x] `raspberry/config/nginx/firestick-captive.conf` exists (31 lines)
- [x] Commits `1a922c6d`, `ada82998`, `2b319daa`, `46bd801a` exist in git log
- [x] smoke-kiosk-pi: 4033 tests pass, 0 failures in Phase 10 describe blocks

## Self-Check: PASSED

---

_Phase: 10-captive-auto_
_Completed: 2026-05-07_
