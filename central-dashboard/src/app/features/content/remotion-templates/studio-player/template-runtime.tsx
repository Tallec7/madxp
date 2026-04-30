/**
 * ADR-075 / ADR-077 — Copie dashboard de TemplateRuntime.
 * Utilisé par `<Player>` @remotion/player dans le wrapper Angular.
 * Garde la parité avec templates-remotion/src/runtime/TemplateRuntime.tsx
 * (worker de rendu final côté serveur).
 */

import React from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { computeAnimation, AnimationPreset } from './animations';

export interface RuntimeLayer {
  id: string;
  videoUrl: string;
  zIndex: number;
  mask: { top: number; bottom: number; left: number; right: number };
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
  /** PDF JOUEUR — slot conditionnel (cf. server runtime). */
  visibleIf?: string | null;
}

export interface RuntimeImageSlot {
  id: string;
  slotKey: string;
  position: { x: number; y: number; width: number; height: number };
  appearAt: number;
  appearDuration: number;
  animation: AnimationPreset;
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

export const TemplateRuntime: React.FC<TemplateRuntimeProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const variant = props.variants.find((v) => v.id === props.variantId);
  const sortedLayers = [...props.layers].sort((a, b) => a.zIndex - b.zIndex);
  const isValidSrc = (url: string): boolean =>
    /^(https?:|blob:|data:)/.test(url);
  const bgSrcRaw = (variant?.backgroundVideoUrl ?? '').trim();
  const bgSrc = isValidSrc(bgSrcRaw) ? bgSrcRaw : '';

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {bgSrc ? (
        <OffthreadVideo
          src={bgSrc}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : null}

      {sortedLayers.map((layer) => {
        const layerSrcRaw = (layer.videoUrl ?? '').trim();
        const layerSrc = isValidSrc(layerSrcRaw) ? layerSrcRaw : '';
        if (!layerSrc) return null;
        const clipPath =
          `inset(${layer.mask.top * 100}% ${layer.mask.right * 100}% ` +
          `${layer.mask.bottom * 100}% ${layer.mask.left * 100}%)`;
        return (
          <AbsoluteFill key={layer.id} style={{ clipPath }}>
            <OffthreadVideo
              src={layerSrc}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </AbsoluteFill>
        );
      })}

      {props.textFields.map((tf) => {
        if (!isSlotVisible(tf.visibleIf, props.selectedOptions ?? {})) return null;
        const value = props.textValues[tf.slotKey] ?? tf.defaultValue;
        if (!value) return null;
        const style = computeAnimation(tf.animation, {
          frame,
          fps,
          appearAtFrame: Math.round(tf.appearAt * fps),
          durationFrames: Math.max(1, Math.round(tf.appearDuration * fps)),
        });
        return (
          <div
            key={tf.id}
            style={{
              position: 'absolute',
              left: `${tf.position.x * 100}%`,
              top: `${tf.position.y * 100}%`,
              width: `${tf.maxWidth * 100}%`,
              transform: `translate(-50%, -50%) ${style.transform}`,
              opacity: style.opacity,
              filter: style.filter,
              color: tf.color,
              fontFamily: tf.fontFamily,
              fontSize: tf.fontSize,
              textAlign: tf.align,
              lineHeight: 1.1,
              whiteSpace: 'pre-wrap',
              pointerEvents: 'none',
            }}
          >
            {value}
          </div>
        );
      })}

      {props.imageSlots.map((slot) => {
        if (!isSlotVisible(slot.visibleIf, props.selectedOptions ?? {})) return null;
        const src = props.imageUploads[slot.slotKey];
        if (!src) return null;
        const style = computeAnimation(slot.animation, {
          frame,
          fps,
          appearAtFrame: Math.round(slot.appearAt * fps),
          durationFrames: Math.max(1, Math.round(slot.appearDuration * fps)),
        });
        return (
          <div
            key={slot.id}
            style={{
              position: 'absolute',
              left: `${slot.position.x * 100}%`,
              top: `${slot.position.y * 100}%`,
              width: `${slot.position.width * 100}%`,
              height: `${slot.position.height * 100}%`,
              transform: `translate(-50%, -50%) ${style.transform}`,
              opacity: style.opacity,
              filter: style.filter,
              pointerEvents: 'none',
            }}
          >
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
