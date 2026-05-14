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
import { useCustomFont } from '../../lib/useCustomFont';

// Identité visuelle figée du template (palette du tournoi).
// Le brand kit du club n'affecte PAS ce template en V1 (pas de binding).
// Couleur de fond et accents restent les valeurs maîtres du design.
const BG_NAVY = '#08122a';

// `__assets` : Record<string, string> injecté par le worker render
// (cf studio-render-worker.service.ts). Chaque clé correspond à un slot
// déclaré dans `manifest.requiredAssets[].key`. Optionnel dans le schéma
// Zod pour conserver la compat preview Remotion (defaultProps).
//
// ADR-125 — fini les `staticFile()` hardcodés. La résolution se fait DB
// via les bindings `studio_template_asset_bindings`.
export const faitsDeJeuSchema = z.object({
  label: z.string().default('2MIN'),
  __assets: z.record(z.string(), z.string()).optional(),
});

export type FaitsDeJeuProps = z.infer<typeof faitsDeJeuSchema>;

const fill: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1920,
  height: 1080,
};

export const FaitsDeJeuComposition: React.FC<FaitsDeJeuProps> = ({
  label,
  __assets,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textScale = spring({ frame, fps, config: { stiffness: 80, damping: 18 } });
  const textOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  const assets = __assets ?? {};
  const metalTextureUrl = assets.metalTexture;
  const lensFlareUrl = assets.lensFlare;
  const watermarkUrl = assets.watermarkNeopro;

  // Charge la font Bulevar depuis l'asset library (ADR-127). delayRender
  // garantit que renderMedia attend la font chargée avant la 1ère frame —
  // sans ça, le fallback `sans-serif` aurait été baked dans la vidéo.
  useCustomFont('Bulevar', assets.bulevarFont);

  return (
    <div style={{ ...fill, overflow: 'hidden', background: BG_NAVY }}>
      {metalTextureUrl ? (
        <Img
          src={metalTextureUrl}
          style={{
            ...fill,
            objectFit: 'cover',
            filter: 'brightness(0.38) sepia(1) saturate(2.2) hue-rotate(195deg)',
          }}
        />
      ) : null}

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
            // Bulevar chargée via useCustomFont (ADR-127). Si l'asset font
            // n'est pas bound côté admin, fallback sans-serif transparent.
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

      {lensFlareUrl ? (
        <OffthreadVideo
          src={lensFlareUrl}
          style={{ ...fill, objectFit: 'cover', mixBlendMode: 'screen' }}
          muted
        />
      ) : null}

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

      {watermarkUrl ? (
        <Img
          src={watermarkUrl}
          style={{
            position: 'absolute',
            bottom: 32,
            right: 44,
            width: 180,
            opacity: 0.4,
          }}
        />
      ) : null}
    </div>
  );
};
