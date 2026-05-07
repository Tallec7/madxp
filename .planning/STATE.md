---
gsd_state_version: 1.0
milestone: v4.1
milestone_name: — Fire Stick polish
status: completed
stopped_at: Phase 11 context gathered
last_updated: '2026-05-07T19:06:38.167Z'
last_activity: 2026-05-07 — 10-01 COMPLETE — nginx wifistub 302 + firestick-captive.conf patched + Pi RACC validated
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 21
  completed_plans: 21
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-07)

**Core value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.
**Current focus:** Milestone v4.1 — Fire Stick polish. Roadmap prête (phases 10-13), planification phase 10 à démarrer.

## Current Position

Phase: Phase 10 — CAPTIVE-AUTO (plan 01 complete, phase complete)
Plan: 10-01-nginx-wifistub-302 (COMPLETE — all 3 tasks done, Pi RACC validated)
Status: Phase 10 complete — wifistub 302 confirmed on Pi RACC; ready for Phase 11 (REASSIGN)
Last activity: 2026-05-07 — 10-01 COMPLETE — nginx wifistub 302 + firestick-captive.conf patched + Pi RACC validated
Next: Phase 11 (REASSIGN) — UX 1-clic réassigner Fire Stick depuis dashboard

## Accumulated Context

### Decisions (carried over from v3.0)

Decisions are logged in PROJECT.md Key Decisions table.

### Decisions (v4.0)

- 05-detect-01: console.info/warn (helpers.js raspberry/server n'expose pas Winston ; cohérence avec hdmi.service.js)
- 05-detect-01: pas de cache TTL — l'état Map<mac, {kind, lastSeenAt}> EST la source de vérité, refresh à chaque tick (10s leases / 30s ARP)
- 05-detect-01: emit `connected-receivers-changed` uniquement sur diff de set membership (add/remove MAC) — `lastSeenAt` refresh sans déclencher d'emit
- 05-detect-02: cache atomic write tmp + rename via fs natif (raspberry/server n'a pas fs-extra) — best-effort, log warn si fail, jamais throw
- 05-detect-02: loadCache appelé dans start(io) AVANT le premier \_scanLeases — restore offline-first, pas d'appel cloud requis
- 05-detect-02: \_scanLeases preserve les MACs assignées (displayIndex !== null) même quand absentes du leases — résilience Fire Stick éteint / reboot
- 05-detect-02: tolérance complète ENOENT/JSON corrupt/version mismatch → warn + state vide, jamais crash (forward-compat)
- 05-detect-03: io.emit wrapper dans server.js (vs event listener) — Socket.IO server n'expose pas `.on('emit')`, le wrap est le pattern standard pour intercepter des emits ciblés sans coupler ReceiversService au state.service
- 05-detect-03: setReceivers résilient (warn + ignore) plutôt que throw — un payload corrompu ne doit pas crasher le state.service partagé par tout le serveur Pi
- 05-detect-03: sync-agent whitelist seul cette phase (pas de handler agent.js) — pré-requis Phase 7 pattern ADR-074
- 07-cloud-03: command-dispatch.js à src/ (pas services/) — testabilité require('../command-dispatch') depuis **tests**/ + séparation du registry existant
- 07-cloud-03: résolution polymorphe receiversService — typeof === 'function' + prototype.assignDisplay → classe (prod) ; sinon objet mock Jest
- 07-cloud-03: pas de Socket.IO local ni HTTP cloud — handler purement cache local (.receivers-cache.json) via assignDisplay Phase 5
- 06-captive-01: reverse-lookup via Map<ip, mac> dédiée populée par \_scanLeases/\_scanArp existants — O(1), zéro nouvel appel système (vs reverse-iterate \_state ou shell exec `ip neigh`)
- 06-captive-01: normalisation IPv4-mapped IPv6 (`::ffff:` → IPv4) au lookup, pas à l'insertion — single edge case côté Express boundary, évite de toucher chaque parse de lease dnsmasq
- 06-captive-01: ARP_LINE_REGEX étendue pour capturer IP (group 1) + MAC (group 2) en une passe — backward-compatible avec \_scanArp existant
- 06-captive-02: createCaptiveRouter factory pattern (cohérent health/hotspot) — guards d'invariants au boot fail-fast
- 06-captive-02: fallback résilient erreur fs (200 + displayIndex=null vs 5xx) — la MAC est connue, le bénévole peut assigner depuis dashboard
- 06-captive-02: case-insensitive MAC compare au lookup boundary (toLowerCase côté requête + config) — defensive contre édition humaine de configuration.json
- 06-captive-02: supertest@^7.2.2 ajouté en devDep raspberry/server (premier usage) — fondation pour futures routes testées HTTP
- 06-captive-03: vanilla HTML standalone pour wait page (pas Angular) — boot avant Angular DL, servi par nginx static
- 06-captive-03: dual mécanisme Socket.IO push (<200ms) + polling 5s safety net — Socket.IO peut échouer derrière proxy captif, polling = filet
- 06-captive-03: DNS hijack restreint à 2 domaines Fire OS (pas de wildcard, pas clients3.google.com) — wildcards casseraient Android/iOS (rule .claude/rules/raspberry.md)
- 06-captive-03: X-Real-IP forward obligatoire dans nginx proxy /api/captive/whoami — sans ça Express voit 127.0.0.1, MAC lookup échoue
- 06-captive-03: window.location.replace (pas href=) pour éviter pollution historique sur télécommande Fire Stick
- 06-captive-05: cp littéral inline (pas variable NGINX_SRC) pour grep/smoke detection — leçon checker iteration 1
- 06-captive-05: backup nginx → sites-available/neopro.pre-phase6.bak (JAMAIS sites-enabled/, nginx charge tout = duplicate default_server)
- 06-captive-05: systemctl restart nginx (pas reload) — empirique Pi NLF, stat caching du symlink fait échouer reload
- 06-captive-06: OTA propagation rescopée à tarball ship + re-run install.sh idempotent (pas d'auto-reload sync-agent — sudoers nginx hors scope)
- 06-captive-06: smoke guard install.sh avec OR-fallback (cp neopro-base.conf OU 3 markers captive) — bloque la régression sans figer la stratégie
- 04-data-01: receiver field optional + nullable in DisplayConfig (rétro-compat with all existing rows, no breaking change)
- 04-data-01: HDMI #0 default kind=pi_native (legacy invariant preservation)
- 04-data-02: setReceiver throws on unknown displayIndex (no phantom display creation, création reste responsabilité d'updateDisplays)
- 04-data-02: méthodes JSONB receiver composent getDisplays + updateDisplays existants — zéro nouveau query() direct, repository pattern strict (CLAUDE.md)
- v4.0 = MVP terrain bénévole-grade (1 Pi + N Fire Sticks ~30€ par TV) — pivot infra multi-écrans
- v4.1 = polish (captive auto-launch, réassigner UX 1 clic, MAC allowlist hostapd, alertes déconnexion)
- Research skippé — POC technique validé 2026-05-05 sur Pi RACC, vision détaillée dans `.planning/firestick-poc/VISION.md`
- Pattern à reproduire : `hdmi.service.js` (EDID/CEC) → `receivers.service.js` (dnsmasq.leases + ARP)
- Source de vérité = DB cloud ; le Pi cache localement pour résilience offline
- Modèle de données = extension `DisplayConfig` JSONB (PROP-002 réutilisé), pas de nouvelle table
- Roadmap 6 phases v4.0 : DATA → DETECT → CAPTIVE → CLOUD → DASHBOARD → OBSERVE (dépendances data-first, cloud après Pi-side, observe en dernier)

### Decisions (v4.1)

- Phase 10 avant Phase 11 : l'auto-launch améliore le captive portal existant (Phase 6), sans dépendance sur Réassigner
- Phase 11 avant Phase 12 : Réassigner UX est une modification pure dashboard (displays-editor), indépendant de la sécurité réseau
- Phase 12 avant Phase 13 : l'allowlist introduit `neopro_hotspot_rejected_total` ; la Phase 13 (alertes) réutilise alertRepository.create() ADR-111 déjà disponible
- ALERT-04 (`neopro_receiver_offline_total`) ajouté au smoke-receivers-discovery existant (extension, pas nouvelle suite)
- Mode allowlist = opt-in par site (ALLOWLIST-04) — pas de breaking change pour les sites v4.0 existants
- 10-01: wifistub 302 deux-hop (wifistub→wifiredirect→root) préserve $host pour Fire OS CaptivePortalLauncher — redirect direct casserait le hostname dans Location
- 10-01: wifiredirect cible http://192.168.4.1/ (racine) pas /captive/wait — Angular router branch via /api/captive/whoami
- 10-01: extractNginxBlock() helper dans smoke tests — évite les faux positifs du bloc @captive_fallback qui contient encore "Success"
- 10-01: firestick-captive.conf POC (Pi RACC sites-enabled) interceptait spectrum.s3.amazonaws.com avant neopro-base.conf et retournait 200 — patché pour 302 chain; la flotte OTA utilise neopro-base.conf via install.sh (pas affectée)

### Pending Todos

None yet.

### Blockers/Concerns

- Configs POC `firestick-captive` (`/etc/dnsmasq.d/` + `/etc/nginx/sites-available/`) sont déjà déployées sur Pi RACC `neopro.local` — vérifier qu'elles ne fuitent pas en prod NLF avant le rollout généralisé
- Edge case PSK rotation : MAC inchangée mais bénévole doit re-saisir PSK sur chaque Fire Stick — préconisation PSK custom stable per-club (cf. mémoire `feedback_psk_format.md`)
- Phase 12 (ALLOWLIST) : `macaddr_acl=1` + `accept_mac_file` dans hostapd.conf requiert redémarrage hostapd — à orchestrer via sync-agent commande dédiée (à ajouter à `DEFAULT_ALLOWED_COMMANDS`)

### Quick Tasks Completed

| #          | Description                                                | Date       | Commit   | Directory                                                                      |
| ---------- | ---------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------ |
| 260507-gxd | DELETE template end-to-end (cascade DB + FTP + UI confirm) | 2026-05-07 | 27774520 | [260507-gxd-...](./quick/260507-gxd-delete-template-end-to-end-endpoint-api-/) |

## Session Continuity

Last session: 2026-05-07T19:06:38.152Z
Stopped at: Phase 11 context gathered
Resume file: .planning/phases/11-reassign-ux-dashboard/11-CONTEXT.md
