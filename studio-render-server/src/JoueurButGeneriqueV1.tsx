/**
 * Wrapper v1 — charge le template JSON, applique resolveTemplate(), rend via
 * TemplateRuntime. Composition séparée de JoueurButGenerique (.tsx v0) pour
 * comparaison visuelle sans casser l'existant.
 */

import React from 'react';
import { z } from 'zod';
import { TemplateRuntime } from './runtime/TemplateRuntime';
import { resolveTemplate } from './runtime/resolveTemplate';
import { templateSchema, renderInputSchema } from '../spec/types';
import templateJson from '../spec/templates/joueur_but_generique.v1.json';

// Props Remotion : plats pour edition dans le studio.
export const joueurButGeneriqueV1Schema = z.object({
  variantId: z.string().default('v1'),
  prenomNom: z.string().default('PRÉNOM\nNOM'),
  nomClub: z.string().default('NOM DU CLUB'),
  titre: z.string().default('BUT'),
  numero: z.string().default('9'),
  logoSrc: z.string().default('logo_club.png'),
  photoJoueur: z.string().default('photos/001.png'),
  /** Zoom sur la photo joueur (1.0 = défaut). */
  photoZoom: z.number().positive().default(1.0),
  /** Décalage horizontal de la photo en pixels. */
  photoOffsetX: z.number().default(0),
  /** Décalage vertical de la photo en pixels. */
  photoOffsetY: z.number().default(0),
  /** Taille de départ du logo intro (0.5 = visible mais petit, 1 = taille finale). */
  logoScaleFrom: z.number().nonnegative().default(0.5),
  /** Taille d'arrivée du logo intro. */
  logoScaleTo: z.number().positive().default(1),
  /** Scale de départ du titre BUT (0.5 = petit, 1 = fontSize JSON = 300px). */
  titreScaleFrom: z.number().positive().default(0.5),
  /** Scale d'arrivée du titre BUT. */
  titreScaleTo: z.number().positive().default(1),
  /** Durée de l'anim scale BUT en secondes. */
  titreScaleDuration: z.number().positive().default(3.0),
  /** Taille du texte BUT en pixels (utile quand masqué par C, où scaleFrom/To sont ignorés). */
  titreFontSize: z.number().positive().default(300),
  /** Taille du texte prénom/nom en pixels. Si undefined → valeur JSON (300). */
  prenomNomFontSize: z.number().positive().optional(),
  /** Taille du texte nom de club aux 4 coins en pixels. Si undefined → valeur JSON. */
  nomClubFontSize: z.number().positive().optional(),
  /** Espacement entre lettres du nom de club en pixels. Si undefined → valeur JSON (20). */
  nomClubLetterSpacing: z.number().nonnegative().optional(),
  /** Scale de départ du nom de club (zoom-in léger). Si undefined → valeur JSON (0.85). */
  nomClubScaleFrom: z.number().positive().optional(),
  /** Scale d'arrivée du nom de club. Si undefined → valeur JSON (1). */
  nomClubScaleTo: z.number().positive().optional(),
  /** Durée de l'anim zoom-in du nom de club en secondes. Si undefined → valeur JSON (0.6). */
  nomClubScaleDuration: z.number().positive().optional(),
  /** Instant de départ de l'anim zoom-in du nom de club en secondes (caler sur la révélation par le packshot). Si undefined → valeur JSON (0). */
  nomClubAppearAt: z.number().nonnegative().optional(),
  /** Photo joueur : scale de départ. Défaut JSON 0.5. */
  photoScaleFrom: z.number().positive().optional(),
  /** Photo joueur : scale d'arrivée. Défaut JSON 1. */
  photoScaleTo: z.number().positive().optional(),
  /** Photo joueur : durée de l'anim en secondes. Défaut JSON 0.8. */
  photoScaleDuration: z.number().positive().optional(),
  /** Photo joueur : instant de départ en secondes. Défaut JSON 2.5. */
  photoAppearAt: z.number().nonnegative().optional(),
  /** Prénom/nom : offset horizontal de départ en px (négatif = vient de la gauche). */
  prenomNomSlideFromX: z.number().default(60),
  /** Prénom/nom : offset horizontal d'arrivée en px. Défaut 0 (position du JSON). */
  prenomNomSlideToX: z.number().default(0),
  /** Prénom/nom : instant de départ en secondes. Défaut JSON 2.5. */
  prenomNomAppearAt: z.number().nonnegative().optional(),
  /** Prénom/nom : durée du slide en secondes. Défaut JSON 0.8. */
  prenomNomDuration: z.number().positive().optional(),
  /** Prénom/nom : scale de départ. Défaut JSON 1 (pas de zoom). */
  prenomNomScaleFrom: z.number().positive().optional(),
  /** Prénom/nom : scale d'arrivée. Défaut JSON 1. */
  prenomNomScaleTo: z.number().positive().optional(),
  /** Numéro : offset horizontal de départ en px (négatif = vient de la gauche, positif = de la droite). */
  numeroSlideFromX: z.number().default(-60),
  /** Numéro : offset horizontal d'arrivée en px. Défaut 0 (position du JSON). */
  numeroSlideToX: z.number().default(0),
  /** Numéro : instant de départ en secondes. Défaut JSON 2.5. */
  numeroAppearAt: z.number().nonnegative().optional(),
  /** Numéro : durée du slide en secondes. Défaut JSON 0.8. */
  numeroDuration: z.number().positive().optional(),
  /** Numéro : scale de départ. Défaut JSON 1. */
  numeroScaleFrom: z.number().positive().optional(),
  /** Numéro : scale d'arrivée. Défaut JSON 1. */
  numeroScaleTo: z.number().positive().optional(),
});

type Props = z.infer<typeof joueurButGeneriqueV1Schema>;

const template = templateSchema.parse(templateJson);

export const JoueurButGeneriqueV1: React.FC<Props> = (props) => {
  const renderInput = renderInputSchema.parse({
    templateId: template.id,
    templateVersion: template.version,
    variantId: props.variantId,
    optionValues: {},
    textValues: {
      prenomNom: props.prenomNom,
      nomClub: props.nomClub,
      titre: props.titre,
      numero: props.numero,
    },
    imageUploads: {
      logoSrc: props.logoSrc,
      photoJoueur: props.photoJoueur,
    },
  });

  const runtimeProps = resolveTemplate(template, renderInput);

  // Overrides depuis les props Remotion (editables live dans le studio).
  const imageSlots = runtimeProps.imageSlots.map((slot) => {
    if (slot.id === 'photo_joueur') {
      const next = { ...slot, zoom: props.photoZoom, offsetX: props.photoOffsetX, offsetY: props.photoOffsetY };
      if (props.photoScaleFrom != null) next.scaleFrom = props.photoScaleFrom;
      if (props.photoScaleTo != null) next.scaleTo = props.photoScaleTo;
      if (props.photoScaleDuration != null) next.appearDuration = props.photoScaleDuration;
      if (props.photoAppearAt != null) next.appearAt = props.photoAppearAt;
      return next;
    }
    if (slot.id === 'logo_intro') {
      return { ...slot, scaleFrom: props.logoScaleFrom, scaleTo: props.logoScaleTo };
    }
    return slot;
  });
  const textFields = runtimeProps.textFields.map((field) => {
    if (field.id === 'titre_but') {
      return {
        ...field,
        scaleFrom: props.titreScaleFrom,
        scaleTo: props.titreScaleTo,
        appearDuration: props.titreScaleDuration,
        fontSize: props.titreFontSize,
      };
    }
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
