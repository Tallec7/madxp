import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";

// ── Helper : luminance mask style from pre-extracted PNG sequence ────────────
// Cast needed because React.CSSProperties doesn't include WebkitMaskMode.
const luminanceMask = (url: string): React.CSSProperties =>
  ({
    WebkitMaskImage: `url("${url}")`,
    WebkitMaskMode: "luminance",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "100% 100%",
    maskImage: `url("${url}")`,
    maskMode: "luminance",
    maskRepeat: "no-repeat",
    maskSize: "100% 100%",
  }) as React.CSSProperties;

// ─────────────────────────────────────────────────────────────────────────────
// SCHÉMA DES PROPS
// ─────────────────────────────────────────────────────────────────────────────
export const butSimpleSchema = z.object({
  prenom: z.string(),
  nom: z.string(),
  club: z.string(),
  logoSrc: z.string().default("logo_club.png"),
  logoSize: z.number().default(500), // largeur du logo en px — ajustable dans Studio ou à l'API
  // Assets vidéo — URL FTP si fourni, sinon fallback sur staticFile() local
  videoSrcA: z.string().optional(),
  videoSrcB: z.string().optional(),
  videoSrcC: z.string().optional(),
});

type Props = z.infer<typeof butSimpleSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITION PRINCIPALE
//
// ORDRE DES COUCHES (de bas en haut) :
//   1. BUT_simple_A.webm  — fond animé (hexagones dorés)      [OffthreadVideo]
//   2. Logo club          — scale-in (spring)
//   3. BUT_simple_C.webm  — packshot fond doré                 [OffthreadVideo]
//   4. Texte              — masqué par PNG grayscale pré-extrait de C (luminance)
//   5. BUT_simple_B.webm  — wipe/transition par-dessus tout    [OffthreadVideo]
//
// Le masque alpha est pré-calculé : scripts/extract-masks.sh extrait les frames
// alpha de C.webm en PNG 480×270. Chaque frame de la composition charge le PNG
// correspondant via staticFile() — plus besoin de delayRender/canvas/toDataURL.
// ─────────────────────────────────────────────────────────────────────────────
// Résout une URL vidéo : URL FTP/blob/remotion-file/data directe si fournie, sinon staticFile() local.
// Défensif : si fallback est vide/undefined, retourne "" pour éviter staticFile(undefined) crash.
const resolveVideo = (url: string | undefined, fallback: string | undefined): string => {
  if (url && (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('remotion-file:') || url.startsWith('data:'))) return url;
  if (!fallback) return '';
  return staticFile(fallback);
};

export const ButSimple: React.FC<Props> = ({ prenom = '', nom = '', club = '', logoSrc = 'logo_club.png', logoSize = 500, videoSrcA, videoSrcB, videoSrcC }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });
  const logoOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  // ── Masque alpha pré-calculé ────────────────────────────────────────────
  // Les frames alpha de C.webm ont été extraites en PNG grayscale 480×270 au build time
  // (scripts/extract-masks.sh). On charge directement l'image correspondant à la frame
  // courante → élimine delayRender + canvas.toDataURL + Video ref + swangle decode.
  // mask-mode: luminance → blanc = visible, noir = masqué.
  const maskFrame = String(frame + 1).padStart(4, '0');
  const maskUrl = staticFile(`masks/but-simple-C/${maskFrame}.png`);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>

      {/* ── FONTS ───────────────────────────────────────────────────────────── */}
      <style>{`
        @font-face {
          font-family: 'Bulevar';
          src: url('${staticFile("Bulevar-Regular.otf")}') format('opentype');
          font-weight: 400;
          font-style: normal;
        }
        @font-face {
          font-family: 'GeneralSans';
          src: url('${staticFile("GeneralSans-Semibold.otf")}') format('opentype');
          font-weight: 600;
          font-style: normal;
        }
      `}</style>

      {/* ── COUCHE 1 : Fond animé ──────────────────────────────────────────── */}
      <OffthreadVideo src={resolveVideo(videoSrcA, "BUT_simple_A.webm")} style={layerStyle} />

      {/* ── COUCHE 2 : Logo club ──────────────────────────────────────────── */}
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img
          src={logoSrc.startsWith("remotion-file:") || logoSrc.startsWith("http") || logoSrc.startsWith("data:") ? logoSrc : staticFile(logoSrc)}
          alt="Logo"
          style={{
            width: logoSize,
            height: "auto",
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
          }}
        />
      </AbsoluteFill>

      {/* ── COUCHE 3 : Packshot C (now OffthreadVideo — FFmpeg native decode) */}
      <OffthreadVideo
        src={resolveVideo(videoSrcC, "BUT_simple_C.webm")}
        style={layerStyle}
      />

      {/* ── COUCHE 4 : Texte masqué par l'alpha pré-calculé de C ──────────── */}
      {/* Le masque est une image PNG grayscale chargée par frame index.
          mask-mode: luminance → blanc = visible, noir = masqué.
          Plus besoin de delayRender/continueRender ni de canvas.toDataURL. */}
      <div
        style={{
          position: "absolute",
          width: 1920,
          height: 1080,
          ...luminanceMask(maskUrl),
        }}
      >
        <span style={clubNameStyle(120)}>{club.toUpperCase()}</span>
        <div style={playerBlockStyle}>
          <div style={playerNameStyle}>{prenom.toUpperCase()}</div>
          <div style={playerNameStyle}>{nom.toUpperCase()}</div>
        </div>
        <span style={clubNameStyle(930)}>{club.toUpperCase()}</span>
      </div>

      {/* ── COUCHE 5 : Wipe B ─────────────────────────────────────────────── */}
      <OffthreadVideo src={resolveVideo(videoSrcB, "BUT_simple_B.webm")} style={layerStyle} />

    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const layerStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 1920,
  height: 1080,
  objectFit: "cover",
};

const playerBlockStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  textAlign: "center",
};

// Pour changer la taille : modifier fontSize (px)
// Police : Bulevar (chargée via loadFont ci-dessus)
const playerNameStyle: React.CSSProperties = {
  fontSize: 330,
  fontFamily: "'Bulevar', sans-serif",
  fontWeight: 400,
  lineHeight: 0.85,
  color: "#ffffff",
  textTransform: "uppercase",
  textShadow: "2px 4px 8px rgba(0,0,0,0.3)",
};

// top: 215 = haut de l'écran, top: 860 = bas de l'écran
// Police : GeneralSans (chargée via loadFont ci-dessus)
const clubNameStyle = (top: number): React.CSSProperties => ({
  position: "absolute",
  top,
  left: "50%",
  transform: "translateX(-50%)",
  fontFamily: "'GeneralSans', sans-serif",
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: 10,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.7)",
  textAlign: "center",
  whiteSpace: "nowrap",
});
