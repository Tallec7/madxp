import { AbsoluteFill, Video, staticFile } from "remotion";
import { z } from "zod";

// Résout une URL vidéo : URL FTP directe si fournie, sinon staticFile() local
const resolveVideo = (url: string | undefined, fallback: string) =>
  url && (url.startsWith('http') || url.startsWith('blob:')) ? url : staticFile(fallback);

export const butImgJoueurSchema = z.object({
  prenom: z.string(),
  nom: z.string(),
  club: z.string(),
  logoSrc: z.string().default("logo_club.png"),
  logoSize: z.number().default(500),
  playerImgSrc: z.string().default(""),
  scoreLabel: z.string().default("+1"),
  // Assets vidéo — URL FTP si fourni, sinon fallback sur staticFile() local
  videoSrcA: z.string().optional(),
  videoSrcB: z.string().optional(),
  videoSrcC: z.string().optional(),
  videoSrcD: z.string().optional(),
  videoSrcE: z.string().optional(),
});

type Props = z.infer<typeof butImgJoueurSchema>;

export const ButImgJoueur: React.FC<Props> = ({ videoSrcA, videoSrcB, videoSrcC, videoSrcD, videoSrcE }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Video src={resolveVideo(videoSrcA, "BUT_img_joueur_A.webm")} style={layer} />
      <Video src={resolveVideo(videoSrcB, "BUT_img_joueur_B.webm")} style={layer} />
      <Video src={resolveVideo(videoSrcC, "BUT_img_joueur_C.webm")} style={layer} />
      <Video src={resolveVideo(videoSrcD, "BUT_img_joueur_D.webm")} style={layer} />
      <Video src={resolveVideo(videoSrcE, "BUT_img_joueur_E.webm")} style={layer} />
    </AbsoluteFill>
  );
};

const layer: React.CSSProperties = {
  position: "absolute",
  top: 0, left: 0,
  width: 1920, height: 1080,
  objectFit: "cover",
};
