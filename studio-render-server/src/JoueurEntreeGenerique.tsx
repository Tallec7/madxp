/**
 * Wrapper — JoueurEntreeGenerique : variante du JoueurButGeneriqueV1 réduite
 * au seul layer P (packshot image) et ses textes (prénom/nom, numéro, club).
 * Pas de logo intro, pas de titre BUT, pas de transition B ni d'outro D.
 */

import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { TemplateRuntime } from './runtime/TemplateRuntime';
import { resolveTemplate } from './runtime/resolveTemplate';
import { templateSchema, renderInputSchema } from '../spec/types';
import templateJson from '../spec/templates/joueur_entree_generique.v1.json';

export const joueurEntreeGeneriqueSchema = z.object({
  variantId: z.string().default('v1'),
  prenomNom: z.string().default('PRÉNOM\nNOM'),
  nomClub: z.string().default('NOM DU CLUB'),
  numero: z.string().default('9'),
  photoJoueur: z.string().default('photos/001.png'),
  /** Zoom sur la photo joueur (1.0 = défaut). */
  photoZoom: z.number().positive().default(1.0),
  /** Décalage horizontal de la photo en pixels. */
  photoOffsetX: z.number().default(0),
  /** Décalage vertical de la photo en pixels. */
  photoOffsetY: z.number().default(0),
  /** Taille du texte prénom/nom en pixels. Si undefined → valeur JSON (300). */
  prenomNomFontSize: z.number().positive().optional(),
  /** Taille du texte nom de club aux coins en pixels. Si undefined → valeur JSON. */
  nomClubFontSize: z.number().positive().optional(),
  /** Espacement entre lettres du nom de club. Si undefined → valeur JSON (20). */
  nomClubLetterSpacing: z.number().nonnegative().optional(),
  nomClubScaleFrom: z.number().positive().optional(),
  nomClubScaleTo: z.number().positive().optional(),
  nomClubScaleDuration: z.number().positive().optional(),
  nomClubAppearAt: z.number().nonnegative().optional(),
  /** Photo joueur : scale de départ. Défaut JSON 0.5. */
  photoScaleFrom: z.number().positive().optional(),
  photoScaleTo: z.number().positive().optional(),
  photoScaleDuration: z.number().positive().optional(),
  photoAppearAt: z.number().nonnegative().optional(),
  prenomNomSlideFromX: z.number().default(60),
  prenomNomSlideToX: z.number().default(0),
  prenomNomAppearAt: z.number().nonnegative().optional(),
  prenomNomDuration: z.number().positive().optional(),
  prenomNomScaleFrom: z.number().positive().optional(),
  prenomNomScaleTo: z.number().positive().optional(),
  numeroSlideFromX: z.number().default(-60),
  numeroSlideToX: z.number().default(0),
  numeroAppearAt: z.number().nonnegative().optional(),
  numeroDuration: z.number().positive().optional(),
  numeroScaleFrom: z.number().positive().optional(),
  numeroScaleTo: z.number().positive().optional(),
  /** Décalage du début de la timeline en secondes (saute le début de la vidéo packshot). Défaut 0. */
  startAtSec: z.number().nonnegative().default(0),
});

type Props = z.infer<typeof joueurEntreeGeneriqueSchema>;

const template = templateSchema.parse(templateJson);

const TemplateBody: React.FC<Props> = (props) => {
  const renderInput = renderInputSchema.parse({
    templateId: template.id,
    templateVersion: template.version,
    variantId: props.variantId,
    optionValues: {},
    textValues: {
      prenomNom: props.prenomNom,
      nomClub: props.nomClub,
      numero: props.numero,
    },
    imageUploads: {
      photoJoueur: props.photoJoueur,
    },
  });

  const runtimeProps = resolveTemplate(template, renderInput);

  const imageSlots = runtimeProps.imageSlots.map((slot) => {
    if (slot.id === 'photo_joueur') {
      const next = { ...slot, zoom: props.photoZoom, offsetX: props.photoOffsetX, offsetY: props.photoOffsetY };
      if (props.photoScaleFrom != null) next.scaleFrom = props.photoScaleFrom;
      if (props.photoScaleTo != null) next.scaleTo = props.photoScaleTo;
      if (props.photoScaleDuration != null) next.appearDuration = props.photoScaleDuration;
      if (props.photoAppearAt != null) next.appearAt = props.photoAppearAt;
      return next;
    }
    return slot;
  });

  const textFields = runtimeProps.textFields.map((field) => {
    if (field.id === 'prenom_nom') {
      const next = { ...field, slideFromX: props.prenomNomSlideFromX, slideToX: props.prenomNomSlideToX };
      if (props.prenomNomFontSize != null) next.fontSize = props.prenomNomFontSize;
      if (props.prenomNomAppearAt != null) next.appearAt = props.prenomNomAppearAt;
      if (props.prenomNomDuration != null) next.appearDuration = props.prenomNomDuration;
      if (props.prenomNomScaleFrom != null) next.scaleFrom = props.prenomNomScaleFrom;
      if (props.prenomNomScaleTo != null) next.scaleTo = props.prenomNomScaleTo;
      return next;
    }
    if (field.id === 'numero_maillot') {
      const next = { ...field, slideFromX: props.numeroSlideFromX, slideToX: props.numeroSlideToX };
      if (props.numeroAppearAt != null) next.appearAt = props.numeroAppearAt;
      if (props.numeroDuration != null) next.appearDuration = props.numeroDuration;
      if (props.numeroScaleFrom != null) next.scaleFrom = props.numeroScaleFrom;
      if (props.numeroScaleTo != null) next.scaleTo = props.numeroScaleTo;
      return next;
    }
    if (field.id.startsWith('club_')) {
      const next = { ...field };
      if (props.nomClubFontSize != null) next.fontSize = props.nomClubFontSize;
      if (props.nomClubLetterSpacing != null) next.letterSpacing = props.nomClubLetterSpacing;
      if (props.nomClubScaleFrom != null) next.scaleFrom = props.nomClubScaleFrom;
      if (props.nomClubScaleTo != null) next.scaleTo = props.nomClubScaleTo;
      if (props.nomClubScaleDuration != null) next.appearDuration = props.nomClubScaleDuration;
      if (props.nomClubAppearAt != null) next.appearAt = props.nomClubAppearAt;
      return next;
    }
    return field;
  });

  return <TemplateRuntime {...runtimeProps} imageSlots={imageSlots} textFields={textFields} />;
};

export const JoueurEntreeGenerique: React.FC<Props> = (props) => {
  const { fps } = useVideoConfig();
  const offsetFrames = Math.round((props.startAtSec ?? 0) * fps);
  if (offsetFrames <= 0) return <TemplateBody {...props} />;
  return (
    <Sequence from={-offsetFrames} layout="none">
      <TemplateBody {...props} />
    </Sequence>
  );
};
