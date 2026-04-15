import {
  AbsoluteFill,
  Video,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useEffect, useRef } from "react";
import { z } from "zod";

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
// HOOK GÉNÉRIQUE : MASQUE ALPHA — SYNCHRONISÉ FRAME PAR FRAME (Remotion-idiomatic)
//
// Même logique que ButSimple (useCAlphaMask) mais paramétrable.
// Le `label` sert à distinguer les deux handles delayRender (C et E).
//
// delayRender / continueRender garantit que Remotion attend le masque avant
// de prendre le screenshot de chaque frame → rendu headless parfaitement synchronisé.
// ─────────────────────────────────────────────────────────────────────────────
const useAlphaMask = (
  videoRef: React.RefObject<HTMLVideoElement>,
  contentRef: React.RefObject<HTMLDivElement>,
  label: string
) => {
  const frame = useCurrentFrame();

  useEffect(() => {
    const video = videoRef.current;
    const content = contentRef.current;
    if (!video || !content) return;

    const handle = delayRender(`alpha-mask-${label}-f${frame}`);
    let rafId: number;
    let resolved = false;

    const canvas = document.createElement("canvas");
    canvas.width = 480;   // 25% de 1920 — suffisant pour le masque CSS
    canvas.height = 270;  // 25% de 1080
    const ctx = canvas.getContext("2d")!;

    const tryApply = () => {
      if (resolved) return;
      if (video.readyState >= 2) {
        resolved = true;
        try {
          ctx.clearRect(0, 0, 480, 270);
          ctx.drawImage(video, 0, 0, 480, 270);
          // WebP(0.85) : ~3x plus rapide que PNG, alpha préservé
          const url = canvas.toDataURL("image/webp", 0.85);
          content.style.visibility = "visible";
          content.style.webkitMaskImage = `url("${url}")`;
          content.style.webkitMaskMode = "alpha";
          content.style.webkitMaskRepeat = "no-repeat";
          content.style.webkitMaskSize = "100% 100%";
        } catch {
          // Canvas tainted (CORS) → pas de masque, contenu visible partout
          content.style.visibility = "visible";
        }
        continueRender(handle);
      } else {
        rafId = requestAnimationFrame(tryApply);
      }
    };

    rafId = requestAnimationFrame(tryApply);

    return () => {
      if (!resolved) {
        resolved = true;
        cancelAnimationFrame(rafId);
        continueRender(handle);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);
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
  const { fps } = useVideoConfig();

  // Refs pour les masques alpha
  const cVideoRef = useRef<HTMLVideoElement>(null);
  const eVideoRef = useRef<HTMLVideoElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  // Masque C → score label (delayRender-synchronisé)
  useAlphaMask(cVideoRef, scoreRef, "c");
  // Masque E → packshot joueur (delayRender-synchronisé)
  useAlphaMask(eVideoRef, playerRef, "e");

  // Logo : spring zoom-in (même config que ButSimple)
  const logoScale = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });
  const logoOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  const playerImgResolved = playerImgSrc ? resolveAsset(playerImgSrc, playerImgSrc) : "";

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

      {/* ── COUCHE 1 : Fond animé A ──────────────────────────────────────────── */}
      <Video src={resolveAsset(videoSrcA, "BUT_img_joueur_A.webm")} style={layerStyle} />

      {/* ── COUCHE 2 : Logo club ─────────────────────────────────────────────── */}
      {/* Reste visible entre A et C — C le cache naturellement dans ses zones opaques */}
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

      {/* ── COUCHE 3 : Vidéo C — source du masque score ──────────────────────── */}
      <Video
        ref={cVideoRef}
        src={resolveAsset(videoSrcC, "BUT_img_joueur_C.webm")}
        style={layerStyle}
      />

      {/* ── COUCHE 4 : Score label — masqué frame-par-frame par l'alpha de C ── */}
      {/* Centré pour correspondre à la zone révélée par le webm C */}
      <div
        ref={scoreRef}
        style={{
          position: "absolute",
          width: 1920,
          height: 1080,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={scoreLabelStyle}>{scoreLabel}</span>
      </div>

      {/* ── COUCHE 5 : Vidéo E — source du masque joueur ─────────────────────── */}
      <Video
        ref={eVideoRef}
        src={resolveAsset(videoSrcE, "BUT_img_joueur_E.webm")}
        style={layerStyle}
      />

      {/* ── COUCHE 6 : Packshot joueur — masqué frame-par-frame par l'alpha de E */}
      {/* Layout : nom à gauche | photo centre-droite | club en 3 coins */}
      <div
        ref={playerRef}
        style={{
          position: "absolute",
          width: 1920,
          height: 1080,
        }}
      >
        {/* Photo : taille et position contrôlées par les props playerImgSize / playerImgLeft */}
        {playerImgResolved && (
          <img
            src={playerImgResolved}
            alt="Joueur"
            style={{
              position: "absolute",
              bottom: playerImgBottom,
              left: playerImgLeft,
              height: playerImgSize,
              width: "auto",
              objectFit: "contain",
            }}
          />
        )}
        {/* Nom joueur : côté gauche, centré verticalement */}
        <div style={playerBlockStyle}>
          <div style={playerNameStyle}>{prenom.toUpperCase()}</div>
          <div style={playerNameStyle}>{nom.toUpperCase()}</div>
        </div>
        {/* Club : 3 coins */}
        <span style={clubNameCornerStyle({ top: 55, left: 80 })}>{club.toUpperCase()}</span>
        <span style={clubNameCornerStyle({ bottom: 65, left: 80 })}>{club.toUpperCase()}</span>
        <span style={clubNameCornerStyle({ bottom: 65, right: 80 })}>{club.toUpperCase()}</span>
      </div>

      {/* ── COUCHES 7 & 8 : Wipes B et D (transitions opaques) ──────────────── */}
      <Video src={resolveAsset(videoSrcB, "BUT_img_joueur_B.webm")} style={layerStyle} />
      <Video src={resolveAsset(videoSrcD, "BUT_img_joueur_D.webm")} style={layerStyle} />

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

// Score : centré, taille XXL — visible dans la zone révélée par C
const scoreLabelStyle: React.CSSProperties = {
  fontFamily: "'Bulevar', sans-serif",
  fontSize: 400,
  fontWeight: 400,
  color: "#ffffff",
  lineHeight: 1,
  textShadow: "2px 4px 8px rgba(0,0,0,0.3)",
};

// Nom joueur : côté gauche, centré verticalement
const playerBlockStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: 80,
  transform: "translateY(-50%)",
  textAlign: "left",
};

const playerNameStyle: React.CSSProperties = {
  fontSize: 350,
  fontFamily: "'Bulevar', sans-serif",
  fontWeight: 400,
  lineHeight: 0.88,
  color: "#ffffff",
  textTransform: "uppercase",
  textShadow: "2px 4px 8px rgba(0,0,0,0.3)",
};

// Club name : positionné dans un coin (top/bottom + left/right)
const clubNameCornerStyle = (pos: {
  top?: number; bottom?: number; left?: number; right?: number;
}): React.CSSProperties => ({
  position: "absolute",
  ...pos,
  fontFamily: "'GeneralSans', sans-serif",
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: 10,
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.7)",
  whiteSpace: "nowrap",
});
