/**
 * Smoke — le canvas processeur LED ne doit JAMAIS dépendre du contenu diffusé.
 *
 * Contexte (vérifié en DB prod le 2026-08-10) : la géométrie de pliage est
 * choisie par le CONTENU et non par l'ÉCRAN — `led-export-worker.service.ts`
 * branche sur `side_files.length > 0` pour choisir entre le pliage continu
 * (`computeRibbonDimensions` + `computeFoldGeometry`) et le pliage par côté
 * (`computeFoldGeometryPerSide`). Les deux ne produisent pas le même canvas.
 *
 * Un processeur LED (Novastar/Colorlight) est configuré UNE FOIS à l'installation,
 * pixel à pixel. Si la diffusion émettait tantôt l'un tantôt l'autre, le second
 * serait immappable → ruban noir ou décalé, un soir de match.
 *
 * Ce garde-fou est un TRIPWIRE, pas un test de feature. Il verrouille le fait que
 * le chemin de DÉPLOIEMENT reste indépendant du pliage tant que la divergence de
 * géométrie existe. Il doit échouer — et être révisé sciemment — le jour où :
 *   - quelqu'un câble l'étape D d'ADR-135 (diffuser le canvas composé), OU
 *   - quelqu'un unifie la géométrie (« toujours par côté »), ce qui supprime la
 *     divergence et rend ce garde-fou obsolète.
 *
 * File-based + calcul pur (audit-then-guard), pas de DB requise.
 *
 * Réf : ADR-134, ADR-135 (étape D « reste à câbler »), docs/specs/features/led-perimeter.spec.md
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  computeRibbonDimensions,
  computeFoldGeometry,
  computeFoldGeometryPerSide,
} from '../../services/led-fold.service';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/**
 * Profils LED réellement en production (relevés en DB le 2026-08-10).
 * Les deux sites sont `site_type='saas'` — aucun Pi. Aucun côté ne dépasse
 * `band_width`, donc le pliage est un no-op fonctionnel pour tout le parc.
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
  describe('la divergence de géométrie est réelle (raison d’être du garde-fou)', () => {
    it.each(PROFILS_PROD)(
      '$site — uniforme et par-côté ne donnent pas le même canvas',
      ({ sides, pitchMm, height, bandWidth, bandCountConfirme }) => {
        const ribbon = computeRibbonDimensions({ sides, pitchMm, height });
        const uniforme = computeFoldGeometry({
          ribbonWidth: ribbon.ribbonWidth,
          ribbonHeight: ribbon.ribbonHeight,
          bandWidth,
        });
        const parCote = computeFoldGeometryPerSide({ sides, pitchMm, height, bandWidth });

        // Le canvas est identique en LARGEUR (= band_width) mais la HAUTEUR dépend
        // du nombre de bandes, qui dépend du mode de pliage.
        expect(uniforme.canvasWidth).toBe(parCote.canvasWidth);

        // Si un installateur a figé band_count, il l'a fait sur la géométrie
        // UNIFORME : c'est cette valeur-là qui est gravée dans le processeur.
        if (bandCountConfirme !== null) {
          expect(uniforme.bandCount).toBe(bandCountConfirme);
          expect(parCote.bandCount).not.toBe(bandCountConfirme);
        }
      }
    );

    it('Lanester : basculer en par-côté doublerait la hauteur du canvas gravé', () => {
      const p = PROFILS_PROD[0];
      const ribbon = computeRibbonDimensions({
        sides: [...p.sides],
        pitchMm: p.pitchMm,
        height: p.height,
      });
      const uniforme = computeFoldGeometry({
        ribbonWidth: ribbon.ribbonWidth,
        ribbonHeight: ribbon.ribbonHeight,
        bandWidth: p.bandWidth,
      });
      const parCote = computeFoldGeometryPerSide({
        sides: [...p.sides],
        pitchMm: p.pitchMm,
        height: p.height,
        bandWidth: p.bandWidth,
      });

      // 1 bande (110 px) vs 2 bandes (220 px) : le processeur de Lanester attend 110.
      expect(uniforme.canvasHeight).toBe(110);
      expect(parCote.canvasHeight).toBe(220);
      expect(parCote.canvasHeight).toBeGreaterThan(uniforme.canvasHeight);
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
