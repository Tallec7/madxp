---
phase: 06-captive-fire-stick-page-neopro
plan: 04
subsystem: raspberry-angular-bootstrap
tags: [captive-portal, angular, bootstrap-router, firestick, ui-spec, anti-flash]

requires:
  - phase: 06-captive
    plan: 02
    provides: GET /api/captive/whoami endpoint (raspberry/server :3000, proxied by nginx Plan 03)
  - phase: 06-captive
    plan: 03
    provides: nginx /api/captive/whoami reverse-proxy + /captive/wait static page
provides:
  - AppComponent.ngOnInit bootstrap router (whoami fetch + replace-redirect)
  - index.html anti-flash baked background #000 (UI-SPEC)
  - Karma spec covering 4 scenarios (bypass / assigned / waiting / fetch-error)
affects: [06-captive (closes loop), Fire Stick UX end-to-end]

tech-stack:
  added: []
  patterns:
    - "Bootstrap router pattern dans AppComponent.ngOnInit — décide avant tout render Angular"
    - "location.replace() obligatoire (UI-SPEC) — pas de pollution back-button sur Fire Stick"
    - "Anti-flash baked CSS dans index.html — pré-bundle, parsé avant tout JS Angular"
    - "Resilient fallback : fetch error / réponse non-conforme → boot Angular normal (offline-first)"

key-files:
  created:
    - raspberry/src/app/app.component.spec.ts
  modified:
    - raspberry/src/app/app.component.ts
    - raspberry/src/index.html

key-decisions:
  - "Bootstrap router placé dans AppComponent.ngOnInit (vs. mini bootstrap HTML servi par nginx) — un seul code path, simpler maintenance ; le coût parse Angular avant redirect est borné car index.html est noir, donc invisible visuellement"
  - "fetch /api/captive/whoami avant socketService.initialize() / removeBootSplash() — la décision de redirect doit se faire AVANT toute autre logique (sinon les sockets s'initialisent puis sont jetés au replace)"
  - "Guard ?display query param via URLSearchParams — bypass total du fetch quand l'URL est déjà résolue (path Pi natif HDMI #0 ou Fire Stick déjà bascule), zéro overhead pour le mode standard"
  - "encodeURIComponent(data.mac) sur la MAC dans l'URL /captive/wait — defensive contre un format MAC inattendu côté serveur (la MAC contient des `:` qui sont safe en query string mais protégeons-nous)"
  - "Anti-flash via inline <style> dans <head> (vs. attribut style sur <body>) — html { bg } couvre aussi la phase de parse pré-body, plus robuste"

patterns-established:
  - "Bootstrap router Angular pour Pi : ngOnInit async, fetch + location.replace(), fallback silent au boot normal sur erreur"

requirements-completed: [CAPTIVE-02, CAPTIVE-04]

metrics:
  duration: ~8min
  tasks_completed: 1
  files_created: 1
  files_modified: 2
  tests_added: 4
  tests_total_local: not_run (node_modules not installed in execution env — will run on Pi RACC validation)
completed: 2026-05-06
---

# Phase 6 Plan 04: Angular Bootstrap Router Summary

**`AppComponent` Angular du Pi étend `ngOnInit` avec un bootstrap router qui consomme `/api/captive/whoami` (Plan 02) avant tout render, redirige via `location.replace()` vers `/?display=N` (assigné) ou `/captive/wait?mac=...` (en attente), et ship un anti-flash `background:#000` baked dans `index.html` pour matcher `firestick-wait.html` (UI-SPEC). 4 tests Karma couvrent les scénarios bypass / assigned / waiting / fetch-error.**

## Status

**Task 1 (autonomous) : COMPLETE** — committed `58bcecf`.
**Task 2 (checkpoint:human-verify Pi RACC) : PENDING** — awaiting manual validation on Pi RACC (`neopro.local`) with real Fire Stick.

This SUMMARY will be updated after the Pi RACC validation completes (Test 1-4 results, observed bascule latency, any deviations).

## Performance (Task 1)

- **Duration:** ~8 min
- **Tasks committed:** 1/2 (Task 2 = manual checkpoint, blocked on Pi RACC)
- **Files created:** 1 (spec)
- **Files modified:** 2 (component + index.html)
- **Tests added:** 4 Karma specs

## Accomplishments (Task 1)

- **Bootstrap router dans `AppComponent.ngOnInit`** :
  - Guard `URLSearchParams.has('display')` → bypass complet si URL déjà résolue (Pi natif HDMI #0 ou Fire Stick déjà bascule)
  - `fetch('/api/captive/whoami', { cache: 'no-store' })` → décision avant tout autre side-effect
  - `typeof data.displayIndex === 'number'` → `location.replace('/?display=' + N)` (CAPTIVE-02)
  - `typeof data.mac === 'string'` (et displayIndex null) → `location.replace('/captive/wait?mac=' + encodeURIComponent(mac))` (CAPTIVE-04)
  - 404 mac_not_found / réponse non-conforme / fetch error → fallthrough vers `socketService.initialize() + removeBootSplash()` (boot Angular normal, résilience offline)
  - `console.warn` sur catch (visible debug Silk) — pas de re-throw, pas de retry (anti boucle infinie)
- **Anti-flash `index.html`** : `<style>html, body { background: #000000; margin: 0 }</style>` injecté dans `<head>` après le `<script socket.io>`. Pré-bundle, parsé avant tout JS Angular. Matche le `#000` de `firestick-wait.html` (UI-SPEC §"No flash white during Angular bootstrap")
- **Spec Karma `app.component.spec.ts`** : nouveau fichier (n'existait pas), 5 tests (1 baseline `should create` + 4 Phase 6) :
  - `bypasses bootstrap when URL already has ?display=N` (no fetch, no replace)
  - `redirects to /?display=N when whoami returns assigned displayIndex` (CAPTIVE-02)
  - `redirects to /captive/wait when whoami returns null displayIndex` (CAPTIVE-04)
  - `boots normally when whoami fetch fails (resilience)`
  - SocketService mocké via `jasmine.createSpyObj` pour isoler le test bootstrap

## Task Commits

1. **Task 1 — bootstrap router + spec + anti-flash** — `58bcecf` (feat)

## Files Created/Modified

- `raspberry/src/app/app.component.spec.ts` (CREATE — 86 lignes) : Karma spec, mock SocketService, 4 tests Phase 6 (bypass / assigned / waiting / fetch-error)
- `raspberry/src/app/app.component.ts` (MODIFY — +30 lignes) : `ngOnInit` devient `async`, ajoute le bootstrap router AVANT `socketService.initialize()` + `removeBootSplash()`. Guards : URL déjà résolue → bypass ; fetch error → fallback boot normal
- `raspberry/src/index.html` (MODIFY — +9 lignes) : `<style>` inline dans `<head>` pour `html, body { background: #000000; margin: 0 }`

## Verification (Task 1)

Acceptance grep checks (tous PASS) :

- `grep -q "/api/captive/whoami" raspberry/src/app/app.component.ts` → ok
- `grep -q "location.replace" raspberry/src/app/app.component.ts` → ok (3 hits)
- `grep -q "URLSearchParams" raspberry/src/app/app.component.ts` → ok
- `grep -q "displayIndex" raspberry/src/app/app.component.ts` → ok (2 hits)
- `grep -q "/captive/wait" raspberry/src/app/app.component.ts` → ok
- `grep -qE "location\.href\s*=" raspberry/src/app/app.component.ts` → exit 1 (interdiction UI-SPEC respectée)
- `grep -q "Fire Stick captive bootstrap" raspberry/src/app/app.component.spec.ts` → ok
- `grep -c "CAPTIVE-0" raspberry/src/app/app.component.spec.ts` → 3 (≥2 required)
- `grep -q "background.*#000" raspberry/src/index.html` → ok

TS compile : `npx tsc --noEmit -p raspberry/tsconfig.json` retourne uniquement le warning pré-existant `baseUrl deprecated` (pas une erreur, hérité du repo, hors scope).

Karma test execution : **non exécuté localement** — `node_modules` n'est pas installé dans cet environnement d'exécution (sandbox sans `npm install`). La validation Karma sera couverte par :
- Le hook CI standard sur la PR (lint + ng test) si configuré
- La validation Pi RACC manuelle (Task 2 — observable end-to-end : si la spec ment, le Fire Stick ne bascule pas)

## Deviations from Plan

**1. [Rule 3 — Blocking] node_modules absents en env d'exécution**

- **Found during:** Task 1 verification step
- **Issue:** Pas de `node_modules` dans la worktree → impossible de lancer `ng test` ou `tsc -p tsconfig.spec.json`
- **Fix:** Validation par grep des invariants de code + TS root check (raspberry/tsconfig.json) qui est self-contained. Karma sera lancé en CI / sur Pi RACC
- **Files modified:** none
- **Commit:** N/A (pas de fix code, juste un changement de méthode de verif)

Aucune autre déviation — plan exécuté exactement comme écrit.

## Pending — Task 2 (checkpoint:human-verify)

Validation manuelle requise sur Pi RACC + Fire Stick réel :

1. **Test 1 (CAPTIVE-01 + CAPTIVE-03)** — Fire Stick neuf → `/captive/wait?mac=...` affichée, MAC visible 128px
2. **Test 2 (CAPTIVE-02 + CAPTIVE-04)** — Admin assigne MAC en DB → bascule auto vers `/?display=N` en <5s (cible <500ms via Socket.IO)
3. **Test 3 (ADR-079 invariant)** — `iptables -t nat -L PREROUTING` ne contient AUCUNE règle DNAT 443
4. **Test 4 (résilience)** — `sudo reboot` du Pi → configs Phase 6 toujours actives au reboot

Resume signal : "approved" si 4/4 passent, sinon description des échecs.

## Self-Check: PASSED (Task 1)

- File `raspberry/src/app/app.component.ts` modified — FOUND (`/api/captive/whoami` présent ligne 21, `location.replace` présent lignes 26+31)
- File `raspberry/src/app/app.component.spec.ts` created — FOUND (3 occurrences `CAPTIVE-0`, describe `Fire Stick captive bootstrap`)
- File `raspberry/src/index.html` modified — FOUND (`background: #000000` ligne 23)
- Commit `58bcecf` (feat bootstrap router) — FOUND in `git log --oneline`
