import React from 'react';
import {
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import { ShieldPattern } from './ShieldPattern';

export const faitsDeJeu2MinSchema = z.object({
  label: z.string().default('2MIN'),
});

type Props = z.infer<typeof faitsDeJeu2MinSchema>;

const fill: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1920,
  height: 1080,
};

export const FaitsDeJeu2Min: React.FC<Props> = ({ label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textScale = spring({ frame, fps, config: { stiffness: 80, damping: 18 } });
  const textOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ ...fill, overflow: 'hidden', background: '#08122a' }}>
      {/* Fond : texture métal teintée bleu marine */}
      <Img
        src={staticFile('metal_texture.png')}
        style={{
          ...fill,
          objectFit: 'cover',
          filter: 'brightness(0.38) sepia(1) saturate(2.2) hue-rotate(195deg)',
        }}
      />

      {/* Hexagones concentriques */}
      <ShieldPattern />

      {/* Texte ghost en arrière-plan */}
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
            textTransform: 'uppercase' as const,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {label}
        </span>
      </div>

      {/* Lens flare (screen blend) */}
      <OffthreadVideo
        src={staticFile('lens_flare.mp4')}
        style={{ ...fill, objectFit: 'cover', mixBlendMode: 'screen' }}
      />

      {/* Texte principal */}
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
            textTransform: 'uppercase' as const,
            lineHeight: 1,
          }}
        >
          {label}
        </span>
      </div>

      {/* Watermark NeoPro */}
      <Img
        src={staticFile('watermark_neopro.png')}
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
