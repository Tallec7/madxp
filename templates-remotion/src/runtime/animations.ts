/**
 * ADR-074 — Animation presets data-driven.
 * Chaque preset retourne { opacity, transform } à appliquer sur un slot
 * (texte ou image), en fonction de la frame courante et de la fenêtre
 * appearAt / appearDuration.
 */

import { interpolate, spring } from 'remotion';

export type AnimationPreset =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'scale-in'
  | 'blur-in';

export interface AnimatedStyle {
  opacity: number;
  transform: string;
  filter?: string;
}

interface Params {
  frame: number;
  fps: number;
  appearAtFrame: number;
  durationFrames: number;
}

const clamped = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Progrès linéaire 0..1 depuis appearAtFrame jusqu'à +durationFrames.
 * Reste à 0 avant la fenêtre, 1 après.
 */
const progress = ({ frame, appearAtFrame, durationFrames }: Params): number => {
  if (durationFrames <= 0) return frame >= appearAtFrame ? 1 : 0;
  return clamped((frame - appearAtFrame) / durationFrames);
};

export function computeAnimation(
  preset: AnimationPreset,
  params: Params
): AnimatedStyle {
  switch (preset) {
    case 'none':
      return {
        opacity: params.frame >= params.appearAtFrame ? 1 : 0,
        transform: 'translate(0, 0)',
      };

    case 'fade':
      return {
        opacity: interpolate(progress(params), [0, 1], [0, 1]),
        transform: 'translate(0, 0)',
      };

    case 'slide-up': {
      const s = spring({
        frame: params.frame - params.appearAtFrame,
        fps: params.fps,
        config: { damping: 18, mass: 0.8 },
      });
      return {
        opacity: interpolate(progress(params), [0, 1], [0, 1]),
        transform: `translate(0, ${interpolate(s, [0, 1], [40, 0])}px)`,
      };
    }

    case 'slide-down': {
      const s = spring({
        frame: params.frame - params.appearAtFrame,
        fps: params.fps,
        config: { damping: 18, mass: 0.8 },
      });
      return {
        opacity: interpolate(progress(params), [0, 1], [0, 1]),
        transform: `translate(0, ${interpolate(s, [0, 1], [-40, 0])}px)`,
      };
    }

    case 'scale-in': {
      const s = spring({
        frame: params.frame - params.appearAtFrame,
        fps: params.fps,
        config: { damping: 14, mass: 0.6 },
      });
      return {
        opacity: interpolate(progress(params), [0, 1], [0, 1]),
        transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`,
      };
    }

    case 'blur-in': {
      const p = progress(params);
      return {
        opacity: interpolate(p, [0, 1], [0, 1]),
        transform: 'translate(0, 0)',
        filter: `blur(${interpolate(p, [0, 1], [12, 0])}px)`,
      };
    }

    default: {
      const _exhaustive: never = preset;
      return { opacity: 1, transform: 'translate(0, 0)' };
    }
  }
}
