---
phase: 11
slug: reassign-ux-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-05-07
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| **Framework**          | Karma + Jasmine (Angular 20)                                               |
| **Config file**        | `central-dashboard/karma.conf.js` (existant Phase 8)                       |
| **Quick run command**  | `npm run test:central -- --include='**/displays-editor.component.spec.ts'` |
| **Full suite command** | `npm run test:central`                                                     |
| **Estimated runtime**  | ~3-5 s (quick) / ~60 s (full, 520+ tests)                                  |

---

## Sampling Rate

- **After every task commit:** `npm run test:central -- --include='**/displays-editor.component.spec.ts'`
- **After every plan wave:** `npm run test:central` (full Karma suite)
- **Before `/gsd:verify-work`:** Full suite + `npm run test:smoke:smart` must be green
- **Max feedback latency:** 5 s (quick) / 60 s (full)

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type    | Automated Command                                                                   | File Exists           | Status     |
| -------- | ---- | ---- | ----------- | ------------ | ----------------------------------------------------------------------------------- | --------------------- | ---------- |
| 11-01-01 | 01   | 1    | ASSIGN-01   | unit (Karma) | `npm run test:central -- --include='**/displays-editor.component.spec.ts'` (test H) | ✅ étend Phase 8 spec | ⬜ pending |
| 11-01-02 | 01   | 1    | ASSIGN-01   | unit         | (test I — filtre MAC courante)                                                      | ✅ étend              | ⬜ pending |
| 11-01-03 | 01   | 1    | ASSIGN-01   | unit         | (test J — sous-texte `actuellement sur [name]`)                                     | ✅ étend              | ⬜ pending |
| 11-01-04 | 01   | 1    | ASSIGN-02   | unit         | (test K — atomicité 2-displays, 1 seul emit)                                        | ✅ étend              | ⬜ pending |
| 11-01-05 | 01   | 1    | ASSIGN-03   | unit         | (assertion payload K — source `receiver: null` + target set dans la même array)     | ✅ étend              | ⬜ pending |
| 11-01-06 | 01   | 1    | Zone C      | unit         | (test L — `isReceiverStale` + classe `--stale` + tooltip)                           | ✅ étend              | ⬜ pending |
| 11-01-07 | 01   | 1    | Zone C      | unit         | (test M — connectedReceivers vide → bouton actif + placeholder)                     | ✅ étend              | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

_Task IDs sont indicatifs ; les plans réels attribuent leurs propres IDs._

---

## Wave 0 Requirements

- [x] `central-dashboard/.../displays-editor.component.spec.ts` — spec Phase 8 existant (7 tests A-G), étendre avec tests H-M
- [x] Aucun framework à installer — Karma + Jasmine déjà configurés
- [x] Aucun nouveau mock requis — `mockReceivers` Phase 8 suffisant (étendre avec 3ème receiver pour scénarios filtre)

_Wave 0 covers all phase requirements via existing infrastructure._

---

## Manual-Only Verifications

| Behavior                                                                                   | Requirement | Why Manual                                                                                        | Test Instructions                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ancien Fire Stick désassigné bascule en page d'attente captive sur TV physique sans reboot | ASSIGN-03   | Wiring cloud→Pi→captive route déjà testé Phase 7 ; le test E2E nécessiterait Pi RACC + Fire Stick | 1) Sur Pi RACC (`ssh pi@neopro.local`), vérifier 2 Fire Sticks connectés. 2) Dashboard → Sites → RACC → Écrans : assigner FS-A à Display 1, FS-B à Display 2. 3) Réassigner FS-A → Display 2. 4) Vérifier sur TV physique de Display 2 : ancienne FS-B affiche page d'attente |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 7/7 tâches couvertes Karma
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — toutes en quick run
- [x] Wave 0 covers all MISSING references — aucun gap, infrastructure Phase 8 réutilisée
- [x] No watch-mode flags — Karma `--watch=false` par défaut dans `npm run test:central`
- [x] Feedback latency < 5 s (quick) — vérifié sur Phase 8 spec (~3 s pour 7 tests)
- [ ] `nyquist_compliant: true` set in frontmatter (sera basculé après création des plans + verify Plan-Checker)

**Approval:** pending (sera signé après `/gsd:plan-phase` verify loop OK)
