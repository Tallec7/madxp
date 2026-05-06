---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: — Multi-écrans Fire Stick (MVP terrain bénévole-grade)
status: Phase 5 DETECT — Plan 01 ReceiversService shipped (10/10 Jest tests green ; passive dnsmasq.leases watch + arp -an fallback)
stopped_at: Completed 05-detect-02-PLAN.md
last_updated: "2026-05-06T10:31:33.245Z"
last_activity: "2026-05-06 — Plan 05-detect-01 complété (TDD : cf7fa13 RED + 1a4df9b GREEN, 10 tests verts)"
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Milestone v4.0 — Multi-écrans Fire Stick (MVP terrain bénévole-grade). Roadmap prête, planification phase 4 à démarrer.

## Current Position

Phase: 5 — DETECT — Pi détecte les receivers (en cours)
Plan: 01 complete (receivers-service), 02 next (cache résilience), 03 (state.service + sync-agent)
Status: Phase 5 DETECT — Plan 01 ReceiversService shipped (10/10 Jest tests green ; passive dnsmasq.leases watch + arp -an fallback)
Last activity: 2026-05-06 — Plan 05-detect-01 complété (TDD : cf7fa13 RED + 1a4df9b GREEN, 10 tests verts)
Next: Plan 05-detect-02 — cache résilience (persistence locale receivers cross-reboot)

## Accumulated Context

### Decisions (carried over from v3.0)

Decisions are logged in PROJECT.md Key Decisions table.

### Decisions (v4.0)

- 05-detect-01: console.info/warn (helpers.js raspberry/server n'expose pas Winston ; cohérence avec hdmi.service.js)
- 05-detect-01: pas de cache TTL — l'état Map<mac, {kind, lastSeenAt}> EST la source de vérité, refresh à chaque tick (10s leases / 30s ARP)
- 05-detect-01: emit `connected-receivers-changed` uniquement sur diff de set membership (add/remove MAC) — `lastSeenAt` refresh sans déclencher d'emit
- 05-detect-02: cache atomic write tmp + rename via fs natif (raspberry/server n'a pas fs-extra) — best-effort, log warn si fail, jamais throw
- 05-detect-02: loadCache appelé dans start(io) AVANT le premier _scanLeases — restore offline-first, pas d'appel cloud requis
- 05-detect-02: _scanLeases preserve les MACs assignées (displayIndex !== null) même quand absentes du leases — résilience Fire Stick éteint / reboot
- 05-detect-02: tolérance complète ENOENT/JSON corrupt/version mismatch → warn + state vide, jamais crash (forward-compat)
- 05-detect-03: io.emit wrapper dans server.js (vs event listener) — Socket.IO server n'expose pas `.on('emit')`, le wrap est le pattern standard pour intercepter des emits ciblés sans coupler ReceiversService au state.service
- 05-detect-03: setReceivers résilient (warn + ignore) plutôt que throw — un payload corrompu ne doit pas crasher le state.service partagé par tout le serveur Pi
- 05-detect-03: sync-agent whitelist seul cette phase (pas de handler agent.js) — pré-requis Phase 7 pattern ADR-074
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

Last session: 2026-05-06T10:28:25.825Z
Stopped at: Completed 05-detect-02-PLAN.md
Resume file: None
