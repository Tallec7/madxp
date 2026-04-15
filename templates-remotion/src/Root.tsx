import { Composition } from "remotion";
import { ButSimple, butSimpleSchema } from "./ButSimple";
import { ButImgJoueur, butImgJoueurSchema } from "./ButImgJoueur";

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
          scoreLabel: '+1',
        }}
      />
    </>
  );
};
