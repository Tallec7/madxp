# Plan — Extension Remotion V2 (N-layers + safe-zones + animations réversibles)

**Date de création** : 2026-04-22
**ADR de référence** : [ADR-086](../../docs/adr/ADR-086-template-studio-n-layers-safe-zones-reversible-animations.md)
**Durée estimée** : 3-4 jours
**Validation finale** : render réussi du template "Joueur détaillé" (5 layers, zoom-out titre, logo-pop, safe-zone photo, layout asymétrique)

---

## Objectif

Livrer les 4 capacités manquantes qui bloquent l'industrialisation du Template Studio v2 :

1. Textes enfants de layer (FK + `respect_alpha`)
2. Safe-zones image + `fit_mode: fill-width-anchor-top`
3. Animations réversibles (`direction: in|out`) + presets `zoom` et `logo-pop`
4. Upload WebM admin depuis l'UI + font dynamique DB-driven

Validation : seed SQL "Joueur détaillé" rendu par `TemplateRuntime.tsx` sans aucun nouveau `.tsx`.

---

## Vagues d'exécution

```
Wave 1 (parallèle) : Migration DB   │   Gabarit SPEC.md designer   │   ADR-086 review
Wave 2 (parallèle) : Runtime engine │   Animations presets          │   Types + Joi + Repository
Wave 3 (parallèle) : UI admin       │   Route upload WebM           │   Script template-import
Wave 4 (séquentiel): Seed "Joueur détaillé" → render validation → smoke tests → docs
```

---

## Wave 1 — Fondations (parallélisable, 0.5 jour)

### Tâche 1.1 — Migration DB

**Fichier** : `central-server/src/scripts/migrations/add-template-studio-v2-layer-parent-safe-zone.sql` (new)

**read_first** :

- `central-server/src/scripts/migrations/add-template-studio-v2.sql` (schéma existant)
- `central-server/src/scripts/migrations/add-template-text-field-visibility-scale.sql` (pattern ADR-084)

**action** :

```sql
-- 1. Text fields deviennent enfants d'un layer
ALTER TABLE template_text_fields
  ADD COLUMN IF NOT EXISTS layer_id UUID REFERENCES template_layers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS respect_alpha BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS animation_direction VARCHAR(4) NOT NULL DEFAULT 'in'
    CHECK (animation_direction IN ('in','out'));

-- Backfill : attacher au premier layer (z_index=1) de chaque template
UPDATE template_text_fields tf
SET layer_id = (
  SELECT id FROM template_layers tl
  WHERE tl.template_id = tf.template_id
  ORDER BY tl.z_index ASC LIMIT 1
)
WHERE tf.layer_id IS NULL;

-- Après backfill, rendre la colonne NOT NULL
ALTER TABLE template_text_fields ALTER COLUMN layer_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_text_fields_layer_id ON template_text_fields(layer_id);

-- 2. Safe-zones sur image slots
ALTER TABLE template_image_slots
  ADD COLUMN IF NOT EXISTS anchor VARCHAR(16) NOT NULL DEFAULT 'center'
    CHECK (anchor IN ('top-left','top-center','top-right','center-left','center','center-right','bottom-left','bottom-center','bottom-right')),
  ADD COLUMN IF NOT EXISTS fit_mode VARCHAR(32) NOT NULL DEFAULT 'contain'
    CHECK (fit_mode IN ('contain','cover','fill-width-anchor-top','fill-height-anchor-left')),
  ADD COLUMN IF NOT EXISTS safe_top_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS safe_left_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS safe_width_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS safe_height_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS overflow VARCHAR(16) NOT NULL DEFAULT 'hidden'
    CHECK (overflow IN ('hidden','visible','top','bottom','left','right')),
  ADD COLUMN IF NOT EXISTS animation_direction VARCHAR(4) NOT NULL DEFAULT 'in'
    CHECK (animation_direction IN ('in','out'));

-- 3. Animations presets réversibles (si table existe, sinon column sur text_fields suffit)
-- Pas de table animation_presets actuellement — les presets sont des string literals.
-- On documente uniquement : la validation Joi côté serveur doit accepter les nouvelles valeurs
-- ('zoom', 'logo-pop') dans middleware/validation.ts (fait en Wave 2 tâche 2.3).

-- 4. Fonts — ajouter woff2_url pour chargement dynamique
ALTER TABLE template_fonts
  ADD COLUMN IF NOT EXISTS woff2_url VARCHAR(512);
```

**acceptance_criteria** :

- `\d template_text_fields` contient `layer_id uuid NOT NULL` et `respect_alpha boolean DEFAULT false` et `animation_direction character varying(4) DEFAULT 'in'`
- `\d template_image_slots` contient `anchor`, `fit_mode`, `safe_top_pct`, `safe_left_pct`, `safe_width_pct`, `safe_height_pct`, `overflow`, `animation_direction`
- `SELECT COUNT(*) FROM template_text_fields WHERE layer_id IS NULL` retourne `0`
- `SELECT COUNT(*) FROM template_layers tl JOIN template_text_fields tf ON tf.layer_id = tl.id` > 0 (la FK est bien résolue)
- Index `idx_text_fields_layer_id` existe

### Tâche 1.2 — Gabarit SPEC.md designer

**Fichiers** :

- `docs/templates/DESIGNER_WORKFLOW.md` (new)
- `docs/templates/SPEC-TEMPLATE.md` (new, gabarit vierge)

**action** : copier la structure proposée dans la conversation (workflow + arborescence Drive + YAML frontmatter layers/slots/animations).

**acceptance_criteria** :

- `docs/templates/DESIGNER_WORKFLOW.md` existe et contient les sections "Livrables designer", "Vocabulaire", "Workflow de bout en bout"
- `docs/templates/SPEC-TEMPLATE.md` contient un YAML frontmatter parsable avec clés `template.slug`, `template.duration_seconds`, `layers[]`, `slots[]`

### Tâche 1.3 — `.claude/rules/templates.md`

**Fichier** : `.claude/rules/templates.md` (new)

**action** : lister les règles "NE JAMAIS FAIRE" de l'ADR-086 (section finale).

**acceptance_criteria** :

- fichier existe et contient "NE JAMAIS FAIRE"
- grep `layer_id NULL` retourne au moins 1 match
- grep `direction: 'out'` retourne au moins 1 match

---

## Wave 2 — Moteur + API (parallélisable, 1.5 jour)

### Tâche 2.1 — Runtime `TemplateRuntime.tsx` + helpers

**Fichiers** :

- `templates-remotion/src/runtime/TemplateRuntime.tsx` (edit)
- `templates-remotion/src/runtime/fit-modes.ts` (new)
- `templates-remotion/src/runtime/alpha-mask.ts` (new)

**read_first** :

- `templates-remotion/src/runtime/TemplateRuntime.tsx` (état actuel)
- `templates-remotion/src/runtime/animations.ts`
- `docs/adr/ADR-075-template-studio.md`

**action** :

1. Dans `TemplateRuntime.tsx`, quand on rend un text field : lire `field.layer_id`, récupérer le layer parent, utiliser `layer.duration_ms` pour `durationInFrames` (pas `field.duration_ms`).
2. Si `field.respect_alpha === true` : wrapper le texte avec `alpha-mask.ts::AlphaMask` qui utilise le WebM du layer parent comme `-webkit-mask-image` via `OffthreadVideo` + canvas (extraction alpha).
3. Pour un image slot : calculer style via `fit-modes.ts::computeImageStyle({ anchor, fit_mode, safe: {top,left,width,height}, overflow })`. Le mode `fill-width-anchor-top` :
   ```ts
   return {
     position: 'absolute',
     top: `${safe.top}%`,
     left: `${safe.left}%`,
     width: `${safe.width}%`,
     height: 'auto',
     overflow: overflow === 'bottom' ? 'visible' : 'hidden',
     objectFit: 'none',
     objectPosition: 'top',
   };
   ```
4. Passer `field.animation_direction` à `computeAnimation()`.

**acceptance_criteria** :

- `grep "layer_id" templates-remotion/src/runtime/TemplateRuntime.tsx` retourne au moins 2 matches
- `grep "fill-width-anchor-top" templates-remotion/src/runtime/fit-modes.ts` retourne au moins 1 match
- `grep "respect_alpha\|respectAlpha" templates-remotion/src/runtime/` retourne au moins 3 matches
- `ls templates-remotion/src/runtime/alpha-mask.ts fit-modes.ts` — les deux fichiers existent
- `cd templates-remotion && npm run build` exit 0

### Tâche 2.2 — Animations presets (`zoom`, `logo-pop`, reverse)

**Fichier** : `templates-remotion/src/runtime/animations.ts` (edit)

**read_first** :

- `templates-remotion/src/runtime/animations.ts` (état actuel : none, fade, slide-up, slide-down, scale-in, blur-in)
- `docs/adr/ADR-084-template-studio-fonts-visibility-scale.md` (pattern scaleFrom/scaleTo)

**action** :

1. Étendre la signature : `computeAnimation(preset, frame, { direction = 'in', scaleFrom = 0.7, scaleTo = 1.0, durationMs = 600 })`.
2. Quand `direction === 'out'` : swap `from`/`to`, déclencher l'animation en fin de durée du layer (pas au début).
3. Ajouter preset `'zoom'` : interpole `scale` de `scaleFrom` vers `scaleTo` (+ opacity 0→1 if in / 1→0 if out).
4. Ajouter preset `'logo-pop'` : spring(`scale` 0.3→1) + linéaire(`opacity` 0→1), 600 ms, `supportsReverse: false`.
5. Marquer `fade`, `slide-up`, `slide-down`, `blur-in` comme `supportsReverse: true` dans leur implémentation (branch `direction === 'out'`).
6. Mirror dans `central-dashboard/src/app/features/remotion-templates/studio-player/animations.ts` (symétrie imposée par smoke `smoke-remotion`).

**acceptance_criteria** :

- `grep "'zoom'\|'logo-pop'" templates-remotion/src/runtime/animations.ts` retourne ≥ 2 matches
- `grep "direction" templates-remotion/src/runtime/animations.ts` retourne ≥ 4 matches
- `grep "'zoom'\|'logo-pop'" central-dashboard/src/app/features/remotion-templates/studio-player/animations.ts` retourne ≥ 2 matches
- `cd templates-remotion && npx tsc --noEmit` exit 0

### Tâche 2.3 — Types + Joi + Repository (server)

**Fichiers** :

- `central-server/src/types/template-studio.types.ts` (edit)
- `central-server/src/middleware/validation.ts` (edit)
- `central-server/src/repositories/template-studio.repository.ts` (edit)

**read_first** :

- `central-server/src/types/template-studio.types.ts` (état actuel)
- `central-server/src/middleware/validation.ts` (section remotion templates)

**action** :

1. Types : ajouter `layer_id: string`, `respect_alpha: boolean`, `animation_direction: 'in'|'out'` sur `TemplateTextField`. Ajouter `anchor`, `fit_mode`, `safe_*_pct`, `overflow`, `animation_direction` sur `TemplateImageSlot`. Étendre union `TemplateAnimation` : `'none'|'fade'|'slide-up'|'slide-down'|'scale-in'|'blur-in'|'zoom'|'logo-pop'`.
2. Joi : étendre `textFieldSchema` et `imageSlotSchema` avec les nouvelles clés + whitelist des enums.
3. Repository : étendre `mapTextFieldRow`, `mapImageSlotRow`, `insertTextField`, `insertImageSlot`, `updateTextField`, `updateImageSlot` pour include les nouvelles colonnes (colMap + RETURNING).

**acceptance_criteria** :

- `grep "layer_id" central-server/src/types/template-studio.types.ts` ≥ 1 match
- `grep "anchor\|fit_mode\|safe_top_pct" central-server/src/types/template-studio.types.ts` ≥ 4 matches
- `grep "'zoom'\|'logo-pop'" central-server/src/middleware/validation.ts` ≥ 2 matches
- `grep "layer_id\|respect_alpha\|anchor\|fit_mode" central-server/src/repositories/template-studio.repository.ts` ≥ 6 matches
- `cd central-server && npx tsc --noEmit` exit 0
- `npm run test:server -- --testPathPattern='template-studio'` exit 0

---

## Wave 3 — UI admin + Upload + Import CLI (parallélisable, 1 jour)

### Tâche 3.1 — `admin-field-editor` extension

**Fichier** : `central-dashboard/src/app/features/remotion-templates/admin-field-editor/admin-field-editor.component.ts` (+ HTML/SCSS)

**read_first** :

- fichier actuel
- `central-dashboard/src/app/features/remotion-templates/remotion-templates.types.ts`

**action** :

1. Ajouter `<select>` "Layer parent" peuplé depuis `@Input() layers: TemplateLayer[]`.
2. Ajouter checkbox "Respecter l'alpha du layer" liée à `field.respect_alpha`.
3. Ajouter toggle `direction: in ⇄ out` visible uniquement si preset ∈ {fade, slide-\*, blur-in, zoom, scale-in}.
4. Peupler `FONT_FAMILIES` depuis un `@Input() fonts: TemplateFont[]` (fetch via `RemotionTemplatesDataService.listFonts()`) avec fallback const actuelle si vide.

**acceptance_criteria** :

- `grep "layer parent\|layerId\|layer_id" admin-field-editor.component.html` ≥ 1 match
- `grep "respect_alpha\|respectAlpha" admin-field-editor.component.ts` ≥ 2 matches
- `grep "animation_direction\|animationDirection" admin-field-editor.component.ts` ≥ 2 matches
- `cd central-dashboard && npm run build:central` exit 0

### Tâche 3.2 — `admin-canvas-overlay` safe-zone widget

**Fichier** : `central-dashboard/src/app/features/remotion-templates/admin-canvas-overlay/admin-canvas-overlay.component.ts`

**action** :

1. Pour un image slot sélectionné, dessiner un rectangle rouge représentant la safe-zone (`safe_top_pct`, `safe_left_pct`, `safe_width_pct`, `safe_height_pct`).
2. Handles de resize aux 4 coins + drag pour repositionner. Emit `(safeZoneChange)`.
3. Dropdown `anchor` (9 valeurs) et `fit_mode` (4 valeurs) inline avec preview instantanée.
4. Toggle `overflow` visuel (bordure pointillée pour "visible", pleine pour "hidden").

**acceptance_criteria** :

- `grep "safe_top_pct\|safeTopPct" admin-canvas-overlay.component.ts` ≥ 2 matches
- `grep "anchor\|fit_mode\|fitMode" admin-canvas-overlay.component.html` ≥ 2 matches
- Test Karma `admin-canvas-overlay.component.spec.ts` couvre "emits safeZoneChange on drag" (1 test minimum)

### Tâche 3.3 — Route upload WebM + composant upload

**Fichiers** :

- `central-server/src/routes/remotion-templates.routes.ts` (edit — ajouter `POST /upload`)
- `central-server/src/controllers/remotion-templates.controller.ts` (edit — handler `uploadAsset`)
- `central-dashboard/src/app/features/remotion-templates/admin-webm-upload/admin-webm-upload.component.ts` (new)

**read_first** :

- `central-server/src/services/storage.service.ts` (pattern FTP upload)
- route existante équivalente (ex: `sites.routes.ts` pour multipart)

**action** :

1. Route : `POST /api/remotion-templates/upload` avec middleware `multer` (memory), guard `requireRole('super_admin')`, `sensitiveRateLimit` (30/min), Joi query (`target: 'layer'|'variant'|'font'`, `templateId`).
2. Controller : valide mimetype (`video/webm` pour layer/variant, `font/woff2|application/font-woff2` pour font), délègue à `storage.service.ts::uploadAsset()`, retourne `{ url }`.
3. Composant Angular : input file + drag-drop, appelle `RemotionTemplatesDataService.uploadAsset(file, target)`, emit `(uploaded)` avec URL.

**acceptance_criteria** :

- `grep "/upload" central-server/src/routes/remotion-templates.routes.ts` ≥ 1 match
- `grep "requireRole.*super_admin" central-server/src/controllers/remotion-templates.controller.ts` (handler upload) ≥ 1 match
- `grep "video/webm\|font/woff2" central-server/src/controllers/remotion-templates.controller.ts` ≥ 2 matches
- `ls central-dashboard/src/app/features/remotion-templates/admin-webm-upload/` contient `.component.ts`, `.component.html`, `.component.spec.ts`
- Test Jest `remotion-templates.upload.test.ts` : 403 si role != super_admin, 413 si fichier > 50 MB, 200 + URL si OK

### Tâche 3.4 — Script CLI `template:import`

**Fichier** : `central-server/src/scripts/template-import.ts` (new)

**read_first** :

- un SPEC.md d'exemple (à créer en tâche 1.2)
- `central-server/src/services/storage.service.ts`

**action** :

1. Parse SPEC.md : lit le frontmatter YAML (`template`, `layers`, `slots`, `fonts`).
2. Valide le schéma avec Joi (même schémas que le controller).
3. Upload les assets FTP (chemins relatifs au dossier SPEC).
4. Génère et exécute un SQL transactionnel idempotent : `INSERT INTO neopro_templates ... ON CONFLICT (slug) DO UPDATE`, idem pour variants/layers/text_fields/image_slots, avec `DELETE FROM ... WHERE template_id = X` avant re-insert pour éviter les orphelins.
5. Exposé dans `package.json` : `"template:import": "ts-node src/scripts/template-import.ts"`.

**acceptance_criteria** :

- `ls central-server/src/scripts/template-import.ts` existe
- `grep "template:import" central-server/package.json` ≥ 1 match
- Exécuter `npm run template:import -- docs/templates/examples/joueur-detaille/SPEC.md --dry-run` affiche le SQL sans l'exécuter et exit 0

---

## Wave 4 — Validation end-to-end (séquentiel, 1 jour)

### Tâche 4.1 — Seed "Joueur détaillé"

**Fichiers** :

- `docs/templates/examples/joueur-detaille/SPEC.md` (new — gabarit rempli par le designer, ici créé à la main en attendant les vrais assets)
- `docs/templates/examples/joueur-detaille/assets/` (placeholders WebM/images en attendant livraison designer)
- `central-server/src/scripts/migrations/seed-joueur-detaille-template.sql` (new — seed généré par le script CLI)

**read_first** :

- tâches 1.2 (gabarit SPEC), 3.4 (script CLI)

**action** :

1. Rédiger SPEC.md complet : 5 layers (A-logo, B-transition, C-titre+pattern, D-transition, E-joueur), 1 variant default, slots (titre avec animation `zoom` direction=out, logo avec `logo-pop`, prenom-nom à gauche centered-Y, numero au-dessus de photo-joueur, photo-joueur avec `fit_mode: fill-width-anchor-top`, nom-club-coin-haut-gauche et coin-bas-droite).
2. Avec les assets placeholders, lancer `npm run template:import`.
3. Copier le SQL généré dans la migration seed pour versioning.

**acceptance_criteria** :

- `ls docs/templates/examples/joueur-detaille/SPEC.md` existe
- `SELECT COUNT(*) FROM template_layers WHERE template_id = (SELECT id FROM neopro_templates WHERE slug = 'joueur-detaille')` retourne `5`
- `SELECT COUNT(*) FROM template_text_fields WHERE template_id = ... AND animation_direction = 'out'` retourne ≥ `1` (le titre zoom-out)
- `SELECT COUNT(*) FROM template_image_slots WHERE template_id = ... AND fit_mode = 'fill-width-anchor-top'` retourne ≥ `1` (photo joueur)

### Tâche 4.2 — Render de validation

**action** :

1. Lancer un render Remotion du template "Joueur détaillé" via le dashboard ou CLI worker.
2. Comparer visuellement aux refs designer (`Animation texte D (1/2)`, `Mise en page D`, `Mise en page F`).
3. Si divergence majeure, itérer sur les valeurs (position, safe-zone, durée layer). **Pas** sur le code.

**acceptance_criteria** :

- un fichier `.mp4` ou `.webm` est produit dans `/tmp/renders/joueur-detaille-validation.mp4`
- screenshot à la frame correspondant au titre zoom-out montre le texte à sa position finale avec scale 1.0
- screenshot à la frame du layer E montre la photo ancrée en haut de sa safe-zone, largeur remplie, débordement bas visible

### Tâche 4.3 — Smoke tests

**Fichiers** :

- `central-server/src/__tests__/smoke/smoke-remotion.test.ts` (edit)
- `central-server/src/__tests__/smoke/smoke-dashboard-guards.test.ts` (edit)

**action** :

1. Smoke `smoke-remotion` nouveaux guards :
   - `template_text_fields.layer_id NOT NULL` après migration
   - `animations.ts` contient `'zoom'` et `'logo-pop'` (côté Remotion ET côté dashboard)
   - `TemplateRuntime.tsx` contient `layer_id` et `fit-modes` et `alpha-mask`
   - Joi whitelist contient les nouveaux enums
2. Smoke `smoke-dashboard-guards` : `admin-field-editor` a sélecteur layer_id, `admin-canvas-overlay` a widget safe-zone.

**acceptance_criteria** :

- `npm run test:smoke:smart` — les 2 suites passent (0 failing)
- `npm run test:smoke` complet — 0 failing

### Tâche 4.4 — Documentation + commit final

**action** :

1. Mettre à jour `docs/adr/README.md` avec ADR-086.
2. Mettre à jour `docs/changelog/CHANGELOG.md`.
3. Si SAFe actif : mettre à jour `docs/safe/*.md` via `.claude/rules/safe-update.md`.
4. Commit + PR : `feat(templates): industrialisation V2 — N-layers, safe-zones, animations réversibles (ADR-086)`.

**acceptance_criteria** :

- `grep "ADR-086" docs/adr/README.md` ≥ 1 match
- PR créée et CI verte (lint + tests)

---

## Must-haves (goal-backward verification)

Le template "Joueur détaillé" DOIT être rendu correctement sans aucun fichier `.tsx` nouveau, en utilisant uniquement :

- [ ] 5 rows dans `template_layers`
- [ ] Le titre du layer C animé en **zoom-out** (preset `zoom`, direction `out`)
- [ ] Le logo du layer A animé en **logo-pop**
- [ ] La photo du layer E rendue en `fit-mode: fill-width-anchor-top` avec overflow bas visible
- [ ] Tous les textes rattachés à un `layer_id` (aucun NULL)
- [ ] L'admin peut modifier le template depuis l'UI existante (`admin-studio-panel`)
- [ ] L'admin peut uploader un nouveau WebM de layer depuis l'UI
- [ ] Le designer peut livrer un nouveau template via `SPEC.md` + script CLI
- [ ] Les templates existants (BUT Simple, BUT Img Joueur V2) rendent identiquement à avant (backward-compat)
- [ ] Tous les smoke tests passent

---

## Out of scope (deferred)

- Studio WYSIWYG complet avec drag-drop de layers depuis une galerie.
- Preview multi-variants côte-à-côte.
- UI de versioning template avec rollback visuel.
- Optimisation GPU du masque alpha (si < 100 ms par frame, acceptable).
- Templates autres que "Joueur détaillé" (fournis ultérieurement par le designer via SPEC.md).
