---
phase: 05-detect
plan: 01
subsystem: raspberry
tags: [receivers, dnsmasq, arp, hotspot, socket.io, firestick, detection]

requires:
  - phase: 04-data
    provides: DisplayConfig.receiver schema + repository methods (where MACs will land cloud-side)
provides:
  - ReceiversService class (raspberry/server/services/receivers.service.js)
  - Passive MAC detection via dnsmasq.leases mtime polling + arp -an fallback
  - Socket event `connected-receivers-changed` (idempotent — only on diff)
  - OUI-based kind inference (firestick vs browser)
affects: [05-detect-02, 05-detect-03, 06-captive, 07-cloud]

tech-stack:
  added: []
  patterns:
    - "Service class avec état interne Map<mac, {kind, lastSeenAt}> (pas de cache TTL — refresh à chaque tick)"
    - "Diff previous-vs-current avant emit (idempotent — pas de spam socket si state inchangé)"
    - "Polling mtime dnsmasq.leases (10s) + fallback exec arp -an (30s)"

key-files:
  created:
    - raspberry/server/services/receivers.service.js
  modified:
    - raspberry/server/__tests__/receivers.service.test.js (RED commit cf7fa13, pré-existant)

key-decisions:
  - "Logs via console.info/warn (cohérent avec hdmi.service.js — helpers.js n'expose pas Winston côté raspberry/server)"
  - "Pas de cache TTL — l'état est la source de vérité, refresh à chaque scan (10s/30s)"
  - "lastSeenAt refreshed on every observation, but emit only on set membership change (add/remove MAC)"
  - "Pi natif (b8:27:eb, etc.) → kind='browser' (le service ne traite que des clients hotspot, le Pi lui-même n'est pas client de son AP)"

patterns-established:
  - "Pattern receivers.service.js : classe + Map state + setInterval polls + diff + emit (réutilisable pour future détection passive cross-source)"
  - "Test pattern Jest : mock fs.statSync/readFileSync + util.promisify.custom pour child_process.exec (déjà éprouvé sur hdmi.service.test.js)"

requirements-completed: [DETECT-01, DETECT-02]

duration: 8 min
completed: 2026-05-06
---

# Phase 5 Plan 1: Receivers Service Summary

**ReceiversService passive WiFi detection — dnsmasq.leases mtime watch + arp -an fallback, OUI-based firestick/browser kind inference, idempotent socket emit on MAC set change**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-06T10:18:00Z (RED commit cf7fa13)
- **Completed:** 2026-05-06T10:26:00Z (GREEN commit 1a4df9b)
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2 (1 created, 1 pré-existant — test fichier de la RED)

## Accomplishments

- `ReceiversService` instanciable avec API publique `start(io)` / `stop()` / `getReceivers()`
- Détection passive Fire Stick via préfixe OUI Amazon (9 OUI publics)
- Fallback `arp -an` (filtré `on wlan0`) pour résilience si dnsmasq.leases inaccessible
- Émission socket idempotente — pas de spam quand state inchangé (mtime identique OU même set MAC)
- Cleanup propre `stop()` (clearInterval des 2 polls)
- 10/10 tests Jest verts (mock fs + child_process via `util.promisify.custom`)

## Task Commits

1. **Task 1 RED — failing tests** — `cf7fa13` (test) — déjà présent au démarrage du plan
2. **Task 1 GREEN — implement service** — `1a4df9b` (feat)

**Plan metadata:** _(à venir, ce commit)_

## Files Created/Modified

- `raspberry/server/services/receivers.service.js` (231 lignes) — Service de détection passive
- `raspberry/server/__tests__/receivers.service.test.js` (162 lignes) — 10 tests Jest (présent depuis cf7fa13)

## Decisions Made

- **console au lieu de Winston** : `helpers.js` côté raspberry/server est un re-export shim de `env-config.js` et n'expose pas de logger Winston. `hdmi.service.js` utilise `console.warn` directement → cohérence côté Pi.
- **`lastSeenAt` refresh ≠ emit trigger** : le service met à jour `lastSeenAt` à chaque observation pour les MACs déjà connues, mais n'émet `connected-receivers-changed` que si le set membership change (add/remove MAC). Cela évite un emit toutes les 10s même quand rien ne bouge.
- **Pas de cache TTL** : différent de `hdmi.service.js` (qui cache CEC 10s, EDID 5min). Ici l'état EST le cache, refresh à chaque tick.

## Deviations from Plan

None - plan executed exactly as written. Le test file (`receivers.service.test.js`) était déjà commit sur `cf7fa13` (RED step réalisée hors session) ; cette session a délivré la GREEN step (`1a4df9b`).

**Total deviations:** 0
**Impact on plan:** None — TDD flow respecté (RED commit pré-existant, GREEN commit délivré ici).

## Issues Encountered

- **Jest babel cache stale** : le premier `npm test` a échoué avec `[BABEL] Plugin/Preset files are not allowed to export objects, only functions`. Résolu avec `npx jest --no-cache`. À noter pour les futures sessions raspberry/server (la cache `node_modules/.cache/babel-jest/` peut générer des faux-négatifs après création de nouveaux fichiers source).

## User Setup Required

None - pas de configuration externe requise.

## Next Phase Readiness

- **Plan 02 (cache résilience)** prêt à démarrer — peut consommer `getReceivers()` pour persister un cache local résilient au reboot.
- **Plan 03 (state.service + sync-agent)** déblocable une fois cache disponible — câblage `start(io)` au boot du server, push events vers cloud via sync-agent.
- **Pas de blocker connu**. La détection est passive (read-only sur dnsmasq.leases + arp), zéro privilège élevé requis.

## Self-Check: PASSED

- File `raspberry/server/services/receivers.service.js` exists on disk
- Commits `cf7fa13` (RED) and `1a4df9b` (GREEN) confirmed in `git log --oneline --all`
- All 10 Jest tests passing
