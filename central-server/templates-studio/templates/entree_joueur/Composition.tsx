import React from 'react';
import { AbsoluteFill } from 'remotion';
import { z } from 'zod';

/**
 * Composition stub minimale pour le template ENTRÉE Joueur.
 *
 * Kind: 'still' → 1 frame PNG. Affiche le joueur (photo détourée si dispo,
 * sinon initiales) + nom + numéro + poste sur fond `primaryColor`. Le design
 * final viendra dans une itération séparée.
 */
export const entreeJoueurSchema = z.object({
  playerName: z.string().default('PRÉNOM NOM'),
  playerNumber: z.string().nullable().default('10'),
  playerPhoto: z.string().nullable().default(null),
  playerPoste: z.string().nullable().default(null),
  clubName: z.string().nullable().default(null),
  clubLogo: z.string().nullable().default(null),
  primaryColor: z.string().default('#0a1d3b'),
  secondaryColor: z.string().nullable().default(null),
});

export type EntreeJoueurProps = z.infer<typeof entreeJoueurSchema>;

export const EntreeJoueurComposition: React.FC<EntreeJoueurProps> = ({
  playerName,
  playerNumber,
  playerPhoto,
  playerPoste,
  clubName,
  clubLogo,
  primaryColor,
  secondaryColor,
}) => {
  const fg = secondaryColor ?? '#ffffff';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: primaryColor,
        color: fg,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 100,
      }}
    >
      {/* Colonne photo */}
      <div
        style={{
          width: 800,
          height: 800,
          borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {playerPhoto ? (
          <img
            src={playerPhoto}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ fontSize: 320, fontWeight: 900, opacity: 0.3 }}>
            {playerName
              .split(' ')
              .map((w) => w.charAt(0))
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
        )}
      </div>

      {/* Colonne texte */}
      <div style={{ marginLeft: 80, flex: 1 }}>
        {playerNumber && (
          <div style={{ fontSize: 180, fontWeight: 900, lineHeight: 1, opacity: 0.95 }}>
            #{playerNumber}
          </div>
        )}

        <div style={{ fontSize: 110, fontWeight: 900, lineHeight: 1.05, marginTop: 30 }}>
          {playerName}
        </div>

        {playerPoste && (
          <div style={{ fontSize: 60, fontWeight: 600, opacity: 0.75, marginTop: 24 }}>
            {playerPoste}
          </div>
        )}

        {clubName && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              marginTop: 60,
              opacity: 0.9,
            }}
          >
            {clubLogo && (
              <img
                src={clubLogo}
                alt=""
                style={{ width: 100, height: 100, objectFit: 'contain' }}
              />
            )}
            <div style={{ fontSize: 60, fontWeight: 700 }}>{clubName}</div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
