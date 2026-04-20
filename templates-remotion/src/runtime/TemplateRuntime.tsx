/**
 * ADR-075 — Meta-composition Remotion data-driven.
 * 1 composition pour N templates : reçoit le template complet + les valeurs
 * user en props, rend bg variant + couches alpha Z-stackées + slots texte/image.
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
}

export interface RuntimeImageSlot {
  id: string;
  slotKey: string;
  position: { x: number; y: number; width: number; height: number };
  appearAt: number;
  appearDuration: number;
  animation: AnimationPreset;
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
}

export const TemplateRuntime: React.FC<TemplateRuntimeProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const variant = props.variants.find((v) => v.id === props.variantId);
  const sortedLayers = [...props.layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {variant && variant.backgroundVideoUrl ? (
        <OffthreadVideo
          src={variant.backgroundVideoUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : null}

      {sortedLayers.map((layer) => {
        if (!layer.videoUrl) return null;
        const clipPath =
          `inset(${layer.mask.top * 100}% ${layer.mask.right * 100}% ` +
          `${layer.mask.bottom * 100}% ${layer.mask.left * 100}%)`;
        return (
          <AbsoluteFill key={layer.id} style={{ clipPath }}>
            <OffthreadVideo
              src={layer.videoUrl}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </AbsoluteFill>
        );
      })}

      {props.textFields.map((tf) => {
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
            <img
              src={src}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
