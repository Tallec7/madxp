# Neopro — Template Studio

## What This Is

Neopro est un système de TV interactive pour clubs sportifs. Un Raspberry Pi dans chaque club affiche sur grand écran des animations vidéo (buts, joueurs, sponsors) déclenchées depuis une télécommande ou le dashboard admin central. Le moteur Template Studio v3 (ADR-110, construit sur le moteur v2 ADR-086/095) génère ces animations via Remotion — il est data-driven (rows DB, pas de code par template) et pilotable directement depuis le dashboard sans terminal ni SQL.

## Core Value

Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.

## Current State

**Shipped:** v4.1 — Fire Stick polish (2026-05-08) · v4.0 — Multi-écrans Fire Stick MVP (2026-05-07) · v3.0 — Template Studio v3 (2026-05-05)
**Next:** Planning v4.2 (APK TWA fullscreen Fire Stick + alertes déconnexion + allowlist hostapd)

- Fire Stick se connecte au hotspot Pi → Silk Browser s'ouvre automatiquement (auto-launch v4.1)
- Super_admin réassigne un Fire Stick en 1 clic depuis le dashboard (Réassigner UX v4.1)
- Fire Stick inconnu détecté → badge ambre dans dashboard + métrique Prometheus (OBSERVE v4.1)
- N Fire Sticks → N TVs en Wi-Fi hotspot Pi sans internet club (~30€/TV)
- Wizard Template Studio 5 étapes, data-driven, 9 suites smoke figées
- 24 plans v4.1 mergés sur main — intégration E2E vérifiée 4/4 flows

## Requirements

### Validated

- ✓ Moteur Template Studio v2 (N-layers data-driven, slots conditionnels, animations paramétriques) — ADR-086/095
- ✓ Rendu Remotion async (worker Chrome, player intégré dashboard) — ADR-054/055
- ✓ Versioning templates + master locking — ADR-108
- ✓ Background grants (accès clubs aux fonds animés) — ADR-109
- ✓ Asset Manager WebM (browse/upload/delete, ffprobe alpha gate, deletion guard) — v3.0
- ✓ Wizard 4 étapes (Identité → Fonds → Zones → Options), INSERT immédiat step 1, refresh-safe — v3.0
- ✓ Duplication atomique 6 tables (clone DB sans copier FTP) — v3.0
- ✓ Vocabulaire métier strict dans l'UI (smoke-enforced banlist) — v3.0
- ✓ Aperçu Remotion temps réel côte-à-côte (steps 3-5, [hidden] GPU-safe) — v3.0
- ✓ Presets animation visuels (cards nommées FR, pas de chiffres scaleTo/From) — v3.0
- ✓ Checklist validation auto pré-publication (8 critères, registry extensible) — v3.0
- ✓ Test render avec données factices avant publication — v3.0
- ✓ Smoke tests : vocabulaire figé, duplication, validation, asset manager, preview, options — v3.0

### Validated (v4.0 — livré 2026-05-07)

- ✓ `receivers.service.js` Pi-side — détection passive MACs hotspot (dnsmasq.leases + ARP, diff + emit)
- ✓ Cache local `.receivers-cache.json` — résilient reboot, restore offline-first
- ✓ Captive portal DNS hijack (`firetvcaptiveportal.com` + `spectrum.s3.amazonaws.com`) + nginx + page d'attente responsive
- ✓ `DisplayConfig.receiver` JSONB + migration safe + repository `getReceiverForDisplay/setReceiver`
- ✓ API `GET /api/sites/:id/connected-receivers` + sync-agent whitelist `receiver_assignment_updated`
- ✓ Pi `command-dispatch.js` handler → `receiversService.assignDisplay` cache local
- ✓ Dashboard `displays-editor` : badge 3 états + dropdown `position:fixed` pré-rempli + assign/unassign
- ✓ `neopro_receivers_total{site_id, status}` Prometheus + Grafana panel
- ✓ `smoke-receivers-discovery` — 12 assertions pinning 11 contrats wiring Fire Stick
- ✓ POC validé live 2026-05-07 sur Pi RACC (`neopro.local`) avec Fire Stick réel MAC `0C:43:F9:36:04:77`

### Validated (v4.1 — livré 2026-05-08)

- ✓ nginx wifistub 302-chain → Fire OS CaptivePortalLauncher auto-launch Silk Browser (CAPTIVE-05/06/07)
- ✓ Réassigner UX 1 clic — mutation atomique 2-displays dans `assignReceiver()`, badge backward-compat (ASSIGN-01/02/03)
- ✓ Counter `neopro_hotspot_unknown_firestick_total{site_id}` + dedup `Map<siteId,Set<mac>>` + Winston warn (OBSERVE-01/02 phase 12)
- ✓ Badge ambre « Non assigné » dans dropdown displays-editor (kind=firestick && displayIndex===null)
- ✓ `smoke-receivers-discovery` étendu — +9 assertions Phase 12 OBSERVE

### Active

**Next Milestone: v4.2 — Fire Stick APK**

**Target features (déclencheurs confirmés) :**

- [ ] **APK TWA fullscreen** — Silk URL bar persistante après v4.1 (trigger : retour terrain confirmé)

**Future (déclencheurs non encore observés) :**

- [ ] Scénario SaaS Fire Stick (token URL/cookie) (trigger : 1er client SaaS multi-écrans)
- [ ] Bouton "Réassigner" côté Fire Stick lui-même (trigger : bénévole seul sans accès dashboard)

**Backlog Template Studio (futurs milestones) :**

- [ ] UI club portal : sélection template + saisie des 4-6 champs → génération vidéo joueur (Template Studio v3.3)
- [ ] Bibliothèque de fonds switchables côté club (`template_variants`) (Template Studio v3.1)
- [ ] Table `template_fonts` réelle en DB (Template Studio v3.2 — ADR-110 §v3.2)
- [ ] Versioning visuel / rollback templates (Template Studio v3.4 — exploitera ADR-108)

### Out of Scope

- Refonte du moteur Remotion (`TemplateRuntime.tsx`) — inchangé par design ADR-110
- CLI `template:import` supprimé — reste actif pour seeding bulk exceptionnel
- Collaboration multi-utilisateur temps réel — complexité élevée, aucun besoin produit identifié
- Ctrl+Z / undo dans le wizard — conflit avec modèle DB-writes-per-step

## Context

- **v3.0 livré 2026-05-05** : 3 phases, 14 plans, 144+ fichiers, +22 299 LOC TypeScript/Angular
- **ADR-110** (2026-05-05) : décision architecturale complète, validée
- **SPEC vivante** : `docs/specs/features/template-studio-v3.spec.md`
- **Stack** : Angular 20 Standalone, Remotion Player, Express/TypeScript, PostgreSQL 18
- **Tables DB** : `neopro_templates`, `template_layers`, `template_text_fields`, `template_image_slots`, `template_options`, `template_packshot_refs`, `template_variants` — inchangées par design v3
- **Colonnes ajoutées v3.0** : `neopro_templates.test_render_at/status/url`, `recurring_schedules.task_type 'test_render_cleanup'`
- **Dette technique** : 13 items UAT visuels (session browser), 1 Joi body schema publish optionnel, placeholder PNGs à remplacer par visuels définitifs

## Key Decisions

| Decision                                                                 | Rationale                                                                                                                             | Outcome                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| v3 = couche UI uniquement (pas refonte moteur)                           | Moteur v2 15/20, gap purement UX — refonte casserait 4+ templates prod                                                                | ✓ Validé v3.0                             |
| Wizard "Dupliquer puis adapter" comme chemin par défaut                  | Designer externe peut être autonome sans partir de zéro                                                                               | ✓ Validé v3.0                             |
| Vocabulaire métier UI testé via smoke test figé                          | Changement de clé = test rouge = régression détectée immédiatement                                                                    | ✓ Validé v3.0 — 9 suites                  |
| Aperçu Remotion temps réel debounce 300ms                                | Évite les renders trop fréquents pendant la saisie                                                                                    | ✓ Validé v3.0                             |
| Phases A/B/C incrémentales (~1 sem chacune)                              | Livraison de valeur incrémentale, évite big-bang 3 semaines bloquant                                                                  | ✓ Livré en 1j (vélocité x5 vs estimation) |
| [hidden] jamais \*ngIf sur le Player Remotion                            | Pitfall P3 — \*ngIf détruit le React root → fuite GPU SharedImage Pi5                                                                 | ✓ Smoke-enforced                          |
| duplicateDeep() transactionnel 6 tables                                  | Cohérence DB garantie même en cas de crash mi-clone                                                                                   | ✓ BEGIN/COMMIT + ROLLBACK                 |
| Validation registry pattern (8 règles extensibles)                       | Ajout règle 9 = 1 fichier + 1 ligne, zéro modification orchestrateur                                                                  | ✓ Validé v3.0                             |
| Publish double-gate (UI + serveur re-validate)                           | Race condition 2 onglets — serveur est l'autorité finale                                                                              | ✓ Validé v3.0                             |
| wifistub 302 deux-hop (pas de redirect direct)                           | Fire OS CaptivePortalLauncher exige `$host` préservé — redirect direct casse le hostname dans Location                                | ✓ Validé v4.1 Phase 10                    |
| badge MAC = classe double `receiver-badge--assigned receiver-badge--mac` | Backward-compat Phase 8 tests B et F (querySelector sur `.receiver-badge--assigned`)                                                  | ✓ Validé v4.1 Phase 11                    |
| mutation atomique assignReceiver() via single `.map()` pass              | sourceDisplay détecté avant la passe, clear source + set target en 1 seul `displaysChange.emit`                                       | ✓ Validé v4.1 Phase 11                    |
| dedup Map<siteId, Set<mac>> scope process (reset au reboot Railway)      | Cardinalité mac comme label Prometheus refusée — mac reste dans log Winston uniquement                                                | ✓ Validé v4.1 Phase 12                    |
| Phase 12 pivotée ALLOWLIST → OBSERVE                                     | ALLOWLIST requiert redémarrage hostapd via sync-agent — scope dépasse v4.1 ; OBSERVE (Counter + badge) plus actionnable immédiatement | ✓ Décision produit 2026-05-08             |

---

_Last updated: 2026-05-08 — milestone v4.1 Fire Stick polish livré_
