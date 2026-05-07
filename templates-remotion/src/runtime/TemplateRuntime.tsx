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
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
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

export interface RuntimeLayer {
  id: string;
  videoUrl: string;
  zIndex: number;
  mask: { top: number; bottom: number; left: number; right: number };
  /** ADR-086 — durée du layer (ms). Héritée par les text/image enfants. */
  durationMs?: number;
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
  /** PDF JOUEUR — slot conditionnel : "<option_key> == \"<value>\"" — invisible si pas de match. */
  visibleIf?: string | null;
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
  if (!/^(https?:|blob:|data:)/.test(url)) return false;
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
  const { fps } = useVideoConfig();

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
    | { kind: 'image'; z: number; slot: RuntimeImageSlot };

  const stack: Stacked[] = [];
  const TOP = Number.MAX_SAFE_INTEGER;

  // PDF JOUEUR — slots conditionnels filtrés contre selectedOptions avant stacking.
  const selectedOptions = props.selectedOptions ?? {};

  for (const layer of props.layers) {
    stack.push({ kind: 'layer', z: layer.zIndex, layer });
  }
  for (const field of props.textFields) {
    if (!isSlotVisible(field.visibleIf, selectedOptions)) continue;
    const parent = field.layerId ? layerById.get(field.layerId) : undefined;
    if (parent && field.respectAlpha) {
      stack.push({ kind: 'text', z: parent.zIndex - 0.5, field });
    } else if (parent) {
      stack.push({ kind: 'text', z: parent.zIndex + 0.5, field });
    } else {
      stack.push({ kind: 'text', z: TOP, field });
    }
  }
  for (const slot of props.imageSlots) {
    if (!isSlotVisible(slot.visibleIf, selectedOptions)) continue;
    const parent = slot.layerId ? layerById.get(slot.layerId) : undefined;
    if (parent) {
      stack.push({ kind: 'image', z: parent.zIndex + 0.5, slot });
    } else {
      stack.push({ kind: 'image', z: TOP, slot });
    }
  }
  stack.sort((a, b) => a.z - b.z);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
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
            <AbsoluteFill key={`layer-${layer.id}`} style={{ clipPath }}>
              <OffthreadVideo
                src={layerSrc}
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

          return (
            <div
              key={`text-${tf.id}`}
              style={{
                position: 'absolute',
                left: `${tf.position.x * 100}%`,
                top: `${tf.position.y * 100}%`,
                width: `${tf.maxWidth * 100}%`,
                transform: `translate(-50%, -50%) ${transform}`,
                opacity,
                filter,
                color: tf.color,
                fontFamily: tf.fontFamily,
                fontSize: tf.fontSize,
                textAlign: tf.align,
                textTransform: tf.textTransform ?? 'none',
                lineHeight: 1.1,
                whiteSpace: 'pre-wrap',
                pointerEvents: 'none',
              }}
            >
              {value}
            </div>
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
            <img src={src} alt="" style={img} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
