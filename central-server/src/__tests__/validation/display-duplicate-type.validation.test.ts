/**
 * Garde-fou anti-doublon de `display.type` sur `sites.displays[]` (ADR-143).
 *
 * Deux displays avec le même `type` exact partagent la même clé de variante
 * vidéo (`video_variants.display_type`) — indistinguables au rendu côté Pi
 * (`resolveDisplayVariant`). Incident réel : deux `led-perimeter` en doublon
 * sur un même site, le second aurait dû être `led-perimeter-2`.
 */

import { schemas } from '../../middleware/validation';

describe('schemas.updateDisplays — anti-doublon de type', () => {
  it('rejette deux displays avec exactement le même type', () => {
    const { error } = schemas.updateDisplays.validate({
      displays: [
        { index: 0, name: 'LED Principale', type: 'led-perimeter' },
        { index: 1, name: 'Bandeau LED horizontal', type: 'led-perimeter' },
      ],
    });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/doublon/);
  });

  it('accepte deux led-perimeter distincts (famille ADR-143, pas un doublon)', () => {
    const { error } = schemas.updateDisplays.validate({
      displays: [
        { index: 0, name: 'LED Principale', type: 'led-perimeter' },
        { index: 1, name: 'Bandeau LED horizontal', type: 'led-perimeter-2' },
      ],
    });
    expect(error).toBeUndefined();
  });

  it('accepte des types tous différents', () => {
    const { error } = schemas.updateDisplays.validate({
      displays: [
        { index: 0, name: 'TV', type: 'tv' },
        { index: 1, name: 'LED', type: 'led-perimeter' },
      ],
    });
    expect(error).toBeUndefined();
  });

  it('rejette un doublon même non adjacent dans le tableau', () => {
    const { error } = schemas.updateDisplays.validate({
      displays: [
        { index: 0, name: 'TV', type: 'tv' },
        { index: 1, name: 'LED', type: 'led-perimeter' },
        { index: 2, name: 'LED bis', type: 'led-perimeter' },
      ],
    });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/doublon/);
  });

  it('accepte deux displays type "tv" (résolution bypass les variantes, cas TV principale + TV bar légitime)', () => {
    const { error } = schemas.updateDisplays.validate({
      displays: [
        { index: 0, name: 'TV 1', type: 'tv' },
        { index: 1, name: 'Bar', type: 'tv' },
      ],
    });
    expect(error).toBeUndefined();
  });
});
