/**
 * Unit tests — PngBboxService (POC SPEC JOUEUR auto_crop).
 *
 * Synthétise des PNG RGBA en mémoire avec pngjs pour valider l'algo de bbox
 * sans dépendre d'assets externes. 4 cas de référence :
 *   1. Photo centrée (offset attendu ≈ 0)
 *   2. Photo décalée à gauche (offset négatif)
 *   3. Photo décalée à droite (offset positif)
 *   4. PNG entièrement transparent (empty = true)
 */

import { PNG } from 'pngjs';
import { PngBboxService } from '../png-bbox.service';

/**
 * Construit un PNG RGBA in-memory avec un rectangle opaque dans une zone donnée.
 * Tout le reste = alpha 0 (transparent).
 */
function buildPng(
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number } | null
): Buffer {
  const png = new PNG({ width, height });
  // Init transparent (alpha = 0 partout, par défaut pngjs).
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
  }
  if (rect) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const idx = (y * width + x) * 4;
        png.data[idx] = 255;
        png.data[idx + 1] = 255;
        png.data[idx + 2] = 255;
        png.data[idx + 3] = 255; // opaque
      }
    }
  }
  return PNG.sync.write(png);
}

describe('PngBboxService.computeAlphaBbox', () => {
  const service = new PngBboxService();

  it('détecte une bbox centrée → offset_x ≈ 0', async () => {
    const buf = buildPng(100, 100, { x: 30, y: 20, w: 40, h: 60 });
    const result = await service.computeAlphaBbox(buf);

    expect(result.empty).toBe(false);
    expect(result.bbox).toEqual({
      top: 20,
      left: 30,
      right: 69, // 30 + 40 - 1
      bottom: 79, // 20 + 60 - 1
      width: 40,
      height: 60,
    });
    expect(Math.abs(result.suggested_offset_x)).toBeLessThan(0.05);
    expect(result.canvas_width).toBe(100);
    expect(result.canvas_height).toBe(100);
  });

  it('détecte une bbox décalée à gauche → offset_x négatif', async () => {
    const buf = buildPng(100, 100, { x: 5, y: 20, w: 30, h: 60 });
    const result = await service.computeAlphaBbox(buf);

    expect(result.empty).toBe(false);
    expect(result.suggested_offset_x).toBeLessThan(-0.3);
  });

  it('détecte une bbox décalée à droite → offset_x positif', async () => {
    const buf = buildPng(100, 100, { x: 65, y: 20, w: 30, h: 60 });
    const result = await service.computeAlphaBbox(buf);

    expect(result.empty).toBe(false);
    expect(result.suggested_offset_x).toBeGreaterThan(0.3);
  });

  it('PNG entièrement transparent → empty = true', async () => {
    const buf = buildPng(50, 50, null);
    const result = await service.computeAlphaBbox(buf);

    expect(result.empty).toBe(true);
    expect(result.bbox.width).toBe(0);
    expect(result.bbox.height).toBe(0);
    expect(result.suggested_offset_x).toBe(0);
  });

  it('respecte le seuil alpha personnalisé', async () => {
    // Pixel central avec alpha = 10 (sous le default 16, sur le custom 5)
    const png = new PNG({ width: 10, height: 10 });
    png.data.fill(0);
    const idx = (5 * 10 + 5) * 4;
    png.data[idx] = 255;
    png.data[idx + 3] = 10;
    const buf = PNG.sync.write(png);

    const defaultResult = await service.computeAlphaBbox(buf);
    expect(defaultResult.empty).toBe(true); // 10 ≤ default threshold 16

    const lowResult = await service.computeAlphaBbox(buf, { alpha_threshold: 5 });
    expect(lowResult.empty).toBe(false);
    expect(lowResult.bbox.width).toBe(1);
  });

  it('rejette un buffer non-PNG', async () => {
    const garbage = Buffer.from('not a png at all');
    await expect(service.computeAlphaBbox(garbage)).rejects.toThrow(/PNG decode failed/);
  });
});

describe('PngBboxService.hasAlphaChannel', () => {
  const service = new PngBboxService();

  it('retourne true sur PNG avec pixels transparents', async () => {
    const buf = buildPng(10, 10, { x: 2, y: 2, w: 4, h: 4 });
    expect(await service.hasAlphaChannel(buf)).toBe(true);
  });

  it('retourne false sur PNG entièrement opaque', async () => {
    const png = new PNG({ width: 5, height: 5 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 200;
      png.data[i + 1] = 100;
      png.data[i + 2] = 50;
      png.data[i + 3] = 255;
    }
    const buf = PNG.sync.write(png);
    expect(await service.hasAlphaChannel(buf)).toBe(false);
  });
});
