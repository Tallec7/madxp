---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: — Multi-écrans Fire Stick (MVP terrain bénévole-grade)
status: completed
stopped_at: Completed 04-data-02-PLAN.md (1 task TDD, 2 commits b54931f + c9fe025)
last_updated: "2026-05-06T10:01:16.160Z"
last_activity: "2026-05-06 — Plan 04-data-01 complété (3 commits: afe1823, 908d7ba, 6005000)"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Milestone v4.0 — Multi-écrans Fire Stick (MVP terrain bénévole-grade). Roadmap prête, planification phase 4 à démarrer.

## Current Position

Phase: 4 — DATA — Modèle DisplayConfig étendu (✅ complete)
Plan: 01 complete (receiver-schema), 02 complete (receiver-repository)
Status: Phase 4 DATA shipped — DisplayConfig.receiver type + Joi + migration + repository methods (24/24 tests green sur site.repository.test.ts)
Last activity: 2026-05-06 — Plan 04-data-02 complété (TDD : b54931f RED + c9fe025 GREEN)
Next: Phase 5 — DETECT (Pi détecte les receivers via dnsmasq.leases + ARP)

## Accumulated Context

### Decisions (carried over from v3.0)

Decisions are logged in PROJECT.md Key Decisions table.

### Decisions (v4.0)

- 04-data-01: receiver field optional + nullable in DisplayConfig (rétro-compat with all existing rows, no breaking change)
- 04-data-01: HDMI #0 default kind=pi_native (legacy invariant preservation)
- 04-data-02: setReceiver throws on unknown displayIndex (no phantom display creation, création reste responsabilité d'updateDisplays)
- 04-data-02: méthodes JSONB receiver composent getDisplays + updateDisplays existants — zéro nouveau query() direct, repository pattern strict (CLAUDE.md)
- v4.0 = MVP terrain bénévole-grade (1 Pi + N Fire Sticks ~30€ par TV) — pivot infra multi-écrans
- v4.1 (futur) = polish (TWA APK fullscreen, SaaS Fire Stick, MAC allowlist, captive auto-launch, Réassigner UX, alertes)
- Research skippé — POC technique validé 2026-05-05 sur Pi RACC, vision détaillée dans `.planning/firestick-poc/VISION.md`
- Pattern à reproduire : `hdmi.service.js` (EDID/CEC) → `receivers.service.js` (dnsmasq.leases + ARP)
- Source de vérité = DB cloud ; le Pi cache localement pour résilience offline
- Modèle de données = extension `DisplayConfig` JSONB (PROP-002 réutilisé), pas de nouvelle table
- Roadmap 6 phases : DATA → DETECT → CAPTIVE → CLOUD → DASHBOARD → OBSERVE (dépendances data-first, cloud après Pi-side, observe en dernier)

### Pending Todos

None yet.

### Blockers/Concerns

- Configs POC `firestick-captive` (`/etc/dnsmasq.d/` + `/etc/nginx/sites-available/`) sont déjà déployées sur Pi RACC `neopro.local` — vérifier qu'elles ne fuitent pas en prod NLF avant le rollout généralisé
- Edge case PSK rotation : MAC inchangée mais bénévole doit re-saisir PSK sur chaque Fire Stick — préconisation PSK custom stable per-club (cf. mémoire `feedback_psk_format.md`)

## Session Continuity

Last session: 2026-05-06T10:01:16.157Z
Stopped at: Completed 04-data-02-PLAN.md (1 task TDD, 2 commits b54931f + c9fe025)
Resume file: None
