# Neopro — Template Studio

## What This Is

Neopro est un système de TV interactive pour clubs sportifs. Un Raspberry Pi dans chaque club affiche sur grand écran des animations vidéo (buts, joueurs, sponsors) déclenchées depuis une télécommande ou le dashboard admin central. Le moteur Template Studio v3 (ADR-110, construit sur le moteur v2 ADR-086/095) génère ces animations via Remotion — il est data-driven (rows DB, pas de code par template) et pilotable directement depuis le dashboard sans terminal ni SQL.

## Core Value

Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.

## Current State

**In progress:** v4.0 — Multi-écrans Fire Stick (started 2026-05-06)
**Shipped:** v3.0 — Template Studio v3 (2026-05-06)

- Wizard 5 étapes (Identité → Fonds → Zones → Options → Publication) opérationnel
- Asset Manager WebM standalone avec ffprobe alpha gate
- Preview Remotion temps réel (debounce 300ms, [hidden] jamais \*ngIf)
- Animation preset cards visuelles (4 presets nommés en FR)
- Checklist 8 critères + test render avant publication
- Publish/unpublish validation-gated avec audit Winston
- 9 suites smoke v3 figent tous les contrats UI↔DB

**UAT pending (non-bloquant):** 13 items visuels browser (session super_admin)

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

### Active

**Current Milestone: v4.0 — Multi-écrans Fire Stick (MVP terrain bénévole-grade)**

**Goal :** Un bénévole branche un Fire Stick sur une TV du club, l'admin assigne la MAC à distance depuis le dashboard, la TV affiche Neopro plein écran. Zéro déplacement technique.

**Target features :**

- Détection passive Pi-side des MACs connectées au hotspot (`receivers.service.js` — pattern HDMI mirror)
- Captive portal Fire Stick (DNS hijack + nginx) → page Neopro assignée OU page d'attente avec MAC
- Modèle `DisplayConfig.receiver` JSONB + migration safe (PROP-002 réutilisé)
- API `/api/sites/:id/connected-receivers` + sync-agent event whitelist
- Dashboard `displays-editor` étendu (colonne Récepteur + dropdown auto-rempli)
- Métriques `neopro_receivers_total` + smoke `smoke-receivers-discovery`

**Future (déclencheurs explicites — v4.1+) :**

- [ ] APK TWA fullscreen Fire Stick (trigger : retour terrain "URL bar Silk")
- [ ] Scénario SaaS Fire Stick (token URL/cookie) (trigger : 1er client SaaS)
- [ ] MAC allowlist hostapd (trigger : rotation PSK bloquante)
- [ ] Captive auto-launch boot Silk (trigger : friction documentée)
- [ ] Bouton "Réassigner" côté Fire Stick (trigger : déplacement TV)
- [ ] Alertes Alertmanager Fire Stick offline (trigger : 2ᵉ client déployé)

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

| Decision                                                | Rationale                                                              | Outcome                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| v3 = couche UI uniquement (pas refonte moteur)          | Moteur v2 15/20, gap purement UX — refonte casserait 4+ templates prod | ✓ Validé v3.0                             |
| Wizard "Dupliquer puis adapter" comme chemin par défaut | Designer externe peut être autonome sans partir de zéro                | ✓ Validé v3.0                             |
| Vocabulaire métier UI testé via smoke test figé         | Changement de clé = test rouge = régression détectée immédiatement     | ✓ Validé v3.0 — 9 suites                  |
| Aperçu Remotion temps réel debounce 300ms               | Évite les renders trop fréquents pendant la saisie                     | ✓ Validé v3.0                             |
| Phases A/B/C incrémentales (~1 sem chacune)             | Livraison de valeur incrémentale, évite big-bang 3 semaines bloquant   | ✓ Livré en 1j (vélocité x5 vs estimation) |
| [hidden] jamais \*ngIf sur le Player Remotion           | Pitfall P3 — \*ngIf détruit le React root → fuite GPU SharedImage Pi5  | ✓ Smoke-enforced                          |
| duplicateDeep() transactionnel 6 tables                 | Cohérence DB garantie même en cas de crash mi-clone                    | ✓ BEGIN/COMMIT + ROLLBACK                 |
| Validation registry pattern (8 règles extensibles)      | Ajout règle 9 = 1 fichier + 1 ligne, zéro modification orchestrateur   | ✓ Validé v3.0                             |
| Publish double-gate (UI + serveur re-validate)          | Race condition 2 onglets — serveur est l'autorité finale               | ✓ Validé v3.0                             |

---

_Last updated: 2026-05-06 — démarrage milestone v4.0 (Multi-écrans Fire Stick) — POC validé 2026-05-05_
