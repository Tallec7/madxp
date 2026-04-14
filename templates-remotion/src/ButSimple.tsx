import {
  AbsoluteFill,
  Sequence,
  Video,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useEffect, useRef } from "react";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// HOOK : MASQUE ALPHA DE C VIA RAF + CANVAS DIRECT DOM
//
// Principe :
//   - cVideoRef  → ref sur le <video> HTML de la couche C (synchronisé Remotion)
//   - textRef    → ref sur le div texte à masquer
//   - Un requestAnimationFrame lit chaque frame de la vidéo C dans un petit
//     canvas (480×270 = 25% de la résolution), puis applique le dataURL
//     directement sur le style CSS du div texte — sans React state,
//     sans re-render, sans lag.
//
// Pourquoi pas useState ?
//   → setState → re-render React → lag visible à la lecture
//   → direct DOM via ref = synchrone, 0 overhead React
//
// Pourquoi canvas petit (480×270) ?
//   → toDataURL sur 1920×1080 = ~5Mo de string, trop lent
//   → 480×270 = ~300Ko, rapide, les bords alpha restent propres visuellement
// ─────────────────────────────────────────────────────────────────────────────
const useCAlphaMaskRAF = (
  cVideoRef: React.RefObject<HTMLVideoElement>,
  textRef: React.RefObject<HTMLDivElement>
) => {
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;   // 25% de 1920
    canvas.height = 270;  // 25% de 1080
    const ctx = canvas.getContext("2d")!;
    let rafId: number;

    const applyMask = () => {
      const video = cVideoRef.current;
      const text = textRef.current;

      if (video && text) {
        if (video.readyState >= 2) {
          try {
            ctx.clearRect(0, 0, 480, 270);
            ctx.drawImage(video, 0, 0, 480, 270);
            const url = canvas.toDataURL("image/png");

            // Application directe sur le DOM — pas de setState, pas de re-render
            text.style.visibility = "visible";
            text.style.webkitMaskImage = `url("${url}")`;
            text.style.webkitMaskMode = "alpha";
            text.style.webkitMaskRepeat = "no-repeat";
            text.style.webkitMaskSize = "100% 100%";
          } catch {
            // Canvas tainted (CORS) → pas de masque, texte visible partout
            text.style.visibility = "visible";
          }
        } else {
          // Vidéo pas encore prête → cacher le texte pour éviter qu'il apparaisse
          // sur les zones transparentes de C avant le chargement
          text.style.visibility = "hidden";
        }
      }

      rafId = requestAnimationFrame(applyMask);
    };

    rafId = requestAnimationFrame(applyMask);
    return () => cancelAnimationFrame(rafId);
  }, [cVideoRef, textRef]);
};

// ─────────────────────────────────────────────────────────────────────────────
// SCHÉMA DES PROPS
// ─────────────────────────────────────────────────────────────────────────────
export const butSimpleSchema = z.object({
  prenom: z.string(),
  nom: z.string(),
  club: z.string(),
  logoSrc: z.string().default(staticFile("logo_club.png")),
});

type Props = z.infer<typeof butSimpleSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITION PRINCIPALE
//
// ORDRE DES COUCHES (de bas en haut) :
//   1. BUT_simple_A.webm  — fond animé (hexagones dorés)
//   2. Logo club          — scale-in puis fade out
//   3. BUT_simple_C.webm  — packshot fond doré (ref exposé pour le masque)
//   4. Texte              — masqué frame-par-frame par le canal alpha de C
//   5. BUT_simple_B.webm  — wipe/transition par-dessus tout
//
// Le masque :
//   cVideoRef → pointe sur le <video> de C → lu par useCAlphaMaskRAF
//   textRef   → pointe sur le div texte   → webkitMaskImage mis à jour en direct
// ─────────────────────────────────────────────────────────────────────────────
export const ButSimple: React.FC<Props> = ({ prenom, nom, club, logoSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Refs pour le masque alpha
  const cVideoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // Active le masque : le texte suit l'alpha de C, frame par frame
  useCAlphaMaskRAF(cVideoRef, textRef);

  // Zoom in : part de 0, overshoot léger (damping bas = rebond), s'installe à 1
  // → damping: 8 = rebond prononcé / stiffness: 120 = arrivée rapide
  // Pour un zoom plus doux : damping: 15, stiffness: 80
  // Pour un zoom sans rebond : damping: 20, stiffness: 100
  const logoScale = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });

  // Fade in rapide au démarrage — C cache le logo naturellement quand elle devient opaque
  const logoOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>

      {/* ── FONTS : @font-face injectées directement dans le DOM ────────── */}
      {/*
        Remotion n'a pas d'API loadFont — on utilise une balise <style> avec
        @font-face. staticFile() résout le chemin vers public/.
        Bulevar    → prénom / nom
        GeneralSans → club
      */}
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
      <Video src={staticFile("BUT_simple_A.webm")} style={layerStyle} />

      {/* ── COUCHE 2 : Logo club ──────────────────────────────────────────── */}
      {/*
        Le logo reste en permanence entre A et C.
        C le cache naturellement dans ses zones opaques — pas besoin de fade out manuel.
      */}
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img
          src={logoSrc}
          alt="Logo"
          style={{
            width: 500,
            height: "auto",
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
          }}
        />
      </AbsoluteFill>

      {/* ── COUCHE 3 : Packshot C ─────────────────────────────────────────── */}
      {/*
        cVideoRef expose le <video> HTML sous-jacent.
        useCAlphaMaskRAF lit ses frames via RAF → masque appliqué sur textRef.
      */}
      <Video
        ref={cVideoRef}
        src={staticFile("BUT_simple_C.webm")}
        style={layerStyle}
      />

      {/* ── COUCHE 4 : Texte masqué par l'alpha de C ──────────────────────── */}
      {/*
        webkitMaskImage est mis à jour directement sur ce div par useCAlphaMaskRAF.
        Le texte est visible UNIQUEMENT dans les zones opaques de C.
        Pour changer le style : voir playerNameStyle / clubNameStyle en bas.
      */}
      <div
        ref={textRef}
        style={{
          position: "absolute",
          width: 1920,
          height: 1080,
          visibility: "hidden", // caché jusqu'à la 1ère frame de masque — évite le flash sur zones transparentes
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
      <Video src={staticFile("BUT_simple_B.webm")} style={layerStyle} />

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
