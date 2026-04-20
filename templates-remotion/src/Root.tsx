import { Composition } from "remotion";
import { ButSimple, butSimpleSchema } from "./ButSimple";
import { ButImgJoueur, butImgJoueurSchema } from "./ButImgJoueur";
import { TemplateRuntime } from "./runtime/TemplateRuntime";

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
        component={TemplateRuntime}
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
    </>
  );
};
