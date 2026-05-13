import React from 'react';
import { staticFile } from 'remotion';
import { z } from 'zod';
import { TemplateRuntime, TemplateRuntimeProps } from './runtime/TemplateRuntime';
import { layerSchema } from './runtime/layerSchema';

export const joueurButGeneriqueSchema = z.object({
  prenomNom:   z.string().default('PRÉNOM\nNOM'),
  nomClub:     z.string().default('NOM DU CLUB'),
  logoSrc:     z.string().default(''),
  photoJoueur: z.string().default(''),
  titre:       z.string().default('BUT'),
  layers: z.array(layerSchema).default([
    { id: 'a', videoAsset: 'JOUEUR_but_A.webm' },
    { id: 'b', videoAsset: 'JOUEUR_but_B.webm' },
    { id: 'c', videoAsset: 'JOUEUR_but_C.webm' },
    { id: 'p', videoAsset: 'PACKSHOT_IMG.mp4' },
    { id: 'd', videoAsset: 'JOUEUR_but_D.webm' },
  ]),
});

type Props = z.infer<typeof joueurButGeneriqueSchema>;

const noMask = { top: 0, bottom: 0, left: 0, right: 0 };

export const JoueurButGenerique: React.FC<Props> = ({
  prenomNom,
  nomClub,
  logoSrc,
  photoJoueur,
  titre,
  layers,
}) => {
  const runtimeProps: TemplateRuntimeProps = {
    variants: [{ id: 'v1', backgroundVideoUrl: '' }],
    variantId: 'v1',
    layers: layers.map((l, i) => ({
      id: l.id,
      videoUrl: staticFile(l.videoAsset),
      zIndex: i,
      mask: noMask,
      blendMode: l.blendMode,
      durationMs: l.durationMs ?? 0,
    })),
    imageSlots: [
      {
        id: 'logo', slotKey: 'logoSrc',
        position: { x: 0.5, y: 0.5, width: 0.25, height: 0.5 },
        appearAt: 0, appearDuration: 1.5,
        animation: 'zoom', animationDirection: 'in',
        scaleFrom: 0.0, scaleTo: 1.0,
        layerId: 'a', anchor: 'center', fitMode: 'contain', overflow: 'hidden',
        safeZone: { topPct: 25, leftPct: 37.5, widthPct: 25, heightPct: 50 },
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
        id: 'titre', slotKey: 'titre', defaultValue: 'BUT',
        position: { x: 0.5, y: 0.5 }, maxWidth: 0.85,
        fontFamily: 'Bulevar', fontSize: 300, color: '#FFFFFF', align: 'center',
        appearAt: 1.02, appearDuration: 0, animation: 'none',
        textTransform: 'uppercase',
        layerId: 'c', respectAlpha: false,
      },
      // Textes packshot IMG — révélés par le masque PNG masks/packshot-img
      {
        id: 'club-tl', slotKey: 'nomClub', defaultValue: 'NOM DU CLUB',
        position: { x: 0.049, y: 0.1 }, maxWidth: 0.4,
        fontFamily: 'General Sans', fontSize: 25, color: '#FFFFFF', align: 'left',
        appearAt: 0, appearDuration: 0, animation: 'none',
        useMask: true, textTransform: 'uppercase',
      },
      {
        id: 'club-bl', slotKey: 'nomClub', defaultValue: 'NOM DU CLUB',
        position: { x: 0.049, y: 0.918 }, maxWidth: 0.4,
        fontFamily: 'General Sans', fontSize: 25, color: '#FFFFFF', align: 'left',
        appearAt: 0, appearDuration: 0, animation: 'none',
        useMask: true, textTransform: 'uppercase',
      },
      {
        id: 'club-br', slotKey: 'nomClub', defaultValue: 'NOM DU CLUB',
        position: { x: 0.95, y: 0.918 }, maxWidth: 0.4,
        fontFamily: 'General Sans', fontSize: 25, color: '#FFFFFF', align: 'right',
        appearAt: 0, appearDuration: 0, animation: 'none',
        useMask: true, textTransform: 'uppercase',
      },
      {
        id: 'prenom', slotKey: 'prenomNom', defaultValue: 'PRÉNOM\nNOM',
        position: { x: 0.05, y: 0.5 }, maxWidth: 0.4,
        fontFamily: 'Bulevar', fontSize: 150, color: '#FFFFFF', align: 'left',
        appearAt: 0, appearDuration: 0, animation: 'none',
        useMask: true, maskFrameOffset: -1, lineHeight: 0.85, textTransform: 'uppercase',
      },
    ],
    textValues: { nomClub, prenomNom, titre },
    imageUploads: { logoSrc, photoJoueur },
    canvasWidth: 1920,
    canvasHeight: 1080,
    selectedOptions: {},
    textMaskDir: 'masks/packshot-img',
    textMaskFrameOffset: 0,
    textMaskZIndex: 3.5,
  };

  return <TemplateRuntime {...runtimeProps} />;
};
