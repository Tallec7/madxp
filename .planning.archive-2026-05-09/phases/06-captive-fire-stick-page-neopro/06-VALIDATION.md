---
phase: 6
slug: captive-fire-stick-page-neopro
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Framework**          | jest 29.x (raspberry/server) + Karma/Jasmine (raspberry/src Angular) + smoke tests jest (central-server)      |
| **Config file**        | `raspberry/server/jest.config.js`, `karma.conf.js` (root), `central-server/jest.config.js`                    |
| **Quick run command**  | `cd raspberry/server && npx jest --testPathPattern='captive\|receivers.service' --no-coverage --forceExit`    |
| **Full suite command** | `cd raspberry/server && npm test && cd ../.. && npm run test:smoke:smart`                                     |
| **Estimated runtime**  | ~30s quick / ~3-5 min full                                                                                    |

---

## Sampling Rate

- **After every task commit:** Run quick command (scoped to fichier modifié)
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green + smoke tests passent
- **Max feedback latency:** 30 seconds (quick) / 5 min (full)

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type   | Automated Command                                                                                  | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ----------- | -------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 6-01-01  | 01   | 1    | CAPTIVE-02  | unit        | `cd raspberry/server && npx jest --testPathPattern='receivers.service' --forceExit`                | ❌ W0       | ⬜ pending |
| 6-02-01  | 02   | 2    | CAPTIVE-02  | unit        | `cd raspberry/server && npx jest --testPathPattern='captive' --forceExit`                          | ❌ W0       | ⬜ pending |
| 6-02-02  | 02   | 2    | CAPTIVE-04  | integration | `cd raspberry/server && npx jest --testPathPattern='captive' --forceExit`                          | ❌ W0       | ⬜ pending |
| 6-03-01  | 03   | 2    | CAPTIVE-01  | smoke/grep  | `grep -E "address=/#/\|firetvcaptiveportal" raspberry/config/dnsmasq/captive-portal.conf`           | ❌ W0       | ⬜ pending |
| 6-03-02  | 03   | 2    | CAPTIVE-01  | smoke/grep  | `nginx -t -c raspberry/config/nginx/captive.conf`                                                  | ❌ W0       | ⬜ pending |
| 6-03-03  | 03   | 2    | CAPTIVE-03  | grep        | `grep "data-mac" raspberry/server/public/firestick-wait.html`                                      | ❌ W0       | ⬜ pending |
| 6-04-01  | 04   | 3    | CAPTIVE-04  | unit (Karma)| `npm run test:raspberry -- --include='**/captive-bootstrap.component.spec.ts'`                     | ❌ W0       | ⬜ pending |
| 6-XX-deploy | 03 | 2    | CAPTIVE-01  | grep        | `grep -E "ln -sf.*captive\|systemctl reload nginx" raspberry/scripts/install.sh`                   | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `raspberry/server/__tests__/captive.routes.test.js` — stubs CAPTIVE-02/04 (whoami endpoint + redirect logic)
- [ ] `raspberry/server/__tests__/receivers.service.resolveByIp.test.js` — extension test pour `resolveMacByIp()` (Plan 01)
- [ ] `raspberry/server/public/firestick-wait.html` — page d'attente (Plan 03 livrable, mais structuré comme test grep ≥ 6 marqueurs)
- [ ] `raspberry/config/nginx/captive.conf` — config nginx (Plan 03)
- [ ] `raspberry/config/dnsmasq/captive-portal.conf` — config DNS hijack (Plan 03)
- [ ] `raspberry/src/app/components/captive-bootstrap/captive-bootstrap.component.spec.ts` — Karma stub Angular bootstrap router (Plan 04)
- [ ] Aucune installation framework requise (jest + Karma déjà actifs)

---

## Manual-Only Verifications

| Behavior                                         | Requirement | Why Manual                                            | Test Instructions                                                                                          |
| ------------------------------------------------ | ----------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fire Stick neuf → atterrit sur page Pi sans manip | CAPTIVE-01  | Nécessite Fire Stick physique + hotspot Pi RACC         | Brancher Fire Stick neuf, connecter SSID club, observer popup captive Fire OS, valider redirect vers `:80` |
| Page d'attente affiche MAC en grand              | CAPTIVE-03  | Validation lisibilité dictée téléphonique               | Ouvrir page sur Fire Stick non assigné, vérifier taille typo MAC ≥ 48px et lisibilité depuis 3m            |
| Bascule auto vers Neopro après assignation admin | CAPTIVE-04  | Latence Socket.IO push réel + render Angular Fire OS    | Assigner MAC depuis dashboard cloud → Pi, observer bascule sur Fire Stick < 5s sans toucher télécommande   |
| install.sh sur Pi vierge                         | CAPTIVE-01  | Demande SD card + boot complet                          | `./install.sh` sur Pi RACC neuf, vérifier nginx + dnsmasq actifs, captive fonctionne au premier boot       |
| ADR-079 invariant : 443 NON DNAT                 | CAPTIVE-01  | Demande inspection iptables sur Pi réel                 | `sudo iptables -t nat -L PREROUTING -n` → confirmer port 80 redirigé, port 443 ABSENT                      |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s quick / 5min full
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
