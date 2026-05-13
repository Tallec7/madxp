/**
 * Pont entre la spec v1 (Template JSON + RenderInput) et le runtime v0
 * (TemplateRuntimeProps). Permet d'utiliser des templates v1 sans toucher
 * au composant TemplateRuntime existant.
 *
 * Stratégie de mapping :
 * - `Template.layers[].duration` → `RuntimeLayer.durationMs = 0` (le runtime v0
 *   confond "durée du layer" et "durée d'anim héritée" ; en mettant 0 on garde
 *   le comportement actuel où chaque slot utilise son propre `appearDuration`).
 *   Le concept de fenêtre temporelle de layer (startAt/duration) sera utilisé
 *   quand le runtime supportera `<Sequence>` (v1.1).
 *
 * - `TextSlot.maskedBy` v1 → `useMask` / `useTitleMask` v0 :
 *   - Tous les slots qui partagent `maskedBy.layerId == X` deviennent `useMask`,
 *     et la composition reçoit `textMaskDir = layer X.alphaSource.dir`.
 *   - Si un 2ᵉ groupe (layerId == Y) existe → `useTitleMask` + `titleMaskDir`.
 *   - 3+ groupes : non supporté par le runtime v0 → throw explicite.
 *   - `maskedBy.frameOffset` → `maskFrameOffset` par slot.
 *   - `maskedBy.zIndexOverride` → `textMaskZIndex` / `titleMaskZIndex` global.
 *
 * - `imageUploads` / asset URLs : chemins relatifs résolus via `staticFile()`,
 *   URLs absolues passées tel quel.
 */

import { staticFile } from 'remotion';
import type {
  Template,
  RenderInput,
  TextSlot,
  ImageSlot,
} from '../../spec/types';
import type {
  TemplateRuntimeProps,
  RuntimeLayer,
  RuntimeTextField,
  RuntimeImageSlot,
} from './TemplateRuntime';

const isAbsoluteUrl = (s: string): boolean => /^https?:\/\//i.test(s);
const toAssetUrl = (s: string): string => (isAbsoluteUrl(s) ? s : staticFile(s));

type MaskGroup = {
  layerId: string;
  /** Soit chemin PNG dir (pngFrames), soit URL webm ('self'). */
  source:
    | { kind: 'pngFrames'; dir: string; threshold: number }
    | { kind: 'video'; videoUrl: string; threshold: number };
  zIndexOverride: number | undefined;
  textSlots: TextSlot[];
  imageSlots: ImageSlot[];
};

const buildMaskGroups = (template: Template): MaskGroup[] => {
  const byLayer = new Map<string, MaskGroup>();

  const ensure = (layerId: string): MaskGroup => {
    let g = byLayer.get(layerId);
    if (g) return g;
    const layer = template.layers.find((l) => l.id === layerId);
    if (!layer) throw new Error(`maskedBy refers to unknown layer "${layerId}"`);
    const source =
      layer.alphaSource === 'self'
        ? { kind: 'video' as const, videoUrl: toAssetUrl(layer.assetUrl), threshold: 128 }
        : { kind: 'pngFrames' as const, dir: layer.alphaSource.dir, threshold: layer.alphaSource.threshold };
    g = {
      layerId,
      source,
      zIndexOverride: undefined,
      textSlots: [],
      imageSlots: [],
    };
    byLayer.set(layerId, g);
    return g;
  };

  for (const s of template.textSlots) {
    if (!s.maskedBy) continue;
    const g = ensure(s.maskedBy.layerId);
    g.textSlots.push(s);
    if (g.zIndexOverride === undefined) g.zIndexOverride = s.maskedBy.zIndexOverride;
  }
  for (const s of template.imageSlots) {
    if (!s.maskedBy) continue;
    const g = ensure(s.maskedBy.layerId);
    g.imageSlots.push(s);
    if (g.zIndexOverride === undefined) g.zIndexOverride = s.maskedBy.zIndexOverride;
  }

  return [...byLayer.values()];
};

export function resolveTemplate(
  template: Template,
  input: RenderInput
): TemplateRuntimeProps {
  if (input.templateId !== template.id) {
    throw new Error(
      `RenderInput.templateId "${input.templateId}" does not match template.id "${template.id}"`
    );
  }
  if (input.templateVersion !== template.version) {
    throw new Error(
      `RenderInput targets template ${input.templateId} v${input.templateVersion} ` +
        `but loaded template is v${template.version}`
    );
  }

  // Variant : explicite ou défaut.
  const variant =
    template.variants.find((v) => v.id === input.variantId) ?? template.variants[0];

  // Options : valeur fournie ou première choice.
  const selectedOptions: Record<string, string> = {};
  for (const opt of template.options) {
    selectedOptions[opt.key] = input.optionValues[opt.key] ?? opt.choices[0].value;
  }

  // Masking groups → propriétés globales du runtime v0.
  const groups = buildMaskGroups(template);
  if (groups.length > 2) {
    const ids = groups.map((g) => g.layerId).join(', ');
    throw new Error(
      `Template "${template.id}" has ${groups.length} mask layers (${ids}). ` +
        `v0 runtime supports max 2 (textMask + titleMask).`
    );
  }
  const [primary, secondary] = groups;

  // Layers → RuntimeLayer[]
  const layers: RuntimeLayer[] = template.layers.map((l) => ({
    id: l.id,
    videoUrl: toAssetUrl(l.assetUrl),
    zIndex: l.zIndex,
    mask: l.mask,
    durationMs: 0, // v0 : 0 = pas d'héritage, slots gardent leur appearDuration
    blendMode: l.blendMode,
  }));

  // Text fields
  const textFields: RuntimeTextField[] = template.textSlots.map((s) => {
    const useMask = !!s.maskedBy && s.maskedBy.layerId === primary?.layerId;
    const useTitleMask = !!s.maskedBy && s.maskedBy.layerId === secondary?.layerId;
    return {
      id: s.id,
      slotKey: s.slotKey,
      defaultValue: s.defaultValue,
      position: s.position,
      maxWidth: s.maxWidth,
      fontFamily: s.typo.fontFamily,
      fontSize: s.typo.fontSize,
      color: s.typo.color,
      align: s.typo.align,
      textTransform: s.typo.textTransform,
      lineHeight: s.typo.lineHeight,
      letterSpacing: s.typo.letterSpacing,
      appearAt: s.appearAt,
      appearDuration: s.appearDuration,
      animation: s.animation,
      animationDirection: s.animationDirection,
      scaleFrom: s.scaleFrom,
      scaleTo: s.scaleTo,
      layerId: s.layerId,
      alwaysVisible: s.alwaysVisible,
      visibleIf: s.visibleIf ?? null,
      useMask: useMask || undefined,
      useTitleMask: useTitleMask || undefined,
      maskFrameOffset: (useMask || useTitleMask) ? s.maskedBy?.frameOffset : undefined,
      respectAlpha: s.respectAlpha,
    };
  });

  // Image slots
  const imageSlots: RuntimeImageSlot[] = template.imageSlots.map((s) => {
    const useMask = !!s.maskedBy && s.maskedBy.layerId === primary?.layerId;
    return {
      id: s.id,
      slotKey: s.slotKey,
      position: s.position,
      appearAt: s.appearAt,
      appearDuration: s.appearDuration,
      animation: s.animation,
      animationDirection: s.animationDirection,
      scaleFrom: s.scaleFrom,
      scaleTo: s.scaleTo,
      layerId: s.layerId,
      anchor: s.anchor,
      fitMode: s.fitMode,
      safeZone: s.safeZone,
      overflow: s.overflow,
      visibleIf: s.visibleIf ?? null,
      zoom: s.zoom,
      offsetX: s.offsetX,
      offsetY: s.offsetY,
      useMask: useMask || undefined,
      maskFrameOffset: useMask ? s.maskedBy?.frameOffset : undefined,
    };
  });

  // Image uploads : chemins → staticFile
  const imageUploads: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.imageUploads)) {
    if (v) imageUploads[k] = toAssetUrl(v);
  }

  return {
    variants: template.variants.map((v) => ({
      id: v.id,
      backgroundVideoUrl: v.backgroundVideoUrl ? toAssetUrl(v.backgroundVideoUrl) : '',
    })),
    variantId: variant.id,
    layers,
    textFields,
    imageSlots,
    textValues: input.textValues,
    imageUploads,
    canvasWidth: template.canvas.width,
    canvasHeight: template.canvas.height,
    selectedOptions,
    textMaskDir: primary?.source.kind === 'pngFrames' ? primary.source.dir : undefined,
    textMaskVideoUrl: primary?.source.kind === 'video' ? primary.source.videoUrl : undefined,
    textMaskFrameOffset: 0,
    textMaskZIndex: primary?.zIndexOverride,
    textMaskThreshold: primary?.source.threshold,
    titleMaskDir: secondary?.source.kind === 'pngFrames' ? secondary.source.dir : undefined,
    titleMaskZIndex: secondary?.zIndexOverride,
    titleMaskThreshold: secondary?.source.threshold,
  };
}
