# ADR-084: Template Studio v2 — Polices custom, visibilité permanente et scale-in paramétrable

**Date** : 2026-04-21
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Le Template Studio v2 (ADR-075) utilisait exclusivement des polices Google Fonts et des paramètres d'animation scale-in codés en dur (`0.7 → 1.0`). Trois besoins sont apparus en production :

1. **Polices propriétaires** : Bulevar (brand sport) et General Sans (titrage) ne sont pas sur Google Fonts — elles doivent être disponibles côté rendu Remotion (worker Chrome headless) ET côté preview dashboard.
2. **Texte sans timecode** : certains layers (watermark, badge permanent, numéro de score en fond) doivent être visibles sur toute la durée sans animation d'entrée — l'ancien modèle obligeait à renseigner un `appearAt` peu intuitif.
3. **Scale-in configurable** : les designers veulent contrôler les valeurs de départ/arrivée du scale (ex: `1.05 → 1.0` pour un légèr shrink-in, ou `0.3 → 1.0` pour un reveal dramatique) sans créer un nouveau preset.

---

## Décision

### 1. Polices custom OTF locales

- Fichiers OTF stockés dans `templates-remotion/public/` (accessible par `staticFile()` dans le worker Chrome) et dans `central-dashboard/src/assets/fonts/` (accessible par Angular).
- Chargement côté worker : `templates-remotion/src/fonts.ts` → `registerCustomFonts()` appelé au boot dans `index.ts` avant `registerRoot()`.
- Chargement côté dashboard : `@font-face` rules dans `central-dashboard/src/styles.scss` avec `font-display: swap`.
- Polices ajoutées au début de `FONT_FAMILIES` dans `admin-field-editor.component.ts` avec un commentaire de guide pour les futures additions.

### 2. Champ `always_visible` sur `template_text_fields`

- Nouvelle colonne `always_visible BOOLEAN NOT NULL DEFAULT FALSE`.
- Quand `true` : `TemplateRuntime.tsx` court-circuite entièrement `computeAnimation()` et expose directement `opacity: 1, transform: translate(0,0)`.
- L'éditeur affiche une checkbox "Toujours visible (sans timecode)" — si cochée, la section Timing est masquée pour éviter la confusion.

### 3. Paramètres `scale_from` / `scale_to` sur `template_text_fields`

- Deux nouvelles colonnes `NUMERIC(4,2)` avec défauts `0.70` / `1.00` (backward-compatible — aucun template existant ne change).
- `computeAnimation('scale-in', { scaleFrom, scaleTo })` utilise ces valeurs à la place des constantes hardcodées.
- Visible dans l'UI uniquement quand `animation === 'scale-in'`.

---

## Fichiers modifiés

| Couche    | Fichiers                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB        | `add-template-text-field-visibility-scale.sql`                                                                                                                                |
| Remotion  | `fonts.ts` (new), `index.ts`, `runtime/animations.ts`, `runtime/TemplateRuntime.tsx`                                                                                          |
| Server    | `types/template-studio.types.ts`, `repositories/template-studio.repository.ts`, `middleware/validation.ts`                                                                    |
| Dashboard | `styles.scss`, `assets/fonts/` (3 OTF), `studio-player/animations.ts`, `remotion-templates.types.ts`, `remotion-templates-data.service.ts`, `admin-field-editor.component.ts` |

---

## Conséquences

- **Backward-compatible** : `always_visible DEFAULT FALSE`, `scale_from DEFAULT 0.70`, `scale_to DEFAULT 1.00` — les templates existants se comportent identiquement.
- **Smoke tests** : nouveaux guards dans `smoke-remotion.test.ts` pour protéger la cohérence cross-layer (fonts dans public/, Joi, colMap, TemplateRuntime alwaysVisible, scale params).
- **Fonts à ajouter** : toute nouvelle police custom suit le même protocole (4 endroits : `public/`, `assets/fonts/`, `fonts.ts`, `styles.scss`).
