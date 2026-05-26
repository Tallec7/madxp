# ADR-110 : Template Studio v3 — UX admin orientée tâche

**Date** : 2026-05-05
**Statut** : Proposé
**Format** : Léger

---

## Contexte

Le moteur Template Studio v2 (ADR-086, ADR-095) est solide : N-layers data-driven, slots conditionnels (`visible_if`), packshots conditionnels (`template_packshot_refs`), animations paramétriques, options user (`template_options`). Il rend tout ce que demande la SPEC PDF JOUEUR (du 30/04/2026, voir `docs/templates/SPEC-Animation-Joueur.pdf`) et bien plus.

**Le problème n'est pas le moteur, c'est l'atelier admin.** Création/clonage/configuration d'un template impose aujourd'hui un workflow éclaté entre 4 outils (SPEC.md sur disque, CLI `template:import`, Admin Studio partial, SQL direct pour `template_packshot_refs` + `template_options`). Le vocabulaire UI expose les concepts DB (layer, slot, anchor, fit_mode, scaleFrom, visible_if). **Daisy elle-même se déclare perdue côté admin** — signal fort qu'aucune personne novice design/vidéo ne peut être autonome aujourd'hui.

Avant d'exposer les templates en consommation aux clubs (UI club portal), l'admin doit pouvoir créer/cloner/publier un template **sans terminal, sans SQL, sans connaître les concepts DB**.

## Décision

Construire **Template Studio v3** : une couche UX admin orientée tâche par-dessus le moteur v2 existant, en 3 phases.

**Principes directeurs** :

1. **Vocabulaire métier strict côté UI**, technique côté DB. Mapping explicite documenté.
2. **Pas de SQL, pas de CLI, pas de SPEC.md sur disque** pour les opérations courantes. Tout passe par l'UI dashboard.
3. **Workflow "Dupliquer puis adapter"** comme chemin par défaut. Le wizard "from scratch" reste possible mais secondaire.
4. **Aperçu temps réel obligatoire** sur toute édition de zones modifiables (Player Remotion à droite, formulaire à gauche).
5. **Le moteur ne change pas.** Toutes les primitives DB (`template_options`, `template_packshot_refs`, `visible_if`, `template_image_slots`, `template_text_fields`, `template_layers`) sont conservées telles quelles. v3 = couche UI, pas refonte.

**Phasage** :

- **Phase A — Création sans terminal (~1 sem)** : Asset Manager WebM + Wizard "Nouveau template" en 4 étapes (Identité → Fonds animés → Zones modifiables → Options club) + bouton "Dupliquer" sur chaque template.
- **Phase B — Vocabulaire métier + aperçu live (~1 sem)** : renommage UI complet, tooltips contextuels avec exemples visuels, mode aperçu en direct côte-à-côte, presets d'animation visuels (cartes nommées au lieu de scaleFrom/To).
- **Phase C — Validation autonome (~3-5j)** : checklist auto pré-publication, génération de test avec données factices, mode pas-à-pas guidé pour le 1er template.

Maquette de référence : `docs/templates/mockups/template-studio-v3-mockup.html` (validée par Daisy le 2026-05-05).

## Alternatives rejetées

- **Refondre le moteur** : rejeté car le moteur v2 est solide (15/20), le gap est purement UX. Refondre casserait les 4+ templates en prod et 14 migrations sans bénéfice métier.
- **Garder SPEC.md + CLI comme workflow principal** : rejeté car incompatible avec l'objectif "personne novice autonome". Le fichier markdown sur disque + commande terminal reste réservé au seeding initial / cas exceptionnels.
- **Exposer directement les clubs sans finaliser l'admin** : rejeté car chaque demande "ajoute un fond bleu" deviendrait un ticket pour l'équipe MadXP à perpétuité (pas scalable au-delà de NLF).
- **Refondre l'admin sans phasage (big bang)** : rejeté car ~3 semaines en un bloc bloque toute évolution autre. Les 3 phases livrent de la valeur incrémentale.

## Conséquences

**Positives** :

- Daisy autonome côté admin → débloque le pilotage produit des templates (peut produire sans demander à un dev).
- Designer externalisable : la maquette montre que le vocabulaire métier est suffisant pour qu'un designer non-MadXP travaille seul.
- Onboarding nouveau template passe de ~1 journée (SPEC.md + CLI + SQL + assets) à ~30 min (wizard + asset manager).
- Réduit la dette mentale : les rules `templates.md` "NE JAMAIS FAIRE" deviennent invisibles côté UI (le moteur les enforce, pas l'humain).
- Prépare l'exposition club portal : une fois l'admin propre, l'UI consommation côté club s'aligne sur le même vocabulaire.

**Négatives / risques** :

- ~2-3 semaines de dev focalisé, retarde d'autres chantiers.
- Risque de drift entre le vocabulaire UI et la DB — mitigé par un mapping explicite versionné dans la SPEC.
- L'aperçu temps réel pose un défi technique côté Remotion Player (déjà géré dans v2 en mode preview, à étendre pour le wizard).
- Phase C "checklist auto" doit rester maintenue à mesure que de nouvelles primitives s'ajoutent au moteur.

## Garde-fous (smoke tests à ajouter)

- Le wizard ne doit pas créer un template sans `template_options` cohérentes avec les `visible_if` des slots (validation pré-publication).
- Le bouton "Dupliquer" doit copier rows DB + assets WebM références (pas de duplication physique des fichiers).
- L'Asset Manager ne doit pas exposer les WebM hors `super_admin` (cohérent avec ADR-095 + invariant templates.md).
- Le vocabulaire métier (layer → "fond animé", slot → "zone modifiable") est testé via un mapping figé dans la SPEC.

## Fichiers impactés (estimation)

- `central-dashboard/src/app/features/content/remotion-templates/studio-v3/` — nouveau module Angular (wizard, asset manager, validation).
- `central-server/src/controllers/template-studio.controller.ts` — endpoints "duplicate template", "validate before publish", "test render with fixtures".
- `central-server/src/repositories/template-studio.repository.ts` — méthodes `duplicateTemplate()`, `validateTemplateIntegrity()`.
- `docs/specs/features/template-studio-v3.spec.md` — spec vivante avec mapping vocabulaire métier ↔ DB.
- `central-server/src/__tests__/smoke/smoke-template-studio-v3.test.ts` — garde-fous wizard / duplication / validation.
- `.claude/rules/templates.md` — section v3 invariants à ajouter en fin de Phase C.

## Références

- [ADR-086 — Template Studio v2 N-layers + safe-zones](./ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md)
- [ADR-095 — Template Studio Admin UX v2](./ADR-095-template-studio-admin-ux-v2.md)
- [ADR-108 — Template versioning + master locking](./ADR-108-template-versioning-and-master-locking.md)
- [ADR-109 — Template backgrounds grants](./ADR-109-template-backgrounds-grants.md)
- SPEC PDF JOUEUR : `docs/templates/SPEC-Animation-Joueur.pdf` (Daisy, 2026-04-30)
- Maquette validée : `docs/templates/mockups/template-studio-v3-mockup.html`
- SPEC vivante : `docs/specs/features/template-studio-v3.spec.md`
