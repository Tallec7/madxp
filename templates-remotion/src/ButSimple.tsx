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
import { MaskedCanvas, drawText, useFontsReady, useMaskFrames } from "./mask-canvas";

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
  const { fps, durationInFrames } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });
  const logoOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  // ── Masque alpha pré-calculé + rendu canvas ────────────────────────────
  // Les PNGs de masque (extraits de C.webm via scripts/extract-masks.sh) sont
  // tous préchargés en HTMLImageElement au mount, puis MaskedCanvas dessine
  // texte + masque en un seul raster par frame. Voir src/mask-canvas.tsx pour
  // le pourquoi (flash CSS mask-image sur les URL qui changent).
  const maskFrames = useMaskFrames('masks/but-simple-C', durationInFrames);
  const fontsReady = useFontsReady();

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

      {/* ── COUCHE 4 : Texte dessiné en canvas + masqué par l'alpha de C ─── */}
      {/* Canvas 1920×1080 : dessine nom/prénom/club puis applique le masque
          en un seul raster par frame (destination-in). Remplace CSS mask-image
          dont le swap d'URL par frame flashait sur le preview. */}
      {fontsReady && (
        <MaskedCanvas
          maskFrames={maskFrames}
          draw={(ctx) => {
            // Club name — haut
            drawText(ctx, {
              x: 960,
              y: 120 + 28 * 0.82,
              text: club.toUpperCase(),
              font: "600 28px 'GeneralSans', sans-serif",
              color: "rgba(255,255,255,0.7)",
              textAlign: "center",
              textBaseline: "alphabetic",
              letterSpacing: 10,
            });
            // Prénom + nom — centré, 2 lignes
            const nameFont = "400 330px 'Bulevar', sans-serif";
            const lineHeight = 330 * 0.85;
            drawText(ctx, {
              x: 960,
              y: 540 - lineHeight / 2 + 330 * 0.82,
              text: prenom.toUpperCase(),
              font: nameFont,
              color: "#ffffff",
              textAlign: "center",
              shadow: { color: "rgba(0,0,0,0.3)", blur: 8, offsetX: 2, offsetY: 4 },
            });
            drawText(ctx, {
              x: 960,
              y: 540 + lineHeight / 2 + 330 * 0.82,
              text: nom.toUpperCase(),
              font: nameFont,
              color: "#ffffff",
              textAlign: "center",
              shadow: { color: "rgba(0,0,0,0.3)", blur: 8, offsetX: 2, offsetY: 4 },
            });
            // Club name — bas
            drawText(ctx, {
              x: 960,
              y: 930 + 28 * 0.82,
              text: club.toUpperCase(),
              font: "600 28px 'GeneralSans', sans-serif",
              color: "rgba(255,255,255,0.7)",
              textAlign: "center",
              letterSpacing: 10,
            });
          }}
        />
      )}

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

