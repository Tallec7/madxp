---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: — Multi-écrans Fire Stick (MVP terrain bénévole-grade)
status: Phase 6 CAPTIVE — Plan 03 configs + wait page + install shipped (dnsmasq DNS hijack 2 Fire OS domains, 3 nginx location blocks, vanilla firestick-wait.html dual mécanisme, 7 smoke tests Phase 6)
stopped_at: Completed 06-captive-03-PLAN.md
last_updated: "2026-05-06T14:00:14Z"
last_activity: "2026-05-06 — Plan 06-captive-03 complété (commits 4db7348 feat + f5f796f test ; ADR-079 invariant respecté, aucun DNAT 443)"
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 9
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Milestone v4.0 — Multi-écrans Fire Stick (MVP terrain bénévole-grade). Roadmap prête, planification phase 4 à démarrer.

## Current Position

Phase: 6 — CAPTIVE — Fire Stick → page Neopro (en cours)
Plan: 01 complete (resolveMacByIp), 02 complete (captive route + server wiring), 03 complete (configs + wait page + build + smoke), 04 (Angular bootstrap router)
Status: Phase 6 CAPTIVE — Plan 03 configs + wait page + install shipped (DNS hijack 2 Fire OS domains, 3 nginx location blocks, vanilla firestick-wait.html dual mécanisme Socket.IO + polling 5s)
Last activity: 2026-05-06 — Plan 06-captive-03 complété (commits 4db7348 feat + f5f796f test ; ADR-079 invariant respecté)
Next: Plan 06-captive-04 — Angular bootstrap router (consume /api/captive/whoami)

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
- 06-captive-01: reverse-lookup via Map<ip, mac> dédiée populée par _scanLeases/_scanArp existants — O(1), zéro nouvel appel système (vs reverse-iterate _state ou shell exec `ip neigh`)
- 06-captive-01: normalisation IPv4-mapped IPv6 (`::ffff:` → IPv4) au lookup, pas à l'insertion — single edge case côté Express boundary, évite de toucher chaque parse de lease dnsmasq
- 06-captive-01: ARP_LINE_REGEX étendue pour capturer IP (group 1) + MAC (group 2) en une passe — backward-compatible avec _scanArp existant
- 06-captive-02: createCaptiveRouter factory pattern (cohérent health/hotspot) — guards d'invariants au boot fail-fast
- 06-captive-02: fallback résilient erreur fs (200 + displayIndex=null vs 5xx) — la MAC est connue, le bénévole peut assigner depuis dashboard
- 06-captive-02: case-insensitive MAC compare au lookup boundary (toLowerCase côté requête + config) — defensive contre édition humaine de configuration.json
- 06-captive-02: supertest@^7.2.2 ajouté en devDep raspberry/server (premier usage) — fondation pour futures routes testées HTTP
- 06-captive-03: vanilla HTML standalone pour wait page (pas Angular) — boot avant Angular DL, servi par nginx static
- 06-captive-03: dual mécanisme Socket.IO push (<200ms) + polling 5s safety net — Socket.IO peut échouer derrière proxy captif, polling = filet
- 06-captive-03: DNS hijack restreint à 2 domaines Fire OS (pas de wildcard, pas clients3.google.com) — wildcards casseraient Android/iOS (rule .claude/rules/raspberry.md)
- 06-captive-03: X-Real-IP forward obligatoire dans nginx proxy /api/captive/whoami — sans ça Express voit 127.0.0.1, MAC lookup échoue
- 06-captive-03: window.location.replace (pas href=) pour éviter pollution historique sur télécommande Fire Stick
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

Last session: 2026-05-06T14:01:15.154Z
Stopped at: Completed 06-captive-03-PLAN.md
Resume file: None
