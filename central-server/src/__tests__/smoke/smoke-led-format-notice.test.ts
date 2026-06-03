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
