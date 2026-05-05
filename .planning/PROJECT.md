# Neopro — Template Studio v3

## What This Is

Neopro est un système de TV interactive pour clubs sportifs. Un Raspberry Pi dans chaque club affiche sur grand écran des animations vidéo (buts, joueurs, sponsors) déclenchées depuis une télécommande ou le dashboard admin central. Le moteur Template Studio v2 (ADR-086, ADR-095) génère ces animations via Remotion — il est data-driven (rows DB, pas de code par template) et robuste.

Ce milestone construit **Template Studio v3** : une couche UX admin au-dessus du moteur v2, pour que Daisy (et tout designer externe) puisse créer, dupliquer, configurer et publier un template **sans terminal, sans SQL, sans connaître les concepts DB**.

## Core Value

Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.

## Requirements

### Validated

<!-- Shippad et confirmé précieux — moteur v2 existant -->

- ✓ Moteur Template Studio v2 (N-layers data-driven, slots conditionnels, animations paramétriques) — ADR-086/095
- ✓ Rendu Remotion async (worker Chrome, player intégré dashboard) — ADR-054/055
- ✓ Versioning templates + master locking — ADR-108
- ✓ Background grants (accès clubs aux fonds animés) — ADR-109

### Active

<!-- Milestone v3.0 — Template Studio v3 UX -->

- [ ] Asset Manager WebM accessible depuis le dashboard sans terminal
- [ ] Wizard 4 étapes pour créer un template (Identité → Fonds → Zones → Options)
- [ ] Bouton "Dupliquer" sur chaque template (clone DB sans dupliquer assets)
- [ ] Vocabulaire métier strict dans l'UI (layer → "fond animé", slot → "zone modifiable")
- [ ] Aperçu Remotion temps réel côte-à-côte dans le wizard (étapes 3, 4, 5)
- [ ] Presets animation visuels (cartes nommées, pas de chiffres scaleTo/From)
- [ ] Checklist de validation auto pré-publication (8 critères)
- [ ] Test render avec données factices avant publication
- [ ] Smoke tests : vocabulaire figé, duplication, validation, asset manager
- [ ] Mode "avancé" (studio v2 existant) accessible pour cas exceptionnels

### Out of Scope

- UI club portal pour consommer un template — Phase D future (ADR-110 §v3.3)
- Table `template_fonts` réelle — v3.2 future (fonts hardcodées dans `FONT_FAMILIES` pour l'instant)
- Bibliothèque de fonds switchables côté club (`template_variants`) — v3.1 future
- Versioning visuel / rollback templates — v3.4 (exploitera ADR-108)
- Refonte du moteur Remotion (`TemplateRuntime.tsx`) — inchangé par design
- CLI `template:import` supprimé — reste actif pour seeding bulk exceptionnel

## Context

- **ADR-110** (2026-05-05) : décision architecturale complète, validée par Daisy
- **SPEC vivante** : `docs/specs/features/template-studio-v3.spec.md` — mapping vocabulaire UI↔DB figé, workflows, cas d'edge, CU canoniques
- **Maquette validée** : `docs/templates/mockups/template-studio-v3-mockup.html`
- **Code existant** : `central-dashboard/src/app/features/content/remotion-templates/studio-v2/` (admin v2 conservé en "mode avancé")
- **Stack Angular** : Angular 20, Standalone Components, Remotion Player intégré via `remotion-preview.service.ts`
- **Backend** : Express/TypeScript, `template-studio.controller.ts` + `template-studio.repository.ts` (à étendre)
- **DB** : Tables existantes (`neopro_templates`, `template_layers`, `template_text_fields`, `template_image_slots`, `template_options`, `template_packshot_refs`, `template_variants`) — inchangées par design

## Constraints

- **Moteur** : Le `TemplateRuntime.tsx` ne change pas — toute nouvelle capacité va dans l'UI, pas le moteur
- **DB** : Pas de migration destructive — uniquement ADD COLUMN IF NOT EXISTS (pattern ADR-086)
- **Auth** : Upload WebM réservé `super_admin` uniquement (guard existant à conserver)
- **Repository pattern** : 0 `query()` direct dans les controllers — passer par `templateStudioRepository`
- **Smoke tests** : Tout nouveau comportement métier doit être couvert par un smoke test (règle `.claude/rules/testing.md`)
- **Worktrees** : Chaque session de code crée sa propre worktree (règle CLAUDE.md)

## Key Decisions

| Decision                                                | Rationale                                                              | Outcome   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| v3 = couche UI uniquement (pas refonte moteur)          | Moteur v2 15/20, gap purement UX — refonte casserait 4+ templates prod | — Pending |
| Wizard "Dupliquer puis adapter" comme chemin par défaut | Designer externe peut être autonome sans partir de zéro                | — Pending |
| Vocabulaire métier UI testé via smoke test figé         | Changement de clé = test rouge = régression détectée immédiatement     | — Pending |
| Aperçu Remotion temps réel debounce 300ms               | Évite les renders trop fréquents pendant la saisie                     | — Pending |
| Phases A/B/C incrémentales (~1 sem chacune)             | Livraison de valeur incrémentale, évite big-bang 3 semaines bloquant   | — Pending |

---

_Last updated: 2026-05-05 — Milestone v3.0 initialisé (ADR-110 validé)_
