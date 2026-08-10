/**
 * Smoke — le canvas processeur LED ne doit JAMAIS dépendre du contenu diffusé.
 *
 * Contexte : jusqu'à ADR-138, la géométrie de pliage était choisie par le CONTENU
 * et non par l'ÉCRAN — le worker branchait sur `side_files.length > 0` entre deux
 * géométries qui ne produisaient pas le même canvas (7 bandes vs 8 sur le même club).
 *
 * Un processeur LED (Novastar/Colorlight) est configuré UNE FOIS à l'installation,
 * pixel à pixel. Si la diffusion émettait tantôt l'un tantôt l'autre, le second
 * serait immappable → ruban noir ou décalé, un soir de match.
 *
 * ## Révisé en ADR-138 — la divergence est CORRIGÉE
 *
 * La géométrie est désormais unifiée : `computeSiteCanvas()` est le point d'entrée
 * unique et plie TOUJOURS par côté. Le contenu ne choisit plus que les sources.
 * Ce fichier ne documente donc plus une divergence à surveiller, mais deux
 * invariants à tenir :
 *
 *   1. le canvas est une fonction pure du terrain (jamais du contenu) ;
 *   2. le chemin de DÉPLOIEMENT reste indépendant du pliage — l'étape D d'ADR-135
 *      n'est toujours pas câblée, et ne doit pas l'être par la bande.
 *
 * File-based + calcul pur (audit-then-guard), pas de DB requise.
 *
 * Réf : ADR-134, ADR-135 (étape D « reste à câbler »), docs/specs/features/led-perimeter.spec.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeSiteCanvas } from '../../services/led-fold.service';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/**
 * Profils LED réellement en production (relevés en DB le 2026-08-10).
 * Les deux sites sont `site_type='saas'` — aucun Pi. Aucun CÔTÉ ne dépasse
 * `band_width` : le pliage par côté ne coupe donc jamais à l'intérieur d'un côté.
 */
interface ProfilProd {
  site: string;
  sides: number[];
  pitchMm: number;
  height: number;
  bandWidth: number;
  /** `canvas_in.band_count` figé par un installateur, ou `null` si encore provisoire. */
  bandCountConfirme: number | null;
}

const PROFILS_PROD: ProfilProd[] = [
  {
    site: 'Saas Lanester HB',
    sides: [4.8, 4.8],
    pitchMm: 10,
    height: 110,
    bandWidth: 1920,
    /** `canvas_in.band_count` FIGÉ par un installateur → géométrie uniforme gravée. */
    bandCountConfirme: 1,
  },
  {
    site: 'Piraths Strasbourg ATH',
    sides: [10, 10, 10, 10],
    pitchMm: 6.25,
    height: 160,
    bandWidth: 1920,
    bandCountConfirme: null,
  },
];

describe('Smoke — invariant : le canvas LED ne dépend pas du contenu', () => {
  describe('le canvas ne dépend QUE du terrain (ADR-138)', () => {
    it.each(PROFILS_PROD)('$site — canvas dérivé du seul profil', ({ sides, pitchMm, height, bandWidth }) => {
      const canvas = computeSiteCanvas({
        sides: [...sides],
        pitch: pitchMm,
        height,
        canvas_in: { band_width: bandWidth },
      });
      // Toujours par côté : chaque côté est un bloc de bandes contigu.
      expect(canvas.geometry.segments).toHaveLength(sides.length);
      expect(canvas.canvasWidth).toBe(bandWidth);
      expect(canvas.canvasHeight).toBe(canvas.derivedBandCount * height);
    });

    it('un band_count figé divergent est SIGNALÉ, jamais écrasé', () => {
      const p = PROFILS_PROD[0]; // Lanester : 1 bande figée, 2 dérivées
      const canvas = computeSiteCanvas({
        sides: [...p.sides],
        pitch: p.pitchMm,
        height: p.height,
        canvas_in: { band_width: p.bandWidth, band_count: p.bandCountConfirme ?? undefined },
      });
      expect(canvas.confirmedBandCount).toBe(1);
      expect(canvas.derivedBandCount).toBe(2);
      expect(canvas.confirmedIsStale).toBe(true);
      // La valeur figée décrit ce qui est gravé dans le processeur : la corriger
      // en douce ferait diverger le canvas émis de la config matérielle réelle.
    });

    it('sans band_count figé, rien à signaler', () => {
      const p = PROFILS_PROD[1]; // Piraths : provisoire
      const canvas = computeSiteCanvas({
        sides: [...p.sides],
        pitch: p.pitchMm,
        height: p.height,
        canvas_in: { band_width: p.bandWidth },
      });
      expect(canvas.confirmedBandCount).toBeNull();
      expect(canvas.confirmedIsStale).toBe(false);
    });
  });

  describe('le chemin de DÉPLOIEMENT reste indépendant du pliage', () => {
    const DEPLOY = 'utils/config-secondary-variants.ts';

    it('config-secondary-variants n’importe ni le moteur de pliage ni le worker d’export', () => {
      const src = read(DEPLOY);
      // Assertion NÉGATIVE : c'est la formulation buguée qu'on bloque, pas une
      // formulation correcte qu'on recopie. Injecter un canvas composé dans la
      // config déployée passerait forcément par l'un de ces deux modules.
      expect(src).not.toMatch(/from\s+['"].*led-fold\.service['"]/);
      expect(src).not.toMatch(/from\s+['"].*led-export-worker\.service['"]/);
      expect(src).not.toMatch(/computeFoldGeometry|applyPerSideFold|applyFoldExport/);
    });

    it('l’enrichissement saute les variantes par côté sans binaire (anti-MP4 noir)', () => {
      const src = read(DEPLOY);
      // Garde-fou ADR-135 étape D (partiel) déjà posé : une variante « par côté
      // pure » n'a ni storage_path ni filename → l'injecter produirait un chemin
      // `videos-led-perimeter/null` et un MP4 noir côté lecteur.
      expect(src).toMatch(/if \(!v\.storage_path && !v\.filename\) continue;/);
    });
  });

  describe('le pliage par côté reste cantonné à l’export / au banc d’essai', () => {
    it('seul le worker d’export consomme applyPerSideFold', () => {
      const worker = read('services/led-export-worker.service.ts');
      expect(worker).toMatch(/applyPerSideFold/);

      // Aucun autre module de production ne doit composer par côté. Si un nouveau
      // consommateur apparaît, c'est probablement l'étape D qu'on câble — et ce
      // garde-fou doit être revu AVANT, pas après.
      const consommateurs = ['controllers/content-deployment.controller.ts', 'controllers/saas.controller.ts'];
      for (const rel of consommateurs) {
        expect(read(rel)).not.toMatch(/applyPerSideFold|computeFoldGeometryPerSide/);
      }
    });
  });
});
