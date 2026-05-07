---
phase: 06-captive-fire-stick-page-neopro
plan: 06
subsystem: infra
tags: [build, ota, install.sh, captive-portal, smoke-test, nginx]

requires:
  - phase: 06-captive-fire-stick-page-neopro
    provides: install.sh::configure_nginx() câblé sur neopro-base.conf (Plan 05, commit d4928210)
provides:
  - OTA tarball ship neopro-base.conf à /home/pi/neopro/config/nginx/
  - Smoke guard contre régression heredoc dans install.sh
  - Closure success_criterion_5 ROADMAP Phase 6 (combiné Plan 05 + 06)
affects: [phase 07 cloud-side]

tech-stack:
  added: []
  patterns:
    - "OTA propagation pattern : tarball ship + re-run idempotent install.sh (pas d'auto-reload sync-agent — rescope explicite)"
    - 'Smoke guard avec OR-fallback : assertion souple (cp source de vérité OU 3 markers captive) qui bloque la régression sans figer la stratégie'

key-files:
  created: []
  modified:
    - 'raspberry/scripts/build-raspberry.sh — bloc Phase 6 (mkdir + cp neopro-base.conf, +12 lignes)'
    - 'central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts — nouveau it() dans bloc Phase 6 (+26 lignes)'

key-decisions:
  - "Rescope OTA = tarball ship + re-run install.sh (idempotent, Plan 05). Pas d'auto-reload nginx via sync-agent : sudoers ne le permettent pas, hors scope."
  - "Smoke guard avec OR-fallback (cp neopro-base.conf OU 3 markers) au lieu d'assertion stricte — laisse de la latitude pour un futur changement de stratégie sans casser le test"
  - 'Position du bloc cp dans build-raspberry.sh : juste après firestick-wait.html (cohérence Phase 6, avant rsync server)'

patterns-established:
  - 'OTA tarball doit shipper la source de vérité nginx pour permettre re-run de install.sh sur Pi existant'
  - 'Smoke test sur install.sh pattern : grep avec fallback markers — robuste face à un refactor de stratégie'

requirements-completed: [success_criterion_5]

duration: 5min
completed: 2026-05-07
---

# Phase 6 Plan 06: OTA propagation + smoke guard captive nginx Summary

**Ship `neopro-base.conf` dans le tarball OTA (build-raspberry.sh) + smoke guard install.sh — closure success_criterion_5 ROADMAP Phase 6 (combiné avec Plan 05).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-07T09:21:00Z
- **Completed:** 2026-05-07T09:26:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `build-raspberry.sh` copie désormais `raspberry/config/nginx/neopro-base.conf` dans `${DEPLOY_DIR}/config/nginx/` → un Pi qui pull la prochaine release OTA aura le fichier à `/home/pi/neopro/config/nginx/neopro-base.conf` (chemin que install.sh::configure_nginx() référence depuis Plan 05)
- Nouveau `it()` dans le bloc `describe('Phase 6 — Fire Stick Captive Portal')` de `smoke-kiosk-pi.test.ts` : vérifie que install.sh contient soit `cp .*config/nginx/neopro-base.conf`, soit les 3 markers captive (`kindle-wifi/wifistub.html`, `/api/captive/whoami`, `/captive/wait`)
- Test passe au premier essai contre install.sh post-Plan 05 (1 passed, 6 ms)

## Task Commits

1. **Task 1: Propagate neopro-base.conf in build-raspberry.sh** — `63dede57` (fix)
2. **Task 2: Add smoke guard against install.sh nginx regression** — `3f6f1033` (test)

## Files Created/Modified

- `raspberry/scripts/build-raspberry.sh` — bloc Phase 6 ajouté après copie firestick-wait.html (+12 lignes)
- `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` — nouveau `it()` dans le describe Phase 6 (+26 lignes)

## Decisions Made

- **Rescope OTA propagation** : "tarball ship + re-run install.sh" plutôt que "auto-reload nginx via sync-agent". Justification : sync-agent n'a pas les sudoers pour `nginx -s reload` ni pour réécrire `/etc/nginx/sites-available/neopro` ; ajouter ces sudoers élargirait la surface d'attaque pour un gain marginal (Pi existants sont rares à recevoir un update du chemin captif). install.sh étant idempotente (Plan 05), opérationnellement = `pull latest + bash install.sh`.
- **Smoke guard avec OR-fallback** plutôt que `expect(usesSourceOfTruth).toBe(true)` strict. Le fallback "3 markers captive" garde de la latitude si un futur PR revient à une stratégie heredoc volontaire (improbable mais non interdit), tant que les routes captives sont préservées. Bloque le bug d'origine (heredoc qui oubliait `/api/captive/whoami`) sans verrouiller la forme.
- **Position dans build-raspberry.sh** : juste après le bloc firestick-wait.html, avant le rsync server. Cohérence Phase 6, et `${DEPLOY_DIR}` existe déjà à ce point.

## Deviations from Plan

None - plan executed exactly as written. Tous les acceptance criteria validés au premier essai :

- `bash -n raspberry/scripts/build-raspberry.sh` exit 0 ✓
- `grep -c 'cp raspberry/config/nginx/neopro-base.conf' raspberry/scripts/build-raspberry.sh` = 1 ✓
- `grep -c 'mkdir -p ${DEPLOY_DIR}/config/nginx' raspberry/scripts/build-raspberry.sh` = 1 ✓
- Bloc positionné après firestick-wait.html ✓ (lignes 392-393)
- Nouveau `it()` dans le bloc Phase 6 existant ✓ (après ADR-079 invariant, fin du describe ligne ~3601)
- Test runne et passe : `1 passed, 6 ms` ✓
- `grep` markers (kindle-wifi, whoami, wait) tous présents ✓

## Issues Encountered

- `node_modules` central-server pas installé dans la worktree → `npm install` requis avant `npx jest` (~14s, 1044 packages, --prefer-offline). Pas un blocker, juste un coût ponctuel d'environnement worktree.
- Le flag jest `--testPathPattern` (singulier) est déprécié, remplacé par `--testPathPatterns` (pluriel) — le plan référençait l'ancien, corrigé inline.

## User Setup Required

None.

## Next Phase Readiness

- **success_criterion_5 ROADMAP Phase 6 fully addressed** (combiné Plan 05 + 06) :
  1. From-scratch install (Plan 05) : `bash install.sh` suffit
  2. OTA tarball (Plan 06 task 1) : conf shipped à `/home/pi/neopro/config/nginx/`, appliquée via re-run idempotent
  3. Anti-régression (Plan 06 task 2) : smoke test bloque tout retour en arrière
- **Risque résiduel acceptable** : pas d'auto-reload nginx via OTA. Adressable plus tard si besoin (commande sync-agent dédiée + sudoers).
- **Plan 04 Task 2 reste pending** : validation manuelle Pi RACC Fire Stick réel (orthogonal à Plan 06).

## Self-Check: PASSED

- FOUND: raspberry/scripts/build-raspberry.sh (bloc neopro-base.conf, lignes 388-397)
- FOUND: central-server/src/**tests**/smoke/smoke-kiosk-pi.test.ts (it() neopro-base.conf, après ADR-079 guard)
- FOUND: commit 63dede57 (task 1)
- FOUND: commit 3f6f1033 (task 2)
- FOUND: smoke test pass (1 passed, 6 ms)

---

_Phase: 06-captive-fire-stick-page-neopro_
_Completed: 2026-05-07_
