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

// ─────────────────────────────────────────────────────────────────────────────
// HOOK : MASQUE ALPHA DE C — SYNCHRONISÉ FRAME PAR FRAME (Remotion-idiomatic)
//
// Problème du RAF continu en headless :
//   En rendu headless (Railway/Puppeteer), Remotion avance frame par frame.
//   Un RAF libre n'est pas synchronisé avec la capture screenshot — le masque
//   appliqué au moment du screenshot peut appartenir à une frame différente,
//   causant des sauts visibles dans la vidéo finale.
//
// Solution : delayRender / continueRender
//   - delayRender() dit à Remotion "ne prends PAS le screenshot de cette frame"
//   - On attend que video.readyState >= 2 (frame vidéo décodée par swangle)
//   - On lit le canvas, applique le masque, puis continueRender() → screenshot
//   - Effect dépend de `frame` → re-run à chaque frame Remotion → masque parfait
//
// Pourquoi canvas 480×270 + WebP ?
//   → toDataURL PNG sur 1920×1080 = ~5Mo de string, trop lent
//   → 480×270 + WebP(0.85) = ~30Ko, ~3x plus rapide que PNG, alpha préservé
//   → PNG encodait en ~10-15ms/frame → contribuait aux frames inégales → VFR → stuttering
// ─────────────────────────────────────────────────────────────────────────────
const useCAlphaMask = (
  cVideoRef: React.RefObject<HTMLVideoElement>,
  textRef: React.RefObject<HTMLDivElement>
) => {
  const frame = useCurrentFrame();

  useEffect(() => {
    const video = cVideoRef.current;
    const text = textRef.current;
    if (!video || !text) return;

    // Bloquer le screenshot Remotion jusqu'à ce que le masque soit appliqué
    const handle = delayRender(`alpha-mask-f${frame}`);
    let rafId: number;
    let resolved = false;

    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 270;
    const ctx = canvas.getContext("2d")!;

    const tryApply = () => {
      if (resolved) return;
      if (video.readyState >= 2) {
        resolved = true;
        try {
          ctx.clearRect(0, 0, 480, 270);
          ctx.drawImage(video, 0, 0, 480, 270);
          // WebP with alpha is ~3x faster to encode than PNG and sufficient for a CSS mask.
          const url = canvas.toDataURL("image/webp", 0.85);
          text.style.visibility = "visible";
          text.style.webkitMaskImage = `url("${url}")`;
          text.style.webkitMaskMode = "alpha";
          text.style.webkitMaskRepeat = "no-repeat";
          text.style.webkitMaskSize = "100% 100%";
        } catch {
          // Canvas tainted (CORS) → pas de masque, texte visible partout
          text.style.visibility = "visible";
        }
        continueRender(handle);
      } else {
        // Vidéo pas encore prête → retry au prochain tick navigateur
        rafId = requestAnimationFrame(tryApply);
      }
    };

    rafId = requestAnimationFrame(tryApply);

    return () => {
      // Cleanup : si la frame suivante démarre avant résolution, libérer quand même
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
export const butSimpleSchema = z.object({
  prenom: z.string(),
  nom: z.string(),
  club: z.string(),
  logoSrc: z.string().default("logo_club.png"),
  logoSize: z.number().default(500), // largeur du logo en px — ajustable dans Studio ou à l'API
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
export const ButSimple: React.FC<Props> = ({ prenom, nom, club, logoSrc, logoSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Refs pour le masque alpha
  const cVideoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // Active le masque : le texte suit l'alpha de C, frame par frame (delayRender-synchronisé)
  useCAlphaMask(cVideoRef, textRef);

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
          // delayRender garantit que le masque est appliqué avant le screenshot —
          // pas besoin de visibility:hidden initial (évite le flash en preview browser)
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
