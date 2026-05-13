/**
 * ADR-075 / ADR-086 — Meta-composition Remotion data-driven.
 * 1 composition pour N templates : reçoit le template complet + les valeurs
 * user en props, rend bg variant + couches alpha Z-stackées + slots texte/image.
 *
 * ADR-086 apports :
 *   - Les text fields / image slots peuvent être enfants d'un layer (`layerId`).
 *     La durée d'animation est héritée du layer parent (`durationMs`).
 *   - Flag `respectAlpha` sur text fields → rendu SOUS le layer parent dans
 *     l'ordre z-stack (le layer masque les zones opaques de son WebM).
 *   - Image slots paramétrables (anchor, fit_mode, safe-zone, overflow).
 *   - Animations réversibles (`animationDirection: 'in' | 'out'`).
 */

import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  computeAnimation,
  AnimationPreset,
  AnimationDirection,
} from './animations';
import {
  computeImageStyle,
  Anchor,
  FitMode,
  Overflow,
} from './fit-modes';
import { useMaskFrames, useMaskFromVideo, useFontsReady, MaskedCanvas, useImageAsset } from '../mask-canvas';

export interface RuntimeLayer {
  id: string;
  videoUrl: string;
  zIndex: number;
  mask: { top: number; bottom: number; left: number; right: number };
  /** ADR-086 — durée du layer (ms). Héritée par les text/image enfants. */
  durationMs?: number;
  /** CSS mix-blend-mode. Mettre 'screen' sur les layers yuv420p (fond noir = transparent). */
  blendMode?: string;
}

export interface RuntimeTextField {
  id: string;
  slotKey: string;
  position: { x: number; y: number };
  maxWidth: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  appearAt: number;
  appearDuration: number;
  animation: AnimationPreset;
  defaultValue: string;
  alwaysVisible?: boolean;
  scaleFrom?: number;
  scaleTo?: number;
  /** ADR-086 — layer parent (durée héritée) */
  layerId?: string | null;
  /** ADR-086 — rendre SOUS le layer parent (masqué par zones opaques) */
  respectAlpha?: boolean;
  /** ADR-086 — 'in' (défaut) = arrivée, 'out' = sortie */
  animationDirection?: AnimationDirection;
  /** SPEC JOUEUR — transformation typographique (CSS text-transform). Défaut 'none'. */
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  /** Interligne canvas (multiplicateur de fontSize). Défaut 1.1. Utiliser 0.85 pour serré (style ButSimple). */
  lineHeight?: number;
  /** Espacement entre lettres en pixels. 0 = défaut. */
  letterSpacing?: number;
  /** Offset horizontal de départ en pixels — le texte glisse depuis cette position vers slideToX pendant appearDuration. Négatif = vient de la gauche, positif = de la droite. */
  slideFromX?: number;
  /** Offset horizontal d'arrivée en pixels. Défaut 0 (revient à la position du JSON). */
  slideToX?: number;
  /** PDF JOUEUR — slot conditionnel : "<option_key> == \"<value>\"" — invisible si pas de match. */
  visibleIf?: string | null;
  /** Canvas masking — si true, texte rendu via MaskedCanvas (masqué par textMaskDir de la compo). */
  useMask?: boolean;
  /** Décalage en frames pour ce field uniquement (override textMaskFrameOffset de la compo). */
  maskFrameOffset?: number;
  /** Si true, texte rendu via le canvas titre (masqué par titleMaskDir de la compo). */
  useTitleMask?: boolean;
}

export interface RuntimeImageSlot {
  id: string;
  slotKey: string;
  position: { x: number; y: number; width: number; height: number };
  appearAt: number;
  appearDuration: number;
  animation: AnimationPreset;
  scaleFrom?: number;
  scaleTo?: number;
  /** ADR-086 — layer parent (durée héritée) */
  layerId?: string | null;
  /** ADR-086 — paramètres safe-zone */
  anchor?: Anchor;
  fitMode?: FitMode;
  safeZone?: {
    topPct: number | null;
    leftPct: number | null;
    widthPct: number | null;
    heightPct: number | null;
  };
  overflow?: Overflow;
  animationDirection?: AnimationDirection;
  /** PDF JOUEUR — slot conditionnel (cf. RuntimeTextField.visibleIf). */
  visibleIf?: string | null;
  /** SPEC v1 — zoom appliqué à l'image (transform: scale). 1.0 = défaut. >1 = zoom. */
  zoom?: number;
  /** SPEC v1 — décalage X/Y appliqué à l'image en pixels (transform: translate). */
  offsetX?: number;
  offsetY?: number;
  /** SPEC v1 — image rendue via MaskedCanvas (alpha du textMaskDir/textMaskVideoUrl). */
  useMask?: boolean;
  /** SPEC v1 — décalage frame entre la composition et l'alpha utilisée pour cette image. */
  maskFrameOffset?: number;
}

export interface RuntimeVariant {
  id: string;
  backgroundVideoUrl: string;
}

export interface TemplateRuntimeProps {
  variants: RuntimeVariant[];
  layers: RuntimeLayer[];
  textFields: RuntimeTextField[];
  imageSlots: RuntimeImageSlot[];
  variantId: string;
  textValues: Record<string, string>;
  imageUploads: Record<string, string>;
  canvasWidth: number;
  canvasHeight: number;
  /** PDF JOUEUR — options sélectionnées par le user (intro_mode, packshot, etc.). Évaluées contre slot.visibleIf. */
  selectedOptions?: Record<string, string>;
  /** Canvas masking — dossier de frames PNG (public/masks/…) utilisé pour masquer les text fields avec useMask:true. */
  textMaskDir?: string;
  /** SPEC v1.1 — URL d'un webm utilisé comme source d'alpha live (luminance). Alternative à textMaskDir. */
  textMaskVideoUrl?: string;
  /** Décalage en frames entre la composition et les PNGs de masque. +1 si le texte apparaît 1 frame trop tôt. */
  textMaskFrameOffset?: number;
  /** Z-index du MaskedCanvas dans la pile. Défaut : MAX (au-dessus de tout). Mettre entre deux layers pour passer sous un layer de wipe. */
  textMaskZIndex?: number;
  /** Seuil de luminance pour le canvas mask (0–255). Défaut 128 (binarise). Mettre à 1 pour laisser passer tout pixel non-noir (utile quand le packshot est sombre, max<128). */
  textMaskThreshold?: number;
  /** Masque titre (ex. layer C pour "BUT") — dossier PNG séparé du textMaskDir. */
  titleMaskDir?: string;
  /** Z-index du canvas titre dans la pile (défaut MAX). */
  titleMaskZIndex?: number;
  /** Seuil luminance du masque titre (défaut 128). */
  titleMaskThreshold?: number;
}

/**
 * Évalue une expression visible_if (`<option_key> == "<value>"`) contre les options.
 * Format strict — copié du service backend pour éviter dep cross-package.
 */
const VISIBLE_IF_REGEX = /^\s*([a-z_][a-z0-9_]{0,63})\s*==\s*"([^"]{0,200})"\s*$/i;
function isSlotVisible(
  visibleIf: string | null | undefined,
  selectedOptions: Record<string, string>
): boolean {
  if (!visibleIf || visibleIf.trim() === '') return true;
  const m = VISIBLE_IF_REGEX.exec(visibleIf);
  if (!m) return true; // expression mal formée → fail-open
  const [, key, expectedValue] = m;
  const actual = selectedOptions[key];
  return actual !== undefined && actual === expectedValue;
}

// Deny-list pour les URLs cassées connues qui ont fui en prod (cf. incident
// 2026-05-07 : 23 layers/variants pointaient vers `neopro-central-production
// .up.railway.app/remotion-preview/public/*.webm` — assets jamais uploadés sur
// FTP, 404 systématique. OffthreadVideo retry en boucle → render process
// crash silencieux. Ces URLs ont été archivées (status=archived sur 7
// templates) mais on garde le guard pour éviter qu'un réimport legacy ne
// recrée le pattern.
//
// Récidive 2026-05-07 (jour même) : un autre lot de rows pointait vers
// `neopro-central-production.up.railway.app/BUT_simple_{A,B,C}.webm` (à la
// racine du domaine, pas sous /remotion-preview/public/) — même symptôme.
// Le 2e pattern attrape TOUTE URL .webm/.mp4 servie depuis un domaine Railway :
// Railway héberge l'API JSON, jamais les assets vidéo (FTP Hostinger only).
const BROKEN_URL_PATTERNS = [
  /up\.railway\.app\/remotion-preview\/public\//i,
  /up\.railway\.app\/[^?#]+\.(webm|mp4)(?:[?#]|$)/i,
];

const isValidSrc = (url: string): boolean => {
  if (!url) return false;
  for (const re of BROKEN_URL_PATTERNS) {
    if (re.test(url)) {
      // eslint-disable-next-line no-console
      console.warn('[TemplateRuntime] rejected broken asset URL', { url });
      return false;
    }
  }
  return true;
};

export const TemplateRuntime: React.FC<TemplateRuntimeProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  // SPEC v1.1 — priorité au webm live (alphaSource: 'self') sur PNG dir.
  const maskFramesFromPng = useMaskFrames(
    props.textMaskVideoUrl ? '' : (props.textMaskDir ?? ''),
    props.textMaskVideoUrl ? 0 : (props.textMaskDir ? durationInFrames : 0),
    props.textMaskThreshold ?? 128
  );
  const maskFramesFromVideo = useMaskFromVideo(
    props.textMaskVideoUrl ?? '',
    props.textMaskVideoUrl ? durationInFrames : 0,
    fps,
    props.textMaskThreshold ?? 128
  );
  const maskFrames = props.textMaskVideoUrl ? maskFramesFromVideo : maskFramesFromPng;
  const titleMaskFrames = useMaskFrames(props.titleMaskDir ?? '', props.titleMaskDir ? durationInFrames : 0, props.titleMaskThreshold ?? 128);
  const fontsReady = useFontsReady();

  const variant = props.variants.find((v) => v.id === props.variantId);
  const bgSrcRaw = (variant?.backgroundVideoUrl ?? '').trim();
  const bgSrc = isValidSrc(bgSrcRaw) ? bgSrcRaw : '';

  const layerById = new Map<string, RuntimeLayer>();
  for (const l of props.layers) layerById.set(l.id, l);

  const appearDurationSeconds = (
    slotAppearDuration: number,
    layerId: string | null | undefined
  ): number => {
    if (!layerId) return slotAppearDuration;
    const parent = layerById.get(layerId);
    if (!parent?.durationMs || parent.durationMs <= 0) return slotAppearDuration;
    return parent.durationMs / 1000;
  };

  // ADR-086 — construire un flux z-stacké unique : layers + text/image.
  // Text/image avec respectAlpha=true sont rendus z=layer.z-0.5 (sous le layer).
  // Sinon, z=layer.z+0.5 (au-dessus du layer parent).
  // Ceux sans layerId gardent le comportement historique : tout en haut.
  type Stacked =
    | { kind: 'layer'; z: number; layer: RuntimeLayer }
    | { kind: 'text'; z: number; field: RuntimeTextField }
    | { kind: 'image'; z: number; slot: RuntimeImageSlot }
    | { kind: 'maskedCanvas'; z: number }
    | { kind: 'titleCanvas'; z: number };

  const stack: Stacked[] = [];
  const TOP = Number.MAX_SAFE_INTEGER;

  // PDF JOUEUR — slots conditionnels filtrés contre selectedOptions avant stacking.
  const selectedOptions = props.selectedOptions ?? {};

  for (const layer of props.layers) {
    stack.push({ kind: 'layer', z: layer.zIndex, layer });
  }
  // SPEC v1 — images pushed AVANT textes pour qu'au même zIndex (ex. numero
  // + photo joueur rattachés au même layer), le texte soit AU-DESSUS de
  // l'image (sort stable préserve l'ordre d'insertion).
  for (const slot of props.imageSlots) {
    if (!isSlotVisible(slot.visibleIf, selectedOptions)) continue;
    if (slot.useMask) continue; // rendu dans le MaskedCanvas (cf. drawFields below)
    const parent = slot.layerId ? layerById.get(slot.layerId) : undefined;
    if (parent) {
      stack.push({ kind: 'image', z: parent.zIndex + 0.5, slot });
    } else {
      stack.push({ kind: 'image', z: TOP, slot });
    }
  }
  for (const field of props.textFields) {
    if (!isSlotVisible(field.visibleIf, selectedOptions)) continue;
    if (field.useMask) continue; // rendu via MaskedCanvas
    if (field.useTitleMask) continue; // rendu via titleCanvas
    const parent = field.layerId ? layerById.get(field.layerId) : undefined;
    if (parent && field.respectAlpha) {
      stack.push({ kind: 'text', z: parent.zIndex - 0.5, field });
    } else if (parent) {
      stack.push({ kind: 'text', z: parent.zIndex + 0.5, field });
    } else {
      stack.push({ kind: 'text', z: TOP, field });
    }
  }
  // MaskedCanvas packshot inséré dans la pile z (défaut : au-dessus de tout)
  if (props.textMaskDir || props.textMaskVideoUrl) {
    const hasMaskedText = props.textFields.some(
      (f) => f.useMask && isSlotVisible(f.visibleIf, selectedOptions)
    );
    const hasMaskedImage = props.imageSlots.some(
      (s) => s.useMask && isSlotVisible(s.visibleIf, selectedOptions)
    );
    if (hasMaskedText || hasMaskedImage) {
      stack.push({ kind: 'maskedCanvas', z: props.textMaskZIndex ?? TOP });
    }
  }
  // Canvas titre (ex. "BUT" masqué par luminance du layer C)
  if (props.titleMaskDir) {
    const hasTitle = props.textFields.some(
      (f) => f.useTitleMask && isSlotVisible(f.visibleIf, selectedOptions)
    );
    if (hasTitle) {
      stack.push({ kind: 'titleCanvas', z: props.titleMaskZIndex ?? TOP });
    }
  }
  stack.sort((a, b) => a.z - b.z);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <style>{`
        @font-face {
          font-family: 'Bulevar';
          src: url('${staticFile("Bulevar-Regular.otf")}') format('opentype');
          font-weight: 400;
        }
        @font-face {
          font-family: 'General Sans';
          src: url('${staticFile("GeneralSans-Semibold.otf")}') format('opentype');
          font-weight: 600;
        }
        @font-face {
          font-family: 'General Sans Bold';
          src: url('${staticFile("GeneralSans-Bold.otf")}') format('opentype');
          font-weight: 700;
        }
      `}</style>
      {/* Force font loading for canvas — fonts not referenced by HTML never download. */}
      <div style={{ position: 'absolute', opacity: 0, fontSize: 1, pointerEvents: 'none', userSelect: 'none' }}>
        <span style={{ fontFamily: 'Bulevar' }}>.</span>
        <span style={{ fontFamily: 'General Sans' }}>.</span>
        <span style={{ fontFamily: 'General Sans Bold' }}>.</span>
      </div>
      {bgSrc ? (
        <OffthreadVideo
          src={bgSrc}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : null}

      {stack.map((item) => {
        if (item.kind === 'layer') {
          const layer = item.layer;
          const layerSrcRaw = (layer.videoUrl ?? '').trim();
          const layerSrc = isValidSrc(layerSrcRaw) ? layerSrcRaw : '';
          if (!layerSrc) return null;
          const clipPath =
            `inset(${layer.mask.top * 100}% ${layer.mask.right * 100}% ` +
            `${layer.mask.bottom * 100}% ${layer.mask.left * 100}%)`;
          return (
            <AbsoluteFill
              key={`layer-${layer.id}`}
              style={{ clipPath, mixBlendMode: (layer.blendMode as React.CSSProperties['mixBlendMode']) }}
            >
              <OffthreadVideo
                src={layerSrc}
                transparent
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </AbsoluteFill>
          );
        }

        if (item.kind === 'text') {
          const tf = item.field;
          const value = props.textValues[tf.slotKey] ?? tf.defaultValue;
          if (!value) return null;

          const durationSec = appearDurationSeconds(tf.appearDuration, tf.layerId);
          let opacity: number;
          let transform: string;
          let filter: string | undefined;

          if (tf.alwaysVisible) {
            opacity = 1;
            transform = 'translate(0, 0)';
          } else {
            const style = computeAnimation(tf.animation, {
              frame,
              fps,
              appearAtFrame: Math.round(tf.appearAt * fps),
              durationFrames: Math.max(1, Math.round(durationSec * fps)),
              direction: tf.animationDirection ?? 'in',
              scaleFrom: tf.scaleFrom,
              scaleTo: tf.scaleTo,
            });
            opacity = style.opacity;
            transform = style.transform;
            filter = style.filter;
          }

          // SPEC v1 — l'ancre horizontale dépend de align. Pour rester cohérent
          // avec le canvas drawing (où align: 'left' = ancrage à gauche du texte),
          // on translate le div en fonction de align au lieu du -50% systématique.
          const xAnchor = tf.align === 'left' ? '0%' : tf.align === 'right' ? '-100%' : '-50%';

          return (
            <div
              key={`text-${tf.id}`}
              style={{
                position: 'absolute',
                left: `${tf.position.x * 100}%`,
                top: `${tf.position.y * 100}%`,
                width: `${tf.maxWidth * 100}%`,
                transform: `translate(${xAnchor}, -50%) ${transform}`,
                opacity,
                filter,
                color: tf.color,
                fontFamily: tf.fontFamily,
                fontSize: tf.fontSize,
                textAlign: tf.align,
                textTransform: tf.textTransform ?? 'none',
                lineHeight: tf.lineHeight ?? 1.1,
                letterSpacing: tf.letterSpacing ? `${tf.letterSpacing}px` : undefined,
                whiteSpace: 'pre-wrap',
                pointerEvents: 'none',
              }}
            >
              {value}
            </div>
          );
        }

        if (item.kind === 'maskedCanvas') {
          if (!fontsReady) return null;
          const maskedFields = props.textFields.filter(
            (f) => f.useMask && isSlotVisible(f.visibleIf, selectedOptions)
          );
          if (maskedFields.length === 0) return null;

          const globalOffset = props.textMaskFrameOffset ?? 0;
          const byOffset = new Map<number, RuntimeTextField[]>();
          for (const f of maskedFields) {
            const off = f.maskFrameOffset ?? globalOffset;
            if (!byOffset.has(off)) byOffset.set(off, []);
            byOffset.get(off)!.push(f);
          }

          const drawFields = (ctx: CanvasRenderingContext2D, fields: RuntimeTextField[]) => {
            for (const field of fields) {
              if (frame < Math.round(field.appearAt * fps)) continue;
              const raw = props.textValues[field.slotKey] ?? field.defaultValue;
              if (!raw) continue;

              const anim = computeAnimation(field.animation, {
                frame, fps,
                appearAtFrame: Math.round(field.appearAt * fps),
                durationFrames: Math.max(1, Math.round(field.appearDuration * fps)),
                direction: field.animationDirection ?? 'in',
                scaleFrom: field.scaleFrom,
                scaleTo: field.scaleTo,
              });
              const scaleMatch = anim.transform.match(/scale\(([\d.]+)\)/);
              const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

              const transform = field.textTransform ?? 'none';
              const text = transform === 'uppercase' ? raw.toUpperCase()
                : transform === 'lowercase' ? raw.toLowerCase()
                : raw;
              const lines = text.split('\n');
              const x = field.position.x * props.canvasWidth;
              const cy = field.position.y * props.canvasHeight;
              const lineH = field.fontSize * (field.lineHeight ?? 1.1);
              const startY = cy - (lines.length * lineH) / 2 + lineH / 2;
              ctx.save();
              ctx.globalAlpha = anim.opacity;
              ctx.font = `${field.fontSize}px '${field.fontFamily}', sans-serif`;
              ctx.fillStyle = field.color;
              ctx.textAlign = field.align as CanvasTextAlign;
              ctx.textBaseline = 'alphabetic';
              const ctxWithSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
              if (field.letterSpacing && 'letterSpacing' in ctx) {
                ctxWithSpacing.letterSpacing = `${field.letterSpacing}px`;
              }
              // Centre visuel du texte (pour scaler depuis le milieu peu importe l'align).
              const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
              const centerX = field.align === 'left' ? x + widest / 2
                : field.align === 'right' ? x - widest / 2
                : x;
              ctx.translate(centerX, cy);
              ctx.scale(scale, scale);
              ctx.translate(-centerX, -cy);
              if (field.slideFromX != null || field.slideToX != null) {
                const fromX = field.slideFromX ?? 0;
                const toX = field.slideToX ?? 0;
                const appearAtFrame = Math.round(field.appearAt * fps);
                const durationFrames = Math.max(1, Math.round(field.appearDuration * fps));
                const p = Math.max(0, Math.min(1, (frame - appearAtFrame) / durationFrames));
                const slideX = fromX + (toX - fromX) * p;
                ctx.translate(slideX, 0);
              }
              // Centrage optique : on place la baseline de chaque ligne pour que
              // le centre visuel des glyphes (entre ascender et descender réels)
              // coïncide avec startY + i*lineH — au lieu du centre de l'em-box.
              lines.forEach((line, i) => {
                const m = ctx.measureText(line);
                const visualCenter = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
                const baselineY = startY + i * lineH + visualCenter;
                ctx.fillText(line, x, baselineY);
              });
              if ('letterSpacing' in ctx) ctxWithSpacing.letterSpacing = '0px';
              ctx.restore();
            }
          };

          return (
            <React.Fragment key="maskedCanvas">
              {/* Images d'abord (en arrière), puis textes (devant) */}
              {props.imageSlots
                .filter((s) => s.useMask && isSlotVisible(s.visibleIf, selectedOptions))
                .map((slot) => (
                  <MaskedImageSingle
                    key={`mask-img-${slot.id}`}
                    slot={slot}
                    src={props.imageUploads[slot.slotKey] ?? ''}
                    maskFrames={maskFrames}
                    globalOffset={globalOffset}
                    canvasWidth={props.canvasWidth}
                    canvasHeight={props.canvasHeight}
                  />
                ))}
              {[...byOffset.entries()].map(([offset, fields]) => (
                <MaskedCanvas
                  key={`mask-${offset}`}
                  maskFrames={maskFrames}
                  frameOffset={offset}
                  draw={(ctx) => drawFields(ctx, fields)}
                />
              ))}
            </React.Fragment>
          );
        }

        if (item.kind === 'titleCanvas') {
          if (!fontsReady) return null;
          const titleFields = props.textFields.filter(
            (f) => f.useTitleMask && isSlotVisible(f.visibleIf, selectedOptions)
          );
          if (titleFields.length === 0) return null;
          return (
            <MaskedCanvas
              key="titleCanvas"
              maskFrames={titleMaskFrames}
              frameOffset={titleFields[0]?.maskFrameOffset ?? 0}
              draw={(ctx) => {
                for (const field of titleFields) {
                  if (frame < Math.round(field.appearAt * fps)) continue;
                  const raw = props.textValues[field.slotKey] ?? field.defaultValue;
                  if (!raw) continue;

                  // SPEC v1 — applique scale animation autour du centre du texte
                  const anim = computeAnimation(field.animation, {
                    frame, fps,
                    appearAtFrame: Math.round(field.appearAt * fps),
                    durationFrames: Math.max(1, Math.round(field.appearDuration * fps)),
                    direction: field.animationDirection ?? 'in',
                    scaleFrom: field.scaleFrom,
                    scaleTo: field.scaleTo,
                  });
                  const scaleMatch = anim.transform.match(/scale\(([\d.]+)\)/);
                  const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

                  const transform = field.textTransform ?? 'none';
                  const text = transform === 'uppercase' ? raw.toUpperCase()
                    : transform === 'lowercase' ? raw.toLowerCase()
                    : raw;
                  const lines = text.split('\n');
                  const x = field.position.x * props.canvasWidth;
                  const cy = field.position.y * props.canvasHeight;
                  const lineH = field.fontSize * (field.lineHeight ?? 1.1);
                  const startY = cy - (lines.length * lineH) / 2 + lineH / 2;
                  ctx.save();
                  ctx.globalAlpha = anim.opacity;
                  // scale autour du centre du bloc texte (x, cy)
                  ctx.translate(x, cy);
                  ctx.scale(scale, scale);
                  ctx.translate(-x, -cy);
                  ctx.font = `${field.fontSize}px '${field.fontFamily}', sans-serif`;
                  ctx.fillStyle = field.color;
                  ctx.textAlign = field.align as CanvasTextAlign;
                  ctx.textBaseline = 'middle';
                  lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineH));
                  ctx.restore();
                }
              }}
            />
          );
        }

        // image
        const slot = item.slot;
        const src = props.imageUploads[slot.slotKey];
        if (!src) return null;

        const durationSec = appearDurationSeconds(slot.appearDuration, slot.layerId);
        const anim = computeAnimation(slot.animation, {
          frame,
          fps,
          appearAtFrame: Math.round(slot.appearAt * fps),
          durationFrames: Math.max(1, Math.round(durationSec * fps)),
          direction: slot.animationDirection ?? 'in',
          scaleFrom: slot.scaleFrom,
          scaleTo: slot.scaleTo,
        });

        const { wrapper, img } = computeImageStyle({
          slotPosition: slot.position,
          anchor: slot.anchor ?? 'center',
          fitMode: slot.fitMode ?? 'contain',
          safeZone: slot.safeZone ?? {
            topPct: null,
            leftPct: null,
            widthPct: null,
            heightPct: null,
          },
          overflow: slot.overflow ?? 'hidden',
        });

        const baseTransform = (wrapper.transform as string | undefined) ?? '';
        // SPEC v1 — zoom + offset appliqués SUR L'IMAGE (pas le wrapper, sinon
        // ça décale toute la safe-zone). transform-origin: top center pour que
        // zoom préserve l'ancrage par le haut (cohérent fill-width-anchor-top).
        const zoom = slot.zoom ?? 1;
        const offsetX = slot.offsetX ?? 0;
        const offsetY = slot.offsetY ?? 0;
        const imgTransform =
          zoom !== 1 || offsetX !== 0 || offsetY !== 0
            ? `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`
            : undefined;
        return (
          <div
            key={`image-${slot.id}`}
            style={{
              ...wrapper,
              transform: `${baseTransform} ${anim.transform}`.trim(),
              opacity: anim.opacity,
              filter: anim.filter,
              pointerEvents: 'none',
            }}
          >
            <img
              src={src}
              alt=""
              style={{
                ...img,
                ...(imgTransform
                  ? { transform: imgTransform, transformOrigin: 'top center' }
                  : {}),
              }}
            />
          </div>
        );
      })}

    </AbsoluteFill>
  );
};

// ── MaskedImageSingle ──────────────────────────────────────────────────────────
// SPEC v1 — rend une image dans un canvas masqué par l'alpha global (textMaskDir
// ou textMaskVideoUrl). Une instance par imageSlot avec maskedBy défini.
// Charge l'image via useImageAsset, calcule la zone de dessin depuis safeZone +
// position + zoom + offsets, puis dessine dans <MaskedCanvas>.
interface MaskedImageSingleProps {
  slot: RuntimeImageSlot;
  src: string;
  maskFrames: (ImageBitmap | HTMLCanvasElement)[];
  globalOffset: number;
  canvasWidth: number;
  canvasHeight: number;
}

const MaskedImageSingle: React.FC<MaskedImageSingleProps> = ({
  slot, src, maskFrames, globalOffset, canvasWidth, canvasHeight,
}) => {
  const img = useImageAsset(src);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!img) return null;

  const offset = slot.maskFrameOffset ?? globalOffset;

  return (
    <MaskedCanvas
      maskFrames={maskFrames}
      frameOffset={offset}
      draw={(ctx) => {
        if (frame < Math.round(slot.appearAt * fps)) return;

        const anim = computeAnimation(slot.animation, {
          frame, fps,
          appearAtFrame: Math.round(slot.appearAt * fps),
          durationFrames: Math.max(1, Math.round(slot.appearDuration * fps)),
          direction: slot.animationDirection ?? 'in',
          scaleFrom: slot.scaleFrom,
          scaleTo: slot.scaleTo,
        });
        const scaleMatch = anim.transform.match(/scale\(([\d.]+)\)/);
        const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

        const sz = slot.safeZone;
        const hasSafe = sz && sz.topPct !== null && sz.leftPct !== null && sz.widthPct !== null && sz.heightPct !== null;
        const left = hasSafe ? (sz!.leftPct! / 100) * canvasWidth : (slot.position.x - slot.position.width / 2) * canvasWidth;
        const top = hasSafe ? (sz!.topPct! / 100) * canvasHeight : (slot.position.y - slot.position.height / 2) * canvasHeight;
        const width = hasSafe ? (sz!.widthPct! / 100) * canvasWidth : slot.position.width * canvasWidth;

        // fit-width-anchor-top : largeur = width, hauteur calculée pour préserver l'aspect
        const aspect = img.naturalWidth / img.naturalHeight;
        const targetH = width / aspect;

        const zoom = slot.zoom ?? 1;
        const offsetX = slot.offsetX ?? 0;
        const offsetY = slot.offsetY ?? 0;

        // Zoom centré horizontalement, ancré au top vertical (cohérent fill-width-anchor-top)
        const finalW = width * zoom;
        const finalH = targetH * zoom;
        const finalLeft = left + width / 2 - finalW / 2 + offsetX;
        const finalTop = top + offsetY;

        const cx = finalLeft + finalW / 2;
        const cy = finalTop + finalH / 2;
        ctx.save();
        ctx.globalAlpha = anim.opacity;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
        ctx.drawImage(img, finalLeft, finalTop, finalW, finalH);
        ctx.restore();
      }}
    />
  );
};
