import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { z } from 'zod';

/**
 * Composition stub minimale pour le template BUT — Générique.
 *
 * Affiche le buteur + numéro + minute en gros sur fond `primaryColor` du brand
 * kit. C'est un placeholder pour permettre le test E2E du pipeline render
 * (manifest → bindings → render → MP4 sur FTP). Le design final viendra
 * dans une itération séparée (probablement portée depuis le legacy
 * `JoueurButGeneriqueV1.tsx` qui est toujours dans `templates-remotion/`).
 */
export const butGeneriqueSchema = z.object({
  scorerName: z.string().default('PRÉNOM NOM'),
  scorerNumber: z.string().nullable().default('10'),
  scorerPhoto: z.string().nullable().default(null),
  assistName: z.string().nullable().default(null),
  minute: z.number().int().min(1).max(130).default(45),
  clubName: z.string().nullable().default(null),
  clubLogo: z.string().nullable().default(null),
  primaryColor: z.string().default('#0a1d3b'),
  secondaryColor: z.string().nullable().default(null),
});

export type ButGeneriqueProps = z.infer<typeof butGeneriqueSchema>;

export const ButGeneriqueComposition: React.FC<ButGeneriqueProps> = ({
  scorerName,
  scorerNumber,
  scorerPhoto,
  assistName,
  minute,
  clubName,
  clubLogo,
  primaryColor,
  secondaryColor,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const numberScale = interpolate(frame, [10, 40], [0.4, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: primaryColor,
        color: secondaryColor ?? '#ffffff',
        opacity,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      {clubLogo && (
        <img
          src={clubLogo}
          alt=""
          style={{ width: 220, height: 220, objectFit: 'contain', marginBottom: 40 }}
        />
      )}

      <div style={{ fontSize: 110, fontWeight: 900, letterSpacing: 4 }}>BUT !</div>

      {scorerPhoto && (
        <img
          src={scorerPhoto}
          alt=""
          style={{
            width: 600,
            height: 600,
            objectFit: 'cover',
            borderRadius: '50%',
            margin: '40px 0',
          }}
        />
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 32,
          marginTop: 20,
        }}
      >
        {scorerNumber && (
          <div
            style={{
              fontSize: 200,
              fontWeight: 900,
              transform: `scale(${numberScale})`,
              lineHeight: 1,
            }}
          >
            #{scorerNumber}
          </div>
        )}

        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 90, fontWeight: 800, lineHeight: 1.05 }}>{scorerName}</div>
          <div style={{ fontSize: 60, opacity: 0.85, marginTop: 16 }}>{minute}&apos;</div>
          {assistName && (
            <div style={{ fontSize: 40, opacity: 0.7, marginTop: 12 }}>
              passe : {assistName}
            </div>
          )}
        </div>
      </div>

      {clubName && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            fontSize: 50,
            fontWeight: 700,
            opacity: 0.9,
          }}
        >
          {clubName}
        </div>
      )}
    </AbsoluteFill>
  );
};
