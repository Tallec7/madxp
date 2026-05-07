---
phase: 06-captive-fire-stick-page-neopro
verified: 2026-05-07T00:00:00Z
status: passed
score: 5/5 success criteria verified
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - 'Configs dnsmasq + nginx déployées par install.sh / prepare-image.sh (success criterion #5)'
  gaps_remaining: []
  regressions: []
  closure_commits:
    - 'd4928210 fix(captive): wire neopro-base.conf in install.sh configure_nginx (plan 05)'
    - '9ceed23d docs(06-captive-05): complete install.sh wire neopro-base.conf gap closure'
    - '63dede57 fix(captive): propagate neopro-base.conf in build-raspberry.sh (plan 06)'
    - '3f6f1033 test(smoke): guard install.sh against captive nginx regression (plan 06)'
    - '0aad33a4 docs(06-captive-06): complete OTA propagation + smoke guard plan'
human_verification:
  - test: 'UX bug TV overflow sur firestick-wait.html (signalé en validation Pi NLF Test 1)'
    expected: 'MAC affichée intégralement à 128px sans overflow horizontal sur 1080p Fire Stick'
    why_human: 'Vérification visuelle terrain — fix en cours dans worktree claude/ecstatic-jones-8d6747 (PR séparée), tracké hors scope Phase 6, ne bloque pas la fonctionnalité'
---

# Phase 6 — Captive Fire Stick : Verification Report (Re-verification)

**Phase Goal:** Un Fire Stick branché sur le hotspot atterrit automatiquement sur la bonne page (Neopro plein écran si MAC assignée, page d'attente sinon), sans intervention manuelle du bénévole.

**Verified:** 2026-05-07
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 05 + 06)

## Re-verification Context

La verification initiale (2026-05-06) avait identifié 1 gap unique sur le success criterion #5 :
`raspberry/config/nginx/neopro-base.conf` était orphelin du point de vue déploiement
(install.sh utilisait un heredoc inline divergent ; build-raspberry.sh ne propageait pas le fichier).

Deux plans de gap closure ont été exécutés et mergés sur la branche :

- **Plan 05** (`d4928210` + `9ceed23d`) — Refactor `raspberry/install.sh::configure_nginx` :
  passage du heredoc 130 lignes à `cp ${INSTALL_DIR}/config/nginx/neopro-base.conf ...`,
  symlink idempotent, cleanup `*.bak`, backup vers `sites-available/neopro.pre-phase6.bak`.
- **Plan 06** (`63dede57` + `3f6f1033` + `0aad33a4`) — Extension `build-raspberry.sh`
  pour copier le `.conf` dans le tarball OTA + ajout d'un smoke guard `it()` dans
  le bloc Phase 6 de `smoke-kiosk-pi.test.ts`.

Cette re-verification confirme que le gap est fermé sans régression sur les 4 truths
déjà validées.

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP)

| #   | Truth                                                                             | Status           | Evidence                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fire Stick neuf → page servie par le Pi (DNS hijack + nginx) sans manipulation    | ✓ VERIFIED       | dnsmasq.conf hijack `firetvcaptiveportal.com` + `spectrum.s3.amazonaws.com`. `neopro-base.conf` location `/kindle-wifi/wifistub.html` retourne 200. Validation Pi NLF Test 1 PASS (2026-05-07).                                                                                                                                                                                         |
| 2   | Si MAC assignée → Neopro plein écran sur le bon display sans étape supplémentaire | ✓ VERIFIED       | `routes/captive.js` lookup MAC dans `configuration.json::displays[].receiver.mac`, retourne `displayIndex`. `app.component.ts` ngOnInit fait `location.replace('/?display=' + displayIndex)`. Validation Pi NLF Test 2 PASS.                                                                                                                                                            |
| 3   | Si MAC non assignée → page affiche MAC en gros + auto-refresh                     | ✓ VERIFIED       | `firestick-wait.html` (127 lignes) MAC affichée 128px, dual mécanisme : Socket.IO `connected-receivers-changed` + polling 5000ms sur `/api/captive/whoami`.                                                                                                                                                                                                                             |
| 4   | Quand admin assigne MAC → bascule auto Fire Stick → Neopro                        | ✓ VERIFIED       | Bootstrap router Angular + listener Socket.IO côté firestick-wait.html → `location.replace('/?display=' + N)`. Validation Pi NLF Test 2 PASS (bascule observée < 5s).                                                                                                                                                                                                                   |
| 5   | Configs dnsmasq + nginx déployées par install.sh / prepare-image.sh (pas manuel)  | ✓ VERIFIED (NEW) | **GAP CLOSED.** `raspberry/install.sh:678` exécute `cp "${INSTALL_DIR}/config/nginx/neopro-base.conf" /etc/nginx/sites-available/neopro` + symlink idempotent + cleanup `*.bak`. `build-raspberry.sh:391-396` copie le fichier dans le tarball OTA. Heredoc inline supprimé (`grep -c "cat > /etc/nginx/sites-available/neopro" install.sh = 0`). Smoke guard ajouté ligne 3576 (PASS). |

**Score:** 5/5 success criteria verified — gap critère #5 fermé sans régression sur 1-4.

### Required Artifacts (Re-verified)

| Artifact                                                    | Expected                                                                                                  | Status                        | Details                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `raspberry/install.sh::configure_nginx`                     | `cp ${INSTALL_DIR}/config/nginx/neopro-base.conf` + symlink idempotent + cleanup .bak + backup pre-phase6 | ✓ VERIFIED (NEW)              | Lignes 662-706 : heredoc 130 lignes supprimé, remplacé par : check source (666-669), backup sites-available/ (672-675), cp littéral (678), chmod (679), cleanup régulier+`*.bak`+`default` (683-688), `ln -sf` (691), nginx -t + restart (701-702). Idempotent. |
| `raspberry/scripts/build-raspberry.sh`                      | Copie neopro-base.conf dans le tarball OTA                                                                | ✓ VERIFIED (NEW)              | Lignes 388-396 : guard sur fichier source, `mkdir -p ${DEPLOY_DIR}/config/nginx`, `cp raspberry/config/nginx/neopro-base.conf ${DEPLOY_DIR}/config/nginx/neopro-base.conf`, abort si source manquante.                                                          |
| `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` | Smoke guard Phase 6 (cp neopro-base.conf OR 3 markers)                                                    | ✓ VERIFIED (NEW)              | Lignes 3576-3600 : `it('install.sh wires neopro-base.conf OR contains the 3 captive markers (Phase 6 gap closure)')` dans le describe block Phase 6 (ligne 3508). Test PASS (vérifié en re-run local).                                                          |
| `raspberry/config/nginx/neopro-base.conf`                   | 3 location blocks (probe + whoami + wait), maintenant déployé via install.sh                              | ✓ VERIFIED (status changé)    | Précédemment ⚠️ ORPHANED, désormais consommé par `install.sh` ET propagé par `build-raspberry.sh`. Single source of truth.                                                                                                                                      |
| `raspberry/server/services/receivers.service.js`            | resolveMacByIp + IPv4-mapped IPv6                                                                         | ✓ VERIFIED (régression check) | Inchangé depuis verification initiale.                                                                                                                                                                                                                          |
| `raspberry/server/routes/captive.js`                        | createCaptiveRouter + GET /whoami + X-Real-IP                                                             | ✓ VERIFIED (régression check) | Inchangé.                                                                                                                                                                                                                                                       |
| `raspberry/server/server.js`                                | Wire `app.use('/api/captive', ...)`                                                                       | ✓ VERIFIED (régression check) | Inchangé.                                                                                                                                                                                                                                                       |
| `raspberry/config/systemd/dnsmasq.conf`                     | DNS hijack 2 domaines Fire OS                                                                             | ✓ VERIFIED (régression check) | Inchangé.                                                                                                                                                                                                                                                       |
| `raspberry/webapp-captive/firestick-wait.html`              | Page wait standalone, MAC 128px, auto-refresh                                                             | ✓ VERIFIED (régression check) | Inchangé.                                                                                                                                                                                                                                                       |
| `raspberry/src/app/app.component.ts`                        | Bootstrap router /api/captive/whoami + location.replace                                                   | ✓ VERIFIED (régression check) | Inchangé.                                                                                                                                                                                                                                                       |
| 6 SUMMARY.md (plans 01-06)                                  | Tous présents                                                                                             | ✓ VERIFIED                    | `06-captive-{01..06}-SUMMARY.md` confirmés.                                                                                                                                                                                                                     |

### Key Link Verification (End-to-End Deployment Path)

| From                          | To                                                        | Via                                                           | Status                                  |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| `build-raspberry.sh`          | tarball OTA `${DEPLOY_DIR}/config/nginx/neopro-base.conf` | `cp` ligne 393                                                | ✓ WIRED (NEW)                           |
| OTA install (sync-agent)      | `/home/pi/neopro/config/nginx/neopro-base.conf`           | extraction tarball                                            | ✓ WIRED (héritage OTA tarball pipeline) |
| `install.sh::configure_nginx` | `/etc/nginx/sites-available/neopro`                       | `cp ${INSTALL_DIR}/config/nginx/neopro-base.conf` (ligne 678) | ✓ WIRED (NEW) — gap fermé               |
| `install.sh::configure_nginx` | `/etc/nginx/sites-enabled/neopro`                         | `ln -sf` (ligne 691) avec cleanup régulier+`*.bak`            | ✓ WIRED (NEW)                           |
| `nginx /api/captive/whoami`   | `http://localhost:3000/api/captive/whoami`                | proxy_pass + X-Real-IP                                        | ✓ WIRED (déployé maintenant)            |
| `routes/captive.js`           | `receiversService.resolveMacByIp`                         | direct call                                                   | ✓ WIRED                                 |
| `firestick-wait.html`         | `/api/captive/whoami`                                     | fetch polling 5000ms                                          | ✓ WIRED                                 |
| `app.component.ts::ngOnInit`  | `/api/captive/whoami` → `location.replace`                | fetch + displayIndex check                                    | ✓ WIRED                                 |
| Smoke guard                   | `install.sh` regex match cp neopro-base.conf              | jest `it()` ligne 3576                                        | ✓ WIRED (NEW)                           |

**End-to-end trace** (5a) :

1. `build-raspberry.sh` → tarball OTA inclut `config/nginx/neopro-base.conf` ✓
2. OTA install Pi existant → tarball extrait vers `/home/pi/neopro/` ✓
3. Re-run `bash install.sh` sur le Pi → `configure_nginx` voit le fichier (check ligne 666), le copie (678), symlink (691), restart nginx (702) ✓
4. `/etc/nginx/sites-enabled/neopro` est un symlink vers `/etc/nginx/sites-available/neopro` qui contient les 3 blocks Phase 6 ✓
5. **User-observable truth** : `curl http://192.168.4.1/api/captive/whoami` retournera Node JSON, pas SPA fallback ✓ (le fichier source contient bien le `location = /api/captive/whoami { proxy_pass http://localhost:3000 ... }`)

### Requirements Coverage (régression check)

| Requirement | Source Plan(s)        | Description                                               | Status                         | Evidence                                                                     |
| ----------- | --------------------- | --------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| CAPTIVE-01  | 06-captive-03         | Silk atterrit sur la page servie par le Pi                | ✓ SATISFIED (régression check) | Inchangé depuis verification initiale, désormais auto-déployé via plan 05+06 |
| CAPTIVE-02  | 06-captive-01, 02, 04 | MAC assignée → Neopro plein écran                         | ✓ SATISFIED (régression check) | Inchangé.                                                                    |
| CAPTIVE-03  | 06-captive-02, 03     | MAC non assignée → page d'attente avec MAC + auto-refresh | ✓ SATISFIED (régression check) | Inchangé.                                                                    |
| CAPTIVE-04  | 06-captive-02, 03, 04 | MAC assignée à distance → bascule auto Fire Stick         | ✓ SATISFIED (régression check) | Inchangé.                                                                    |

### Anti-Patterns Found

**Précédemment 🛑 Blocker (duplication source de vérité install.sh heredoc vs neopro-base.conf) → RÉSOLU.**

Plus aucun anti-pattern code-level. Le `cp` depuis `${INSTALL_DIR}/config/nginx/neopro-base.conf` est désormais la source unique de vérité, garde-fou par smoke test.

### Non-Blocking Observation

Le fichier de smoke `smoke-kiosk-pi.test.ts` contient un autre test pre-existing (`ADR-079 invariant: no DNAT 443 introduced by Phase 6`, ligne 3566-3573) qui échoue actuellement aussi bien sur la branche que sur `main`. **Ce failure pré-existe au gap closure et n'est PAS introduit par les plans 05/06** (vérifié : le même test échoue sur `main` HEAD). Il s'agit d'une régression antérieure indépendante de Phase 6 (probablement dans `setup-captive-portal-iptables.sh` ou `fix-fleet-pi.sh`), à tracker séparément. Le smoke guard Phase 6 ajouté par plan 06 (ligne 3576) passe vert.

### Human Verification Required

#### 1. UX bug TV overflow firestick-wait.html

**Test:** Brancher Fire Stick sur Pi NLF, observer la page d'attente sur TV 1080p
**Expected:** MAC affichée intégralement à 128px sans overflow / coupure horizontale
**Why human:** Bug visuel reporté pendant validation Pi NLF Test 1, fix en cours dans worktree `claude/ecstatic-jones-8d6747` (PR séparée hors scope Phase 6). Ne bloque pas la fonctionnalité — la phase est livrable.

### Gaps Summary

**Aucun gap restant.** Les 5 success criteria de la phase 6 sont satisfaits.

Le gap unique de la verification initiale (success criterion #5 — déploiement automatisé des configs nginx Phase 6) est désormais fermé via :

- `raspberry/install.sh::configure_nginx` consomme maintenant `neopro-base.conf` comme source de vérité unique (heredoc inline supprimé).
- `raspberry/scripts/build-raspberry.sh` propage le fichier dans le tarball OTA — un Pi mis à jour via OTA puis qui re-run `bash install.sh` aura automatiquement les 3 location blocks Phase 6 actifs sans intervention manuelle (scp/symlink/restart).
- Smoke guard `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts:3576` empêche toute régression future (revert vers heredoc divergent ou suppression du `cp`).

La phase 6 est **PASSED** — prête pour rollout flotte.

---

_Verified: 2026-05-07 (re-verification after plans 05 + 06)_
_Verifier: Claude (gsd-verifier)_
