import { Composition, staticFile } from "remotion";
import { ButSimple, butSimpleSchema } from "./ButSimple";

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
          prenom: "PRENOM",
          nom: "NOM",
          club: "NOM DU CLUB",
          logoSrc: staticFile("logo_club.png"),
        }}
      />
    </>
  );
};
