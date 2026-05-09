---
phase: 05-detect
verified: 2026-05-06T12:00:00Z
status: passed
score: 9/9 must-haves verified
---

# Phase 5: DETECT Verification Report

**Phase Goal:** Fire Stick passive auto-detection on Pi hotspot with cache resilience and state/sync-agent integration (milestone v4.0 multi-screens).
**Verified:** 2026-05-06T12:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                | Status     | Evidence                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fire Stick MAC observable côté Pi <30s via dnsmasq.leases watch + ARP fallback                                       | VERIFIED   | `receivers.service.js:27` LEASES_PATH, line 342 `arp -an`, intervals 10s/30s; tests `_scanLeases parses firestick OUI`           |
| 2   | Disparition Fire Stick détectée et émise via socket                                                                  | VERIFIED   | `receivers.service.js:380` `io.emit('connected-receivers-changed', ...)`, test "removes a MAC and emits change when disappears"  |
| 3   | OUI Amazon distingué de 'browser' générique                                                                          | VERIFIED   | `receivers.service.js:39` Amazon OUI list (`0c:43:f9` etc), `_inferKind()`, tests for both kinds                                  |
| 4   | Cache local restauré au boot sans appel cloud                                                                        | VERIFIED   | `receivers.service.js:73` `this.loadCache()` in start(), test "instance B restores mapping from cache without _scanLeases"        |
| 5   | Cache réécrit atomiquement à chaque assignation                                                                      | VERIFIED   | `receivers.service.js:193` `fs.renameSync(tmpPath, CACHE_PATH)`, test "writes atomically: writeFileSync(tmp) then renameSync"     |
| 6   | Cache absent/corrompu → state vide sans crash                                                                        | VERIFIED   | Tests "does not throw when cache file is missing", "does not throw when cache JSON is corrupt", "ignores unknown version"         |
| 7   | state.service expose receivers via getState/getFullState                                                             | VERIFIED   | `state.service.js:86` `_receivers=[]`, `:275-285` get/set, `:386` `receivers: this.getReceivers()` in getFullState                |
| 8   | ReceiversService instancié dans server.js, démarré avec io, état consommé par state.service                          | VERIFIED   | `server.js:27,45,155,160` import + new + setReceivers wrapper + start                                                             |
| 9   | sync-agent DEFAULT_ALLOWED_COMMANDS contient 'receiver-detected' et 'receiver-disconnected'                          | VERIFIED   | `sync-agent/src/config.js:54-55` both events whitelisted                                                                           |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact                                                            | Expected           | Status     | Details                                                  |
| ------------------------------------------------------------------- | ------------------ | ---------- | -------------------------------------------------------- |
| `raspberry/server/services/receivers.service.js`                    | ≥120 lines         | VERIFIED   | 384 lines, all required patterns present                 |
| `raspberry/server/__tests__/receivers.service.test.js`              | ≥80 lines, 18+ tests | VERIFIED | 376 lines, 21 tests passing                              |
| `raspberry/server/services/state.service.js` (extended)             | _receivers + getReceivers/setReceivers + getFullState | VERIFIED | All methods present, defensive copies, getFullState includes receivers |
| `raspberry/server/server.js` (modified)                             | ReceiversService instantiation + io wrapper          | VERIFIED | All wiring present + SIGTERM/SIGINT handlers            |
| `raspberry/sync-agent/src/config.js` (modified)                     | receiver-detected/disconnected in DEFAULT_ALLOWED_COMMANDS | VERIFIED | Both events present at lines 54-55                       |

### Key Link Verification

| From                                            | To                                          | Via                                         | Status | Details                                                  |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------------- | ------ | -------------------------------------------------------- |
| `receivers.service.js`                          | Socket.IO io                                | `io.emit('connected-receivers-changed')`    | WIRED  | Line 380                                                 |
| `receivers.service.js`                          | `/var/lib/misc/dnsmasq.leases`              | `fs.statSync` mtime + readFileSync          | WIRED  | LEASES_PATH constant + statSync polling                  |
| `ReceiversService.start(io)`                    | `.receivers-cache.json`                     | `fs.readFileSync` + JSON.parse              | WIRED  | `loadCache()` called in start() before first scan        |
| `ReceiversService.assignDisplay()`              | `.receivers-cache.json`                     | atomic write tmp + rename                   | WIRED  | writeFileSync + renameSync sequence verified by test     |
| `server.js`                                     | `ReceiversService`                          | `new ReceiversService() + .start(io)`       | WIRED  | server.js:45,160                                         |
| `ReceiversService.getReceivers()`               | `state.service.getFullState()`              | io wrapper → `stateService.setReceivers`    | WIRED  | server.js:155 in ioForReceivers wrapper                  |
| `sync-agent/src/config.js`                      | Phase 7 cloud whitelist                     | `'receiver-detected'`/`'receiver-disconnected'` in array | WIRED | Both at config.js:54-55                            |

### Requirements Coverage

| Requirement | Source Plan          | Description                                                                | Status    | Evidence                                                                              |
| ----------- | -------------------- | -------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------- |
| DETECT-01   | 05-detect-01, 03     | Pi détecte automatiquement les MACs hotspot (dnsmasq.leases + ARP)        | SATISFIED | receivers.service.js complet + tests verts; REQUIREMENTS.md:14 marqué [x]             |
| DETECT-02   | 05-detect-01, 03     | Pi pousse les changements vers le cloud via socket                         | SATISFIED | `connected-receivers-changed` emit + sync-agent whitelist; REQUIREMENTS.md:15 [x]     |
| DETECT-03   | 05-detect-02, 03     | Cache local résilient pour reboot scenario                                 | SATISFIED | loadCache/saveCache/atomic write/reboot test green; REQUIREMENTS.md:16 [x]            |

No orphaned requirements — all DETECT-* IDs from REQUIREMENTS.md mapped to plans in this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |

None. No TODO/FIXME/placeholder/stub patterns in modified files. Tests are real (not mocked-pass-through). Logging via console.warn/info is intentional and documented (helpers.js côté raspberry/server n'expose pas Winston, cohérent avec hdmi.service.js).

### Test Results

- `npx jest --testPathPattern='receivers.service'` → **21/21 GREEN**
- `npx jest --testPathPattern='state.service'` → **47/47 GREEN** (5 new for receivers)
- `node --check raspberry/server/server.js` → **exit 0**
- sync-agent config events both present (grep verified)

### Human Verification Required

None required at automated verification level. Optional integration validation (not blocking):

1. **Real Fire Stick connection test on Pi hardware** — connect a Fire Stick to Pi hotspot, verify within 30s a `connected-receivers-changed` event is emitted with `kind: 'firestick'`. Why human: requires real hotspot + Fire Stick hardware, OUI inference correctness on real device.
2. **Reboot recovery on real Pi** — assign a display, reboot Pi, verify cache persists and is restored. Why human: requires real Pi systemd lifecycle.

These are deferred to Phase 6 (CAPTIVE) / Phase 7 (CLOUD) integration testing — not blocking phase 5 goal.

### Gaps Summary

No gaps. All 9 must-have truths verified, all artifacts present and substantive (384/376/415 lines), all key links wired (file → emit, file → cache, server → service, service → state, sync-agent whitelist), all 3 requirements satisfied with implementation evidence, all tests green (21 + 47 = 68 tests passing), syntax valid.

The goal "Fire Stick passive auto-detection on Pi hotspot with cache resilience and state/sync-agent integration" is achieved at the code level. Phase 6 (CAPTIVE) and Phase 7 (CLOUD) consumers are unblocked.

---

_Verified: 2026-05-06T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
