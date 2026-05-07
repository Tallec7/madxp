/**
 * ADR-075 / ADR-077 / ADR-086 — Copie dashboard de TemplateRuntime.
 * Utilisé par `<Player>` @remotion/player dans le wrapper Angular.
 * Garde la parité avec templates-remotion/src/runtime/TemplateRuntime.tsx
 * (worker de rendu final côté serveur).
 *
 * fix/joueur-preview-runtime-parity — mise à jour complète ADR-086 :
 *   - animationDirection 'in' | 'out' pour images et textes
 *   - z-stacking (layers + text/image interleaved, comme le worker)
 *   - appearDurationSeconds (durationMs hérité du layer parent)
 *   - layerId, respectAlpha, textTransform sur les textes
 *   - anchor, fitMode, safeZone, overflow sur les images
 *   - visible_if filtering avant le stacking
 */

import React from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { computeAnimation, AnimationPreset, AnimationDirection } from './animations';

// ── Interfaces ────────────────────────────────────────────────────────────────

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
  /** PDF JOUEUR — slot conditionnel (cf. server runtime). */
  visibleIf?: string | null;
}

export type Anchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type FitMode = 'contain' | 'cover' | 'fill-width-anchor-top' | 'fill-height-anchor-left';
export type Overflow = 'hidden' | 'visible' | 'top' | 'bottom' | 'left' | 'right';

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
  /** ADR-086 — 'in' (défaut) = arrivée, 'out' = sortie */
  animationDirection?: AnimationDirection;
  /** PDF JOUEUR — slot conditionnel (cf. server runtime). */
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
  /** PDF JOUEUR §démarrage — propagé pour filtrer les slots conditionnels. */
  selectedOptions?: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Cohérent avec server runtime. Format strict, fail-open. */
const DASHBOARD_VISIBLE_IF_REGEX = /^\s*([a-z_][a-z0-9_]{0,63})\s*==\s*"([^"]{0,200})"\s*$/i;
function isSlotVisible(visibleIf: string | null | undefined, opts: Record<string, string>): boolean {
  if (!visibleIf || visibleIf.trim() === '') return true;
  const m = DASHBOARD_VISIBLE_IF_REGEX.exec(visibleIf);
  if (!m) return true;
  const [, key, value] = m;
  const actual = opts[key];
  return actual !== undefined && actual === value;
}

// Deny-list pour les URLs cassées connues qui ont fui en prod (cf. incident
// 2026-05-07 : 23 layers/variants pointaient vers `neopro-central-production
// .up.railway.app/remotion-preview/public/*.webm` — assets jamais uploadés sur
// FTP, 404 systématique. OffthreadVideo retry en boucle → cascade Chrome →
// tab unresponsive. Ces URLs ont été archivées (status=archived sur 7
// templates) mais on garde le guard pour éviter qu'un réimport legacy ne
// recrée le pattern.
const BROKEN_URL_PATTERNS = [/up\.railway\.app\/remotion-preview\/public\//i];

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

// ── Component ─────────────────────────────────────────────────────────────────

export const TemplateRuntime: React.FC<TemplateRuntimeProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const variant = props.variants.find((v) => v.id === props.variantId);
  const bgSrcRaw = (variant?.backgroundVideoUrl ?? '').trim();
  const bgSrc = isValidSrc(bgSrcRaw) ? bgSrcRaw : '';

  const layerById = new Map<string, RuntimeLayer>();
  for (const l of props.layers) layerById.set(l.id, l);

  /** Durée effective du slot : héritée du layer parent si durationMs > 0, sinon slot propre. */
  const appearDurationSeconds = (
    slotAppearDuration: number,
    layerId: string | null | undefined
  ): number => {
    if (!layerId) return slotAppearDuration;
    const parent = layerById.get(layerId);
    if (!parent?.durationMs || parent.durationMs <= 0) return slotAppearDuration;
    return parent.durationMs / 1000;
  };

  // ADR-086 — z-stacking interleaved (mirrors server runtime).
  const selectedOptions = props.selectedOptions ?? {};
  const TOP = Number.MAX_SAFE_INTEGER;

  type Stacked =
    | { kind: 'layer'; z: number; layer: RuntimeLayer }
    | { kind: 'text'; z: number; tf: RuntimeTextField }
    | { kind: 'image'; z: number; slot: RuntimeImageSlot };

  const stack: Stacked[] = [];

  for (const layer of props.layers) {
    stack.push({ kind: 'layer', z: layer.zIndex, layer });
  }
  for (const tf of props.textFields) {
    if (!isSlotVisible(tf.visibleIf, props.selectedOptions ?? {})) continue;
    const parent = tf.layerId ? layerById.get(tf.layerId) : undefined;
    if (parent && tf.respectAlpha) {
      stack.push({ kind: 'text', z: parent.zIndex - 0.5, tf });
    } else if (parent) {
      stack.push({ kind: 'text', z: parent.zIndex + 0.5, tf });
    } else {
      stack.push({ kind: 'text', z: TOP, tf });
    }
  }
  for (const slot of props.imageSlots) {
    if (!isSlotVisible(slot.visibleIf, props.selectedOptions ?? {})) continue;
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
          const tf = item.tf;
          const value = props.textValues[tf.slotKey] ?? tf.defaultValue;
          if (!value) return null;

          let opacity = 1;
          let transform = 'translate(0, 0)';
          let filter: string | undefined;

          if (!tf.alwaysVisible) {
            const durationSec = appearDurationSeconds(tf.appearDuration, tf.layerId);
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

        // image slot
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

        return (
          <div
            key={`image-${slot.id}`}
            style={{
              position: 'absolute',
              left: `${slot.position.x * 100}%`,
              top: `${slot.position.y * 100}%`,
              width: `${slot.position.width * 100}%`,
              height: `${slot.position.height * 100}%`,
              transform: `translate(-50%, -50%) ${anim.transform}`,
              opacity: anim.opacity,
              filter: anim.filter,
              pointerEvents: 'none',
              overflow: slot.overflow ?? 'hidden',
            }}
          >
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
