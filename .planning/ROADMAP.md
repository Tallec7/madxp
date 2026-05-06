# Roadmap: Neopro — Template Studio

## Milestones

- ✅ **v3.0 — Template Studio v3 : UX admin orientée tâche** — Phases 1-3 (shipped 2026-05-05) — [archive](.planning/milestones/v3.0-ROADMAP.md)
- 🚧 **v4.0 — Multi-écrans Fire Stick (MVP terrain bénévole-grade)** — Phases 4-9 (started 2026-05-06)

## Phases

<details>
<summary>✅ v3.0 — Template Studio v3 (Phases 1-3) — SHIPPED 2026-05-05</summary>

- [x] Phase 1: Fondations (5/5 plans) — completed 2026-05-05
- [x] Phase 2: UX interactive (4/4 plans) — completed 2026-05-05
- [x] Phase 3: Gate de publication (5/5 plans) — completed 2026-05-05

</details>

### v4.0 — Multi-écrans Fire Stick

- [ ] **Phase 4: DATA — Modèle DisplayConfig étendu** — Étendre le JSONB `sites.displays` avec un objet `receiver` + accès repository
- [ ] **Phase 5: DETECT — Pi détecte les receivers** — `receivers.service.js` (pattern HDMI mirror) watch dnsmasq.leases + ARP, push socket, cache local
- [ ] **Phase 6: CAPTIVE — Fire Stick → page Neopro** — Industrialiser configs POC (`install.sh` / `prepare-image.sh`) + routage dynamique MAC→display
- [ ] **Phase 7: CLOUD — API + sync-agent** — Route `/api/sites/:id/connected-receivers` + whitelist event `receiver-detected`
- [ ] **Phase 8: DASHBOARD — UX admin assignation** — `displays-editor` étendu (colonne Récepteur + dropdown auto-rempli)
- [ ] **Phase 9: OBSERVE — Métriques + smoke** — Métrique Prometheus `neopro_receivers_total` + suite `smoke-receivers-discovery`

## Phase Details

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
- [ ] 04-data-02-receiver-repository-PLAN.md — siteRepository.getReceiverForDisplay + setReceiver (DATA-03)

### Phase 5: DETECT — Pi détecte les receivers

**Goal**: Le Pi observe en continu les MACs présentes sur son hotspot et tient un état local résilient au redémarrage.
**Depends on**: Phase 4 (consomme le modèle pour formater les events)
**Requirements**: DETECT-01, DETECT-02, DETECT-03
**Success Criteria** (what must be TRUE):

1. Quand un Fire Stick rejoint le hotspot, l'apparition de sa MAC est observable côté Pi en moins de 30 s (logs Winston + état service).
2. Quand un Fire Stick quitte le hotspot, sa disparition est détectée et émise via socket.
3. Après reboot du Pi, le mapping MAC↔display assigné est restauré sans appel cloud (cache local).

**Plans**: TBD

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

**Plans**: TBD

### Phase 7: CLOUD — API + sync-agent

**Goal**: Le cloud expose les MACs détectées par le Pi et propage les assignations en source de vérité.
**Depends on**: Phase 4 (modèle data) + Phase 5 (events Pi à recevoir)
**Requirements**: CLOUD-01, CLOUD-02, CLOUD-03, CLOUD-04
**Success Criteria** (what must be TRUE):

1. `GET /api/sites/:id/connected-receivers` retourne la liste des MACs auto-détectées par le Pi, ordonnée par fraîcheur (`last_seen_at` desc).
2. `PATCH` du `DisplayConfig` (route PROP-002 existante) accepte un payload contenant un `receiver` valide (Joi) et le persiste.
3. Un event `receiver-detected` ou `receiver-disconnected` envoyé par le Pi est accepté par le sync-agent (whitelist) et traité côté cloud.
4. Quand un admin assigne une MAC à un display côté cloud, le Pi reçoit l'assignation via socket et met à jour son cache local sans reboot.

**Plans**: TBD

### Phase 8: DASHBOARD — UX admin assignation

**Goal**: Un super_admin peut assigner ou désassigner un Fire Stick à un display depuis le dashboard, sans saisie aveugle, sans aide technique.
**Depends on**: Phase 7 (consomme l'API connected-receivers)
**Requirements**: DASHBOARD-01, DASHBOARD-02, DASHBOARD-03
**Success Criteria** (what must be TRUE):

1. Dans `Sites > <club> > Écrans`, chaque ligne affiche une colonne « Récepteur » qui distingue clairement Pi natif HDMI / Fire Stick assigné (MAC tronquée) / aucun.
2. Le bouton [Assigner ▾] ouvre un dropdown pré-rempli avec les MACs auto-détectées par le Pi (pas de champ texte libre).
3. Le bouton [Désassigner] détache une MAC d'un display sans casser la configuration du display ni les autres assignations.

**Plans**: TBD

### Phase 9: OBSERVE — Métriques + smoke

**Goal**: La feature Fire Stick est observable en prod (Prometheus) et figée par smoke tests pour prévenir les régressions silencieuses de wiring.
**Depends on**: Phases 4-8 (fige les contrats livrés)
**Requirements**: OBSERVE-01, OBSERVE-02
**Success Criteria** (what must be TRUE):

1. La métrique `neopro_receivers_total{site_id, status}` est exposée sur `/metrics` et incrémentée par les transitions detected/assigned/disconnected.
2. La suite `smoke-receivers-discovery` échoue si l'event `receiver-detected` est retiré de la whitelist sync-agent, si la route API disparaît, si la colonne dashboard est retirée, ou si les configs nginx/dnsmasq ne sont plus posées par `install.sh`.

**Plans**: TBD

## Progress

| Phase                  | Milestone | Plans Complete | Status      | Completed  |
| ---------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Fondations          | v3.0      | 5/5            | Complete    | 2026-05-05 |
| 2. UX interactive      | v3.0      | 4/4            | Complete    | 2026-05-05 |
| 3. Gate publication    | v3.0      | 5/5            | Complete    | 2026-05-05 |
| 4. DATA                | v4.0      | 1/2            | In Progress | -          |
| 5. DETECT              | v4.0      | 0/0            | Not started | -          |
| 6. CAPTIVE             | v4.0      | 0/0            | Not started | -          |
| 7. CLOUD               | v4.0      | 0/0            | Not started | -          |
| 8. DASHBOARD           | v4.0      | 0/0            | Not started | -          |
| 9. OBSERVE             | v4.0      | 0/0            | Not started | -          |

---

_Next: `/gsd:plan-phase 4` — démarrer la planification DATA (DisplayConfig JSONB extension + repository)_
