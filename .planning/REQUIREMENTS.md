# Requirements — Milestone v4.2 Fire Stick APK TWA

**Goal :** Remplacer Silk Browser (URL bar persistante, expérience non-pro) par une APK Android TWA fullscreen sur Fire Stick. Bénévole sideload l'APK une fois ; l'expérience utilisateur final = TV plein écran sans aucun chrome navigateur.

**Trigger :** Retour terrain v4.1 — l'auto-launch Silk Browser fonctionne mais la barre URL reste visible en haut de l'écran TV (constat ergonomique non-acceptable pour clubs Premium).
**Décision produit 2026-05-08 :** ALLOWLIST + ALERT (Phases 12-13 v4.1 prévues) abandonnés au profit de l'APK TWA — l'OBSERVE badge ambre v4.1 couvre déjà 80% du besoin de visibilité Fire Stick inconnus, et les alertes déconnexion peuvent être traitées par alertingService existant si besoin futur.

**Source de référence :**

- Phase 10 v4.1 (CAPTIVE-AUTO) — wifistub 302-chain qui tape sur la racine `/` du Pi (sera la cible de l'APK)
- Pattern Android TWA : `androidx.browser.trusted.TrustedWebActivity` (standard, pas de WebView custom)
- Clé de signature persistante (upgrades sans réinstall flotte)

---

## v4.2 Requirements

### TWA — APK Android Trusted Web Activity

- [x] **TWA-01** : APK Android TWA wrapping la page captive Pi (URL configurable au build : défaut `http://192.168.4.1/` ou résolution captive `firetvcaptiveportal.com`) — manifest configurable, smoke automatisé, package id `bzh.kalonpartners.neopro.firestick` vérifié `aapt dump badging` (Phase 13-04 commit `f437b8c4`)
- [~] **TWA-02** : Mode fullscreen immersif (immersive sticky) — `display: "fullscreen-sticky"` dans `twa-manifest.json` (smoke automatisé ✅) ; **UAT visuel reporté à Phase 14** : Fire OS impose le wrapper Silk WebView tant que le Wi-Fi est en état captive (fix Pi-side = 204 sur `/generate_204`, `/connecttest.txt`, `/hotspot-detect.html`)
- [~] **TWA-03** : APK suit les redirects HTTP 302 — chaîne 302 suivie nativement par TWA validé via logcat (URL finale `/display/1` atteinte sans `ERR_CLEARTEXT_NOT_PERMITTED`) ; **check no-flash visuel reporté à Phase 14** (même blocker Fire OS captive wrapper)
- [x] **TWA-04** : APK signée avec une clé de release stable (`firestick-release` alias, RSA 2048, validité 2056-04-30) — `apksigner verify --verbose` confirme v2=true + v3=true ; procédure de rotation documentée README §Keystore Rotation (Phase 13-03 commits `33df7170`/`6bcf09ec`)

### INSTALL — Sideload bénévole-grade

- [ ] **INSTALL-01** : Procédure documentée pas-à-pas pour sideload ADB depuis ordinateur bénévole vers Fire Stick (Mac/Windows/Linux), incluant activation Developer Mode Fire OS et appairage ADB
- [ ] **INSTALL-02** : Script `scripts/firestick-install-apk.sh` (ou équivalent) qui automatise `adb connect <fire-stick-ip>` + `adb install neopro-tv.apk` avec checks de version
- [ ] **INSTALL-03** : APK distribuée depuis URL Pi local (`http://192.168.4.1/firestick.apk` servi par nginx) — bénévole pas besoin d'internet club

### AUTOLAUNCH — Lancement automatique APK

- [ ] **AUTOLAUNCH-01** : Quand le Fire Stick rejoint le hotspot Pi, l'APK Neopro TV se lance automatiquement (intent filter sur connexion réseau ou re-use du flow CaptivePortalLauncher v4.1)
- [ ] **AUTOLAUNCH-02** : Si l'APK n'est pas installée sur le Fire Stick, comportement v4.1 conservé (Silk Browser auto-launch via wifistub) — zéro régression du fallback

### OBSERVE — Métriques + smoke

- [ ] **OBSERVE-01** : Métrique Prometheus `neopro_firestick_apk_total{site_id, version}` incrémentée à chaque connexion APK détectée (User-Agent custom `NeoproTV/<version>`)
- [ ] **OBSERVE-02** : Suite smoke (existante `smoke-receivers-discovery` étendue OU nouvelle `smoke-firestick-apk`) fige les contrats : User-Agent string, manifest fullscreen flag, target URL captive, intent filter

---

## Future Requirements (v4.3+)

- [ ] **Distribution APK via OTA Pi** — APK auto-déployée sur les Pi depuis le cloud (trigger : flotte > 10 sites Fire Stick)
- [ ] **Auto-update APK in-place** — APK détecte version dispo et propose update sans intervention bénévole (trigger : 1ʳᵉ release post-MVP)
- [ ] **Scénario SaaS Fire Stick (token URL/cookie, sans Pi)** — APK pointe sur cloud direct (trigger : 1er client SaaS multi-écrans)
- [ ] **Bouton "Réassigner" côté Fire Stick (UI APK)** — bénévole seul sans accès dashboard (trigger : retour terrain confirmé)

---

## Out of Scope

- **Distribution Play Store / Amazon Appstore** — pas pertinent pour distribution captive interne, ajoute friction signature commerciale
- **APK iOS / autres plateformes** — Fire Stick = Android only, scope strictement Fire OS
- **Custom WebView avec polices/extensions** — TWA standard suffit, pas de divergence du runtime web déjà testé
- **Multi-VLAN club (APK qui se connecte au LAN club + Pi simultanément)** — scope strictement hotspot Pi local, pas d'intégration LAN externe (héritage v4.0)

---

## Traceability

| REQ-ID        | Phase                | Plan                                                                                 |
| ------------- | -------------------- | ------------------------------------------------------------------------------------ |
| TWA-01        | Phase 13 (TWA-BUILD) | 13-01, 13-04 ✅ (manifest + smoke + automated package-id check)                      |
| TWA-02        | Phase 13 (TWA-BUILD) | 13-01 ✅ (manifest `fullscreen-sticky`) ; visual UAT → Phase 14 (Pi captive 204 fix) |
| TWA-03        | Phase 13 (TWA-BUILD) | 13-04 ✅ (302 chain validated logcat) ; no-flash visual UAT → Phase 14               |
| TWA-04        | Phase 13 (TWA-BUILD) | 13-03, 13-04 ✅ (keystore + apksigner v2+v3 verified)                                |
| INSTALL-01    | Phase 14 (DEPLOY)    | TBD                                                                                  |
| INSTALL-02    | Phase 14 (DEPLOY)    | TBD                                                                                  |
| INSTALL-03    | Phase 14 (DEPLOY)    | TBD                                                                                  |
| AUTOLAUNCH-01 | Phase 15 (INTEGRATE) | TBD                                                                                  |
| AUTOLAUNCH-02 | Phase 15 (INTEGRATE) | TBD                                                                                  |
| OBSERVE-01    | Phase 15 (INTEGRATE) | TBD                                                                                  |
| OBSERVE-02    | Phase 15 (INTEGRATE) | TBD                                                                                  |

**v4.2: 11 requirements** | **4 catégories** | **Coverage: 11/11** ✓

---

_Last updated: 2026-05-08 — Phase 13 PARTIAL : APK shipped (TWA-01 + TWA-04 ✅), TWA-02 + TWA-03 visual UAT reportés Phase 14 (Pi captive 204 fix prérequis)_
