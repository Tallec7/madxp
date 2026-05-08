---
phase: 13
slug: twa-build-apk-twa-fullscreen
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| **Framework**          | Jest (existant, smoke pattern Neopro)                                                                   |
| **Config file**        | `central-server/jest.config.js`                                                                         |
| **Quick run command**  | `cd central-server && npx jest --testPathPattern='smoke/smoke-firestick-apk' --no-coverage --forceExit` |
| **Full suite command** | `npm run test:smoke`                                                                                    |
| **Estimated runtime**  | ~3 seconds (quick) / ~28 seconds (full smoke)                                                           |

---

## Sampling Rate

- **After every task commit:** Run quick command (~3s)
- **After every plan wave:** Run `npm run test:smoke:smart` (suites pertinentes au git diff)
- **Before `/gsd:verify-work`:** `npm run test:smoke` (all 13+1 suites green) + UAT manuel sur Fire Stick AFTSS RACC
- **Max feedback latency:** 3 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type              | Automated Command                                                                             | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ---------------------- | --------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 13-01-XX | 01   | 1    | TWA-01      | file-based smoke       | `npx jest --testPathPattern='smoke-firestick-apk' -t 'TWA-01'`                                | ❌ W0       | ⬜ pending |
| 13-02-XX | 02   | 2    | TWA-01      | file-based smoke       | `npx jest --testPathPattern='smoke-firestick-apk' -t 'cleartext'`                             | ❌ W0       | ⬜ pending |
| 13-02-XX | 02   | 2    | TWA-02      | file-based smoke       | `npx jest --testPathPattern='smoke-firestick-apk' -t 'TWA-02'`                                | ❌ W0       | ⬜ pending |
| 13-03-XX | 03   | 2    | TWA-04      | file-based smoke       | `npx jest --testPathPattern='smoke-firestick-apk' -t 'TWA-04'`                                | ❌ W0       | ⬜ pending |
| 13-03-XX | 03   | 2    | TWA-04      | doc-based smoke        | `grep -q 'keytool -genkey' firestick-apk/README.md`                                           | ❌ W0       | ⬜ pending |
| 13-04-XX | 04   | 3    | TWA-04      | post-build smoke (CLI) | `apksigner verify --verbose firestick-apk/dist/*.apk \| grep -E 'v2.*true.*v3.*true'`         | ❌ W0       | ⬜ pending |
| 13-04-XX | 04   | 3    | TWA-03      | manual UAT             | Sideload v0.1.0 sur AFTSS RACC, connect hotspot, observer page Neopro fullscreen sans URL bar | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `central-server/src/__tests__/smoke/smoke-firestick-apk.test.ts` — fige TWA-01 (host + cleartext), TWA-02 (display fullscreen-sticky), TWA-04 (signingKey alias)
- [ ] `firestick-apk/twa-manifest.json` — committé pour que le smoke ait un fichier à parser
- [ ] `firestick-apk/manifest/network_security_config.xml` — committé pour cleartext smoke
- [ ] `firestick-apk/scripts/build.sh` — script de build orchestrateur
- [ ] `firestick-apk/scripts/verify-apk.sh` — wrapper apksigner + aapt pour smoke post-build
- [ ] `firestick-apk/README.md` — procédure keystore + section UAT manuel (acceptance Fire Stick visuel)
- [ ] Framework install : N/A (Jest déjà présent dans `central-server/`)

---

## Manual-Only Verifications

| Behavior                                                               | Requirement | Why Manual                                                                                  | Test Instructions                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aucune URL bar visible sur TV à l'ouverture APK                        | TWA-03      | Comportement visuel du Custom Tab fallback (pas de DAL sur 192.168.4.1) — non-observable JS | 1. Sideload `neopro-firestick-v0.1.0.apk` sur Fire Stick AFTSS RACC. 2. Connecter au hotspot Pi `neopro.local`. 3. Lancer l'APK depuis le launcher Fire OS. 4. Confirmer : pas d'URL bar, pas de status bar, page Neopro chargée. |
| Aucune barre système (clock, network) visible après bootstrap          | TWA-02      | `fullscreen-sticky` est un override runtime — vérifiable seulement à l'écran                | Idem ci-dessus, observer 5 secondes après ouverture                                                                                                                                                                               |
| Pas de flash visuel d'URL intermédiaire (~500ms wifistub→wifiredirect) | TWA-03      | Latence de transition Chrome Custom Tab — observable à l'œil seul                           | Idem ; filmer si possible pour preuve                                                                                                                                                                                             |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (smoke + manifest + scripts + README)
- [ ] No watch-mode flags
- [ ] Feedback latency < 3s (quick smoke)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
