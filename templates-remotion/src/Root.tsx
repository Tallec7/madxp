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
      position: { x: 0.5, y: 0.136 }, maxWidth: 0.8,
      fontFamily: 'sans-serif', fontSize: 25, color: '#FFFFFF', align: 'center',
      appearAt: 2.76, appearDuration: 0.5, animation: 'fade', animationDirection: 'in',
      layerId: 'p', respectAlpha: false,
    },
    {
      id: 'club-b', slotKey: 'nomClubBas', defaultValue: 'NOM DU CLUB',
      position: { x: 0.5, y: 0.864 }, maxWidth: 0.8,
      fontFamily: 'sans-serif', fontSize: 25, color: '#FFFFFF', align: 'center',
      appearAt: 2.76, appearDuration: 0.5, animation: 'fade', animationDirection: 'in',
      layerId: 'p', respectAlpha: false,
    },
    {
      id: 'prenom', slotKey: 'prenomNom', defaultValue: 'PRÉNOM NOM',
      position: { x: 0.5, y: 0.5 }, maxWidth: 0.85,
      fontFamily: 'sans-serif', fontSize: 120, color: '#FFFFFF', align: 'center',
      appearAt: 2.76, appearDuration: 0.5, animation: 'fade', animationDirection: 'in',
      layerId: 'p', respectAlpha: false,
    },
  ],
  textValues: { nomClubHaut: 'FC NANTES', nomClubBas: 'FC NANTES', prenomNom: 'KEVIN DUPONT', numeroIntro: '9' },
  imageUploads: {
    // Remplacer par une URL publique de logo pour le test
    logoSrc: 'https://upload.wikimedia.org/wikipedia/fr/thumb/f/f5/Nantes_FC_2019.svg/200px-Nantes_FC_2019.svg',
  },
  canvasWidth: 1920,
  canvasHeight: 1080,
  selectedOptions: { intro_mode: 'logo' },
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
