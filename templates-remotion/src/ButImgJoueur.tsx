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
import { MaskedCanvas, drawText, useFontsReady, useImageAsset, useMaskFrames } from "./mask-canvas";

// Résout une URL : URL FTP/blob/remotion-file directe si fournie, sinon staticFile() local.
// Défensif : si fallback est vide/undefined (props non renseignée), retourne "" pour éviter
// le crash staticFile(undefined) dans le player bundlé (les defaults zod ne s'appliquent pas
// quand les props arrivent via postMessage depuis le dashboard).
const resolveAsset = (url: string | undefined, fallback: string | undefined): string => {
  if (
    url &&
    (url.startsWith("http") ||
      url.startsWith("blob:") ||
      url.startsWith("remotion-file:") ||
      url.startsWith("data:"))
  ) {
    return url;
  }
  if (!fallback) return "";
  return staticFile(fallback);
};

// ─────────────────────────────────────────────────────────────────────────────
// SCHÉMA DES PROPS
// ─────────────────────────────────────────────────────────────────────────────
export const butImgJoueurSchema = z.object({
  prenom: z.string(),
  nom: z.string(),
  club: z.string(),
  logoSrc: z.string().default("logo_club.png"),
  logoSize: z.number().default(400),
  playerImgSrc: z.string().default(""),
  playerImgSize: z.number().default(1080),   // hauteur en px (1080 = plein écran, >1080 = déborde en haut)
  playerImgLeft: z.number().default(560),    // position gauche en px
  playerImgBottom: z.number().default(0),    // offset bas en px (négatif = descend hors cadre)
  scoreLabel: z.string().default("+1"),
  // Assets vidéo — URL FTP si fourni, sinon fallback sur staticFile() local
  videoSrcA: z.string().optional(),
  videoSrcB: z.string().optional(),
  videoSrcC: z.string().optional(),
  videoSrcD: z.string().optional(),
  videoSrcE: z.string().optional(),
});

type Props = z.infer<typeof butImgJoueurSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITION PRINCIPALE
//
// ORDRE DES COUCHES (de bas en haut) :
//   1. A.webm      — fond animé avec logo club
//   2. Logo club   — spring zoom-in par-dessus A
//   3. C.webm      — transition (ref cVideoRef → source du masque score)
//   4. Score label — au-dessus de C, masqué par l'alpha de C
//   5. E.webm      — transition (ref eVideoRef → source du masque joueur)
//   6. Packshot    — au-dessus de E, masqué par l'alpha de E (photo + nom)
//   7. B.webm      — wipe pur (transition opaque)
//   8. D.webm      — wipe pur (transition opaque)
//
// Le masque CSS :
//   cVideoRef → webkitMaskImage sur scoreRef  → score visible uniquement dans zones opaques de C
//   eVideoRef → webkitMaskImage sur playerRef → joueur visible uniquement dans zones opaques de E
// ─────────────────────────────────────────────────────────────────────────────
export const ButImgJoueur: React.FC<Props> = ({
  prenom,
  nom,
  club,
  logoSrc,
  logoSize,
  playerImgSrc,
  playerImgSize,
  playerImgLeft,
  playerImgBottom,
  scoreLabel,
  videoSrcA,
  videoSrcB,
  videoSrcC,
  videoSrcD,
  videoSrcE,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });
  const logoOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  const playerImgResolved = playerImgSrc ? resolveAsset(playerImgSrc, playerImgSrc) : "";

  // ── Masques alpha pré-calculés + rendu canvas ──────────────────────────
  // Voir src/mask-canvas.tsx : précharge toutes les frames PNG, puis
  // MaskedCanvas dessine contenu + masque en un raster par frame.
  const maskFramesC = useMaskFrames('masks/but-img-joueur-C', durationInFrames);
  const maskFramesE = useMaskFrames('masks/but-img-joueur-E', durationInFrames);
  const playerImg = useImageAsset(playerImgResolved || null);
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

      {/* ── COUCHE 1 : Fond animé A (FFmpeg native decode) ────────────────── */}
      <OffthreadVideo src={resolveAsset(videoSrcA, "BUT_img_joueur_A.webm")} style={layerStyle} />

      {/* ── COUCHE 2 : Logo club ─────────────────────────────────────────────── */}
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img
          src={resolveAsset(logoSrc, logoSrc)}
          alt="Logo"
          style={{
            width: logoSize,
            height: "auto",
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
          }}
        />
      </AbsoluteFill>

      {/* ── COUCHE 3 : Vidéo C (now OffthreadVideo — FFmpeg native decode) ── */}
      <OffthreadVideo
        src={resolveAsset(videoSrcC, "BUT_img_joueur_C.webm")}
        style={layerStyle}
      />

      {/* ── COUCHE 4 : Score label en canvas — masqué par l'alpha de C ───── */}
      {fontsReady && (
        <MaskedCanvas
          maskFrames={maskFramesC}
          draw={(ctx) => {
            drawText(ctx, {
              x: 960,
              y: 540 + 400 * 0.35,
              text: scoreLabel,
              font: "400 400px 'Bulevar', sans-serif",
              color: "#ffffff",
              textAlign: "center",
              shadow: { color: "rgba(0,0,0,0.3)", blur: 8, offsetX: 2, offsetY: 4 },
            });
          }}
        />
      )}

      {/* ── COUCHE 5 : Vidéo E (now OffthreadVideo — FFmpeg native decode) ── */}
      <OffthreadVideo
        src={resolveAsset(videoSrcE, "BUT_img_joueur_E.webm")}
        style={layerStyle}
      />

      {/* ── COUCHE 6 : Photo + nom + club en canvas — masqué par l'alpha de E */}
      {fontsReady && (
        <MaskedCanvas
          maskFrames={maskFramesE}
          draw={(ctx) => {
            // Photo joueur (position bottom-left en CSS → en canvas on convertit)
            if (playerImg && playerImg.naturalWidth > 0) {
              const imgAspect = playerImg.naturalWidth / playerImg.naturalHeight;
              const drawH = playerImgSize;
              const drawW = drawH * imgAspect;
              const drawX = playerImgLeft;
              const drawY = 1080 - playerImgBottom - drawH;
              ctx.drawImage(playerImg, drawX, drawY, drawW, drawH);
            }
            // Nom joueur — gauche, centré vertical
            const nameFont = "400 350px 'Bulevar', sans-serif";
            const lineHeight = 350 * 0.88;
            drawText(ctx, {
              x: 80,
              y: 540 - lineHeight / 2 + 350 * 0.82,
              text: prenom.toUpperCase(),
              font: nameFont,
              color: "#ffffff",
              textAlign: "left",
              shadow: { color: "rgba(0,0,0,0.3)", blur: 8, offsetX: 2, offsetY: 4 },
            });
            drawText(ctx, {
              x: 80,
              y: 540 + lineHeight / 2 + 350 * 0.82,
              text: nom.toUpperCase(),
              font: nameFont,
              color: "#ffffff",
              textAlign: "left",
              shadow: { color: "rgba(0,0,0,0.3)", blur: 8, offsetX: 2, offsetY: 4 },
            });
            // Club : 3 coins
            const clubFont = "600 28px 'GeneralSans', sans-serif";
            const clubColor = "rgba(255,255,255,0.7)";
            const clubText = club.toUpperCase();
            // Top-left
            drawText(ctx, {
              x: 80, y: 55 + 28 * 0.82, text: clubText, font: clubFont, color: clubColor,
              textAlign: "left", letterSpacing: 10,
            });
            // Bottom-left
            drawText(ctx, {
              x: 80, y: 1080 - 65 + 28 * 0.82 - 28, text: clubText, font: clubFont, color: clubColor,
              textAlign: "left", letterSpacing: 10,
            });
            // Bottom-right
            drawText(ctx, {
              x: 1920 - 80, y: 1080 - 65 + 28 * 0.82 - 28, text: clubText, font: clubFont, color: clubColor,
              textAlign: "right", letterSpacing: 10,
            });
          }}
        />
      )}

      {/* ── COUCHES 7 & 8 : Wipes B et D (FFmpeg native decode) ─────────────── */}
      <OffthreadVideo src={resolveAsset(videoSrcB, "BUT_img_joueur_B.webm")} style={layerStyle} />
      <OffthreadVideo src={resolveAsset(videoSrcD, "BUT_img_joueur_D.webm")} style={layerStyle} />

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

