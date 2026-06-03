/**
 * Validation du profil LED périmétrique sur `sites.displays[].led` (PROP-014 §3, §12).
 *
 * Garde-fou DATA : `stripUnknown` retirerait `led` si elle n'était pas explicitement
 * déclarée dans `schemas.updateDisplays`. Ces tests verrouillent la présence + la forme.
 */

import { schemas } from '../../middleware/validation';

describe('schemas.updateDisplays — profil LED (PROP-014)', () => {
  const wrap = (display: object) => schemas.updateDisplays.validate({ displays: [display] });

  const ledMinimal = {
    sides: [40, 20, 20],
    pitch: 'P6',
    height: 160,
    spacing_m: 10,
  };

  it('accepte un display led-perimeter avec profil led minimal', () => {
    const { error, value } = wrap({ index: 1, name: 'Bord de terrain', type: 'led-perimeter', led: ledMinimal });
    expect(error).toBeUndefined();
    // zones par défaut → 'uniform'
    expect(value.displays[0].led.zones).toBe('uniform');
  });

  it('préserve `led` (n’est PAS retiré par stripUnknown)', () => {
    const { value } = wrap({ index: 1, name: 'LED', type: 'led-perimeter', led: ledMinimal });
    expect(value.displays[0].led).toBeDefined();
    expect(value.displays[0].led.sides).toEqual([40, 20, 20]);
    expect(value.displays[0].led.pitch).toBe('P6');
  });

  it('applique les défauts provisoires de canvas_in (SPIKE-free)', () => {
    const { value } = wrap({
      index: 1,
      name: 'LED',
      type: 'led-perimeter',
      led: { ...ledMinimal, canvas_in: {} },
    });
    const canvas = value.displays[0].led.canvas_in;
    expect(canvas.band_width).toBe(1920);
    expect(canvas.order).toBe('top-to-bottom');
    expect(canvas.mode).toBe('B');
  });

  it('accepte un canvas_in complet rempli post-SPIKE', () => {
    const { error } = wrap({
      index: 1,
      name: 'LED',
      type: 'led-perimeter',
      led: {
        ...ledMinimal,
        zones: 'per-side',
        canvas_in: { band_width: 1920, band_count: 7, order: 'bottom-to-top', mode: 'A' },
      },
    });
    expect(error).toBeUndefined();
  });

  it('accepte un display sans led (rétro-compat displays existants)', () => {
    expect(wrap({ index: 0, name: 'TV', type: 'tv' }).error).toBeUndefined();
  });

  it('accepte led: null (désactivation du profil)', () => {
    expect(wrap({ index: 1, name: 'LED', type: 'led-perimeter', led: null }).error).toBeUndefined();
  });

  it('rejette un pitch mal formé', () => {
    const { error } = wrap({ index: 1, name: 'LED', type: 'led-perimeter', led: { ...ledMinimal, pitch: '6mm' } });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/pitch/);
  });

  it('rejette sides vide', () => {
    const { error } = wrap({ index: 1, name: 'LED', type: 'led-perimeter', led: { ...ledMinimal, sides: [] } });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/sides/);
  });

  it('rejette une longueur de côté non positive', () => {
    const { error } = wrap({ index: 1, name: 'LED', type: 'led-perimeter', led: { ...ledMinimal, sides: [40, 0] } });
    expect(error).toBeDefined();
  });

  it('rejette une height non entière', () => {
    const { error } = wrap({ index: 1, name: 'LED', type: 'led-perimeter', led: { ...ledMinimal, height: 160.5 } });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/height/);
  });

  it('rejette un zones inconnu', () => {
    const { error } = wrap({ index: 1, name: 'LED', type: 'led-perimeter', led: { ...ledMinimal, zones: 'mosaic' } });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/zones/);
  });

  it('rejette un canvas_in.mode hors {A,B}', () => {
    const { error } = wrap({
      index: 1,
      name: 'LED',
      type: 'led-perimeter',
      led: { ...ledMinimal, canvas_in: { mode: 'C' } },
    });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/mode/);
  });

  it('rejette un canvas_in.order hors enum fold()', () => {
    const { error } = wrap({
      index: 1,
      name: 'LED',
      type: 'led-perimeter',
      led: { ...ledMinimal, canvas_in: { order: 'left-to-right' } },
    });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/order/);
  });

  // --- side_zones : contenu/cadence par côté (ADR-135) ---

  it('préserve side_zones (n’est PAS retiré par stripUnknown)', () => {
    const { error, value } = wrap({
      index: 1,
      name: 'LED',
      type: 'led-perimeter',
      led: {
        ...ledMinimal,
        zones: 'per-side',
        side_zones: [
          { name: 'Tribune', video_id: '11111111-1111-1111-1111-111111111111', spacing_m: 10 },
          { name: 'But Est', video_id: '22222222-2222-2222-2222-222222222222' },
          {},
        ],
      },
    });
    expect(error).toBeUndefined();
    expect(value.displays[0].led.side_zones).toHaveLength(3);
    expect(value.displays[0].led.side_zones[0].name).toBe('Tribune');
    expect(value.displays[0].led.side_zones[1].video_id).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('accepte side_zones absent (mode uniform)', () => {
    const { error, value } = wrap({ index: 1, name: 'LED', type: 'led-perimeter', led: ledMinimal });
    expect(error).toBeUndefined();
    expect(value.displays[0].led.side_zones).toBeUndefined();
  });

  it('rejette un video_id non-uuid dans side_zones', () => {
    const { error } = wrap({
      index: 1,
      name: 'LED',
      type: 'led-perimeter',
      led: { ...ledMinimal, side_zones: [{ video_id: 'pas-un-uuid' }] },
    });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/video_id/);
  });

  it('rejette plus de 8 zones', () => {
    const { error } = wrap({
      index: 1,
      name: 'LED',
      type: 'led-perimeter',
      led: { ...ledMinimal, side_zones: Array.from({ length: 9 }, () => ({})) },
    });
    expect(error).toBeDefined();
  });
});
