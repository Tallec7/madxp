import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import { useCustomFont } from '../../lib/useCustomFont';

/**
 * ENTRÉE Joueur (ADR-128, port du design legacy V2 `joueur_entree_generique.v1`).
 *
 * Spec source : git aca60b8b:studio-render-server/spec/templates/joueur_entree_generique.v1.json
 *
 * Format : 1920×1080. `kind='still'` → le worker capture la frame définie
 * dans `manifest.stillFrame` (par défaut 174 = dernière frame, packshot
 * complètement révélé + texts visibles).
 *
 * Structure :
 *  - 1 layer WebM (`packshot` = `PACKSHOT_IMG.webm`) avec masque alpha
 *    PNG frames `maskPackshot`.
 *  - Photo joueur dans la safeZone du packshot.
 *  - Texts : nomClub aux 4 coins (General Sans), prenomNom + numero (Bulevar).
 *
 * Bien que rendu en still, la composition utilise `useCurrentFrame()` pour
 * interpoler le masque + jouer les animations spring → la frame capturée
 * (174) montre l'état final du reveal.
 */

const directoryAssetSchema = z.object({
  kind: z.literal('directory'),
  baseUrl: z.string(),
  framePattern: z.string(),
  frameCount: z.number(),
});

const assetValueSchema = z.union([z.string(), directoryAssetSchema]);

export const entreeJoueurSchema = z.object({
  playerName: z.string().default('PRÉNOM NOM'),
  playerNumber: z.string().nullable().default('10'),
  playerPhoto: z.string().nullable().default(null),
  playerPoste: z.string().nullable().default(null),
  clubName: z.string().nullable().default('NOM DU CLUB'),
  clubLogo: z.string().nullable().default(null),
  primaryColor: z.string().default('#0a1d3b'),
  secondaryColor: z.string().nullable().default('#ffffff'),
  __assets: z.record(z.string(), assetValueSchema).optional(),
});

export type EntreeJoueurProps = z.infer<typeof entreeJoueurSchema>;
type DirectoryAssetRef = z.infer<typeof directoryAssetSchema>;

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

function isDirectoryAsset(
  value: string | DirectoryAssetRef | undefined,
): value is DirectoryAssetRef {
  return typeof value === 'object' && value !== null && value.kind === 'directory';
}

function asString(value: string | DirectoryAssetRef | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function frameUrl(asset: DirectoryAssetRef, frameIdx: number): string {
  const idx = Math.max(1, Math.min(asset.frameCount, frameIdx));
  const interpolated = asset.framePattern.replace(/\{i:0(\d+)d\}/, (_match, padding) =>
    String(idx).padStart(parseInt(padding, 10), '0'),
  );
  return asset.baseUrl + interpolated;
}

const fillStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
};

export const EntreeJoueurComposition: React.FC<EntreeJoueurProps> = ({
  playerName,
  playerNumber,
  playerPhoto,
  clubName,
  primaryColor,
  __assets,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const assets = __assets ?? {};

  const packshot = asString(assets.packshot);
  const maskPackshot = isDirectoryAsset(assets.maskPackshot)
    ? assets.maskPackshot
    : undefined;

  useCustomFont('Bulevar', asString(assets.fontBulevar));
  useCustomFont('General Sans', asString(assets.fontGeneralSans));

  const textAppearFrame = Math.round(2.5 * fps);
  const textsVisible = frame >= textAppearFrame;
  const textsScale = textsVisible
    ? spring({
        frame: frame - textAppearFrame,
        fps,
        from: 0.3,
        to: 1,
        config: { stiffness: 80, damping: 16 },
      })
    : 0;
  const photoScale = textsVisible
    ? spring({
        frame: frame - textAppearFrame,
        fps,
        from: 0.5,
        to: 1,
        config: { stiffness: 80, damping: 16 },
      })
    : 0;

  const maskUrl = maskPackshot ? frameUrl(maskPackshot, frame + 1) : null;
  const maskId = `entree-mask-${frame}`;

  return (
    <AbsoluteFill style={{ backgroundColor: primaryColor, overflow: 'hidden' }}>
      {/* Packshot WebM avec masque alpha PNG frames (zIndex 3, comme legacy). */}
      {packshot && (
        <div style={{ ...fillStyle, zIndex: 3 }}>
          {maskUrl ? (
            <svg
              style={{ ...fillStyle, position: 'absolute' }}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            >
              <defs>
                <mask id={maskId}>
                  <image
                    href={maskUrl}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    preserveAspectRatio="none"
                  />
                </mask>
              </defs>
              <foreignObject
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                mask={`url(#${maskId})`}
              >
                <OffthreadVideo
                  src={packshot}
                  style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, objectFit: 'cover' }}
                  muted
                />
              </foreignObject>
            </svg>
          ) : (
            <OffthreadVideo src={packshot} style={fillStyle} muted />
          )}
        </div>
      )}

      {/* Photo joueur (zIndex 3, safeZone du packshot). */}
      {playerPhoto && textsVisible && (
        <div
          style={{
            position: 'absolute',
            top: '6%',
            left: '55%',
            width: '37.5%',
            height: '88%',
            transform: `scale(${photoScale})`,
            transformOrigin: 'top center',
            zIndex: 3,
          }}
        >
          <Img
            src={playerPhoto}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top',
            }}
          />
        </div>
      )}

      {textsVisible && clubName && (
        <>
          <ClubLabel position="top-left" scale={textsScale} label={clubName} />
          <ClubLabel position="bottom-left" scale={textsScale} label={clubName} />
          <ClubLabel position="bottom-right" scale={textsScale} label={clubName} />
        </>
      )}

      {textsVisible && (
        <>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '13.33%',
              transform: `translateY(-50%) scale(${textsScale})`,
              transformOrigin: 'left center',
              fontFamily: 'Bulevar, sans-serif',
              fontSize: 300,
              color: '#FFFFFF',
              textTransform: 'uppercase',
              lineHeight: 0.85,
              zIndex: 4,
              maxWidth: '60%',
              whiteSpace: 'pre-line',
            }}
          >
            {playerName.replace(' ', '\n')}
          </div>

          {playerNumber && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                right: '13.28%',
                transform: `translateY(-50%) scale(${textsScale})`,
                transformOrigin: 'right center',
                fontFamily: 'Bulevar, sans-serif',
                fontSize: 600,
                color: '#FFFFFF',
                lineHeight: 1,
                zIndex: 4,
                textAlign: 'right',
              }}
            >
              {playerNumber}
            </div>
          )}
        </>
      )}
    </AbsoluteFill>
  );
};

const ClubLabel: React.FC<{
  position: 'top-left' | 'bottom-left' | 'bottom-right';
  scale: number;
  label: string;
}> = ({ position, scale, label }) => {
  const isRight = position === 'bottom-right';
  const top = position === 'top-left' ? '10%' : '91.85%';
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: isRight ? undefined : '4.896%',
        right: isRight ? '5%' : undefined,
        transform: `scale(${scale})`,
        transformOrigin: isRight ? 'right top' : 'left top',
        fontFamily: 'General Sans, sans-serif',
        fontSize: 25,
        letterSpacing: '20px',
        color: '#FFFFFF',
        fontWeight: 600,
        textTransform: 'uppercase',
        lineHeight: 1.1,
        maxWidth: '40%',
        textAlign: isRight ? 'right' : 'left',
        zIndex: 5,
      }}
    >
      {label}
    </div>
  );
};
