/**
 * Géométrie LED périmétrique — helpers purs côté dashboard.
 *
 * ⚠️ SOURCE DE VÉRITÉ : `central-server/src/services/led-fold.service.ts`
 * (`computeRibbonDimensions` / `computeFoldGeometry`). Ce module en est une
 * transposition minimale pour l'affichage — frontière de bundle, le dashboard ne
 * peut pas importer `central-server/src`. Toute évolution de la formule doit être
 * répercutée des deux côtés (même contrainte que la composition Remotion, ADR-134).
 *
 * Sert à DÉRIVER ce qui était figé en dur : la résolution d'un écran LED n'est pas
 * une constante de gabarit, elle dépend du terrain (côtés × pitch × hauteur).
 */

import { LedProfileConfig } from '../models';

/** Dernier recours quand le terrain n'est pas encore saisi (aucun côté, pitch illisible). */
export const DEFAULT_LED_BAND_WIDTH = 1920;

/**
 * Largeur d'entrée que le processeur attend, DÉRIVÉE du terrain : le côté le plus
 * long, puisque le pliage met chaque côté dans son bloc de bandes (ADR-138).
 *
 * 1920 en dur était un pari sur « une sortie HDMI standard », et il est faux dès que
 * les côtés ne font pas 1920 px. Chez Piraths (10 m en P6.25 → 1600 px/côté), il
 * ajoutait 320 px de noir à chaque bande et décalait tout face à un processeur gravé
 * pour 1600 — le canvas plié fabriqué à la main sur place fait bien 1600×640.
 *
 * PLAFONNÉ : au-delà de 1920, aucun processeur n'accepte le signal. Une salle de 40 m
 * en P6 donne un côté de 6667 px — il faut alors le découper en plusieurs bandes,
 * c'est précisément le rôle du pliage. Le plafond n'est pas un pis-aller : c'est la
 * borne physique de l'entrée, et le dérivé ne s'applique qu'en deçà.
 */
export function ledDerivedBandWidth(led: LedProfileConfig | null | undefined): number {
  if (!led) return DEFAULT_LED_BAND_WIDTH;
  const mm = ledPitchMm(led.pitch);
  const longest = Math.max(0, ...(led.sides ?? []));
  if (mm === 0 || longest <= 0) return DEFAULT_LED_BAND_WIDTH;
  return Math.min(Math.round(longest * (1000 / mm)), DEFAULT_LED_BAND_WIDTH);
}

/** Pas de pixel en mm depuis le libellé (`'P6'` → 6). `0` si illisible. */
export function ledPitchMm(pitch: string | undefined): number {
  if (!pitch) return 0;
  const mm = parseFloat(pitch.replace(/^P/i, ''));
  return Number.isFinite(mm) && mm > 0 ? mm : 0;
}

/** Largeur du ruban déroulé à plat (px) = Σ côtés × (1000 / pitch_mm). */
export function ledRibbonWidth(led: LedProfileConfig | null | undefined): number {
  if (!led) return 0;
  const mm = ledPitchMm(led.pitch);
  if (mm === 0) return 0;
  const sumSides = (led.sides ?? []).reduce((a, b) => a + b, 0);
  return Math.round(sumSides * (1000 / mm));
}

/** Largeur d'une bande (px) — valeur figée à l'install, sinon le dérivé du terrain. */
export function ledBandWidth(led: LedProfileConfig | null | undefined): number {
  return led?.canvas_in?.band_width || ledDerivedBandWidth(led);
}

/** Nb de bandes dérivé = ceil(ruban / largeur de bande). */
export function ledBandCount(led: LedProfileConfig | null | undefined): number {
  const ribbon = ledRibbonWidth(led);
  const bw = ledBandWidth(led);
  if (ribbon <= 0 || bw <= 0) return 0;
  return Math.ceil(ribbon / bw);
}

/**
 * Nb de bandes EFFECTIF : l'override figé par l'installateur (`canvas_in.band_count`)
 * prime sur le dérivé — c'est lui qui est gravé dans le processeur.
 */
export function ledBandsEffective(led: LedProfileConfig | null | undefined): number {
  return led?.canvas_in?.band_count ?? ledBandCount(led);
}

/** Hauteur du canvas plié (px) = bandes effectives × hauteur de dalle. */
export function ledCanvasHeight(led: LedProfileConfig | null | undefined): number {
  return ledBandsEffective(led) * (led?.height || 0);
}

/**
 * Format que le club doit PRODUIRE : le ruban déroulé à plat (`largeur × hauteur`),
 * pas le canvas plié — c'est ce que `validateLedFormat` juge côté serveur.
 * `null` si le profil est incomplet.
 */
export function ledSourceFormat(led: LedProfileConfig | null | undefined): string | null {
  const w = ledRibbonWidth(led);
  const h = led?.height || 0;
  return w > 0 && h > 0 ? `${w}x${h}` : null;
}

/**
 * Cadence du motif en pixels (= `spacing_m` × px/m).
 *
 * C'est le pas de répétition utilisé par le pavage `repeated`/`scrolling` : sur un
 * côté de 1600 px avec une cadence de 10 m à P6.25, le motif tient une fois par
 * côté. Sert à l'aperçu pour montrer le BON nombre de copies — en afficher deux
 * quand il n'y en aura qu'une serait un mensonge visuel.
 *
 * `0` si le profil est incomplet.
 */
export function ledCellPx(led: LedProfileConfig | null | undefined): number {
  const mm = ledPitchMm(led?.pitch);
  const spacing = led?.spacing_m;
  if (mm === 0 || !spacing || spacing <= 0) return 0;
  return Math.max(1, Math.round(spacing * (1000 / mm)));
}
