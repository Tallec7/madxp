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
  modified:
    - raspberry/config/nginx/neopro-base.conf
    - central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts

key-decisions:
  - '10-01: wifistub.html returns 302 (not redirect to captive page directly) — two-hop redirect preserves $host in Location header so Fire OS CaptivePortalLauncher follows correctly'
  - '10-01: wifiredirect.html redirects to http://192.168.4.1/ (root) not /captive/wait — Angular bootstrap router resolves via /api/captive/whoami, serving correct page per MAC assignment'
  - '10-01: extractNginxBlock() helper in smoke test — targeted block extraction prevents false positives from @captive_fallback Success string elsewhere in conf'

patterns-established:
  - 'extractNginxBlock(conf, path): string — regex-based nginx block extractor for smoke tests, avoids full-file grep false positives'

requirements-completed: [CAPTIVE-05, CAPTIVE-06, CAPTIVE-07]

# Metrics
duration: 25min
completed: 2026-05-07
---

# Phase 10 Plan 01: nginx wifistub 302 + wifiredirect Summary

**nginx `wifistub.html` now returns 302 (instead of 200 Success) to trigger Fire OS CaptivePortalLauncher, with new `wifiredirect.html` endpoint chaining to Angular bootstrap at `http://192.168.4.1/`**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-07T18:00:00Z
- **Completed:** 2026-05-07T18:20:00Z
- **Tasks:** 2/3 complete (Task 3 = checkpoint:human-verify pending)
- **Files modified:** 3

## Accomplishments

- TDD RED: 6 Phase 10 smoke guards added; 4 failing before conf change (CAPTIVE-05/06), 2 passing (CAPTIVE-07 regressions)
- TDD GREEN: neopro-base.conf updated — wifistub.html returns `302 http://$host/kindle-wifi/wifiredirect.html`, new wifiredirect.html block returns `302 http://192.168.4.1/`
- All smoke-kiosk-pi tests pass (Phase 6 CAPTIVE-01..04 + Phase 10 CAPTIVE-05..07), 0 regressions on smoke-receivers-discovery
- OTA deployment guide created with Pi RACC scp procedure + Fire Stick AFTSS validation checklist

## Task Commits

1. **Task 1 (RED): Phase 10 smoke guards** - `1a922c6d` (test)
2. **Task 2 (GREEN): nginx wifistub 302 + wifiredirect** - `ada82998` (feat)
3. **Task 3 (doc): CAPTIVE-AUTO-OTA.md** - `2b319daa` (docs)

Task 3 is a `checkpoint:human-verify` — manual validation on Pi RACC + Fire Stick AFTSS `0c:43:f9:36:04:77` pending.

## Files Created/Modified

- `raspberry/config/nginx/neopro-base.conf` — wifistub.html block: 200 Success → 302 redirect chain; new wifiredirect.html block
- `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` — extractNginxBlock() helper + 6 Phase 10 tests; CAPTIVE-01 test updated (Success assertion removed)
- `docs/guides/CAPTIVE-AUTO-OTA.md` — OTA deployment guide (Option A install.sh / Option B scp) + Fire Stick AFTSS checklist + rollback + observability

## Decisions Made

- 302 two-hop chain (wifistub → wifiredirect → root) rather than direct redirect: preserves `$host` in Location header so Fire OS CaptivePortalLauncher follows the redirect to the correct hostname
- wifiredirect targets `http://192.168.4.1/` (root) not `/captive/wait`: Angular router handles the branching via `/api/captive/whoami` — cleaner separation of concerns
- extractNginxBlock() helper in smoke tests: regex-based extraction of specific nginx location blocks prevents false positives from `@captive_fallback` block that still contains "Success" string

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TDD cycle was clean. The extractNginxBlock helper regex worked on first attempt. The `@captive_fallback` block (which still legitimately contains "Success") did not interfere thanks to the targeted block extraction.

## Validation Status (Task 3 — checkpoint pending)

**Pi RACC deployment:** Not yet done — requires manual `scp` + nginx restart on `pi@neopro.local`.

**Fire Stick AFTSS `0c:43:f9:36:04:77` test:** Not yet done — requires physical reboot + WiFi connection.

**Expected outcome per CAPTIVE-05/06:** Silk Browser opens automatically within 10s, OR system notification "Connectez-vous au réseau" appears (1 tap acceptable).

**Fallback CAPTIVE-07:** `firetvcaptiveportal.com` → wait page should still work manually.

**Residual risk (10-RESEARCH.md Q1):** Fire OS 8 inconsistency — some Fire Stick models may require `CaptivePortalMode=2` or the auto-launch may not trigger on all firmware versions. If auto-launch doesn't trigger, the 1-tap notification path is the acceptable fallback.

## Next Phase Readiness

- nginx changes ready to deploy to Pi fleet via Option A (install.sh re-run) after Pi RACC validation confirmed
- Phase 11 (REASSIGN) is independent — no blocker from Phase 10 completion
- OTA to NLF production Pi to be orchestrated after Pi RACC validation stable

---

_Phase: 10-captive-auto_
_Completed: 2026-05-07_
