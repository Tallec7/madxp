---
phase: 06-captive-fire-stick-page-neopro
plan: 02
subsystem: raspberry-pi-network
tags: [captive-portal, express-route, whoami, firestick, mac-resolution, display-index]

requires:
  - phase: 06-captive
    plan: 01
    provides: receiversService.resolveMacByIp(ip) — pure Map lookup
  - phase: 04-data
    provides: configuration.json displays[].receiver.mac (source of truth ADR Phase 4)
provides:
  - GET /api/captive/whoami endpoint on raspberry/server (port 3000)
  - createCaptiveRouter({ receiversService, configPath }) Express factory
  - IP→MAC→displayIndex pipeline (X-Real-IP > socket.remoteAddress)
  - Resilient response when configuration.json unreadable (200 + displayIndex=null)
affects: [06-captive-03, 06-captive-04, captive-bootstrap-decision]

tech-stack:
  added:
    - "supertest@^7.2.2 (devDep raspberry/server — Express router HTTP testing)"
  patterns:
    - "Express router factory pattern (cohérent health.js / hotspot.js)"
    - "Best-effort fallback on config read errors (200 + null fields vs 5xx)"
    - "Case-insensitive MAC equality at lookup boundary (entrée externe potentiellement uppercase)"

key-files:
  created:
    - raspberry/server/routes/captive.js
    - raspberry/server/__tests__/routes/captive.test.js
  modified:
    - raspberry/server/server.js
    - raspberry/server/package.json
    - raspberry/server/package-lock.json

key-decisions:
  - "Endpoint path /whoami (sous /api/captive) plutôt que /api/captive (factory mount + sous-route) — laisse la place à de futurs sous-endpoints (e.g. /assign-display, /status) sans casser la convention de mounting"
  - "Fallback résilient sur erreur lecture config (200 + displayIndex=null vs 5xx) — la MAC est connue, le bénévole peut assigner depuis le dashboard ; un 5xx forcerait une erreur visible côté Fire Stick alors que la situation est récupérable"
  - "Case-insensitive MAC compare au lookup (toLowerCase() côté requête + côté config.displays[].receiver.mac) — defensive : la MAC retournée par resolveMacByIp est lowercase par contrat (Plan 01), mais configuration.json est édité par humain/dashboard et peut contenir n'importe quelle casse"
  - "X-Real-IP forwarded header lu en lowercase ('x-real-ip') — Express normalise les headers en lowercase, la convention nginx 'X-Real-IP' arrive donc en clé lowercase. Validé par le test 'uses X-Real-IP header'."
  - "Factory guards (throw si receiversService manque resolveMacByIp ou configPath manque) — fail-fast au boot serveur plutôt qu'au premier appel HTTP, debug plus facile"

patterns-established:
  - "Routes Pi avec dépendances services injectées : factory function + guards d'invariants au boot, mount via app.use(prefix, factory({ deps }))"

requirements-completed: [CAPTIVE-02, CAPTIVE-03, CAPTIVE-04]

metrics:
  duration: ~10min
  tasks_completed: 2
  files_created: 2
  files_modified: 3
  tests_added: 8
  tests_total: 168
completed: 2026-05-06
---

# Phase 6 Plan 02: Captive Route + Server Wire Summary

**Express endpoint `GET /api/captive/whoami` livré et wiré dans raspberry/server, résolvant IP cliente Fire Stick → MAC (via Plan 01) → displayIndex (via configuration.json) avec fallback résilient en <5ms, prêt à alimenter le bootstrap Angular Plan 04.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 (TDD pour Task 1, refactor minimal Task 2)
- **Files created:** 2 (route + tests)
- **Files modified:** 3 (server.js wire + package.json/lock supertest)
- **Tests added:** 8 nouveaux (6 endpoint + 2 factory guards)
- **Tests total:** 168/168 verts (zéro régression sur les 160 pré-existants)

## Accomplishments

- **`GET /api/captive/whoami` endpoint** sur le serveur Pi local (port 3000) :
  - Lit l'IP cliente depuis `X-Real-IP` (nginx forward) avec fallback `req.socket.remoteAddress`
  - Délègue le lookup MAC à `receiversService.resolveMacByIp` (Plan 01, pure Map, <1ms)
  - Trouve le `displayIndex` correspondant dans `configuration.json` via `displays[].receiver.mac` (case-insensitive)
  - 3 réponses business : `{ mac, displayIndex: N, displayName }` (assigné), `{ mac, displayIndex: null, displayName: null }` (non assigné), `404 { error: 'mac_not_found' }` (MAC inconnue)
  - Fallback résilient : si `configuration.json` est ENOENT/JSON corrompu, retourne `200 + displayIndex=null` plutôt que 5xx
- **`createCaptiveRouter` factory** : pattern cohérent avec `routes/health.js` et `routes/hotspot.js`, guards d'invariants au boot (fail-fast)
- **Wiring server.js** : import + `app.use('/api/captive', ...)` placé après `express.json()` et autres routers, avant `server.listen()`
- **Test infra** : `supertest@^7.2.2` ajouté en devDep raspberry/server (premier usage — facilitera les futures routes testées HTTP)

## Task Commits

1. **Task 1 RED — failing tests + supertest devDep** — `3dbc5bc` (test)
2. **Task 1 GREEN — createCaptiveRouter implementation** — `2ead49d` (feat)
3. **Task 2 — wire into server.js** — `b54242e` (feat)

## Files Created/Modified

- `raspberry/server/routes/captive.js` (CREATE — 81 lignes) : factory `createCaptiveRouter({ receiversService, configPath })`, route `GET /whoami`, guards d'invariants, fallback résilient erreur fs
- `raspberry/server/__tests__/routes/captive.test.js` (CREATE — 8 tests) : couverture des 3 cas business + X-Real-IP forwarded + ENOENT resilience + case-insensitive MAC + 2 factory guards
- `raspberry/server/server.js` (MODIFY) : `+const createCaptiveRouter = require('./routes/captive');` + `+app.use('/api/captive', createCaptiveRouter({ receiversService, configPath: CONFIG_PATH }));`
- `raspberry/server/package.json` (MODIFY) : `+"supertest": "^7.2.2"` en devDependencies
- `raspberry/server/package-lock.json` (MODIFY) : lockfile supertest

## Verification

- `cd raspberry/server && npx jest --testPathPattern='routes/captive' --no-coverage --forceExit` → **8/8 tests** passing
- `node --check raspberry/server/server.js` → exit 0
- `cd raspberry/server && npx jest --no-coverage --forceExit` → **168/168 tests** passing (9 suites, zéro régression)
- `grep -q "createCaptiveRouter" raspberry/server/routes/captive.js` → ok
- `grep -q "x-real-ip" raspberry/server/routes/captive.js` → ok
- `grep -q "module.exports = createCaptiveRouter" raspberry/server/routes/captive.js` → ok
- `grep -q "resolveMacByIp" raspberry/server/routes/captive.js` → ok
- `grep -q "require('./routes/captive')" raspberry/server/server.js` → ok
- `grep -q "app.use('/api/captive'" raspberry/server/server.js` → ok
- `grep -q "configPath: CONFIG_PATH" raspberry/server/server.js` → ok
- Aucun `child_process` / `exec` / `query` direct dans `routes/captive.js` (pure Express + fs lecture)

## Deviations from Plan

None — plan exécuté exactement comme écrit. RED→GREEN cycle propre, ordre middleware respecté, aucun auto-fix nécessaire.

Note: `supertest` n'était pas pré-installé dans `raspberry/server/package.json` (le plan le supposait possiblement absent). Installé proprement comme devDep — premier usage de supertest dans ce sous-projet, posera la fondation pour les futures routes testées HTTP.

## Self-Check: PASSED

- File `raspberry/server/routes/captive.js` — FOUND
- File `raspberry/server/__tests__/routes/captive.test.js` — FOUND
- File `raspberry/server/server.js` modified — FOUND (`app.use('/api/captive', ...)` présent)
- Commit `3dbc5bc` (RED test) — FOUND
- Commit `2ead49d` (GREEN feat route) — FOUND
- Commit `b54242e` (wire server.js) — FOUND
