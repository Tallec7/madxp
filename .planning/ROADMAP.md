# Roadmap: Neopro — Template Studio

## Milestones

- ✅ **v3.0 — Template Studio v3 : UX admin orientée tâche** — Phases 1-3 (shipped 2026-05-05) — [archive](milestones/v3.0-ROADMAP.md)
- ✅ **v4.0 — Multi-écrans Fire Stick (MVP terrain bénévole-grade)** — Phases 4-9 (shipped 2026-05-07)
- ✅ **v4.1 — Fire Stick polish** — Phases 10-12 (shipped 2026-05-08) — [archive](milestones/v4.1-ROADMAP.md)
- 📋 **v4.2 — Fire Stick APK TWA** — Phases 13-15 (planned)

## Phases

<details>
<summary>✅ v3.0 — Template Studio v3 (Phases 1-3) — SHIPPED 2026-05-05</summary>

- [x] Phase 1: Fondations (5/5 plans) — completed 2026-05-05
- [x] Phase 2: UX interactive (4/4 plans) — completed 2026-05-05
- [x] Phase 3: Gate de publication (5/5 plans) — completed 2026-05-05

</details>

<details>
<summary>✅ v4.0 — Multi-écrans Fire Stick (Phases 4-9) — SHIPPED 2026-05-07</summary>

- [x] **Phase 4: DATA — Modèle DisplayConfig étendu** — Étendre le JSONB `sites.displays` avec un objet `receiver` + accès repository ✅ 2026-05-06
- [x] **Phase 5: DETECT — Pi détecte les receivers** — `receivers.service.js` (pattern HDMI mirror) watch dnsmasq.leases + ARP, push socket, cache local (completed 2026-05-06)
- [x] **Phase 6: CAPTIVE — Fire Stick → page Neopro** — Industrialiser configs POC (`install.sh` / `prepare-image.sh`) + routage dynamique MAC→display (completed 2026-05-07)
- [x] **Phase 7: CLOUD — API + sync-agent** — Route `/api/sites/:id/connected-receivers` + whitelist event `receiver-detected` (completed 2026-05-07, 3/3 plans)
- [x] **Phase 8: DASHBOARD — UX admin assignation** — `displays-editor` étendu (colonne Récepteur + dropdown auto-rempli) (completed 2026-05-07)
- [x] **Phase 9: OBSERVE — Métriques + smoke** — Métrique Prometheus `neopro_receivers_total` + suite `smoke-receivers-discovery` (completed 2026-05-07)

</details>

<details>
<summary>✅ v4.1 — Fire Stick polish (Phases 10-12) — SHIPPED 2026-05-08</summary>

- [x] Phase 10: CAPTIVE-AUTO — Silk Browser auto-launch (1/1 plan) — completed 2026-05-07
- [x] Phase 11: REASSIGN — Réassigner UX dashboard (1/1 plan) — completed 2026-05-08
- [x] Phase 12: OBSERVE — Fire Stick inconnus + badge ambre (2/2 plans, pivoté de ALLOWLIST) — completed 2026-05-08

**Gaps intentionnellement abandonnés (décision produit 2026-05-08) :** ALLOWLIST-01/02/03/04, ALERT-01/02/03/04

</details>

## Phase Details

### v4.2 — Fire Stick APK TWA (Phases 13-15, planned)

- [ ] **Phase 13: TWA-BUILD — APK TWA fullscreen** — Build APK Android TWA fullscreen wrappant la page captive Pi, signée release-grade
- [ ] **Phase 14: DEPLOY — Sideload bénévole** — Procédure ADB sideload + script automatisé + APK servie depuis nginx Pi local
- [ ] **Phase 15: INTEGRATE — Auto-launch + observabilité** — APK auto-launch à la connexion hotspot avec fallback Silk + métrique Prometheus + smoke

---

### Phase 13: TWA-BUILD — APK TWA fullscreen

**Goal**: Une APK Android TWA fullscreen, signée avec une clé release stable, wrappant la page captive Pi sans afficher d'URL bar ni de chrome navigateur.
**Depends on**: Nothing (greenfield Android packaging — Phase 10 v4.1 fournit l'URL captive cible)
**Requirements**: TWA-01, TWA-02, TWA-03, TWA-04
**Success Criteria** (what must be TRUE):

1. L'APK installée sur un Fire Stick, lancée manuellement, charge la page captive Pi en plein écran sans aucune barre URL ni barre système visible.
2. L'APK suit le redirect 302 wifistub → wifiredirect → `/?display=N` sans flash d'URL intermédiaire à l'écran.
3. La même clé `neopro-firestick-release.keystore` peut signer un APK v0.2 qui s'installe en upgrade par-dessus v0.1 sans désinstaller la première (signature match).

**Plans**: 4 plans

- [ ] 13-01-scaffold-firestick-apk-PLAN.md — Scaffold firestick-apk/ + Wave 0 smoke + manifest + .gitignore + README skeleton (TWA-01, TWA-02, TWA-04)
- [ ] 13-02-cleartext-fullscreen-patch-PLAN.md — network_security_config.xml + idempotent patch-android-manifest.sh + README §Cleartext (TWA-01, TWA-02)
- [ ] 13-03-keystore-generation-PLAN.md — generate-keystore.sh wrapper + README §Keystore + §Rotation + Daisy human-action (TWA-04)
- [ ] 13-04-build-orchestrator-uat-PLAN.md — build.sh + verify-apk.sh + npm run build:firestick-apk + README §UAT + Fire Stick acceptance (TWA-01, TWA-02, TWA-03, TWA-04)

### Phase 14: DEPLOY — Sideload bénévole-grade

**Goal**: Un bénévole (zéro compétence Android) peut installer l'APK sur un Fire Stick neuf en moins de 10 minutes, en suivant un guide pas-à-pas, sans connexion internet club.
**Depends on**: Phase 13 (consomme l'APK signée)
**Requirements**: INSTALL-01, INSTALL-02, INSTALL-03
**Success Criteria** (what must be TRUE):

1. La procédure documentée permet à un bénévole avec un Mac/Windows/Linux d'installer l'APK sur un Fire Stick en moins de 10 min (mesuré sur un test réel).
2. L'APK est servie par nginx du Pi (`http://192.168.4.1/firestick.apk`) — accessible quand le Pi tourne en hotspot, même sans internet club.
3. Le script `firestick-install-apk.sh` détecte une APK déjà installée et propose upgrade vs réinstall propre.

**Plans**: TBD (à définir en `/gsd:plan-phase 14`)

### Phase 15: INTEGRATE — Auto-launch + observabilité

**Goal**: L'APK se lance automatiquement quand un Fire Stick rejoint le hotspot Pi, le fallback Silk Browser v4.1 reste fonctionnel pour les Fire Sticks sans APK, et l'adoption APK vs Silk est observable côté Prometheus.
**Depends on**: Phase 13 (APK existe), Phase 14 (APK déployable bénévole-grade)
**Requirements**: AUTOLAUNCH-01, AUTOLAUNCH-02, OBSERVE-01, OBSERVE-02
**Success Criteria** (what must be TRUE):

1. Un Fire Stick avec APK installée affiche la page Neopro fullscreen en moins de 30s après connexion au hotspot, sans intervention bénévole.
2. Un Fire Stick sans APK installée tombe sur le comportement v4.1 (Silk auto-launch) sans erreur ni régression.
3. La métrique `neopro_firestick_apk_total{site_id, version}` permet de distinguer dans Grafana les Fire Sticks APK vs Silk pour suivre la migration de la flotte.
4. La suite smoke fige les contrats clés (User-Agent custom, manifest fullscreen, target URL captive) — un changement régressif fait rouge le smoke.

**Plans**: TBD (à définir en `/gsd:plan-phase 15`)

---

### Phase 4: DATA — Modèle DisplayConfig étendu

**Goal**: Le modèle `DisplayConfig` JSONB peut porter l'identité d'un récepteur (Pi natif, Fire Stick, browser) sans rupture des displays existants.
**Depends on**: Nothing (point d'entrée v4.0, pose les fondations data)
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):

1. Un `DisplayConfig` peut sérialiser/désérialiser un objet `receiver` avec `kind`, `mac`, `last_seen_at`.
2. Tous les sites existants en prod (NLF, RACC) restent fonctionnels après migration sans intervention manuelle (HDMI #0 défaulte à `pi_native`).
3. Le code applicatif peut lire et écrire le récepteur d'un display via le repository (`getReceiverForDisplay`, `setReceiver`) sans toucher au JSONB brut.

**Plans**: 2 plans

- [x] 04-data-01-receiver-schema-PLAN.md — Migration backfill + DisplayConfig.receiver TS + Joi (DATA-01, DATA-02) ✅ 2026-05-06
- [x] 04-data-02-receiver-repository-PLAN.md — siteRepository.getReceiverForDisplay + setReceiver (DATA-03) ✅ 2026-05-06

### Phase 5: DETECT — Pi détecte les receivers

**Goal**: Le Pi observe en continu les MACs présentes sur son hotspot et tient un état local résilient au redémarrage.
**Depends on**: Phase 4 (consomme le modèle pour formater les events)
**Requirements**: DETECT-01, DETECT-02, DETECT-03
**Success Criteria** (what must be TRUE):

1. Quand un Fire Stick rejoint le hotspot, l'apparition de sa MAC est observable côté Pi en moins de 30 s (logs Winston + état service).
2. Quand un Fire Stick quitte le hotspot, sa disparition est détectée et émise via socket.
3. Après reboot du Pi, le mapping MAC↔display assigné est restauré sans appel cloud (cache local).

**Plans**: 3 plans

- [ ] 05-detect-01-receivers-service-PLAN.md — receivers.service.js core (dnsmasq.leases watch + ARP fallback + diff + emit) (DETECT-01, DETECT-02)
- [ ] 05-detect-02-cache-resilience-PLAN.md — Cache local résilient .receivers-cache.json (loadCache/saveCache + assignDisplay/unassignDisplay + reboot scenario tests) (DETECT-03)
- [ ] 05-detect-03-state-syncagent-integration-PLAN.md — state.service.js extension + server.js wiring + sync-agent whitelist (DETECT-01, DETECT-02, DETECT-03)

### Phase 6: CAPTIVE — Fire Stick → page Neopro

**Goal**: Un Fire Stick branché sur le hotspot atterrit automatiquement sur la bonne page (Neopro plein écran si MAC assignée, page d'attente sinon), sans intervention manuelle du bénévole.
**Depends on**: Phase 4 (lookup MAC→display) + Phase 5 (signal de présence)
**Requirements**: CAPTIVE-01, CAPTIVE-02, CAPTIVE-03, CAPTIVE-04
**Success Criteria** (what must be TRUE):

1. Un Fire Stick neuf sorti du carton, après connexion au Wi-Fi du club, arrive sur une page servie par le Pi (DNS hijack + nginx) sans manipulation du bénévole.
2. Si la MAC est déjà assignée à un display, la TV affiche Neopro plein écran sur le bon display sans étape supplémentaire.
3. Si la MAC n'est pas assignée, la page affiche la MAC en grand caractère (pour dictée téléphonique à l'admin) et auto-refresh.
4. Une fois l'admin assigne la MAC à distance, la page Fire Stick bascule automatiquement vers Neopro sans toucher la télécommande Fire Stick.
5. Les configs `dnsmasq` + `nginx` sont déployées par `install.sh` / `prepare-image.sh` (pas de manuel sur chaque Pi).

**Plans**: 4 plans

- [x] 06-captive-01-receivers-resolve-mac-by-ip-PLAN.md — receivers.service.resolveMacByIp + tests (CAPTIVE-02) ✅ 2026-05-06
- [ ] 06-captive-02-captive-route-server-wire-PLAN.md — /api/captive/whoami route + server.js wire (CAPTIVE-02, CAPTIVE-03, CAPTIVE-04)
- [ ] 06-captive-03-configs-wait-page-install-PLAN.md — dnsmasq+nginx configs + firestick-wait.html + smoke (CAPTIVE-01, CAPTIVE-03, CAPTIVE-04)
- [ ] 06-captive-04-angular-bootstrap-router-PLAN.md — AppComponent bootstrap router + Karma + Pi RACC validation (CAPTIVE-02, CAPTIVE-04)

### Phase 7: CLOUD — API + sync-agent

**Goal**: Le cloud expose les MACs détectées par le Pi et propage les assignations en source de vérité.
**Depends on**: Phase 4 (modèle data) + Phase 5 (events Pi à recevoir)
**Requirements**: CLOUD-01, CLOUD-02, CLOUD-03, CLOUD-04
**Success Criteria** (what must be TRUE):

1. `GET /api/sites/:id/connected-receivers` retourne la liste des MACs auto-détectées par le Pi, ordonnée par fraîcheur (`last_seen_at` desc).
2. `PATCH` du `DisplayConfig` (route PROP-002 existante) accepte un payload contenant un `receiver` valide (Joi) et le persiste.
3. Un event `receiver-detected` ou `receiver-disconnected` envoyé par le Pi est accepté par le sync-agent (whitelist) et traité côté cloud.
4. Quand un admin assigne une MAC à un display côté cloud, le Pi reçoit l'assignation via socket et met à jour son cache local sans reboot.

**Plans**: 3 plans

- [x] 07-cloud-01-connected-receivers-map-PLAN.md — SocketService Map + GET /api/sites/:id/connected-receivers (CLOUD-01)
- [x] 07-cloud-02-patch-displays-emit-command-PLAN.md — updateSiteDisplays emit receiver_assignment_updated + sync-agent whitelist (CLOUD-02, CLOUD-03)
- [x] 07-cloud-03-pi-command-dispatch-handler-PLAN.md — Pi command-dispatch handler → receiversService.assignDisplay (CLOUD-04)

### Phase 8: DASHBOARD — UX admin assignation

**Goal**: Un super_admin peut assigner ou désassigner un Fire Stick à un display depuis le dashboard, sans saisie aveugle, sans aide technique.
**Depends on**: Phase 7 (consomme l'API connected-receivers)
**Requirements**: DASHBOARD-01, DASHBOARD-02, DASHBOARD-03
**Success Criteria** (what must be TRUE):

1. Dans `Sites > <club> > Écrans`, chaque ligne affiche une colonne « Récepteur » qui distingue clairement Pi natif HDMI / Fire Stick assigné (MAC tronquée) / aucun.
2. Le bouton [Assigner ▾] ouvre un dropdown pré-rempli avec les MACs auto-détectées par le Pi (pas de champ texte libre).
3. Le bouton [Désassigner] détache une MAC d'un display sans casser la configuration du display ni les autres assignations.

**Plans**: 4 plans

- [ ] 08-dashboard-01-models-receiver-config-PLAN.md — ReceiverConfig + ReceiverInfo interfaces + DisplayConfig.receiver extension (DASHBOARD-01, DASHBOARD-02, DASHBOARD-03)
- [ ] 08-dashboard-02-sites-service-receiver-load-PLAN.md — SitesService.getConnectedReceivers + ngOnInit load + template binding (DASHBOARD-01, DASHBOARD-03)
- [ ] 08-dashboard-03-displays-editor-receiver-ux-PLAN.md — 3-state badge + position:fixed dropdown + assign/unassign emit (DASHBOARD-01, DASHBOARD-02, DASHBOARD-03)
- [ ] 08-dashboard-04-karma-tests-PLAN.md — Karma tests: badge states + assign + unassign + empty state + ngOnInit load (DASHBOARD-01, DASHBOARD-02, DASHBOARD-03)

### Phase 9: OBSERVE — Métriques + smoke

**Goal**: La feature Fire Stick est observable en prod (Prometheus) et figée par smoke tests pour prévenir les régressions silencieuses de wiring.
**Depends on**: Phases 4-8 (fige les contrats livrés)
**Requirements**: OBSERVE-01, OBSERVE-02
**Success Criteria** (what must be TRUE):

1. La métrique `neopro_receivers_total{site_id, status}` est exposée sur `/metrics` et incrémentée par les transitions detected/assigned/disconnected.
2. La suite `smoke-receivers-discovery` échoue si l'event `receiver-detected` est retiré de la whitelist sync-agent, si la route API disparaît, si la colonne dashboard est retirée, ou si les configs nginx/dnsmasq ne sont plus posées par `install.sh`.

**Plans**: 2 plans

- [x] 09-observe-01-prometheus-receivers-metric-PLAN.md — Counter neopro_receivers_total{site_id, status} + Grafana panel (OBSERVE-01) ✅ 2026-05-07
- [x] 09-observe-02-smoke-receivers-discovery-PLAN.md — Suite smoke-receivers-discovery (wiring whitelist + API + dashboard + install.sh) (OBSERVE-02) ✅ 2026-05-07

---

## v4.1 — Fire Stick polish

### Phase 10: CAPTIVE-AUTO — Silk Browser auto-launch

**Goal**: Un Fire Stick branché sur le hotspot Pi ouvre automatiquement le portail captif sans aucune manipulation de la télécommande par le bénévole.
**Depends on**: Phase 6 (captive portal nginx + page d'attente opérationnels)
**Requirements**: CAPTIVE-05, CAPTIVE-06, CAPTIVE-07
**Success Criteria** (what must be TRUE):

1. Un Fire Stick fraîchement connecté au hotspot affiche la page captive Pi dans Silk Browser sans que le bénévole n'appuie sur aucun bouton de télécommande.
2. Au reboot du Fire Stick (premier démarrage après connexion hotspot), Silk s'ouvre sur le portail captif sans étape manuelle de l'utilisateur.
3. Si l'auto-launch ne se déclenche pas (Fire Stick hors portée, timeout réseau), la page d'attente reste accessible manuellement — le comportement v4.0 est préservé sans régression.

**Plans**: 1 plan

- [x] 10-01-nginx-wifistub-302-PLAN.md — nginx wifistub 302 + wifiredirect endpoint + smoke guards Phase 10 + doc OTA Pi (CAPTIVE-05, CAPTIVE-06, CAPTIVE-07) (completed 2026-05-07)

### Phase 11: REASSIGN — Réassigner UX dashboard

**Goal**: Un super_admin réassigne un Fire Stick d'un display à un autre en 1 clic depuis le dashboard, sans passer par Désassigner puis Assigner en deux temps.
**Depends on**: Phase 8 (displays-editor existant) + Phase 7 (cloud API + sync-agent)
**Requirements**: ASSIGN-01, ASSIGN-02, ASSIGN-03
**Success Criteria** (what must be TRUE):

1. Dans `Sites > <club> > Écrans`, le dropdown d'un display déjà assigné propose [Réassigner ▾] avec les MACs détectées (MAC courante exclue).
2. Sélectionner une MAC dans [Réassigner ▾] effectue l'opération en un seul clic — l'ancienne assignation est détachée et la nouvelle est appliquée atomiquement, sans état intermédiaire visible.
3. L'ancien Fire Stick désassigné bascule automatiquement en page d'attente via `receiver_assignment_updated` → Pi → captive route, sans reboot ni manipulation terrain.

**Plans**: 1 plan

- [x] 11-01-displays-editor-reassign-ux-PLAN.md — Helpers `isReceiverStale` / `getReassignableReceivers` / `getCrossDisplayHint` + mutation atomique 2-displays dans `assignReceiver` + bouton [Réassigner ▾] séparé du badge MAC + 6 tests Karma (ASSIGN-01, ASSIGN-02, ASSIGN-03) ✅ 2026-05-07

### Phase 13: APK TWA fullscreen

**Goal**: Le Fire Stick affiche Neopro en plein écran sans barre URL Silk Browser.
**Depends on**: Phase 10 (captive auto-launch opérationnel)
**Requirements**: APK-01 (à définir)
**Success Criteria** (what must be TRUE):

1. L'APK TWA installée sur Fire Stick ouvre l'URL Neopro en fullscreen, sans barre URL visible.
2. Le comportement captive portal (auto-launch Phase 10) reste fonctionnel avec l'APK.

**Plans**: TBD

## Progress

| Phase               | Milestone | Plans Complete | Status   | Completed  |
| ------------------- | --------- | -------------- | -------- | ---------- |
| 1. Fondations       | v3.0      | 5/5            | Complete | 2026-05-05 |
| 2. UX interactive   | v3.0      | 4/4            | Complete | 2026-05-05 |
| 3. Gate publication | v3.0      | 5/5            | Complete | 2026-05-05 |
| 4. DATA             | v4.0      | 2/2            | Complete | 2026-05-06 |
| 5. DETECT           | v4.0      | 3/3            | Complete | 2026-05-06 |
| 6. CAPTIVE          | v4.0      | 6/6            | Complete | 2026-05-07 |
| 7. CLOUD            | v4.0      | 3/3            | Complete | 2026-05-07 |
| 8. DASHBOARD        | v4.0      | 4/4            | Complete | 2026-05-07 |
| 9. OBSERVE          | v4.0      | 2/2            | Complete | 2026-05-07 |
| 10. CAPTIVE-AUTO    | v4.1      | 1/1            | Complete | 2026-05-07 |
| 11. REASSIGN        | v4.1      | 1/1            | Complete | 2026-05-08 |
| 12. OBSERVE(pivoté) | v4.1      | 2/2            | Complete | 2026-05-08 |
| 13. APK TWA         | v4.2      | 0/?            | Planned  | -          |

---

✅ **Milestone v4.1 — Fire Stick polish SHIPPED** — 3 phases, 4 plans, 2026-05-08
