import React from 'react';
import { staticFile } from 'remotion';
import { z } from 'zod';
import { TemplateRuntime, TemplateRuntimeProps } from './runtime/TemplateRuntime';
import { layerSchema } from './runtime/layerSchema';

export const joueurSimpleGeneriqueSchema = z.object({
  prenomNom:   z.string().default('PRÉNOM\nNOM'),
  nomClub:     z.string().default('NOM DU CLUB'),
  logoSrc:     z.string().default(''),
  introMode:   z.enum(['logo', 'numero']).default('logo'),
  numeroIntro: z.string().default('10'),
  layers: z.array(layerSchema).default([
    { id: 'a', videoAsset: 'JOUEUR_simple_A.mp4' },
    { id: 'p', videoAsset: 'PACKSHOT_GENERIQUE.mp4' },
    { id: 'b', videoAsset: 'JOUEUR_simple_B.mp4' },
  ]),
});

type Props = z.infer<typeof joueurSimpleGeneriqueSchema>;

const noMask = { top: 0, bottom: 0, left: 0, right: 0 };

export const JoueurSimpleGenerique: React.FC<Props> = ({
  prenomNom,
  nomClub,
  logoSrc,
  introMode,
  numeroIntro,
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
        id: 'club-h', slotKey: 'nomClub', defaultValue: 'NOM DU CLUB',
        position: { x: 0.5, y: 0.136 }, maxWidth: 0.8,
        fontFamily: 'General Sans', fontSize: 28, color: '#FFFFFF', align: 'center',
        appearAt: 1.2, appearDuration: 0, animation: 'none',
        useMask: true, textTransform: 'uppercase',
      },
      {
        id: 'club-b', slotKey: 'nomClub', defaultValue: 'NOM DU CLUB',
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
    textValues: { nomClub, prenomNom, numeroIntro },
    imageUploads: { logoSrc },
    canvasWidth: 1920,
    canvasHeight: 1080,
    selectedOptions: { intro_mode: introMode },
    textMaskDir: 'masks/packshot-generique',
    textMaskFrameOffset: 0,
    textMaskZIndex: 1.5,
  };

  return <TemplateRuntime {...runtimeProps} />;
};
