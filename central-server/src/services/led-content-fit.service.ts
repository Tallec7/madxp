/**
 * Classement d'une vidéo reçue contre la géométrie d'un ruban LED.
 *
 * ## Le problème
 *
 * L'opérateur choisit entre quatre options abstraites — Répété, Défilant, Étalé,
 * Centré — sans que rien ne lui dise laquelle convient à CETTE vidéo sur CE ruban.
 * Sur une vidéo sponsor de 1600×120 posée sur un côté de 1600×160, « Étalé »
 * **écrase le logo de 33 %** et rien ne le signale.
 *
 * Ce module transforme deux mesures (la vidéo, le terrain) en une recommandation
 * lisible : sur quoi la vidéo est cadrée, comment elle remplit, et ce qui se
 * passerait si on choisissait autre chose.
 *
 * ## La règle qui compte : une largeur exacte prime sur le ratio
 *
 * Une agence qui livre `1600×120` pour un côté de 1600 px l'a fait exprès — le
 * nom du fichier le dit souvent. Or son ratio (13,3:1) s'écarte de 33 % de celui
 * du côté (10:1) : une heuristique purement basée sur le ratio la classerait
 * « ne correspond à rien » et proposerait un pavage, à tort.
 *
 * On teste donc les correspondances EXACTES de largeur d'abord, le ratio ensuite.
 *
 * ## Ce que ça n'est pas
 *
 * Pas un blocage : c'est une **proposition**. L'opérateur garde la main et corrige
 * si le résultat visé est différent (une image qui fait le tour, par exemple).
 */

import Joi from 'joi';
import type { LedExportLayout } from './led-fold.service';

/** Sur quoi la vidéo est cadrée. */
export type FitScope =
  /** Cadrée sur UN côté — répétée à l'identique sur tous les côtés. */
  | 'one-side'
  /** Cadrée sur le TOUR complet — découpée, un segment par côté. */
  | 'full-ribbon';

export interface ClassifyInput {
  videoWidth: number;
  videoHeight: number;
  /** Longueurs des côtés (m). */
  sides: number[];
  /** Pas de pixel (mm). */
  pitchMm: number;
  /** Hauteur de dalle (rangées px). */
  height: number;
}

export interface FitRecommendation {
  scope: FitScope;
  /** Mise en page proposée, à pré-sélectionner dans l'UI. */
  layout: LedExportLayout;
  /** Cible en px du cadre retenu (un côté, ou le tour complet). */
  target: { width: number; height: number };
  /** Phrase en clair, destinée à l'opérateur. */
  explanation: string;
  /** Avertissements — déformation, perte de définition, cadrage imprévu. */
  warnings: string[];
  /** `true` quand la vidéo tombe pile sur la cible (aucune adaptation). */
  exact: boolean;
  /**
   * Part de la largeur du cadre occupée après mise à l'échelle proportionnelle.
   *
   * `1` = la vidéo remplit le cadre. `0,13` = un 16:9 posé sur un ruban : ramené à
   * 120 px de haut, il n'occupe plus qu'un huitième de la largeur. Quand la vidéo
   * est MOINS allongée que le ruban — le cas de tout clip TV — ce nombre vaut
   * exactement `ratio vidéo / ratio ruban` : c'est donc la mesure d'élongation
   * relative, et le seul critère de format honnête pour trier du contenu de ruban
   * d'un clip TV (cf. `RIBBON_MIN_FILL_RATIO` côté appelant).
   */
  fillRatio: number;
}

const schema = Joi.object<ClassifyInput>({
  videoWidth: Joi.number().integer().positive().required(),
  videoHeight: Joi.number().integer().positive().required(),
  sides: Joi.array().items(Joi.number().positive()).min(1).required(),
  pitchMm: Joi.number().positive().required(),
  height: Joi.number().integer().positive().required(),
}).required();

/** Tolérance de ratio (multiplicative) pour rattacher une vidéo à un cadre. */
const RATIO_TOLERANCE = 1.15;

/** Écart relatif entre deux ratios, ≥ 1. `1` = identiques. */
function ratioGap(a: number, b: number): number {
  return a > b ? a / b : b / a;
}

function pct(n: number): string {
  return `${Math.round(n * 100)} %`;
}

/**
 * Classe une vidéo contre un ruban et propose un cadrage.
 * Fonction pure, aucun I/O. @throws si l'entrée est invalide (Joi).
 */
export function classifyVideoForRibbon(input: ClassifyInput): FitRecommendation {
  const { error, value } = schema.validate(input, { convert: false });
  if (error) {
    throw new Error(`classifyVideoForRibbon: entrée invalide — ${error.message}`);
  }

  const pxPerMeter = 1000 / value.pitchMm;
  const sideWidths = value.sides.map((m) => Math.round(m * pxPerMeter));
  const ribbonWidth = Math.round(value.sides.reduce((a, b) => a + b, 0) * pxPerMeter);
  const h = value.height;

  const vw = value.videoWidth;
  const vh = value.videoHeight;
  const videoRatio = vw / vh;

  // Sur des côtés inégaux, « un côté » n'a pas de largeur unique : on prend le
  // plus grand comme cible et on le signale — le pavage s'adaptera par côté.
  const maxSide = Math.max(...sideWidths);
  const sidesEqual = sideWidths.every((w) => w === sideWidths[0]);

  // 1) Correspondance EXACTE de largeur — le signal le plus fort.
  let scope: FitScope;
  if (sideWidths.includes(vw)) {
    scope = 'one-side';
  } else if (vw === ribbonWidth) {
    scope = 'full-ribbon';
  } else {
    // 2) À défaut, le ratio le plus proche.
    const gapSide = ratioGap(videoRatio, maxSide / h);
    const gapRibbon = ratioGap(videoRatio, ribbonWidth / h);
    if (gapSide <= RATIO_TOLERANCE || gapSide <= gapRibbon) {
      scope = 'one-side';
    } else {
      scope = 'full-ribbon';
    }
  }

  const target =
    scope === 'one-side'
      ? { width: sideWidths.includes(vw) ? vw : maxSide, height: h }
      : { width: ribbonWidth, height: h };

  const warnings: string[] = [];
  const exact = vw === target.width && vh === target.height;

  // Choix de la mise en page.
  let layout: LedExportLayout;
  let explanation: string;

  // Taux de remplissage APRÈS mise à l'échelle proportionnelle (contain) — pas la
  // largeur brute. Un 1920×1080 est plus large qu'un côté de 1600, mais une fois
  // ramené à 160 px de haut il n'en occupe plus que 18 % : le bon critère est ce
  // qu'il reste à l'écran, pas la taille du fichier.
  const containScale = Math.min(target.width / vw, target.height / vh);
  const fillRatio = (vw * containScale) / target.width;

  if (fillRatio < 0.9) {
    // La vidéo ne peut pas remplir le cadre : la répéter est plus lisible qu'un
    // logo minuscule perdu au milieu de dix mètres de noir.
    layout = 'repeated';
    explanation =
      `Ta vidéo (${vw}×${vh}) ne remplit que ${pct(fillRatio)} de ` +
      `${scope === 'one-side' ? 'la largeur d’un côté' : 'la largeur du tour'} ` +
      `(${target.width}×${target.height}) : elle sera répétée le long du ruban.`;
    warnings.push(
      `L'étaler sur toute la largeur la déformerait fortement (elle est bien plus ` +
        `« carrée » que le ruban) — image floue et écrasée. La répétition est préférable.`
    );
  } else if (exact) {
    layout = 'centered';
    explanation =
      `Ta vidéo tombe pile sur ${scope === 'one-side' ? 'un côté' : 'le tour complet'} ` +
      `(${target.width}×${target.height}) : elle sera diffusée telle quelle.`;
  } else {
    layout = 'centered';
    const parts: string[] = [];
    if (vh !== target.height) {
      const bars = Math.max(0, target.height - Math.round((vh * target.width) / vw));
      if (bars > 0) {
        parts.push(`${Math.round(bars / 2)} px noirs en haut et en bas`);
      }
      const distortion = Math.abs(target.height / vh - 1);
      if (distortion > 0.02) {
        warnings.push(
          `« Étalé » déformerait l'image de ${pct(distortion)} en hauteur — à éviter sur un logo.`
        );
      }
    }
    explanation =
      `Ta vidéo (${vw}×${vh}) sera adaptée à ${scope === 'one-side' ? 'un côté' : 'tout le tour'} ` +
      `(${target.width}×${target.height})` +
      (parts.length ? `, avec ${parts.join(' et ')}` : '') +
      '.';
  }

  if (scope === 'one-side') {
    explanation += ` Elle apparaîtra à l'identique sur les ${value.sides.length} côtés.`;
    if (!sidesEqual) {
      warnings.push(
        `Les côtés ne font pas la même longueur (${sideWidths.join(', ')} px) : ` +
          `le rendu ne sera pas identique partout.`
      );
    }
  }

  return { scope, layout, target, explanation, warnings, exact, fillRatio };
}

export default { classifyVideoForRibbon };
