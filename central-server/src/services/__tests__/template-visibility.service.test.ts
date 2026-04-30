/**
 * Unit tests — template visibility expression evaluator.
 * Couvre tous les cas d'usage du PDF JOUEUR + edge cases sécurité.
 */

import { evaluateVisibleIf, filterVisibleSlots } from '../template-visibility.service';

describe('evaluateVisibleIf', () => {
  it('null / undefined / empty → visible', () => {
    expect(evaluateVisibleIf(null, {}).visible).toBe(true);
    expect(evaluateVisibleIf(undefined, {}).visible).toBe(true);
    expect(evaluateVisibleIf('', {}).visible).toBe(true);
    expect(evaluateVisibleIf('   ', {}).visible).toBe(true);
  });

  it('match strict key == "value"', () => {
    expect(evaluateVisibleIf('intro_mode == "logo"', { intro_mode: 'logo' })).toEqual({ visible: true });
    expect(evaluateVisibleIf('intro_mode == "logo"', { intro_mode: 'numero' })).toEqual({ visible: false });
  });

  it('option absente → invisible (requiert match explicite)', () => {
    expect(evaluateVisibleIf('intro_mode == "logo"', {})).toEqual({ visible: false });
    expect(evaluateVisibleIf('packshot == "img"', { intro_mode: 'logo' })).toEqual({ visible: false });
  });

  it('expression mal formée → visible + invalid:true (fail-open)', () => {
    expect(evaluateVisibleIf('not an expression', {})).toEqual({ visible: true, invalid: true });
    expect(evaluateVisibleIf('intro_mode = "logo"', {})).toEqual({ visible: true, invalid: true });
    expect(evaluateVisibleIf('intro_mode == logo', {})).toEqual({ visible: true, invalid: true });
    expect(evaluateVisibleIf('intro_mode != "logo"', {})).toEqual({ visible: true, invalid: true });
  });

  it('parser sécurité : pas de regex catastrophique sur input pathologique', () => {
    const t0 = Date.now();
    const big = 'a'.repeat(10000) + ' == "x"';
    const res = evaluateVisibleIf(big, {});
    expect(Date.now() - t0).toBeLessThan(50);
    // Au-delà de 64 char le key est rejeté → invalid
    expect(res.invalid).toBe(true);
  });

  it('case-sensitive sur la valeur, case-insensitive sur la syntaxe == ', () => {
    expect(evaluateVisibleIf('intro_mode == "Logo"', { intro_mode: 'Logo' }).visible).toBe(true);
    expect(evaluateVisibleIf('intro_mode == "Logo"', { intro_mode: 'logo' }).visible).toBe(false);
  });

  it('autorise espaces autour du ==', () => {
    expect(evaluateVisibleIf('intro_mode=="logo"', { intro_mode: 'logo' }).visible).toBe(true);
    expect(evaluateVisibleIf('  intro_mode  ==  "logo"  ', { intro_mode: 'logo' }).visible).toBe(true);
  });
});

describe('filterVisibleSlots', () => {
  const slots = [
    { id: 'a', label: 'Logo', visible_if: 'intro_mode == "logo"' },
    { id: 'b', label: 'Numéro', visible_if: 'intro_mode == "numero"' },
    { id: 'c', label: 'Toujours', visible_if: null },
    { id: 'd', label: 'Photo', visible_if: 'packshot == "img"' },
  ];

  it('mode logo + packshot generique', () => {
    const filtered = filterVisibleSlots(slots, { intro_mode: 'logo', packshot: 'generique' });
    expect(filtered.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('mode numero + packshot img', () => {
    const filtered = filterVisibleSlots(slots, { intro_mode: 'numero', packshot: 'img' });
    expect(filtered.map((s) => s.id)).toEqual(['b', 'c', 'd']);
  });

  it('aucune option → seuls les slots sans visible_if', () => {
    const filtered = filterVisibleSlots(slots, {});
    expect(filtered.map((s) => s.id)).toEqual(['c']);
  });
});
