# Requirements — Milestone v4.0 Multi-écrans Fire Stick

**Goal :** Un bénévole branche un Fire Stick sur une TV du club, l'admin assigne la MAC à distance depuis le dashboard, la TV affiche Neopro plein écran. Zéro déplacement technique.

**Source de vision :** `.planning/firestick-poc/VISION.md` (POC validé 2026-05-05)
**Pattern de référence :** `hdmi.service.js` (PROP-002 phase 5) → `receivers.service.js`

---

## v4.0 Requirements

### DETECT — Pi détecte les receivers

- [ ] **DETECT-01** : Le Pi détecte automatiquement les MACs connectées à son hotspot (watch `dnsmasq.leases` + ARP)
- [ ] **DETECT-02** : Le Pi pousse les changements (`receiver-detected`, `receiver-disconnected`) vers le cloud via socket
- [ ] **DETECT-03** : Le Pi cache localement le mapping MAC↔display pour résilience offline (Pi off → recovery au reboot)

### CAPTIVE — Fire Stick → page Neopro

- [ ] **CAPTIVE-01** : Connexion au hotspot → Silk atterrit sur la page servie par le Pi (DNS hijack `firetvcaptiveportal.com` + `spectrum.s3.amazonaws.com` + nginx — pattern POC)
- [ ] **CAPTIVE-02** : Si MAC assignée à un display → page Neopro plein écran pour ce display (302 vers `/` avec query `?display=N`)
- [ ] **CAPTIVE-03** : Si MAC non assignée → page d'attente avec MAC affichée en gros + auto-refresh (polling)
- [ ] **CAPTIVE-04** : Une fois MAC assignée à distance par l'admin → page Fire Stick bascule auto vers la page Neopro (sans intervention bénévole)

### DATA — Modèle DisplayConfig étendu

- [ ] **DATA-01** : `DisplayConfig` JSONB étendu avec `receiver?: { kind: 'pi_native'|'firestick'|'browser', mac?, last_seen_at? }`
- [ ] **DATA-02** : Migration safe : `displays` existants restent valides (defaults `pi_native` pour HDMI #0)
- [ ] **DATA-03** : Repository expose `getReceiverForDisplay(siteId, displayIndex)` + `setReceiver(siteId, displayIndex, receiver)`

### CLOUD — API + sync-agent

- [ ] **CLOUD-01** : `GET /api/sites/:id/connected-receivers` retourne les MACs détectées par le Pi (auto-discovery liste, ordonnée par `last_seen_at`)
- [ ] **CLOUD-02** : Assignation MAC↔display via PATCH du `DisplayConfig` (route PROP-002 existante étendue, validation Joi)
- [ ] **CLOUD-03** : Sync-agent whitelist nouvel event `receiver-detected` (et `receiver-disconnected`)
- [ ] **CLOUD-04** : DB cloud = source de vérité ; Pi reçoit assignments via socket et met à jour cache local automatiquement

### DASHBOARD — UX admin assignation

- [ ] **DASHBOARD-01** : `displays-editor` affiche colonne « Récepteur » par display (🟢 Pi natif HDMI / 🟢 Fire Stick MAC tronquée / ⚪ Aucun)
- [ ] **DASHBOARD-02** : Dropdown [Assigner ▾] pré-rempli avec les MACs auto-détectées par le Pi (pas de saisie aveugle, pas de pré-config)
- [ ] **DASHBOARD-03** : Bouton [Désassigner] détache une MAC d'un display sans casser le display

### OBSERVE — Métriques + smoke

- [ ] **OBSERVE-01** : Métrique Prometheus `neopro_receivers_total{site_id, status}` (status: `detected` / `assigned` / `disconnected`)
- [ ] **OBSERVE-02** : Suite smoke `smoke-receivers-discovery` fige les contrats (event whitelist sync-agent, repo extension, route API, dashboard column, captive nginx route)

---

## Future Requirements (v4.1+)

Déclencheurs explicites — features ajoutées au prochain milestone uniquement si le trigger est observé en prod :

- [ ] **APK TWA fullscreen Fire Stick** — trigger : 1er retour terrain "URL bar Silk fait pas pro"
- [ ] **Scénario SaaS Fire Stick** (token URL/cookie, pas de Pi) — trigger : 1er client SaaS qui demande
- [ ] **MAC allowlist hostapd avancée** — trigger : rotation PSK bloquante en prod
- [ ] **Captive auto-launch boot Silk** — trigger : friction "lancer Silk manuellement" documentée
- [ ] **Bouton « Réassigner » côté Fire Stick** (déplacement TV) — trigger : 1er retour terrain
- [ ] **Alertes Alertmanager Fire Stick offline > 24h** — trigger : 2ᵉ déploiement client

---

## Out of Scope (jamais — v4.x)

- **Solution sans Pi** (refonte complète streaming) — la valeur Fire Stick = extension du Pi existant. Sans Pi → c'est un cas SaaS différent.
- **Multi-VLAN club** (Fire Stick sur LAN club avec internet) — le scope est strictement hotspot Pi local, pas d'intégration LAN externe.
- **Streaming inter-display synchronisé** (4 TVs montrent la même animation au même frame) — complexité élevée, aucun besoin produit identifié.

---

## Traceability

| REQ-ID       | Phase           | Plan |
| ------------ | --------------- | ---- |
| DATA-01      | Phase 4 (DATA)      | TBD  |
| DATA-02      | Phase 4 (DATA)      | TBD  |
| DATA-03      | Phase 4 (DATA)      | TBD  |
| DETECT-01    | Phase 5 (DETECT)    | TBD  |
| DETECT-02    | Phase 5 (DETECT)    | TBD  |
| DETECT-03    | Phase 5 (DETECT)    | TBD  |
| CAPTIVE-01   | Phase 6 (CAPTIVE)   | TBD  |
| CAPTIVE-02   | Phase 6 (CAPTIVE)   | TBD  |
| CAPTIVE-03   | Phase 6 (CAPTIVE)   | TBD  |
| CAPTIVE-04   | Phase 6 (CAPTIVE)   | TBD  |
| CLOUD-01     | Phase 7 (CLOUD)     | TBD  |
| CLOUD-02     | Phase 7 (CLOUD)     | TBD  |
| CLOUD-03     | Phase 7 (CLOUD)     | TBD  |
| CLOUD-04     | Phase 7 (CLOUD)     | TBD  |
| DASHBOARD-01 | Phase 8 (DASHBOARD) | TBD  |
| DASHBOARD-02 | Phase 8 (DASHBOARD) | TBD  |
| DASHBOARD-03 | Phase 8 (DASHBOARD) | TBD  |
| OBSERVE-01   | Phase 9 (OBSERVE)   | TBD  |
| OBSERVE-02   | Phase 9 (OBSERVE)   | TBD  |

**18 requirements** | **6 catégories** | **Coverage: 18/18** ✓ | Research skipped (POC + pattern PROP-002 known)
