---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Multi-écrans Fire Stick
status: planning
stopped_at: Defining requirements
last_updated: '2026-05-06T10:00:00.000Z'
last_activity: 2026-05-06 — Milestone v4.0 started (Fire Stick POC validated 2026-05-05, vision approved)
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Milestone v4.0 — Multi-écrans Fire Stick (MVP terrain bénévole-grade). Defining requirements.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-06 — Milestone v4.0 started, research skipped (POC + pattern PROP-002 known)

## Accumulated Context

### Decisions (carried over from v3.0)

Decisions are logged in PROJECT.md Key Decisions table.

### Decisions (v4.0)

- v4.0 = MVP terrain bénévole-grade (1 Pi + N Fire Sticks ~30€ par TV) — pivot infra multi-écrans
- v4.1 (futur) = polish (TWA APK fullscreen, SaaS Fire Stick, MAC allowlist, captive auto-launch, Réassigner UX, alertes)
- Research skippé — POC technique validé 2026-05-05 sur Pi RACC, vision détaillée dans `.planning/firestick-poc/VISION.md`
- Pattern à reproduire : `hdmi.service.js` (EDID/CEC) → `receivers.service.js` (dnsmasq.leases + ARP)
- Source de vérité = DB cloud ; le Pi cache localement pour résilience offline
- Modèle de données = extension `DisplayConfig` JSONB (PROP-002 réutilisé), pas de nouvelle table

### Pending Todos

None yet.

### Blockers/Concerns

- Configs POC `firestick-captive` (`/etc/dnsmasq.d/` + `/etc/nginx/sites-available/`) sont déjà déployées sur Pi RACC `neopro.local` — vérifier qu'elles ne fuitent pas en prod NLF avant le rollout généralisé
- Edge case PSK rotation : MAC inchangée mais bénévole doit re-saisir PSK sur chaque Fire Stick — préconisation PSK custom stable per-club (cf. mémoire `feedback_psk_format.md`)

## Session Continuity

Last session: 2026-05-06T10:00:00.000Z
Stopped at: Milestone v4.0 — defining requirements
Resume file: .planning/firestick-poc/VISION.md (vision source)
