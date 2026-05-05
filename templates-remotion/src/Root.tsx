import { Composition } from "remotion";
import { ButSimple, butSimpleSchema } from "./ButSimple";
import { ButImgJoueur, butImgJoueurSchema } from "./ButImgJoueur";
import { TemplateRuntime } from "./runtime/TemplateRuntime";
import type { TemplateRuntimeProps } from "./runtime/TemplateRuntime";

// ─── URLs WebM Railway (accessibles même en local si Railway est up) ─────────
const BASE = 'https://neopro-central-production.up.railway.app/remotion-preview/public';

// ─── Props de test — Joueur Simple Générique (toutes migrations appliquées) ──
// Stacking : A=0, P=1, B=2 (fix-joueur-stacking-v1-pattern.sql)
// Logo     : fade-out 1.7→2.2s (fix-joueur-logo-fadeout.sql)
// Packshot : appear_at=2.76s (fix-joueur-packshot-timing.sql)
// Duration : duration_ms=0 sur tous les layers (fix-joueur-layer-duration-ms.sql)
const joueurSimpleGeneriqueTestProps: TemplateRuntimeProps = {
  variants: [{ id: 'v1', backgroundVideoUrl: '' }],
  variantId: 'v1',
  layers: [
    { id: 'a', videoUrl: `${BASE}/JOUEUR_simple_A.webm`, zIndex: 0, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'p', videoUrl: `${BASE}/PACKSHOT_GENERIQUE.webm`, zIndex: 1, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'b', videoUrl: `${BASE}/JOUEUR_simple_B.webm`, zIndex: 2, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
  ],
  imageSlots: [
    {
      id: 'logo', slotKey: 'logoSrc',
      position: { x: 0.5, y: 0.5, width: 0.25, height: 0.5 },
      appearAt: 1.7, appearDuration: 0.5,
      animation: 'fade', animationDirection: 'out',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'a', anchor: 'center', fitMode: 'contain', overflow: 'hidden',
      safeZone: { topPct: 25, leftPct: 37.5, widthPct: 25, heightPct: 50 },
      visibleIf: 'intro_mode == "logo"',
    },
  ],
  textFields: [
    {
      id: 'num', slotKey: 'numeroIntro', defaultValue: '10',
      position: { x: 0.5, y: 0.5 }, maxWidth: 0.25,
      fontFamily: 'sans-serif', fontSize: 400, color: '#FFFFFF', align: 'center',
      appearAt: 1.7, appearDuration: 0.5, animation: 'fade', animationDirection: 'out',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'a', respectAlpha: false, visibleIf: 'intro_mode == "numero"',
    },
    {
      id: 'club-h', slotKey: 'nomClubHaut', defaultValue: 'NOM DU CLUB',
      position: { x: 0.5, y: 0.111 }, maxWidth: 0.8,
      fontFamily: 'GeneralSans', fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.7)', align: 'center',
      appearAt: 1.4, appearDuration: 1.4, animation: 'fade', animationDirection: 'in',
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', letterSpacing: 10,
    },
    {
      id: 'club-b', slotKey: 'nomClubBas', defaultValue: 'NOM DU CLUB',
      position: { x: 0.5, y: 0.861 }, maxWidth: 0.8,
      fontFamily: 'GeneralSans', fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.7)', align: 'center',
      appearAt: 1.4, appearDuration: 1.4, animation: 'fade', animationDirection: 'in',
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', letterSpacing: 10,
    },
    {
      id: 'prenom', slotKey: 'prenomNom', defaultValue: 'PRÉNOM\nNOM',
      position: { x: 0.5, y: 0.5 }, maxWidth: 0.85,
      fontFamily: 'Bulevar', fontSize: 330, color: '#FFFFFF', align: 'center',
      appearAt: 1.4, appearDuration: 1.4, animation: 'fade', animationDirection: 'in',
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', lineHeight: 0.85,
      textShadow: '2px 4px 8px rgba(0,0,0,0.3)',
    },
  ],
  textValues: { nomClubHaut: 'FC NANTES', nomClubBas: 'FC NANTES', prenomNom: 'KEVIN\nDUPONT', numeroIntro: '9' },
  imageUploads: {
    // Remplacer par une URL publique de logo pour le test
    logoSrc: 'https://upload.wikimedia.org/wikipedia/fr/thumb/f/f5/Nantes_FC_2019.svg/200px-Nantes_FC_2019.svg',
  },
  canvasWidth: 1920,
  canvasHeight: 1080,
  selectedOptions: { intro_mode: 'logo' },
};

// ─── Props de test — Joueur Simple Image (avec photo joueur détourée) ────────
// 3 layers : A intro + B transition + P packshot image
// Durée : 5.96s @ 25fps (149 frames)
const joueurSimpleImageTestProps: TemplateRuntimeProps = {
  variants: [{ id: 'v1', backgroundVideoUrl: '' }],
  variantId: 'v1',
  layers: [
    { id: 'a', videoUrl: `${BASE}/JOUEUR_simple_A.webm`, zIndex: 0, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'b', videoUrl: `${BASE}/JOUEUR_simple_B.webm`, zIndex: 1, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'p', videoUrl: `${BASE}/PACKSHOT_IMG.webm`, zIndex: 2, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
  ],
  imageSlots: [
    {
      id: 'logo', slotKey: 'logoSrc',
      position: { x: 0.5, y: 0.5, width: 0.25, height: 0.5 },
      appearAt: 0, appearDuration: 1.7,
      animation: 'zoom', animationDirection: 'in',
      scaleFrom: 0.0, scaleTo: 1.19,
      layerId: 'a', anchor: 'center', fitMode: 'contain', overflow: 'hidden',
      safeZone: { topPct: 25, leftPct: 37.5, widthPct: 25, heightPct: 50 },
      visibleIf: 'intro_mode == "logo"',
    },
    {
      id: 'photo', slotKey: 'photoJoueur',
      position: { x: 0.7, y: 0.5, width: 0.30, height: 1.0 },
      appearAt: 0, appearDuration: 0.6,
      animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', anchor: 'top-center', fitMode: 'fill-width-anchor-top', overflow: 'bottom',
      safeZone: { topPct: 0, leftPct: 50, widthPct: 30, heightPct: 100 },
    },
  ],
  textFields: [
    {
      id: 'num', slotKey: 'numeroIntro', defaultValue: '10',
      position: { x: 0.5, y: 0.5 }, maxWidth: 0.25,
      fontFamily: 'Bulevar', fontSize: 400, color: '#FFFFFF', align: 'center',
      appearAt: 0, appearDuration: 1.7, animation: 'zoom', animationDirection: 'in',
      scaleFrom: 0.0, scaleTo: 1.19,
      layerId: 'a', respectAlpha: false, visibleIf: 'intro_mode == "numero"',
    },
    {
      id: 'club-tl', slotKey: 'clubTopLeft', defaultValue: 'NOM DU CLUB',
      position: { x: 0.049, y: 0.1 }, maxWidth: 0.4,
      fontFamily: 'GeneralSans', fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.7)', align: 'left',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', letterSpacing: 10,
    },
    {
      id: 'club-bl', slotKey: 'clubBottomLeft', defaultValue: 'NOM DU CLUB',
      position: { x: 0.049, y: 0.918 }, maxWidth: 0.4,
      fontFamily: 'GeneralSans', fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.7)', align: 'left',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', letterSpacing: 10,
    },
    {
      id: 'club-br', slotKey: 'clubBottomRight', defaultValue: 'NOM DU CLUB',
      position: { x: 0.95, y: 0.918 }, maxWidth: 0.4,
      fontFamily: 'GeneralSans', fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.7)', align: 'right',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', letterSpacing: 10,
    },
    {
      id: 'prenom', slotKey: 'prenomNom', defaultValue: 'PRÉNOM\nNOM',
      position: { x: 0.133, y: 0.5 }, maxWidth: 0.45,
      fontFamily: 'Bulevar', fontSize: 150, color: '#FFFFFF', align: 'left',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', lineHeight: 0.85,
      textShadow: '2px 4px 8px rgba(0,0,0,0.3)',
    },
    {
      id: 'numero', slotKey: 'numero', defaultValue: '10',
      position: { x: 0.867, y: 0.5 }, maxWidth: 0.15,
      fontFamily: 'Bulevar', fontSize: 300, color: '#FFFFFF', align: 'right',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: false,
    },
  ],
  textValues: { clubTopLeft: 'FC NANTES', clubBottomLeft: 'FC NANTES', clubBottomRight: 'FC NANTES', prenomNom: 'KEVIN\nDUPONT', numero: '9', numeroIntro: '9' },
  imageUploads: {
    logoSrc: 'https://upload.wikimedia.org/wikipedia/fr/thumb/f/f5/Nantes_FC_2019.svg/200px-Nantes_FC_2019.svg',
    photoJoueur: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg',
  },
  canvasWidth: 1920,
  canvasHeight: 1080,
  selectedOptions: { intro_mode: 'logo' },
};

// ─── Props de test — Joueur But Générique ─────────────────────────────────────
// 5 layers : A intro logo + B transition1 + C titre+pattern + D transition2 + P packshot
// Durée : 6.96s @ 25fps (174 frames)
const joueurButGeneriqueTestProps: TemplateRuntimeProps = {
  variants: [{ id: 'v1', backgroundVideoUrl: '' }],
  variantId: 'v1',
  layers: [
    { id: 'a', videoUrl: `${BASE}/JOUEUR_but_A.webm`, zIndex: 0, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'b', videoUrl: `${BASE}/JOUEUR_but_B.webm`, zIndex: 1, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'c', videoUrl: `${BASE}/JOUEUR_but_C.webm`, zIndex: 2, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'd', videoUrl: `${BASE}/JOUEUR_but_D.webm`, zIndex: 3, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'p', videoUrl: `${BASE}/PACKSHOT_GENERIQUE.webm`, zIndex: 4, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
  ],
  imageSlots: [
    {
      id: 'logo', slotKey: 'logoSrc',
      position: { x: 0.5, y: 0.5, width: 0.25, height: 0.5 },
      appearAt: 0, appearDuration: 2.12,
      animation: 'zoom', animationDirection: 'in',
      scaleFrom: 0.0, scaleTo: 1.19,
      layerId: 'a', anchor: 'center', fitMode: 'contain', overflow: 'hidden',
      safeZone: { topPct: 25, leftPct: 37.5, widthPct: 25, heightPct: 50 },
    },
  ],
  textFields: [
    {
      id: 'titre', slotKey: 'titre', defaultValue: 'BUT',
      position: { x: 0.5, y: 0.5 }, maxWidth: 0.85,
      fontFamily: 'Bulevar', fontSize: 389, color: '#FFFFFF', align: 'center',
      appearAt: 0.92, appearDuration: 1.2, animation: 'zoom', animationDirection: 'out',
      scaleFrom: 0.77, scaleTo: 1.0,
      layerId: 'c', respectAlpha: true,
      textTransform: 'uppercase',
    },
    {
      id: 'club-h', slotKey: 'nomClubHaut', defaultValue: 'NOM DU CLUB',
      position: { x: 0.5, y: 0.111 }, maxWidth: 0.8,
      fontFamily: 'GeneralSans', fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.7)', align: 'center',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', letterSpacing: 10,
    },
    {
      id: 'club-b', slotKey: 'nomClubBas', defaultValue: 'NOM DU CLUB',
      position: { x: 0.5, y: 0.861 }, maxWidth: 0.8,
      fontFamily: 'GeneralSans', fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.7)', align: 'center',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', letterSpacing: 10,
    },
    {
      id: 'prenom', slotKey: 'prenomNom', defaultValue: 'PRÉNOM\nNOM',
      position: { x: 0.5, y: 0.5 }, maxWidth: 0.85,
      fontFamily: 'Bulevar', fontSize: 330, color: '#FFFFFF', align: 'center',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: false,
      textTransform: 'uppercase', lineHeight: 0.85,
      textShadow: '2px 4px 8px rgba(0,0,0,0.3)',
    },
  ],
  textValues: { nomClubHaut: 'FC NANTES', nomClubBas: 'FC NANTES', prenomNom: 'KEVIN\nDUPONT', titre: 'BUT' },
  imageUploads: {
    logoSrc: 'https://upload.wikimedia.org/wikipedia/fr/thumb/f/f5/Nantes_FC_2019.svg/200px-Nantes_FC_2019.svg',
  },
  canvasWidth: 1920,
  canvasHeight: 1080,
  selectedOptions: {},
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="ButSimple"
        component={ButSimple}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
        schema={butSimpleSchema}
        defaultProps={{
          prenom: 'PRENOM',
          nom: 'NOM',
          club: 'NOM DU CLUB',
          logoSrc: 'logo_club copie.png',
          logoSize: 500,
        }}
      />
      <Composition
        id="ButImgJoueur"
        component={ButImgJoueur}
        durationInFrames={210}
        fps={30}
        width={1920}
        height={1080}
        schema={butImgJoueurSchema}
        defaultProps={{
          prenom: 'PRENOM',
          nom: 'NOM',
          club: 'NOM DU CLUB',
          logoSrc: 'logo_club copie.png',
          logoSize: 800,
          playerImgSrc: 'player_photo.png',
          playerImgSize: 1080,
          playerImgLeft: 560,
          playerImgBottom: 0,
          scoreLabel: '+1',
        }}
      />
      {/* ADR-075 — Meta-composition data-driven pour les templates v2 (schema_version=2).
          Durée / fps / dimensions sont surchargés à l'enqueue via calculateMetadata(),
          les defaultProps ici sont une stub de dev (Remotion exige des defaults valides). */}
      <Composition
        id="TemplateRuntime"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={TemplateRuntime as any}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          variants: [],
          layers: [],
          textFields: [],
          imageSlots: [],
          variantId: '',
          textValues: {},
          imageUploads: {},
          canvasWidth: 1920,
          canvasHeight: 1080,
        }}
      />

      {/* ── DEV ONLY — Joueur Simple Image (photo joueur détourée, packshot IMG) ──
          intro_mode: 'logo' | 'numero' (modifier selectedOptions dans le JSON editor).
          Vérifier : photo droite, textes club 3 coins, prénom-nom gauche, numéro géant droite. */}
      <Composition
        id="JoueurSimpleImageTest"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={TemplateRuntime as any}
        durationInFrames={149}
        fps={25}
        width={1920}
        height={1080}
        defaultProps={joueurSimpleImageTestProps}
      />

      {/* ── DEV ONLY — Joueur But Générique (5 layers, titre BUT zoom-out) ──────
          Vérifier : logo intro apparaît + zoom, titre "BUT" zoom-out à t=0.92s,
          packshot générique avec prénom-nom centré. */}
      <Composition
        id="JoueurButGeneriqueTest"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={TemplateRuntime as any}
        durationInFrames={174}
        fps={25}
        width={1920}
        height={1080}
        defaultProps={joueurButGeneriqueTestProps}
      />

      {/* ── DEV ONLY — Joueur Simple Générique (props après toutes les migrations) ──
          Tester localement : cd templates-remotion && npm run studio → sélectionner cette compo.
          intro_mode: 'logo' | 'numero' (modifier selectedOptions dans le JSON editor).
          Vérifier : logo disparaît à t=1.7s, packshot textes à t=2.76s, logo invisible ensuite. */}
      <Composition
        id="JoueurSimpleGeneriqueTest"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={TemplateRuntime as any}
        durationInFrames={149}
        fps={25}
        width={1920}
        height={1080}
        defaultProps={joueurSimpleGeneriqueTestProps}
      />
    </>
  );
};
