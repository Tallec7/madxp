/**
 * Smoke — validateur de format LED à l'upload (PROP-014 §6 / ADR-134).
 *
 * Garde-fou : le controller variant calcule un `format_notice` NON BLOQUANT à partir
 * du profil LED du display, et le joint à la réponse d'upload sans jamais rejeter.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Smoke — format_notice LED (PROP-014 §6)', () => {
  const ctrl = read('controllers/content-variant.controller.ts');

  it('importe le validateur + le calcul de ruban depuis led-fold.service', () => {
    expect(ctrl).toMatch(/validateLedFormat/);
    expect(ctrl).toMatch(/computeRibbonDimensions/);
  });

  it('le helper ne juge que les displays led-perimeter avec profil', () => {
    expect(ctrl).toMatch(/computeLedFormatNotice/);
    expect(ctrl).toMatch(/displayType !== 'led-perimeter'/);
  });

  it("joint format_notice à la réponse d'upload (non bloquant, spread conditionnel)", () => {
    expect(ctrl).toMatch(/format_notice/);
    // Le notice est ajouté via spread conditionnel → jamais une erreur HTTP.
    expect(ctrl).toMatch(/\.\.\.\(formatNotice \?/);
  });

  it('validateLedFormat ne lève jamais (retourne toujours un verdict)', () => {
    const svc = read('services/led-fold.service.ts');
    expect(svc).toMatch(/export function validateLedFormat/);
    expect(svc).toMatch(/verdict: 'unknown'/);
    expect(svc).toMatch(/verdict: 'incompatible'/);
  });
});

/**
 * Dimensions mesurées à l'upload — l'entrée SANS LAQUELLE le validateur ci-dessus
 * est muet.
 *
 * Avant : `videos.metadata` ne contenait qu'un `title`, et les colonnes
 * `video_variants.width/height` venaient de `req.body` — jamais envoyé par le
 * dashboard, donc NULL sur 100 % des rows. `validateLedFormat` tombait
 * systématiquement en verdict `unknown`, et personne ne savait ce qui partait
 * réellement sur un écran.
 */
describe('Smoke — dimensions mesurées à l’upload', () => {
  const SRC2 = path.resolve(__dirname, '../..');
  const read2 = (rel: string) => fs.readFileSync(path.join(SRC2, rel), 'utf8');

  it('l’util de sonde existe et ne bloque jamais un upload', () => {
    const util = read2('utils/video-dimensions.ts');
    expect(util).toMatch(/export async function probeVideoDimensions/);
    expect(util).toMatch(/export function dimensionsMetadata/);
    // 0×0 = inconnu, pas une mesure : persister 0 ferait croire à une mesure.
    expect(util).toMatch(/if \(!meta\.width \|\| !meta\.height\) /);
    // Jamais d'exception propagée vers le chemin d'upload.
    expect(util).toMatch(/catch \(error\)/);
    expect(util).toMatch(/return null;/);
  });

  it('les uploads de vidéo persistent les dimensions dans metadata', () => {
    const ctrl = read2('controllers/content.controller.ts');
    expect(ctrl).toMatch(/import \{ probeVideoDimensions, dimensionsMetadata \}/);
    // Unitaire ET import en masse — un bulk ne doit pas produire de vidéos sans dimensions.
    expect(ctrl).toMatch(/const dimensions = await probeVideoDimensions\(tempFilePath\)/);
    expect(ctrl).toMatch(/const bulkDimensions = await probeVideoDimensions\(tempFilePath\)/);
    expect((ctrl.match(/\.\.\.dimensionsMetadata\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('les variantes MESURENT le fichier au lieu de croire le client', () => {
    const ctrl = read2('controllers/content-variant.controller.ts');
    expect(ctrl).toMatch(/const probed = await probeVideoDimensions\(tempFilePath\)/);
    expect(ctrl).toMatch(/const probedSide = await probeVideoDimensions\(tempFilePath\)/);

    // Assertion NÉGATIVE : c'est la formulation buguée qu'on bloque. `req.body`
    // ne doit plus être la source PRIMAIRE — seulement un repli après la sonde.
    expect(ctrl).not.toMatch(/const width = req\.body\.width \? parseInt/);
    expect(ctrl).toMatch(/probed\?\.width \?\? \(req\.body\.width/);
  });

  it('une variante créée depuis une vidéo existante hérite des dimensions de la source', () => {
    const ctrl = read2('controllers/content-variant.controller.ts');
    expect(ctrl).toMatch(/function dimensionsFromVideo/);
    // Le fichier n'est pas local : re-télécharger pour mesurer ce qu'on sait déjà
    // serait absurde — on lit `metadata` de la source.
    expect(ctrl).not.toMatch(/width: null,\n      height: null,/);
    expect((ctrl.match(/sourceDimensions/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});
