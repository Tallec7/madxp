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
import { usePreloadFrameSequence } from '../../lib/usePreloadFrameSequence';

/**
 * BUT — Générique (ADR-128, port du design legacy V2 `joueur_but_generique.v1`).
 *
 * Spec source : git aca60b8b:studio-render-server/spec/templates/joueur_but_generique.v1.json
 *
 * Format : 1920×1080 @ 25 fps, 7000 ms = 175 frames.
 *
 * Structure :
 *  - 5 layers WebM superposés via `<OffthreadVideo>` :
 *      A (zIndex 0)  intro logo
 *      B (zIndex 2)  transition
 *      C (zIndex 1)  titre BUT (avec masque alpha PNG frames)
 *      P (zIndex 3)  packshot photo joueur (masque alpha PNG frames)
 *      D (zIndex 4)  outro
 *  - Masques alpha = séquence PNG frames stockée dans la library Studio
 *    (asset_kind='directory', ADR-128). Le runtime interpole la frame
 *    courante via `useCurrentFrame()` + `framePattern`.
 *  - Texts : nomClub aux 4 coins (font General Sans), prenomNom + numero
 *    (font Bulevar) avec animations spring scale.
 *  - Image slot photo joueur : positionné dans la safeZone du packshot.
 *
 * Tous les assets (vidéos, masques PNG frames, fonts) sont injectés via
 * `__assets[key]` par le worker render depuis les bindings DB (ADR-125).
 */

// Shape pour les directories : { kind, baseUrl, framePattern, frameCount }.
const directoryAssetSchema = z.object({
  kind: z.literal('directory'),
  baseUrl: z.string(),
  framePattern: z.string(),
  frameCount: z.number(),
});

const assetValueSchema = z.union([z.string(), directoryAssetSchema]);

export const butGeneriqueSchema = z.object({
  scorerName: z.string().default('PRÉNOM NOM'),
  scorerNumber: z.string().nullable().default('10'),
  scorerPhoto: z.string().nullable().default(null),
  assistName: z.string().nullable().default(null),
  minute: z.number().int().min(1).max(130).default(45),
  clubName: z.string().nullable().default('NOM DU CLUB'),
  clubLogo: z.string().nullable().default(null),
  primaryColor: z.string().default('#0a1d3b'),
  secondaryColor: z.string().nullable().default('#ffffff'),
  __assets: z.record(z.string(), assetValueSchema).optional(),
});

export type ButGeneriqueProps = z.infer<typeof butGeneriqueSchema>;
type DirectoryAssetRef = z.infer<typeof directoryAssetSchema>;

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

// Helpers ─────────────────────────────────────────────────────────────────────

function isDirectoryAsset(
  value: string | DirectoryAssetRef | undefined,
): value is DirectoryAssetRef {
  return typeof value === 'object' && value !== null && value.kind === 'directory';
}

function asString(value: string | DirectoryAssetRef | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Interpole une URL de frame depuis le baseUrl + framePattern + index 1-based.
 * Pattern : `frame_{i:03d}.png` → `frame_001.png`.
 */
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

// Layer WebM générique avec masque alpha PNG frames optionnel via SVG <mask>.
const MaskedLayer: React.FC<{
  videoUrl: string;
  maskAsset?: DirectoryAssetRef;
  maskFrameOffset?: number;
  zIndex: number;
}> = ({ videoUrl, maskAsset, maskFrameOffset = 0, zIndex }) => {
  const frame = useCurrentFrame();
  const maskUrl = maskAsset
    ? frameUrl(maskAsset, frame + 1 + maskFrameOffset)
    : null;
  // SVG mask : on peint l'image PNG frames comme luminance source. Les zones
  // blanches du PNG = visibles ; noir = transparent. Compose via CSS
  // `mask-image: url(...)` + `mask-mode: luminance` pour une compatibilité
  // headless Chrome maximale (cf. décision Daisy : SVG mask > CSS direct).
  const maskId = `mask-${zIndex}-${frame}`;
  return (
    <div style={{ ...fillStyle, zIndex }}>
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
              src={videoUrl}
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, objectFit: 'cover' }}
              muted
            />
          </foreignObject>
        </svg>
      ) : (
        <OffthreadVideo
          src={videoUrl}
          style={fillStyle}
          muted
        />
      )}
    </div>
  );
};

export const ButGeneriqueComposition: React.FC<ButGeneriqueProps> = ({
  scorerName,
  scorerNumber,
  scorerPhoto,
  clubName,
  primaryColor,
  __assets,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const assets = __assets ?? {};

  const layerA = asString(assets.layerA);
  const layerB = asString(assets.layerB);
  const layerC = asString(assets.layerC);
  const layerD = asString(assets.layerD);
  const packshot = asString(assets.packshot);
  const maskC = isDirectoryAsset(assets.maskC) ? assets.maskC : undefined;
  const maskPackshot = isDirectoryAsset(assets.maskPackshot)
    ? assets.maskPackshot
    : undefined;

  // Fonts custom (ADR-127). Fallback sans-serif si l'asset n'est pas bound.
  useCustomFont('Bulevar', asString(assets.fontBulevar));
  useCustomFont('General Sans', asString(assets.fontGeneralSans));

  // Précharge les masques PNG frames avant tout screenshot (delayRender). Sans
  // ça, Chromium headless sur Railway Hobby capture des frames pendant que les
  // <image href> SVG sont encore en cours de fetch FTP → masques vides → layers
  // visibles plein écran. Inutile en local (réseau rapide) mais critique en prod.
  usePreloadFrameSequence(maskC, 'butGenerique:maskC');
  usePreloadFrameSequence(maskPackshot, 'butGenerique:maskPackshot');

  // Animations spring pour les texts qui apparaissent à frame 2.5s = 62.5 (~63).
  // Reproduit le `appearAt: 2.5, scale-only` du spec legacy.
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

  // Titre BUT : appearAt: 1, scale-only (1 → 0.8). Reproduit avec spring.
  const titreAppearFrame = Math.round(1 * fps);
  const titreVisible = frame >= titreAppearFrame;
  const titreScale = titreVisible
    ? spring({
        frame: frame - titreAppearFrame,
        fps,
        from: 1,
        to: 0.8,
        config: { stiffness: 100, damping: 20 },
      })
    : 0;

  // Photo joueur : appearAt: 2.5, scale-only (0.5 → 1).
  const photoVisible = frame >= textAppearFrame;
  const photoScale = photoVisible
    ? spring({
        frame: frame - textAppearFrame,
        fps,
        from: 0.5,
        to: 1,
        config: { stiffness: 80, damping: 16 },
      })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: primaryColor, overflow: 'hidden' }}>
      {/* Layer A — intro (zIndex 0). Plein écran, alpha self. */}
      {layerA && <MaskedLayer videoUrl={layerA} zIndex={0} />}

      {/* Layer C — titre BUT avec masque alpha PNG frames (zIndex 1). */}
      {layerC && <MaskedLayer videoUrl={layerC} maskAsset={maskC} zIndex={1} />}

      {/* Layer B — transition (zIndex 2). */}
      {layerB && <MaskedLayer videoUrl={layerB} zIndex={2} />}

      {/* Texte titre BUT positionné sur le layer C (centre, 0.5/0.55, Bulevar 300). */}
      {titreVisible && (
        <div
          style={{
            position: 'absolute',
            top: '55%',
            left: '50%',
            transform: `translate(-50%, -50%) scale(${titreScale})`,
            fontFamily: 'Bulevar, sans-serif',
            fontSize: 300,
            color: '#FFFFFF',
            textTransform: 'uppercase',
            lineHeight: 1.1,
            zIndex: 1,
            whiteSpace: 'nowrap',
          }}
        >
          BUT
        </div>
      )}

      {/* Layer P — packshot avec masque alpha PNG frames (zIndex 3). */}
      {packshot && <MaskedLayer videoUrl={packshot} maskAsset={maskPackshot} zIndex={3} />}

      {/* Photo joueur slot (zIndex 3, positionné selon safeZone du packshot). */}
      {scorerPhoto && photoVisible && (
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
            src={scorerPhoto}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top',
            }}
          />
        </div>
      )}

      {/* Texts — apparaissent en même temps que la photo joueur. */}
      {textsVisible && clubName && (
        <>
          {/* Club top-left */}
          <ClubLabel position="top-left" scale={textsScale} label={clubName} />
          {/* Club bottom-left */}
          <ClubLabel position="bottom-left" scale={textsScale} label={clubName} />
          {/* Club bottom-right */}
          <ClubLabel position="bottom-right" scale={textsScale} label={clubName} />
        </>
      )}

      {textsVisible && (
        <>
          {/* Prénom Nom — left, large (Bulevar 300) */}
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
            {scorerName.replace(' ', '\n')}
          </div>

          {/* Numero — right, énorme (Bulevar 600) */}
          {scorerNumber && (
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
              {scorerNumber}
            </div>
          )}
        </>
      )}

      {/* Layer D — outro (zIndex 4). */}
      {layerD && <MaskedLayer videoUrl={layerD} zIndex={4} />}
    </AbsoluteFill>
  );
};

/**
 * Label nom du club ré-utilisé aux 4 coins du packshot. Position en %
 * (4 angles) avec letter-spacing accentué (texture typo legacy V2).
 */
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
