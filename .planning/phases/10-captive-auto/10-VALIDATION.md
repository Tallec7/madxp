---
phase: 10
slug: captive-auto
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                            |
| ---------------------- | ------------------------------------------------ |
| **Framework**          | Jest (smoke tests) + validation manuelle Pi RACC |
| **Config file**        | `central-server/jest.config.js`                  |
| **Quick run command**  | `npm run test:smoke:smart`                       |
| **Full suite command** | `npm run test:smoke`                             |
| **Estimated runtime**  | ~10 seconds (smart) / ~30 seconds (full)         |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:smoke:smart`
- **After every plan wave:** Run `npm run test:smoke`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type      | Automated Command                              | File Exists | Status     |
| -------- | ---- | ---- | ----------- | -------------- | ---------------------------------------------- | ----------- | ---------- |
| 10-01-01 | 01   | 1    | CAPTIVE-05  | smoke + manuel | `npm run test:smoke:smart`                     | ✅          | ⬜ pending |
| 10-01-02 | 01   | 1    | CAPTIVE-06  | manuel Pi RACC | `ssh pi@neopro.local journalctl -u sync-agent` | N/A manuel  | ⬜ pending |
| 10-01-03 | 01   | 2    | CAPTIVE-07  | smoke          | `npm run test:smoke:smart`                     | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

- Smoke tests existants (`smoke-kiosk-pi`, `smoke-network-wifi`) fournissent la base
- Nginx config déjà testée en Phase 6 (smoke-receivers-discovery + smoke-kiosk-pi)
- Pas de nouveau framework requis

---

## Manual-Only Verifications

| Behavior                                                   | Requirement | Why Manual                                              | Test Instructions                                                                                                              |
| ---------------------------------------------------------- | ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Silk s'ouvre automatiquement après connexion hotspot       | CAPTIVE-05  | Comportement hardware Fire TV Silk, non simulable en CI | Connecter Fire Stick au hotspot Pi RACC, observer si Silk s'ouvre dans les 10s sans télécommande                               |
| Auto-launch au boot Fire Stick                             | CAPTIVE-06  | Boot Fire TV OS non simulable en CI                     | Déconnecter + reconnecter Fire Stick au hotspot, reboot Fire Stick, observer dans les 30s                                      |
| Page d'attente accessible manuellement si auto-launch fail | CAPTIVE-07  | Fallback UI Fire TV Silk                                | Si auto-launch ne se déclenche pas : ouvrir manuellement Silk, naviguer vers `http://firetvcaptiveportal.com` → page d'attente |

---

## Validation Sign-Off

- [ ] Smoke tests existants passent après modifications nginx
- [ ] Smoke guard Phase 10 créé (vérifie wifistub 302 + wifiredirect présent)
- [ ] Validation manuelle Pi RACC : wifistub retourne 302
- [ ] Validation manuelle Pi RACC : wifiredirect.html sert la page de redirect
- [ ] Régression CAPTIVE-07 : page d'attente accessible manuellement si Silk pas ouvert
- [ ] `nyquist_compliant: true` set in frontmatter après sign-off

**Approval:** pending
