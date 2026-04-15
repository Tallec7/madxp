import { AbsoluteFill, Video, staticFile } from "remotion";
import { z } from "zod";

export const butImgJoueurSchema = z.object({
  prenom: z.string(),
  nom: z.string(),
  club: z.string(),
  logoSrc: z.string().default("logo_club.png"),
  logoSize: z.number().default(500),
  playerImgSrc: z.string().default(""),
  scoreLabel: z.string().default("+1"),
});

type Props = z.infer<typeof butImgJoueurSchema>;

export const ButImgJoueur: React.FC<Props> = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Video src={staticFile("BUT_img_joueur_A.webm")} style={layer} />
      <Video src={staticFile("BUT_img_joueur_B.webm")} style={layer} />
      <Video src={staticFile("BUT_img_joueur_C.webm")} style={layer} />
      <Video src={staticFile("BUT_img_joueur_D.webm")} style={layer} />
      <Video src={staticFile("BUT_img_joueur_E.webm")} style={layer} />
    </AbsoluteFill>
  );
};

const layer: React.CSSProperties = {
  position: "absolute",
  top: 0, left: 0,
  width: 1920, height: 1080,
  objectFit: "cover",
};
