import { Composition, staticFile } from "remotion";
import { ButSimple, butSimpleSchema } from "./ButSimple";
import { ButImgJoueur, butImgJoueurSchema } from "./ButImgJoueur";
import { FaitsDeJeu2Min, faitsDeJeu2MinSchema } from "./FaitsDeJeu2Min";
import { JoueurSimpleGenerique, joueurSimpleGeneriqueSchema } from "./JoueurSimpleGenerique";
import { JoueurButGenerique, joueurButGeneriqueSchema } from "./JoueurButGenerique";
import { JoueurButGeneriqueV1, joueurButGeneriqueV1Schema } from "./JoueurButGeneriqueV1";
import { JoueurEntreeGenerique, joueurEntreeGeneriqueSchema } from "./JoueurEntreeGenerique";
import { TemplateRuntime } from "./runtime/TemplateRuntime";
import type { TemplateRuntimeProps } from "./runtime/TemplateRuntime";

// ─── URLs WebM locales (public/) ─────────────────────────────────────────────
const asset = (name: string) => staticFile(name);

// ─── Props de test — Joueur Simple Générique (toutes migrations appliquées) ──
// Stacking : A=0, P=1, B=2 (fix-joueur-stacking-v1-pattern.sql)
// Logo     : fade-out 1.7→2.2s (fix-joueur-logo-fadeout.sql)
// Packshot : appear_at=2.76s (fix-joueur-packshot-timing.sql)
// Duration : duration_ms=0 sur tous les layers (fix-joueur-layer-duration-ms.sql)
const joueurSimpleGeneriqueTestProps: TemplateRuntimeProps = {
  variants: [{ id: 'v1', backgroundVideoUrl: '' }],
  variantId: 'v1',
  layers: [
    { id: 'a', videoUrl: asset('JOUEUR_simple_A.webm'), zIndex: 0, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'p', videoUrl: asset('PACKSHOT_GENERIQUE.webm'), zIndex: 1, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'b', videoUrl: asset('JOUEUR_simple_B.webm'), zIndex: 2, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
  ],
  imageSlots: [
    {
      id: 'logo', slotKey: 'logoSrc',
      position: { x: 0.5, y: 0.5, width: 0.25, height: 0.5 },
      appearAt: 0, appearDuration: 1.5,
      animation: 'zoom', animationDirection: 'in',
      scaleFrom: 0.0, scaleTo: 1.0,
      layerId: 'a', anchor: 'center', fitMode: 'contain', overflow: 'hidden',
      safeZone: { topPct: 25, leftPct: 37.5, widthPct: 25, heightPct: 50 },
      visibleIf: 'intro_mode == "logo"',
    },
  ],
  textFields: [
    {
      id: 'num', slotKey: 'numeroIntro', defaultValue: '10',
      position: { x: 0.5, y: 0.5 }, maxWidth: 0.25,
      fontFamily: 'Bulevar', fontSize: 400, color: '#FFFFFF', align: 'center',
      appearAt: 0, appearDuration: 0, animation: 'none',
      layerId: 'a', respectAlpha: false, visibleIf: 'intro_mode == "numero"',
    },
    {
      id: 'club-h', slotKey: 'nomClubHaut', defaultValue: 'NOM DU CLUB',
      position: { x: 0.5, y: 0.136 }, maxWidth: 0.8,
      fontFamily: 'General Sans', fontSize: 28, color: '#FFFFFF', align: 'center',
      appearAt: 1.2, appearDuration: 0, animation: 'none',
      useMask: true, textTransform: 'uppercase',
    },
    {
      id: 'club-b', slotKey: 'nomClubBas', defaultValue: 'NOM DU CLUB',
      position: { x: 0.5, y: 0.864 }, maxWidth: 0.8,
      fontFamily: 'General Sans', fontSize: 28, color: '#FFFFFF', align: 'center',
      appearAt: 1.2, appearDuration: 0, animation: 'none',
      useMask: true, textTransform: 'uppercase',
    },
    {
      id: 'prenom', slotKey: 'prenomNom', defaultValue: 'PRÉNOM\nNOM',
      position: { x: 0.5, y: 0.5 }, maxWidth: 0.85,
      fontFamily: 'Bulevar', fontSize: 330, color: '#FFFFFF', align: 'center',
      appearAt: 1.2, appearDuration: 0, animation: 'none',
      useMask: true, maskFrameOffset: -1, lineHeight: 0.85, textTransform: 'uppercase',
    },
  ],
  textValues: { nomClubHaut: 'FC NANTES', nomClubBas: 'FC NANTES', prenomNom: 'KEVIN\nDUPONT', numeroIntro: '9' },
  imageUploads: {
    logoSrc: asset('logo_club.png'),
  },
  canvasWidth: 1920,
  canvasHeight: 1080,
  selectedOptions: { intro_mode: 'logo' },
  textMaskDir: 'masks/packshot-generique',
  textMaskFrameOffset: 0,
  textMaskZIndex: 1.5, // texte au-dessus du packshot (z=1) mais sous le wipe B (z=2)
};

// ─── Props de test — Joueur Simple Image (avec photo joueur détourée) ────────
// 3 layers : A intro + B transition + P packshot image
// Durée : 5.96s @ 25fps (149 frames)
const joueurSimpleImageTestProps: TemplateRuntimeProps = {
  variants: [{ id: 'v1', backgroundVideoUrl: '' }],
  variantId: 'v1',
  layers: [
    { id: 'a', videoUrl: asset('JOUEUR_simple_A.webm'), zIndex: 0, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'b', videoUrl: asset('JOUEUR_simple_B.webm'), zIndex: 1, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
    { id: 'p', videoUrl: asset('PACKSHOT_IMG.webm'), zIndex: 2, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
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
      fontFamily: 'General Sans', fontSize: 25, color: '#FFFFFF', align: 'left',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: true,
    },
    {
      id: 'club-bl', slotKey: 'clubBottomLeft', defaultValue: 'NOM DU CLUB',
      position: { x: 0.049, y: 0.918 }, maxWidth: 0.4,
      fontFamily: 'General Sans', fontSize: 25, color: '#FFFFFF', align: 'left',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: true,
    },
    {
      id: 'club-br', slotKey: 'clubBottomRight', defaultValue: 'NOM DU CLUB',
      position: { x: 0.95, y: 0.918 }, maxWidth: 0.4,
      fontFamily: 'General Sans', fontSize: 25, color: '#FFFFFF', align: 'right',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: true,
    },
    {
      id: 'prenom', slotKey: 'prenomNom', defaultValue: 'PRÉNOM\nNOM',
      position: { x: 0.133, y: 0.5 }, maxWidth: 0.45,
      fontFamily: 'Bulevar', fontSize: 150, color: '#FFFFFF', align: 'left',
      appearAt: 0, appearDuration: 0.6, animation: 'fade', animationDirection: 'in',
      scaleFrom: 1.0, scaleTo: 1.0,
      layerId: 'p', respectAlpha: true,
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
    logoSrc: asset('logo_club.png'),
    photoJoueur: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg',
  },
  canvasWidth: 1920,
  canvasHeight: 1080,
  selectedOptions: { intro_mode: 'logo' },
};


// ─── Props de test — Packshot seul (debug canvas mask) ───────────────────────
const packshotOnlyTestProps: TemplateRuntimeProps = {
  variants: [{ id: 'v1', backgroundVideoUrl: '' }],
  variantId: 'v1',
  layers: [
    { id: 'p', videoUrl: asset('PACKSHOT_GENERIQUE.webm'), zIndex: 0, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 0 },
  ],
  imageSlots: [],
  textFields: [
    {
      id: 'club-h', slotKey: 'nomClubHaut', defaultValue: 'NOM DU CLUB',
      position: { x: 0.5, y: 0.136 }, maxWidth: 0.8,
      fontFamily: 'General Sans', fontSize: 25, color: '#FFFFFF', align: 'center',
      appearAt: 1.2, appearDuration: 0, animation: 'none',
      useMask: true,
    },
    {
      id: 'prenom', slotKey: 'prenomNom', defaultValue: 'PRÉNOM\nNOM',
      position: { x: 0.5, y: 0.5 }, maxWidth: 0.85,
      fontFamily: 'Bulevar', fontSize: 330, color: '#FFFFFF', align: 'center',
      appearAt: 1.2, appearDuration: 0, animation: 'none',
      useMask: true, maskFrameOffset: -1, lineHeight: 0.85, textTransform: 'uppercase',
    },
  ],
  textValues: { nomClubHaut: 'FC NANTES', prenomNom: 'KEVIN\nDUPONT' },
  imageUploads: {},
  canvasWidth: 1920,
  canvasHeight: 1080,
  selectedOptions: {},
  textMaskDir: 'masks/packshot-generique',
  textMaskFrameOffset: 0,
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="FaitsDeJeu2Min"
        component={FaitsDeJeu2Min}
        durationInFrames={750}
        fps={25}
        width={1920}
        height={1080}
        schema={faitsDeJeu2MinSchema}
        defaultProps={{ label: '2 MIN' }}
      />

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
          logoSrc: 'logo_club.png',
          logoSize: 500,
        }}
      />
      <Composition
        id="JoueurSimpleGenerique"
        component={JoueurSimpleGenerique}
        durationInFrames={149}
        fps={25}
        width={1920}
        height={1080}
        schema={joueurSimpleGeneriqueSchema}
        defaultProps={{"prenomNom":"PRÉNOM\nNOM","nomClub":"NOM DU CLUB","logoSrc":"logo_club copie.png","introMode":"logo" as const,"numeroIntro":"10","layers":[{"id":"a","videoAsset":"JOUEUR_simple_A.webm"},{"id":"p","videoAsset":"PACKSHOT_GENERIQUE.webm"},{"id":"b","videoAsset":"JOUEUR_simple_B.webm"}]}}
      />

      {/* ButImgJoueur désactivé — fichiers .mov non supportés par Chrome en preview. */}
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

      <Composition
        id="JoueurButGenerique"
        component={JoueurButGenerique}
        durationInFrames={175}
        fps={25}
        width={1920}
        height={1080}
        schema={joueurButGeneriqueSchema}
        defaultProps={{"prenomNom":"PRÉNOM\nNOM","nomClub":"NOM DU CLUB","logoSrc":"logo_club.png","photoJoueur":"logo_club.png","titre":"BUT","layers":[{"id":"a","videoAsset":"JOUEUR_but_A.webm"},{"id":"b","videoAsset":"JOUEUR_but_B.webm"},{"id":"c","videoAsset":"JOUEUR_but_C.webm"},{"id":"p","videoAsset":"PACKSHOT_IMG.webm"},{"id":"d","videoAsset":"JOUEUR_but_D.webm"}]}}
      />

      {/* ── SPEC v1 — Joueur But Générique (template JSON déclaratif) ───────────
          Source : spec/templates/joueur_but_generique.v1.json
          Rendu via resolveTemplate() → TemplateRuntime (même moteur que v0).
          Comparer visuellement avec la composition "JoueurButGenerique" ci-dessus. */}
      <Composition
        id="JoueurButGeneriqueV1"
        component={JoueurButGeneriqueV1}
        durationInFrames={175}
        fps={25}
        width={1920}
        height={1080}
        schema={joueurButGeneriqueV1Schema}
        defaultProps={{"variantId":"v1","prenomNom":"LISE\nLE PRIELEC","nomClub":"LANESTER\nHANDBALL","logoSrc":"logo_club copie.png","photoJoueur":"photos/014.png","titre":"BUT","numero":"4","photoZoom":1.5,"photoOffsetX":-150,"photoOffsetY":-300,"logoScaleFrom":0.5,"logoScaleTo":2.5,"titreScaleFrom":4,"titreScaleTo":1,"titreScaleDuration":10,"titreFontSize":150,"nomClubLetterSpacing":15,"nomClubScaleFrom":1,"nomClubScaleTo":1.1,"nomClubScaleDuration":5,"nomClubAppearAt":2,"photoScaleFrom":0.9,"photoScaleTo":1,"photoScaleDuration":9,"photoAppearAt":0,"prenomNomSlideFromX":0,"prenomNomSlideToX":-20,"prenomNomAppearAt":0,"prenomNomDuration":8,"prenomNomScaleFrom":1,"prenomNomScaleTo":1,"numeroSlideFromX":0,"numeroSlideToX":20,"numeroAppearAt":0,"numeroDuration":5,"numeroScaleFrom":1,"numeroScaleTo":1}}
      />

      {/* ── Joueur Entrée Générique — variante réduite au layer P uniquement ─── */}
      <Composition
        id="JoueurEntreeGenerique"
        component={JoueurEntreeGenerique}
        durationInFrames={1}
        fps={25}
        width={1920}
        height={1080}
        schema={joueurEntreeGeneriqueSchema}
        defaultProps={{"variantId":"v1","prenomNom":"LISE\nLE PRIELEC","nomClub":"LANESTER\nHANDBALL","photoJoueur":"photos/002.png","numero":"4","photoZoom":2,"photoOffsetX":-150,"photoOffsetY":-500,"nomClubLetterSpacing":15,"nomClubScaleFrom":1,"nomClubScaleTo":1.1,"nomClubScaleDuration":5,"nomClubAppearAt":2,"photoScaleFrom":0.9,"photoScaleTo":1,"photoScaleDuration":9,"photoAppearAt":0,"prenomNomSlideFromX":0,"prenomNomSlideToX":-20,"prenomNomAppearAt":0,"prenomNomDuration":8,"prenomNomScaleFrom":1,"prenomNomScaleTo":1,"numeroSlideFromX":0,"numeroSlideToX":20,"numeroAppearAt":0,"numeroDuration":5,"numeroScaleFrom":1,"numeroScaleTo":1,"startAtSec":6.6}}
      />

      {/* ── DEV ONLY — Joueur Simple Générique (props après toutes les migrations) ──
          Tester localement : cd templates-remotion && npm run studio → sélectionner cette compo.
          intro_mode: 'logo' | 'numero' (modifier selectedOptions dans le JSON editor).
          Vérifier : logo disparaît à t=1.7s, packshot textes à t=2.76s, logo invisible ensuite. */}
      <Composition
        id="PackshotOnlyTest"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={TemplateRuntime as any}
        durationInFrames={149}
        fps={25}
        width={1920}
        height={1080}
        defaultProps={packshotOnlyTestProps}
      />

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
