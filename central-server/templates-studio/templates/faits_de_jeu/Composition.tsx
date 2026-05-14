import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';

/**
 * Composition stub minimale pour le template FAITS DE JEU.
 *
 * **Stub autonome** : zéro asset externe (les anciens `metal_texture.png`,
 * `lens_flare_web.mp4`, `watermark_neopro.png` n'existent pas dans le repo —
 * ils vivent sur FTP). Le design original sera étoffé dans une PR séparée
 * une fois la pipeline assets résolue.
 *
 * Affiche le label (2MIN / PÉNALTY / CARTON / etc.) en gros sur fond
 * dégradé navy + bande accent jaune animée. Animation spring d'apparition.
 */
export const faitsDeJeuSchema = z.object({
  label: z.string().default('2MIN'),
});

export type FaitsDeJeuProps = z.infer<typeof faitsDeJeuSchema>;

const BG_NAVY = '#08122a';
const BG_NAVY_LIGHT = '#1b2c54';
const ACCENT = '#ffd400';

export const FaitsDeJeuComposition: React.FC<FaitsDeJeuProps> = ({ label }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const textScale = spring({ frame, fps, config: { stiffness: 80, damping: 18 } });
  const textOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  const accentBarWidth = interpolate(frame, [10, 35], [0, width * 0.6], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, ${BG_NAVY_LIGHT} 0%, ${BG_NAVY} 70%)`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Bande accent jaune horizontale qui s'étire en spring */}
      <div
        style={{
          position: 'absolute',
          top: height / 2 - 6,
          left: (width - accentBarWidth) / 2,
          width: accentBarWidth,
          height: 12,
          background: ACCENT,
          opacity: 0.85,
        }}
      />

      <div
        style={{
          fontSize: 220,
          fontWeight: 900,
          letterSpacing: 8,
          transform: `scale(${textScale})`,
          opacity: textOpacity,
          textShadow: '0 8px 30px rgba(0,0,0,0.6)',
          lineHeight: 1,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};
