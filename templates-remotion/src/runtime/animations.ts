/**
 * ADR-075 / ADR-086 — Animation presets data-driven.
 * Chaque preset retourne { opacity, transform } à appliquer sur un slot
 * (texte ou image), en fonction de la frame courante, de la fenêtre
 * appearAt / appearDuration, et de la direction ('in' = arrivée,
 * 'out' = sortie — ADR-086).
 *
 * Convention sémantique (ADR-086) :
 *   `from` = état quand l'élément n'est PAS présent (invisible / initial)
 *   `to`   = état quand l'élément est FULLY présent
 *   direction 'in'  → `from` → `to`   pendant la fenêtre
 *   direction 'out' → `to`   → `from` pendant la fenêtre
 */

import { interpolate, spring } from 'remotion';

export type AnimationPreset =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'scale-in'
  | 'blur-in'
  | 'zoom'
  | 'logo-pop';

export type AnimationDirection = 'in' | 'out';

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
  /** 'in' (défaut) = arrivée, 'out' = sortie (ADR-086) */
  direction?: AnimationDirection;
  /** zoom / scale-in / logo-pop : valeur de départ (état "non présent") */
  scaleFrom?: number;
  /** zoom / scale-in / logo-pop : valeur d'arrivée (état "présent") */
  scaleTo?: number;
}

const clamped = (n: number): number => Math.max(0, Math.min(1, n));

/** Progrès linéaire 0..1 depuis appearAtFrame jusqu'à +durationFrames. */
const progress = ({ frame, appearAtFrame, durationFrames }: Params): number => {
  if (durationFrames <= 0) return frame >= appearAtFrame ? 1 : 0;
  return clamped((frame - appearAtFrame) / durationFrames);
};

/** Presence 0..1 — 1 = présent, 0 = absent. Flip pour direction='out'. */
const presence = (p: number, direction?: AnimationDirection): number =>
  direction === 'out' ? 1 - p : p;

export function computeAnimation(
  preset: AnimationPreset,
  params: Params
): AnimatedStyle {
  const dir = params.direction;

  switch (preset) {
    case 'none':
      return {
        opacity: params.frame >= params.appearAtFrame ? 1 : 0,
        transform: 'translate(0, 0)',
      };

    case 'fade': {
      const pres = presence(progress(params), dir);
      return {
        opacity: interpolate(pres, [0, 1], [0, 1]),
        transform: 'translate(0, 0)',
      };
    }

    case 'slide-up': {
      const s = spring({
        frame: params.frame - params.appearAtFrame,
        fps: params.fps,
        config: { damping: 18, mass: 0.8 },
      });
      const pres = presence(s, dir);
      return {
        opacity: interpolate(presence(progress(params), dir), [0, 1], [0, 1]),
        transform: `translate(0, ${interpolate(pres, [0, 1], [40, 0])}px)`,
      };
    }

    case 'slide-down': {
      const s = spring({
        frame: params.frame - params.appearAtFrame,
        fps: params.fps,
        config: { damping: 18, mass: 0.8 },
      });
      const pres = presence(s, dir);
      return {
        opacity: interpolate(presence(progress(params), dir), [0, 1], [0, 1]),
        transform: `translate(0, ${interpolate(pres, [0, 1], [-40, 0])}px)`,
      };
    }

    case 'scale-in':
    case 'zoom': {
      const from = params.scaleFrom ?? 0.7;
      const to = params.scaleTo ?? 1.0;
      const s = spring({
        frame: params.frame - params.appearAtFrame,
        fps: params.fps,
        config: { damping: 14, mass: 0.6 },
      });
      const pres = presence(s, dir);
      return {
        opacity: interpolate(presence(progress(params), dir), [0, 1], [0, 1]),
        transform: `scale(${interpolate(pres, [0, 1], [from, to])})`,
      };
    }

    case 'logo-pop': {
      const from = params.scaleFrom ?? 0.3;
      const to = params.scaleTo ?? 1.0;
      const s = spring({
        frame: params.frame - params.appearAtFrame,
        fps: params.fps,
        config: { damping: 12, mass: 0.5, stiffness: 180 },
      });
      const pres = presence(s, dir);
      return {
        opacity: interpolate(presence(progress(params), dir), [0, 1], [0, 1]),
        transform: `scale(${interpolate(pres, [0, 1], [from, to])})`,
      };
    }

    case 'blur-in': {
      const pres = presence(progress(params), dir);
      return {
        opacity: interpolate(pres, [0, 1], [0, 1]),
        transform: 'translate(0, 0)',
        filter: `blur(${interpolate(pres, [0, 1], [12, 0])}px)`,
      };
    }

    default: {
      const _exhaustive: never = preset;
      void _exhaustive;
      return { opacity: 1, transform: 'translate(0, 0)' };
    }
  }
}
