# Templates Remotion V2 — Invariants

Source de vérité : ADR-075, ADR-077, ADR-084, ADR-086.
Le Template Studio v2 est **data-driven** : tout template se décrit par des rows DB + assets, jamais par du code.

## NE JAMAIS FAIRE (smoke test enforced)

### Moteur / runtime

- **Créer un `.tsx` par template.** Tout passe par `templates-remotion/src/runtime/TemplateRuntime.tsx`. Si une capacité manque, l'ajouter au moteur générique — jamais à un template spécifique.
- **Laisser un `template_text_fields.layer_id` NULL.** La colonne est NOT NULL depuis ADR-086. Un texte appartient toujours à un layer (source de vérité pour la durée et l'alpha).
- **Utiliser `template_text_fields.duration_ms` comme durée effective.** La durée est héritée du layer parent (`template_layers.duration_ms`). Le runtime ignore la colonne autonome.
- **Créer un nouveau preset pour l'inverse d'un preset existant.** `zoom-out` = `zoom` + `direction: 'out'`. `fade-out` = `fade` + `direction: 'out'`. Pareil pour `slide-*` et `blur-in`.
- **Ajouter un slot image sans `anchor` + `fit_mode` explicites.** Les deux colonnes sont NOT NULL avec défauts ; surcharger à l'insertion quand nécessaire (`fill-width-anchor-top` pour photos détourées).
- **Lire un canal alpha WebM côté serveur.** Le `respect_alpha` est appliqué côté runtime Remotion uniquement (client ou worker Chrome).

### Workflow designer

- **Accepter un template livré sans `SPEC.md`.** Le gabarit `docs/templates/SPEC-TEMPLATE.md` est le contrat de livraison. Sans frontmatter YAML parsable, le script `template:import` refuse.
- **Uploader des assets WebM sans canal alpha** quand le layer contient des slots texte avec `respect_alpha: true`. Le masque ne fonctionnerait pas.
- **Livrer des time-codes absolus par slot.** Les slots héritent du layer parent. Un slot n'a pas de `appearAt` autonome (la colonne existe pour backward-compat, ignorée par la runtime v2).

### Fonts

- **Hardcoder une police dans `FONT_FAMILIES`** du dashboard (`admin-field-editor.component.ts`). Passer par la table `template_fonts` + endpoint `GET /api/remotion-templates/fonts`.
- **Référencer une police absente de `template_fonts`.** Le validator Joi côté serveur doit refuser une référence à une police inconnue.

### API / upload

- **Exposer une route d'upload WebM sans guard `super_admin` + Joi.** La route `POST /api/remotion-templates/upload` est réservée (templates = asset partagé de la flotte).
- **Importer depuis les controllers `../config/database` directement.** Repository pattern obligatoire (`templateStudioRepository`).

### Backward-compat

- **Modifier la migration `add-template-studio-v2.sql` déjà en production.** Toute évolution passe par une nouvelle migration `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` (voir `add-template-studio-v2-layer-parent-safe-zone.sql` pour le pattern ADR-086).
- **Casser le rendu des templates existants** (BUT Simple, BUT Img Joueur V2). Chaque migration doit inclure un backfill safe et les défauts doivent préserver le comportement antérieur.

## Invariants positifs (à respecter)

- Le **layer est le conteneur de vérité** : durée, alpha, scope des slots enfants.
- L'**admin définit les safe-zones** une fois, le user les subit (ne peut pas déplacer).
- Les **animations sont paramétriques** : `preset` + `direction` + options (scaleFrom, scaleTo, durationMs).
- Tout nouveau template = **rows DB + assets FTP**. Rien d'autre.

## Référence

- [ADR-086](../../docs/adr/ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md)
- [Workflow designer](../../docs/templates/DESIGNER_WORKFLOW.md)
- [Gabarit SPEC](../../docs/templates/SPEC-TEMPLATE.md)
