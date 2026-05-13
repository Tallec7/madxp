/**
 * Spec v1 — Schéma Zod source de vérité du système de templates Neopro.
 * Les types TypeScript sont dérivés via z.infer<…> en bas du fichier.
 *
 * Voir SPEC.md pour la sémantique. Ce fichier ne décrit que la structure.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes & validateurs partagés
// ─────────────────────────────────────────────────────────────────────────────

/** Marge de sécurité réseaux sociaux par défaut (pourcentages 0–100). */
export const SAFE_ZONE_DEFAULTS = {
  topPct: 5,
  bottomPct: 5,
  leftPct: 3,
  rightPct: 3,
} as const;

/** Canvas par défaut : paysage 16:9, 1920×1080, 25 fps. */
export const CANVAS_DEFAULTS = {
  width: 1920,
  height: 1080,
  fps: 25,
} as const;

/** Regex stricte pour `visibleIf` : `<option_key> == "<value>"`. */
export const VISIBLE_IF_REGEX =
  /^\s*([a-z_][a-z0-9_]{0,63})\s*==\s*"([^"]{0,200})"\s*$/i;

/** URLs rejetées (incident 2026-05-07). Voir SPEC §6.5. */
const BROKEN_URL_PATTERNS = [
  /up\.railway\.app\/remotion-preview\/public\//i,
  /up\.railway\.app\/[^?#]+\.(webm|mp4|mov)(?:[?#]|$)/i,
];

/**
 * Asset URL : soit URL absolue (http/https), soit chemin relatif servi par
 * `staticFile()` de Remotion (ex. "JOUEUR_but_A.webm", "masks/packshot-img").
 * Rejette les URLs cassées connues (incident 2026-05-07, SPEC §6.5).
 */
const assetUrl = z
  .string()
  .min(1)
  .refine(
    (url) => !BROKEN_URL_PATTERNS.some((re) => re.test(url)),
    { message: 'asset URL matches a known broken pattern (see SPEC §6.5)' }
  );

/** URL de fond optionnelle (variant) — peut être vide pour signifier "pas de fond". */
const variantBackgroundUrl = z
  .string()
  .refine(
    (url) => !url || !BROKEN_URL_PATTERNS.some((re) => re.test(url)),
    { message: 'asset URL matches a known broken pattern (see SPEC §6.5)' }
  );

/** Asset vidéo de layer : webm uniquement (cf. SPEC §6.1). mp4/mov interdits. */
const layerAssetUrl = assetUrl.refine(
  (url) => /\.webm(?:[?#]|$)/i.test(url),
  { message: 'layer assets must be .webm (VP9 yuva420p) — mp4/mov forbidden, see SPEC §6.1' }
);

const ratio01 = z.number().min(0).max(1);
/** Clé d'option : snake_case strict (utilisée dans `visibleIf`). */
const optionKey = z.string().regex(/^[a-z_][a-z0-9_]{0,63}$/);
/** Clé d'input utilisateur : identifiant JS valide (snake_case ou camelCase). */
const slotKey = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/);
const visibleIf = z
  .string()
  .regex(VISIBLE_IF_REGEX, 'visibleIf must match `key == "value"`')
  .nullable()
  .optional();

// ─────────────────────────────────────────────────────────────────────────────
// Enums & sous-types
// ─────────────────────────────────────────────────────────────────────────────

/** Valeurs alignées sur runtime/animations.ts (v0). */
export const animationPresetSchema = z.enum([
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'scale-in',
  'blur-in',
  'zoom',
  'scale-only',
]);

export const animationDirectionSchema = z.enum(['in', 'out']);

export const blendModeSchema = z.enum([
  'normal',
  'screen',
  'multiply',
  'overlay',
  'add',
  'lighten',
  'darken',
]);

export const anchorSchema = z.enum([
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]);

/** Valeurs alignées sur runtime/fit-modes.ts (v0). */
export const fitModeSchema = z.enum([
  'contain',
  'cover',
  'fill-width-anchor-top',
  'fill-height-anchor-left',
]);
export const overflowSchema = z.enum([
  'hidden', 'visible', 'top', 'bottom', 'left', 'right',
]);
export const alignSchema = z.enum(['left', 'center', 'right']);
export const textTransformSchema = z.enum(['none', 'uppercase', 'lowercase', 'capitalize']);

// ─────────────────────────────────────────────────────────────────────────────
// Canvas & fonts
// ─────────────────────────────────────────────────────────────────────────────

export const fontSchema = z.object({
  family: z.string(),
  url: z.string(),
  weight: z.number().int().min(100).max(900).default(400),
  style: z.enum(['normal', 'italic']).default('normal'),
});

export const canvasSchema = z.object({
  width: z.number().int().positive().default(CANVAS_DEFAULTS.width),
  height: z.number().int().positive().default(CANVAS_DEFAULTS.height),
  fps: z.number().int().positive().default(CANVAS_DEFAULTS.fps),
  /** Durée totale en ms. Doit être >= max(layer.startAt + layer.duration). */
  durationMs: z.number().int().positive(),
  fonts: z.array(fontSchema).default([]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Variant
// ─────────────────────────────────────────────────────────────────────────────

export const variantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** URL ou chemin staticFile du fond plein écran. Vide = pas de fond (sera noir). */
  backgroundVideoUrl: variantBackgroundUrl,
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer
// ─────────────────────────────────────────────────────────────────────────────

export const layerMaskSchema = z.object({
  top: ratio01.default(0),
  right: ratio01.default(0),
  bottom: ratio01.default(0),
  left: ratio01.default(0),
});

export const layerSchema = z.object({
  id: z.string().min(1),
  assetUrl: layerAssetUrl,
  /** Position dans la timeline (ms). Défaut 0. */
  startAt: z.number().min(0).default(0),
  /** Durée d'affichage (ms). */
  duration: z.number().positive(),
  zIndex: z.number().int(),
  mask: layerMaskSchema.default({ top: 0, right: 0, bottom: 0, left: 0 }),
  blendMode: blendModeSchema.optional(),
  /**
   * Source d'alpha pour servir de masque (cf. TextSlot.maskedBy / ImageSlot.maskedBy).
   * - 'self' : l'alpha du webm est extraite à la volée (recommandé, VP9 yuva420p).
   * - { kind: 'pngFrames', dir, threshold } : frames PNG pré-rendues, binarisées par luminance.
   *   Utile pour les assets v0 en yuv420p sans vrai alpha (transition).
   */
  alphaSource: z
    .union([
      z.literal('self'),
      z.object({
        kind: z.literal('pngFrames'),
        dir: z.string(),
        threshold: z.number().int().min(0).max(255).default(128),
      }),
    ])
    .default('self'),
});

/**
 * Référence à un layer servant de masque alpha pour un slot.
 * - `layerId` : le layer dont l'alpha est utilisée comme masque.
 * - `zIndexOverride` : si défini, le canvas masqué est inséré à ce zIndex dans la pile
 *   (ex. 3.5 pour glisser le canvas entre layer 3 et layer 4). Défaut : au-dessus de tout.
 * - `frameOffset` : décalage en frames entre la composition et l'alpha utilisée (cf. mémoire
 *   `feedback_mask_frame_offset` : centre=-1, bords=0 pour synchroniser texte et alpha packshot).
 */
export const maskedBySchema = z.object({
  layerId: z.string().min(1),
  zIndexOverride: z.number().optional(),
  frameOffset: z.number().int().default(0),
}).nullable().default(null);

// ─────────────────────────────────────────────────────────────────────────────
// Slots — base commune
// ─────────────────────────────────────────────────────────────────────────────

const slotBase = z.object({
  id: z.string().min(1),
  slotKey,
  /** Layer parent : hérite de sa fenêtre temporelle [startAt, startAt+duration]. */
  layerId: z.string().nullable().default(null),
  /** Apparition relative à la fenêtre du layer parent (ou à t=0 si layerId=null). En secondes. */
  appearAt: z.number().min(0).default(0),
  /** Durée d'animation d'apparition en secondes. Si layerId défini, défaut = duration du layer parent. */
  appearDuration: z.number().min(0).default(0.5),
  animation: animationPresetSchema.default('fade'),
  animationDirection: animationDirectionSchema.default('in'),
  scaleFrom: z.number().nonnegative().optional(),
  scaleTo: z.number().nonnegative().optional(),
  visibleIf,
});

// ─────────────────────────────────────────────────────────────────────────────
// TextSlot
// ─────────────────────────────────────────────────────────────────────────────

export const textTypoSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  color: z.string(), // CSS color (hex / rgb / etc.)
  align: alignSchema.default('center'),
  textTransform: textTransformSchema.default('none'),
  /** Multiplicateur de fontSize. 1.1 = défaut. 0.85 = serré. */
  lineHeight: z.number().positive().default(1.1),
  /** Espacement entre lettres en pixels (CSS letter-spacing). 0 = défaut. Positif = espacé. */
  letterSpacing: z.number().default(0),
});

export const textSlotSchema = slotBase.extend({
  defaultValue: z.string().default(''),
  position: z.object({ x: ratio01, y: ratio01 }),
  /** Largeur max du bloc texte (ratio du canvas). */
  maxWidth: ratio01.default(0.9),
  typo: textTypoSchema,
  /**
   * Si défini, le texte est rendu dans un canvas masqué par l'alpha du layer cible.
   * Visible UNIQUEMENT dans les zones opaques du layer. Voir SPEC §3.3.
   */
  maskedBy: maskedBySchema,
  /** Texte affiché en permanence sur sa fenêtre temporelle, sans anim d'entrée. */
  alwaysVisible: z.boolean().default(false),
  /** SPEC v1 — si true, texte rendu SOUS le layer parent (z = parent.zIndex - 0.5).
   *  Le contenu opaque du layer parent recouvre le texte naturellement. */
  respectAlpha: z.boolean().default(false),
});

// ─────────────────────────────────────────────────────────────────────────────
// ImageSlot
// ─────────────────────────────────────────────────────────────────────────────

/** Safe zone en pourcentages 0–100 (unité du motion designer). */
const pct = z.number().min(0).max(100);
export const safeZoneSchema = z.object({
  topPct: pct.nullable().default(null),
  leftPct: pct.nullable().default(null),
  widthPct: pct.nullable().default(null),
  heightPct: pct.nullable().default(null),
});

export const imageSlotSchema = slotBase.extend({
  position: z.object({
    x: ratio01,
    y: ratio01,
    width: ratio01,
    height: ratio01,
  }),
  anchor: anchorSchema.default('center'),
  fitMode: fitModeSchema.default('contain'),
  safeZone: safeZoneSchema.default({
    topPct: null, leftPct: null, widthPct: null, heightPct: null,
  }),
  overflow: overflowSchema.default('hidden'),
  /** Cf. TextSlot.maskedBy. Même sémantique. */
  maskedBy: maskedBySchema,
  /** Zoom appliqué à l'image (transform: scale). 1.0 = défaut. >1 = zoom in. */
  zoom: z.number().positive().default(1),
  /** Décalage de l'image en pixels après zoom. */
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
});

// ─────────────────────────────────────────────────────────────────────────────
// Option (choix utilisateur, pilote visibleIf)
// ─────────────────────────────────────────────────────────────────────────────

export const optionSchema = z.object({
  key: optionKey,
  label: z.string().min(1),
  choices: z.array(
    z.object({
      value: z.string().min(1),
      label: z.string().min(1),
    })
  ).min(1),
});

// ─────────────────────────────────────────────────────────────────────────────
// Template
// ─────────────────────────────────────────────────────────────────────────────

export const templateSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().default(''),
  canvas: canvasSchema,
  variants: z.array(variantSchema).min(1),
  layers: z.array(layerSchema).min(1),
  textSlots: z.array(textSlotSchema).default([]),
  imageSlots: z.array(imageSlotSchema).default([]),
  options: z.array(optionSchema).default([]),
})
  // Cohérence référentielle : tous les layerId / maskedBy doivent pointer sur des layers existants.
  .superRefine((tpl, ctx) => {
    const layerIds = new Set(tpl.layers.map((l) => l.id));
    const optionKeys = new Set(tpl.options.map((o) => o.key));

    const checkRef = (path: (string | number)[], val: string | null | undefined, set: Set<string>, label: string) => {
      if (val && !set.has(val)) {
        ctx.addIssue({ code: 'custom', path, message: `${label} "${val}" not found` });
      }
    };

    tpl.textSlots.forEach((s, i) => {
      checkRef(['textSlots', i, 'layerId'], s.layerId, layerIds, 'layerId');
      checkRef(['textSlots', i, 'maskedBy', 'layerId'], s.maskedBy?.layerId, layerIds, 'maskedBy.layerId');
      if (s.visibleIf) {
        const m = VISIBLE_IF_REGEX.exec(s.visibleIf);
        if (m && !optionKeys.has(m[1])) {
          ctx.addIssue({
            code: 'custom',
            path: ['textSlots', i, 'visibleIf'],
            message: `option "${m[1]}" referenced by visibleIf not declared`,
          });
        }
      }
    });

    tpl.imageSlots.forEach((s, i) => {
      checkRef(['imageSlots', i, 'layerId'], s.layerId, layerIds, 'layerId');
      checkRef(['imageSlots', i, 'maskedBy', 'layerId'], s.maskedBy?.layerId, layerIds, 'maskedBy.layerId');
    });

    // Durée totale cohérente avec les layers.
    const maxLayerEnd = Math.max(...tpl.layers.map((l) => l.startAt + l.duration));
    if (tpl.canvas.durationMs < maxLayerEnd) {
      ctx.addIssue({
        code: 'custom',
        path: ['canvas', 'durationMs'],
        message: `canvas.durationMs (${tpl.canvas.durationMs}) < max(layer.startAt+duration) (${maxLayerEnd})`,
      });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// RenderInput (payload runtime)
// ─────────────────────────────────────────────────────────────────────────────

export const renderInputSchema = z.object({
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  variantId: z.string(),
  optionValues: z.record(optionKey, z.string()).default({}),
  textValues: z.record(slotKey, z.string()).default({}),
  imageUploads: z.record(slotKey, assetUrl).default({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Types TS dérivés (source de vérité = les schémas ci-dessus)
// ─────────────────────────────────────────────────────────────────────────────

export type AnimationPreset = z.infer<typeof animationPresetSchema>;
export type AnimationDirection = z.infer<typeof animationDirectionSchema>;
export type BlendMode = z.infer<typeof blendModeSchema>;
export type Anchor = z.infer<typeof anchorSchema>;
export type FitMode = z.infer<typeof fitModeSchema>;
export type Overflow = z.infer<typeof overflowSchema>;
export type Align = z.infer<typeof alignSchema>;
export type TextTransform = z.infer<typeof textTransformSchema>;

export type Font = z.infer<typeof fontSchema>;
export type Canvas = z.infer<typeof canvasSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type LayerMask = z.infer<typeof layerMaskSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type TextTypo = z.infer<typeof textTypoSchema>;
export type SafeZone = z.infer<typeof safeZoneSchema>;
export type TextSlot = z.infer<typeof textSlotSchema>;
export type ImageSlot = z.infer<typeof imageSlotSchema>;
export type Option = z.infer<typeof optionSchema>;
export type MaskedBy = z.infer<typeof maskedBySchema>;
export type Template = z.infer<typeof templateSchema>;
export type RenderInput = z.infer<typeof renderInputSchema>;
