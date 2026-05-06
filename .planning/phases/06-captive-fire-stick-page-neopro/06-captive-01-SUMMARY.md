---
phase: 06-captive-fire-stick-page-neopro
plan: 01
subsystem: raspberry-pi-network
tags: [captive-portal, dnsmasq, arp, mac-resolution, firestick, ipv6-mapped]

requires:
  - phase: 05-detect
    provides: ReceiversService (dnsmasq.leases watcher + arp -an fallback + Map<mac, state>)
provides:
  - resolveMacByIp(ip) public method on ReceiversService — pure Map lookup, <1ms
  - this._ipToMac Map<ip, mac_lowercase> populated by _scanLeases + _scanArp
  - IPv4-mapped IPv6 normalization (::ffff:X.X.X.X → X.X.X.X) for Express behind nginx [::]:80
  - Extended ARP_LINE_REGEX capturing both IP (group 1) and MAC (group 2)
affects: [06-captive-02, /api/captive/whoami, captive-route]

tech-stack:
  added: []
  patterns:
    - "Reverse-lookup Map populated by existing scanners (no new poll, no system call)"
    - "IPv6-mapped IPv4 normalization at lookup time (single source of truth)"

key-files:
  created: []
  modified:
    - raspberry/server/services/receivers.service.js
    - raspberry/server/__tests__/receivers.service.test.js

key-decisions:
  - "Reverse lookup via dedicated Map<ip, mac> rather than reverse-iterating _state — O(1) lookup, populated free during existing scans"
  - "IPv4-mapped IPv6 normalization at lookup time (resolveMacByIp) rather than at insertion — avoids pre-normalizing every dnsmasq.leases entry, handles only the actual Express edge case"
  - "ARP_LINE_REGEX extended to capture IP (group 1) instead of adding a second regex — single pass, backward-compatible"
  - "Falsy / non-string input returns null rather than throwing — defensive at the API boundary (CAPTIVE-02 endpoint will pass req.headers['x-real-ip'] which can be undefined)"

patterns-established:
  - "Reverse-lookup Map: when an existing scanner already iterates a structured source, populate auxiliary Maps in the same pass for O(1) inverse access"

requirements-completed: [CAPTIVE-02]

duration: ~5min
completed: 2026-05-06
---

# Phase 6 Plan 01: Receivers resolveMacByIp Summary

**Pure Map IP→MAC reverse lookup added to ReceiversService, populated free by existing dnsmasq.leases + arp scanners, ready to back the upcoming /api/captive/whoami endpoint without any new system call.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 1 (TDD)
- **Files modified:** 2

## Accomplishments

- `resolveMacByIp(ip)` public method on ReceiversService (pure Map lookup, <1ms latency)
- `_ipToMac` Map populated transparently by `_scanLeases` (dnsmasq lease IP) and `_scanArp` (arp -an output)
- IPv4-mapped IPv6 normalization (`::ffff:192.168.4.X` → `192.168.4.X`) handles Express edge case behind nginx `listen [::]:80`
- 26/26 Jest tests green (21 existing Phase 5 tests + 5 new — zero regression)

## Task Commits

1. **Task 1 RED: tests for resolveMacByIp** — `84f0448` (test)
2. **Task 1 GREEN: resolveMacByIp implementation + ARP regex extension** — `e354961` (feat)

## Files Created/Modified

- `raspberry/server/services/receivers.service.js` — added `_ipToMac` Map, extended ARP_LINE_REGEX to capture IP, added `resolveMacByIp(ip)` public method, populate `_ipToMac` from `_scanLeases` and `_scanArp`
- `raspberry/server/__tests__/receivers.service.test.js` — new `describe('resolveMacByIp')` block with 5 tests (leases hit, IPv6-mapped, unknown IP, falsy input, ARP-populated)

## Verification

- `npx jest --testPathPattern='receivers.service' --no-coverage --forceExit` → 26/26 tests pass
- `grep -q "resolveMacByIp" raspberry/server/services/receivers.service.js` → ok
- `grep -q "_ipToMac" raspberry/server/services/receivers.service.js` → ok
- `grep -q "::ffff:" raspberry/server/services/receivers.service.js` → ok
- 10 references to `resolveMacByIp` in test file (≥3 required)
- No `child_process.exec` or `execAsync` call in `resolveMacByIp` body — pure Map lookup

## Deviations from Plan

None — plan executed exactly as written. RED→GREEN cycle clean, no auto-fixes required.

Note: a transient Babel/Jest cache issue surfaced after the GREEN edit (`babel-plugin-jest-hoist` reported as exporting an object); cleared via `--clearCache` and tests passed on retry. Not a code issue, no commit needed.

## Self-Check: PASSED

- File `raspberry/server/services/receivers.service.js` modified — FOUND
- File `raspberry/server/__tests__/receivers.service.test.js` modified — FOUND
- Commit `84f0448` (RED) — FOUND
- Commit `e354961` (GREEN) — FOUND
