---
phase: 06-captive-fire-stick-page-neopro
verified: 2026-05-06T00:00:00Z
status: gaps_found
score: 4/5 success criteria verified
gaps:
  - truth: 'Configs dnsmasq + nginx déployées par install.sh / prepare-image.sh (pas manuel par Pi) — success criterion #5'
    status: failed
    reason: "Le fichier raspberry/config/nginx/neopro-base.conf (qui contient les 3 location blocks Phase 6) n'est référencé par AUCUN script de déploiement. install.sh utilise un heredoc inline (cat > /etc/nginx/sites-available/neopro << 'EOF') qui ne contient PAS les blocks Phase 6 (kindle-wifi, /api/captive/whoami, /captive/wait). build-raspberry.sh copie firestick-wait.html mais pas la config nginx. Validation Pi NLF 2026-05-07 a confirmé ce gap : déploiement manuel scp + symlink + nginx restart requis — non automatisable en l'état pour rollout flotte."
    artifacts:
      - path: 'raspberry/install.sh'
        issue: "Heredoc lignes 665-794 inline une config nginx qui n'inclut PAS les 3 location blocks Phase 6 (kindle-wifi/wifistub.html, /api/captive/whoami, /captive/wait)"
      - path: 'raspberry/scripts/build-raspberry.sh'
        issue: 'Copie firestick-wait.html (lignes 382-385) mais ne déploie pas raspberry/config/nginx/neopro-base.conf vers /etc/nginx/sites-available/neopro ni ne crée de symlink'
      - path: 'raspberry/config/nginx/neopro-base.conf'
        issue: "Fichier orphelin du point de vue déploiement — référencé uniquement en commentaire d'en-tête (`sudo cp ...` manuel) et dans une string TS à valeur documentaire"
    missing:
      - "Soit étendre l'heredoc inline de configure_nginx() dans install.sh avec les 3 location blocks Phase 6 (kindle-wifi, /api/captive/whoami, /captive/wait)"
      - 'Soit basculer install.sh sur `cp raspberry/config/nginx/neopro-base.conf /etc/nginx/sites-available/neopro` (single source of truth) — préférable, supprime la duplication'
      - 'Étendre build-raspberry.sh pour déployer la config nginx pendant le sync OTA (cp + ln -sf + sudo systemctl reload nginx avec sudoers approprié)'
      - 'Ajouter un smoke test garde-fou : vérifier que install.sh contient les markers Phase 6 (kindle-wifi/wifistub.html, /api/captive/whoami, X-Real-IP, /captive/wait, firestick-wait.html) OU que install.sh `cp` le fichier neopro-base.conf'
human_verification:
  - test: 'UX bug TV overflow sur firestick-wait.html (signalé en validation Pi NLF Test 1)'
    expected: 'MAC affichée intégralement à 128px sans overflow horizontal sur 1080p Fire Stick'
    why_human: 'Vérification visuelle terrain — fix en cours dans worktree claude/ecstatic-jones-8d6747 (PR séparée), hors scope Phase 6'
---

# Phase 6 — Captive Fire Stick : Verification Report

**Phase Goal:** Un Fire Stick branché sur le hotspot atterrit automatiquement sur la bonne page (Neopro plein écran si MAC assignée, page d'attente sinon), sans intervention manuelle du bénévole.

**Verified:** 2026-05-06
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP)

| #   | Truth                                                                             | Status     | Evidence                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Fire Stick neuf → page servie par le Pi (DNS hijack + nginx) sans manipulation    | ✓ VERIFIED | `dnsmasq.conf` lignes 59-60 hijack `firetvcaptiveportal.com` + `spectrum.s3.amazonaws.com`. `neopro-base.conf` location `/kindle-wifi/wifistub.html` retourne 200 Success. Validation Pi NLF Test 1 PASS (2026-05-07).                                                                                                               |
| 2   | Si MAC assignée → Neopro plein écran sur le bon display sans étape supplémentaire | ✓ VERIFIED | `routes/captive.js::createCaptiveRouter` lookup MAC dans `configuration.json::displays[].receiver.mac`, retourne `displayIndex`. `app.component.ts` ngOnInit fait `location.replace('/?display=' + displayIndex)`. Validation Pi NLF Test 2 PASS.                                                                                    |
| 3   | Si MAC non assignée → page affiche MAC en gros + auto-refresh                     | ✓ VERIFIED | `firestick-wait.html` (127 lignes) contient `data-mac`, MAC affichée 128px, dual mécanisme : Socket.IO `connected-receivers-changed` + polling `setInterval(..., 5000)` sur `/api/captive/whoami`.                                                                                                                                   |
| 4   | Quand admin assigne MAC → bascule auto Fire Stick → Neopro                        | ✓ VERIFIED | Bootstrap router Angular (`app.component.ts` lignes 17-31) + listener Socket.IO côté firestick-wait.html → `location.replace('/?display=' + N)`. Validation Pi NLF Test 2 PASS (bascule observée < 5s).                                                                                                                              |
| 5   | Configs dnsmasq + nginx déployées par install.sh / prepare-image.sh (pas manuel)  | ✗ FAILED   | install.sh heredoc inline ligne 665 ne contient PAS les 3 blocs Phase 6. `neopro-base.conf` n'est référencé par aucun script de déploiement (build-raspberry.sh, install.sh, sync-deploy). Validation Pi NLF a requis scp + symlink + restart manuels — confirmé dans 06-captive-04-SUMMARY.md ligne 137 ("Pré-requis déploiement"). |

**Score:** 4/5 success criteria verified — 1 gap on infrastructure deployment automation.

### Required Artifacts

| Artifact                                                    | Expected                                                | Status      | Details                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `raspberry/server/services/receivers.service.js`            | resolveMacByIp + \_ipToMac + IPv4-mapped IPv6 norm      | ✓ VERIFIED  | Lines 59 (\_ipToMac), 137-141 (resolveMacByIp), 313/385 (Map populate from leases + ARP)                                                |
| `raspberry/server/__tests__/receivers.service.test.js`      | ≥3 tests resolveMacByIp                                 | ✓ VERIFIED  | 10 occurrences resolveMacByIp                                                                                                           |
| `raspberry/server/routes/captive.js`                        | createCaptiveRouter + GET /whoami + X-Real-IP           | ✓ VERIFIED  | Line 32 factory, line 44 `req.headers['x-real-ip']`, line 45 resolveMacByIp                                                             |
| `raspberry/server/__tests__/routes/captive.test.js`         | Supertest tests (≥4 cas)                                | ✓ VERIFIED  | File exists                                                                                                                             |
| `raspberry/server/server.js`                                | Wire `app.use('/api/captive', ...)`                     | ✓ VERIFIED  | Lines 131 (require) + 140 (app.use)                                                                                                     |
| `raspberry/config/systemd/dnsmasq.conf`                     | DNS hijack 2 domaines Fire OS                           | ✓ VERIFIED  | Lines 59-60                                                                                                                             |
| `raspberry/config/nginx/neopro-base.conf`                   | 3 location blocks (probe + whoami + wait)               | ⚠️ ORPHANED | Lines 45/52/57/62 contiennent les 3 blocs MAIS le fichier n'est consommé par aucun script de déploiement (cf. gap success criterion #5) |
| `raspberry/webapp-captive/firestick-wait.html`              | Page wait standalone, 60+ lignes, MAC 128px             | ✓ VERIFIED  | 127 lignes, markers présents (data-mac, 128px, /api/captive/whoami, socket.io.js, 5000, "En attente d'assignation")                     |
| `raspberry/scripts/build-raspberry.sh`                      | Copie firestick-wait.html dans dist/webapp/             | ✓ VERIFIED  | Lines 382-385                                                                                                                           |
| `central-server/src/__tests__/smoke/smoke-kiosk-pi.test.ts` | Bloc Phase 6 + 7 assertions                             | ✓ VERIFIED  | Line 3508 describe block, 7 it() couvrant CAPTIVE-01/02/03 + ADR-079                                                                    |
| `raspberry/src/app/app.component.ts`                        | Bootstrap router /api/captive/whoami + location.replace | ✓ VERIFIED  | Lines 18-31 (URLSearchParams, fetch, displayIndex, location.replace, /captive/wait)                                                     |
| `raspberry/src/index.html`                                  | Background #000 anti-flash                              | ✓ VERIFIED  | Lines 18, 23 (background: #000000)                                                                                                      |

### Key Link Verification

| From                                        | To                                       | Via                                         | Status                                                                              |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| receivers.service.js::\_scanLeases          | this.\_ipToMac                           | `set(ip, mac.toLowerCase())`                | ✓ WIRED                                                                             |
| routes/captive.js                           | receiversService.resolveMacByIp          | `receiversService.resolveMacByIp(clientIp)` | ✓ WIRED                                                                             |
| routes/captive.js                           | configuration.json (displays)            | `fs.readFileSync(configPath)` + find        | ✓ WIRED                                                                             |
| server.js                                   | createCaptiveRouter                      | `app.use('/api/captive', ...)`              | ✓ WIRED                                                                             |
| firestick-wait.html                         | /api/captive/whoami                      | fetch polling 5000ms                        | ✓ WIRED                                                                             |
| firestick-wait.html                         | /socket.io/socket.io.js                  | `<script src="/socket.io/socket.io.js">`    | ✓ WIRED                                                                             |
| nginx neopro-base.conf::/api/captive/whoami | http://localhost:3000/api/captive/whoami | proxy_pass + X-Real-IP                      | ⚠️ WIRED dans le fichier source — mais le fichier n'est pas déployé sur Pi (gap #5) |
| app.component.ts::ngOnInit                  | /api/captive/whoami → location.replace   | fetch + displayIndex check                  | ✓ WIRED                                                                             |
| install.sh::configure_nginx                 | raspberry/config/nginx/neopro-base.conf  | (attendu) `cp` ou `ln -sf`                  | ✗ NOT_WIRED — heredoc inline divergent                                              |

### Requirements Coverage

| Requirement | Source Plan(s)        | Description                                                     | Status      | Evidence                                                                             |
| ----------- | --------------------- | --------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| CAPTIVE-01  | 06-captive-03         | Silk atterrit sur la page servie par le Pi (DNS hijack + nginx) | ✓ SATISFIED | dnsmasq.conf + nginx wifistub.html + smoke tests + Validation Pi NLF Test 1 PASS     |
| CAPTIVE-02  | 06-captive-01, 02, 04 | MAC assignée → Neopro plein écran                               | ✓ SATISFIED | resolveMacByIp + /whoami + Angular bootstrap router + Validation Pi NLF Test 2 PASS  |
| CAPTIVE-03  | 06-captive-02, 03     | MAC non assignée → page d'attente avec MAC + auto-refresh       | ✓ SATISFIED | firestick-wait.html (128px MAC + 5000ms polling + Socket.IO listener)                |
| CAPTIVE-04  | 06-captive-02, 03, 04 | MAC assignée à distance → bascule auto Fire Stick               | ✓ SATISFIED | Listener `connected-receivers-changed` + polling fallback + Validation Pi NLF Test 2 |

**Note:** Les 4 requirements sont fonctionnellement satisfaits. Le gap success criterion #5 (déploiement automatisé des configs) n'est pas un requirement explicite mais est listé comme success criterion dans ROADMAP — il bloque le rollout flotte sans toucher la fonctionnalité elle-même sur les Pi déjà patchés manuellement.

### Anti-Patterns Found

| File                                                           | Pattern                                                                             | Severity   | Impact                                                                                                                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| raspberry/install.sh + raspberry/config/nginx/neopro-base.conf | Duplication source de vérité nginx (heredoc inline + fichier versionné non utilisé) | 🛑 Blocker | Toute évolution nginx Phase 6+ doit être doublement maintenue (install.sh ET neopro-base.conf), risque de divergence garanti — déjà observé sur Pi NLF |

Aucun anti-pattern code-level (pas de TODO/placeholder/empty handler dans les artifacts vérifiés).

### Human Verification Required

#### 1. UX bug TV overflow firestick-wait.html

**Test:** Brancher Fire Stick sur Pi NLF, observer la page d'attente sur TV 1080p
**Expected:** MAC affichée intégralement à 128px sans overflow / coupure horizontale
**Why human:** Bug visuel reporté pendant validation Pi NLF Test 1, fix en cours dans worktree `claude/ecstatic-jones-8d6747` (PR séparée hors scope Phase 6).

### Gaps Summary

**Gap unique sur l'industrialisation du déploiement (success criterion #5).**

Les 4 plans (01-04) ont livré et câblé toute la chaîne fonctionnelle (resolveMacByIp → /api/captive/whoami → bootstrap Angular → page d'attente → DNS hijack → nginx config). La validation terrain Pi NLF + Fire Stick AFTSS le 2026-05-07 a confirmé 4/4 tests PASS (CAPTIVE-01..04 + ADR-079 invariant respecté).

**Cependant**, la validation a aussi révélé que la nouvelle config nginx Phase 6 (`raspberry/config/nginx/neopro-base.conf`) n'est déployée par AUCUN script automatisé :

- `install.sh::configure_nginx` (lignes 665-794) écrit un heredoc inline qui ne contient PAS les 3 location blocks Phase 6.
- `raspberry/scripts/build-raspberry.sh` copie bien `firestick-wait.html` (lignes 382-385) mais pas la config nginx.
- Aucun script ne fait `cp raspberry/config/nginx/neopro-base.conf /etc/nginx/sites-available/neopro`.

Conséquence : un Pi neuf installé via `install.sh` n'aura PAS les blocks Phase 6 actifs même après pull de la branche. Pour la flotte (NLF, futurs clubs), un opérateur devra `scp` + `ln -sf` + `nginx restart` manuellement — anti-pattern bénévole-grade et exactement le pattern que le success criterion #5 visait à éviter.

**Action suggérée :** rebasculer `install.sh::configure_nginx` sur `cp raspberry/config/nginx/neopro-base.conf /etc/nginx/sites-available/neopro` (single source of truth), ajouter une étape équivalente dans `build-raspberry.sh` pour les OTA, puis ajouter un smoke test garde-fou (vérifier que `install.sh` ne réintroduit pas un heredoc inline divergent OU que les 3 markers Phase 6 sont présents).

---

_Verified: 2026-05-06_
_Verifier: Claude (gsd-verifier)_
