import React from 'react';
import {
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import { ShieldPattern } from './ShieldPattern';
import { asset } from './asset';

// Identité visuelle figée du template (palette du tournoi).
// Le brand kit du club n'affecte PAS ce template en V1 (pas de binding).
// Couleur de fond et accents restent les valeurs maîtres du design.
const BG_NAVY = '#08122a';

export const faitsDeJeuSchema = z.object({
  label: z.string().default('2MIN'),
});

export type FaitsDeJeuProps = z.infer<typeof faitsDeJeuSchema>;

const fill: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1920,
  height: 1080,
};

export const FaitsDeJeuComposition: React.FC<FaitsDeJeuProps> = ({ label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textScale = spring({ frame, fps, config: { stiffness: 80, damping: 18 } });
  const textOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ ...fill, overflow: 'hidden', background: BG_NAVY }}>
      <Img
        src={asset('metal_texture.png')}
        style={{
          ...fill,
          objectFit: 'cover',
          filter: 'brightness(0.38) sepia(1) saturate(2.2) hue-rotate(195deg)',
        }}
      />

      <ShieldPattern />

      <div
        style={{
          ...fill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'Bulevar, sans-serif',
            fontSize: 720,
            color: '#FFFFFF',
            opacity: 0.055,
            textTransform: 'uppercase',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {label}
        </span>
      </div>

      <OffthreadVideo
        src={asset('lens_flare_web.mp4')}
        style={{ ...fill, objectFit: 'cover', mixBlendMode: 'screen' }}
        muted
      />

      <div
        style={{
          ...fill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${textScale})`,
          opacity: textOpacity,
        }}
      >
        <span
          style={{
            fontFamily: 'Bulevar, sans-serif',
            fontSize: 380,
            color: '#FFFFFF',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          {label}
        </span>
      </div>

      <Img
        src={asset('watermark_neopro.png')}
        style={{
          position: 'absolute',
          bottom: 32,
          right: 44,
          width: 180,
          opacity: 0.4,
        }}
      />
    </div>
  );
};
