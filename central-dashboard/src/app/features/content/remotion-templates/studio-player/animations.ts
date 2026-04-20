/**
 * ADR-075 / ADR-077 — Copie dashboard de animations.ts (templates-remotion/src/runtime).
 * Garde la parité visuelle avec le worker de rendu server-side.
 * Tout nouveau preset doit être updaté aux 4 endroits (CHECK SQL, union, ici, worker).
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

const progress = ({ frame, appearAtFrame, durationFrames }: Params): number => {
  if (durationFrames <= 0) return frame >= appearAtFrame ? 1 : 0;
  return clamped((frame - appearAtFrame) / durationFrames);
};

export function computeAnimation(preset: AnimationPreset, params: Params): AnimatedStyle {
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
      void _exhaustive;
      return { opacity: 1, transform: 'translate(0, 0)' };
    }
  }
}
