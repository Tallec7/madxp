# ADR-086: Template Studio v2 — Textes enfants de layer, safe-zones image, animations réversibles

**Date** : 2026-04-22
**Statut** : Accepté
**Format** : Léger
**Précédents** : ADR-075 (Template Studio v2), ADR-077 (Preview & Uploads), ADR-084 (Fonts + visibility + scale)

---

## Contexte

Le Template Studio v2 couvre ~70 % des besoins designer (couches, slots, variants, animations preset). Un nouveau template ("Joueur détaillé") exposé par le designer met en évidence 4 manques qui **bloquent l'industrialisation** (sans ces capacités, chaque template demande un `.tsx` ad hoc — contraire au principe de V2 "zéro code par template") :

1. **Textes orphelins de layer** — aujourd'hui un `template_text_fields` n'a pas de FK vers `template_layers`. Il possède ses propres `duration_ms` et `appearAt`, ce qui :
   - oblige le designer à jongler avec des time-codes au lieu de raisonner en couches ;
   - empêche l'héritage de durée quand un layer change ;
   - rend impossible le principe "le texte apparaît dans les zones alpha du layer" (principe cadré avec le designer : _le layer est le conteneur de vérité_).

2. **Images sans safe-zone** — le rendu actuel utilise `objectFit: 'contain'` figé. Un slot "photo joueur" détouré doit se caler _tête en haut, largeur remplie, pieds pouvant dépasser_. Il n'existe aucune primitive `fit_mode` custom ni notion de rectangle safe.

3. **Animations non réversibles** — les presets `fade`, `slide-up`, `slide-down`, `scale-in`, `blur-in` existent uniquement en direction "in". Un `zoom-out` de titre exige aujourd'hui un nouveau preset codé en dur, alors que c'est mathématiquement le même moteur avec `direction: 'out'`.

4. **Pas de preset `logo-pop`** pour l'animation logo standard (scale 0.3→1 + opacity 0→1).

Principes cadrants actés avec le designer :

- Le **layer est le conteneur de vérité** : durée, alpha, scope des slots enfants.
- Les **safe-zones** sont définies par l'admin une fois, figées pour le user (rôle "user" = remplissage de valeurs uniquement).
- Les **animations** sont des presets réversibles (flag `direction`), pas des presets dédupliqués.
- **Industrialisation** : tout nouveau template = SQL seed + assets. Jamais un nouveau `.tsx`.

---

## Décision

### 1. Textes enfants d'un layer (`layer_id` FK + `respect_alpha`)

- Ajout de `template_text_fields.layer_id UUID NOT NULL` (FK vers `template_layers.id ON DELETE CASCADE`).
- Ajout de `template_text_fields.respect_alpha BOOLEAN NOT NULL DEFAULT FALSE` : quand `true`, `TemplateRuntime.tsx` applique un masque dérivé du WebM du layer parent (canal alpha → zones visibles).
- La **durée du texte est héritée du layer parent** : on conserve `duration_ms` en colonne pour backward-compat mais la runtime l'ignore (lit `layer.duration_ms`). Migration backfill : `UPDATE template_text_fields SET layer_id = (SELECT id FROM template_layers WHERE template_id = tf.template_id AND z_index = 1)` pour les rows existantes (premier layer par défaut).
- Smoke guard : `smoke-remotion` vérifie `layer_id IS NOT NULL` sur toutes les rows V2 après migration.

### 2. Safe-zones image (`anchor` + `fit_mode` + rectangle safe)

Nouvelles colonnes sur `template_image_slots` :

| Colonne           | Type         | Défaut      | Description                                                  |
| ----------------- | ------------ | ----------- | ------------------------------------------------------------ |
| `anchor`          | VARCHAR(16)  | `'center'`  | `top-left`\|`top-center`\|`top-right`\|`center`\|`bottom-*`  |
| `fit_mode`        | VARCHAR(32)  | `'contain'` | `contain`\|`cover`\|`fill-width-anchor-top`\|`fill-height-*` |
| `safe_top_pct`    | NUMERIC(5,2) | NULL        | Offset haut du rectangle safe (% du canvas)                  |
| `safe_left_pct`   | NUMERIC(5,2) | NULL        | Offset gauche                                                |
| `safe_width_pct`  | NUMERIC(5,2) | NULL        | Largeur du rectangle                                         |
| `safe_height_pct` | NUMERIC(5,2) | NULL        | Hauteur du rectangle                                         |
| `overflow`        | VARCHAR(16)  | `'hidden'`  | `hidden`\|`bottom`\|`top`\|`visible` — direction autorisée   |

Le nouveau `fit_mode: 'fill-width-anchor-top'` :

- remplit la **largeur** du rectangle safe (`safe_width_pct` × canvas.width),
- ancre le haut de l'image sur `safe_top_pct`,
- laisse déborder par le bas (`overflow: 'bottom'` = visible),
- préserve le ratio natif de l'image.

Implémentation côté runtime : wrapper `<div>` positionné absolument sur le rectangle safe, avec `overflow: visible` côté `bottom` et `<img width="100%" style="object-fit: none; object-position: top">`.

### 3. Animations réversibles (`direction: in|out`)

- Ajout de `animation_presets.supports_reverse BOOLEAN DEFAULT FALSE`.
- Ajout de `template_text_fields.animation_direction VARCHAR(4) DEFAULT 'in'` (CHECK in `('in','out')`).
- Ajout de `template_image_slots.animation_direction VARCHAR(4) DEFAULT 'in'`.
- `animations.ts::computeAnimation(preset, { direction, ... })` applique l'interpolation inversée quand `direction === 'out'` (swap `from`/`to`, phase de sortie en fin de plage au lieu d'entrée au début).
- Nouveau preset `zoom` (paramétrique : `scaleFrom`, `scaleTo`) — remplace `scale-in` qui devient un alias (`zoom` + `direction=in` + scaleFrom=0.7).
- Nouveau preset `logo-pop` : équivalent de l'animation logo BUT Simple (scale 0.3→1.0 + opacity 0→1, spring, 600 ms).
- `fade`, `slide-up`, `slide-down`, `blur-in` passent tous à `supports_reverse=TRUE`.

### 4. UI admin — extension des composants existants

| Composant                | Ajout                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `admin-field-editor`     | Sélecteur "Layer parent" (dropdown des layers du template), toggle `respect_alpha`, toggle `Direction: in ⇄ out` |
| `admin-canvas-overlay`   | Widget rectangle safe-zone (rouge, draggable/resizable) pour image slots                                         |
| `admin-layers-panel`     | Indicateur "N slots enfants" par layer                                                                           |
| Nouveau composant upload | `admin-webm-upload.component.ts` — upload WebM layer/variant vers FTP via `/api/remotion-templates/upload`       |

Route backend nouvelle : `POST /api/remotion-templates/upload` (multipart, guard super_admin, rate limit, passe à `storage.service.ts`).

### 5. Workflow designer — gabarit `SPEC.md` + script d'import

- `docs/templates/DESIGNER_WORKFLOW.md` — convention de livrables (dossier Drive `template-<slug>/`, nommage assets, fonts, refs visuelles).
- `docs/templates/SPEC-TEMPLATE.md` — gabarit rempli par le designer (layers + slots + animations en YAML frontmatter + prose).
- `central-server/src/scripts/template-import.ts` — CLI `npm run template:import <path/to/spec.md>` qui :
  - parse le SPEC.md (frontmatter YAML),
  - upload assets FTP (layers WebM, fonts, refs),
  - génère le SQL seed (INSERT INTO neopro_templates + variants + layers + text_fields + image_slots),
  - exécute la migration idempotente (ON CONFLICT DO UPDATE sur slug).

Ce script est un **fallback** : dès que l'UI admin expose tous les paramètres, le designer peut composer directement dans le Studio. Le SPEC.md reste utile pour versionner le contrat de template.

### 6. Font dynamique — **différée**

ADR-084 charge Bulevar et General Sans statiquement (fonts.ts + public/ + styles.scss) — il n'existe **pas** de table `template_fonts`. Tant que le nombre de fonts reste limité, ce chargement statique suffit.

Une migration séparée créera `template_fonts` (name, woff2_url, status) quand un designer voudra livrer une font via SPEC.md sans passer par un commit. Dans l'intervalle, le script `template:import` refuse les fonts non présentes dans `fonts.ts` (whitelist statique).

---

## Fichiers modifiés

| Couche    | Fichiers                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB        | `add-template-studio-v2-layer-parent-safe-zone.sql` (migration)                                                                                                                                                     |
| Remotion  | `runtime/TemplateRuntime.tsx`, `runtime/animations.ts`, `runtime/fit-modes.ts` (new), `runtime/alpha-mask.ts` (new)                                                                                                 |
| Server    | `types/template-studio.types.ts`, `repositories/template-studio.repository.ts`, `middleware/validation.ts`, `controllers/remotion-templates.controller.ts`, `routes/remotion-templates.routes.ts` (ajout `/upload`) |
| Dashboard | `admin-field-editor.component.ts` (+ HTML/SCSS), `admin-canvas-overlay.component.ts`, `admin-layers-panel.component.ts`, `admin-webm-upload.component.ts` (new), `remotion-templates.types.ts`                      |
| Scripts   | `scripts/template-import.ts` (new), `scripts/seed-joueur-detaille.sql` (new)                                                                                                                                        |
| Docs      | `docs/templates/DESIGNER_WORKFLOW.md`, `docs/templates/SPEC-TEMPLATE.md`, `.claude/rules/templates.md`                                                                                                              |
| Tests     | `smoke-remotion.test.ts`, `smoke-dashboard-guards.test.ts`                                                                                                                                                          |

---

## Conséquences

- **Backward-compatible** : toutes les nouvelles colonnes ont des défauts safe. BUT Simple et BUT Img Joueur V2 continuent de rendre identiquement (le backfill attache les textes existants au layer z_index=1, la durée reste celle du layer).
- **Industrialisation effective** : validation end-to-end avec le seed "Joueur détaillé" (5 layers, safe-zone photo, zoom-out titre, logo-pop, layout asymétrique). Zéro `.tsx` créé.
- **Smoke guards nouveaux** :
  - `template_text_fields.layer_id NOT NULL` (post-backfill)
  - `animations.ts` exporte `zoom`, `logo-pop` et accepte `direction`
  - `TemplateRuntime.tsx` lit `layer_id` et ignore `duration_ms` autonome
  - `fit-modes.ts` exporte `fill-width-anchor-top`
  - Route `POST /api/remotion-templates/upload` guard super_admin + Joi
- **Risques** :
  - Migration backfill doit être testée sur une copie prod (volume `template_text_fields` inconnu).
  - `respect_alpha` = lecture du canal alpha du WebM côté runtime → coût CPU à mesurer (optimisation différée si < 100 ms par frame).
- **Deferred** :
  - Studio WYSIWYG complet (drag-drop de layers depuis une galerie, preview multi-variants côte-à-côte) — reporté tant que < 10 templates en prod.
  - Versioning de templates avec rollback UI — reporté.

---

## Règles "NE JAMAIS FAIRE" (à ajouter dans `.claude/rules/templates.md`)

- Ne pas créer un `.tsx` par template (tout passe par `TemplateRuntime`).
- Ne pas laisser un `template_text_fields.layer_id` NULL (smoke test enforced).
- Ne pas utiliser `duration_ms` autonome sur un text field (hérite du layer parent).
- Ne pas ajouter un slot image sans `anchor` + `fit_mode` explicites.
- Ne pas créer un nouveau preset pour l'inverse d'un preset existant — utiliser `direction: 'out'`.
- Ne pas hardcoder une font dans `FONT_FAMILIES` — passer par `template_fonts`.
- Ne pas exposer de route d'upload WebM sans guard `super_admin` + Joi.
