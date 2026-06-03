/**
 * Tests unitaires — module `fold()` LED périmétrique (PROP-014 §2, §13).
 *
 * Deux niveaux :
 *  1. Géométrie pure (`computeFoldGeometry`) : 100% testable sans matériel ni vidéo.
 *  2. Construction de la commande ffmpeg (`buildFoldFilterGraph` / `buildFoldFfmpegArgs`) :
 *     pure également (pas de spawn) — on vérifie le graphe de filtres généré.
 *
 * Le SPIKE matériel (SPIKE-003) ne fournit QUE `canvas_in` (bandWidth, bandCount, order,
 * mode A/B). Ici tout est paramétrique : `fold()` ne change pas quand le SPIKE remplira
 * les vraies valeurs.
 */

// Le logger n'est importé que par la couche ffmpeg ; on le mocke pour éviter tout I/O.
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import {
  computeFoldGeometry,
  computeRibbonDimensions,
  buildFoldFilterGraph,
  buildFoldFfmpegArgs,
  ledFoldService,
  type FoldGeometry,
} from './led-fold.service';

describe('led-fold.service — géométrie pure', () => {
  describe('computeFoldGeometry', () => {
    it('cas validé PROP-014 : 13344×160 @1920 → 7 bandes, canvas 1920×1120', () => {
      const g = computeFoldGeometry({
        ribbonWidth: 13344,
        ribbonHeight: 160,
        bandWidth: 1920,
      });

      expect(g.bandCount).toBe(7);
      expect(g.bandWidth).toBe(1920);
      expect(g.bandHeight).toBe(160);
      expect(g.canvasWidth).toBe(1920);
      expect(g.canvasHeight).toBe(1120); // 7 × 160
      expect(g.order).toBe('top-to-bottom');
      expect(g.bands).toHaveLength(7);
    });

    it('découpe correctement srcX/dstY et padde la dernière bande (1824 → padRight 96)', () => {
      const g = computeFoldGeometry({
        ribbonWidth: 13344,
        ribbonHeight: 160,
        bandWidth: 1920,
      });

      // Bandes pleines 0..5 : largeur 1920, sans padding.
      for (let i = 0; i < 6; i++) {
        expect(g.bands[i]).toMatchObject({
          index: i,
          srcX: i * 1920,
          srcY: 0,
          w: 1920,
          h: 160,
          dstX: 0,
          dstY: i * 160,
          padRight: 0,
        });
      }

      // Dernière bande : reste = 13344 − 6×1920 = 1824, padding 96 px à droite.
      expect(g.bands[6]).toMatchObject({
        index: 6,
        srcX: 6 * 1920,
        srcY: 0,
        w: 1824,
        h: 160,
        dstX: 0,
        dstY: 6 * 160,
        padRight: 96,
      });
    });

    it('cas largeur multiple exact : 7680×160 @1920 → 4 bandes, aucun padding', () => {
      const g = computeFoldGeometry({
        ribbonWidth: 7680,
        ribbonHeight: 160,
        bandWidth: 1920,
      });

      expect(g.bandCount).toBe(4);
      expect(g.canvasWidth).toBe(1920);
      expect(g.canvasHeight).toBe(640);
      expect(g.bands.every((b) => b.w === 1920 && b.padRight === 0)).toBe(true);
      expect(g.bands.map((b) => b.srcX)).toEqual([0, 1920, 3840, 5760]);
      expect(g.bands.map((b) => b.dstY)).toEqual([0, 160, 320, 480]);
    });

    it('cas 1 bande : 1920×160 @1920 → canvas inchangé 1920×160', () => {
      const g = computeFoldGeometry({
        ribbonWidth: 1920,
        ribbonHeight: 160,
        bandWidth: 1920,
      });

      expect(g.bandCount).toBe(1);
      expect(g.canvasWidth).toBe(1920);
      expect(g.canvasHeight).toBe(160);
      expect(g.bands).toEqual([
        {
          index: 0,
          srcX: 0,
          srcY: 0,
          w: 1920,
          h: 160,
          dstX: 0,
          dstY: 0,
          padRight: 0,
        },
      ]);
    });

    it('cas ruban plus étroit qu’une bande : 1200×160 @1920 → 1 bande, padRight 720', () => {
      const g = computeFoldGeometry({
        ribbonWidth: 1200,
        ribbonHeight: 160,
        bandWidth: 1920,
      });

      expect(g.bandCount).toBe(1);
      expect(g.canvasWidth).toBe(1920);
      expect(g.canvasHeight).toBe(160);
      expect(g.bands[0]).toMatchObject({ w: 1200, padRight: 720, dstY: 0 });
    });

    it('order "bottom-to-top" inverse uniquement dstY (miroir vertical des bandes)', () => {
      const base = { ribbonWidth: 7680, ribbonHeight: 160, bandWidth: 1920 } as const;
      const top = computeFoldGeometry(base);
      const bottom = computeFoldGeometry({ ...base, order: 'bottom-to-top' });

      // Le contenu source (srcX) est identique ; seul l'empilement dstY change.
      expect(bottom.bands.map((b) => b.srcX)).toEqual(top.bands.map((b) => b.srcX));
      // Bande 0 (segment gauche du ruban) atterrit tout en bas du canvas.
      expect(bottom.bands.map((b) => b.dstY)).toEqual([480, 320, 160, 0]);
      // dstY couvre toujours le canvas entier sans trou ni recouvrement.
      const ys = [...bottom.bands.map((b) => b.dstY)].sort((a, b) => a - b);
      expect(ys).toEqual([0, 160, 320, 480]);
    });

    it('bandHeight optionnel : gutter vertical (bandHeight > ribbonHeight) agrandit le canvas', () => {
      const g = computeFoldGeometry({
        ribbonWidth: 7680,
        ribbonHeight: 160,
        bandWidth: 1920,
        bandHeight: 200, // 40 px de gutter sous chaque bande
      });

      expect(g.bandHeight).toBe(200);
      expect(g.canvasHeight).toBe(800); // 4 × 200
      expect(g.bands.map((b) => b.dstY)).toEqual([0, 200, 400, 600]);
      // Le contenu reste à la hauteur du ruban (160) ; le gutter est du padding.
      expect(g.bands.every((b) => b.h === 160)).toBe(true);
    });

    it('rejette (Joi) des dimensions non entières / non positives', () => {
      expect(() => computeFoldGeometry({ ribbonWidth: 0, ribbonHeight: 160, bandWidth: 1920 })).toThrow();
      expect(() => computeFoldGeometry({ ribbonWidth: 1920, ribbonHeight: -1, bandWidth: 1920 })).toThrow();
      expect(() => computeFoldGeometry({ ribbonWidth: 1920.5, ribbonHeight: 160, bandWidth: 1920 })).toThrow();
      expect(() => computeFoldGeometry({ ribbonWidth: 1920, ribbonHeight: 160, bandWidth: 0 })).toThrow();
    });

    it('rejette (Joi) un bandHeight inférieur à ribbonHeight (le contenu ne tiendrait pas)', () => {
      expect(() =>
        computeFoldGeometry({ ribbonWidth: 1920, ribbonHeight: 160, bandWidth: 1920, bandHeight: 100 }),
      ).toThrow();
    });

    it('rejette (Joi) un order inconnu', () => {
      expect(() =>
        // @ts-expect-error test runtime : order hors enum
        computeFoldGeometry({ ribbonWidth: 1920, ribbonHeight: 160, bandWidth: 1920, order: 'diagonal' }),
      ).toThrow();
    });
  });
});

describe('led-fold.service — profil LED → ruban (computeRibbonDimensions)', () => {
  it('80 m P6 → 13333×160 (px/m = 1000/6)', () => {
    const r = computeRibbonDimensions({ sides: [40, 20, 20], pitchMm: 6, height: 160 });
    expect(r.ribbonWidth).toBe(13333); // round(80 × 166.6667)
    expect(r.ribbonHeight).toBe(160);
    expect(r.pxPerMeter).toBeCloseTo(166.6667, 3);
  });

  it('un seul côté de 40 m P10 → 4000×160', () => {
    const r = computeRibbonDimensions({ sides: [40], pitchMm: 10, height: 160 });
    expect(r.ribbonWidth).toBe(4000);
  });

  it('alimente fold() : ribbonWidth → bandCount cohérent', () => {
    const { ribbonWidth, ribbonHeight } = computeRibbonDimensions({ sides: [40, 20, 20], pitchMm: 6, height: 160 });
    const geom = computeFoldGeometry({ ribbonWidth, ribbonHeight, bandWidth: 1920 });
    expect(geom.bandCount).toBe(7); // ceil(13333/1920)
    expect(geom.canvasHeight).toBe(1120);
  });

  it('rejette (Joi) des entrées invalides', () => {
    expect(() => computeRibbonDimensions({ sides: [], pitchMm: 6, height: 160 })).toThrow();
    expect(() => computeRibbonDimensions({ sides: [40], pitchMm: 0, height: 160 })).toThrow();
    expect(() => computeRibbonDimensions({ sides: [40], pitchMm: 6, height: 160.5 })).toThrow();
  });
});

describe('led-fold.service — construction ffmpeg (pure)', () => {
  const geom7: FoldGeometry = computeFoldGeometry({
    ribbonWidth: 13344,
    ribbonHeight: 160,
    bandWidth: 1920,
  });

  describe('buildFoldFilterGraph', () => {
    it('génère split + N crops + vstack pour le cas multi-bandes', () => {
      const graph = buildFoldFilterGraph(geom7);

      // Un split en 7 sorties.
      expect(graph).toContain('split=7');
      // Crop de la 1re bande pleine.
      expect(graph).toContain('crop=1920:160:0:0');
      // Crop de la dernière bande tronquée (1824 de large, à x=11520) + pad à 1920.
      expect(graph).toContain('crop=1824:160:11520:0');
      expect(graph).toContain('pad=1920:160:0:0');
      // Empilement final des 7 bandes.
      expect(graph).toContain('vstack=inputs=7');
    });

    it('respecte l’ordre dstY dans le vstack (bottom-to-top empile la bande 0 en dernier)', () => {
      const bottom = computeFoldGeometry({
        ribbonWidth: 7680,
        ribbonHeight: 160,
        bandWidth: 1920,
        order: 'bottom-to-top',
      });
      const graph = buildFoldFilterGraph(bottom);
      // L'entrée vstack la plus haute (dstY=0) doit être la bande 3 (segment droit).
      const vstackInputs = graph.slice(graph.indexOf('[b')).match(/\[b\d+\]/g);
      // Premier label fourni au vstack = bande dont dstY=0.
      const firstLabel = graph.match(/((?:\[b\d+\])+)vstack=inputs=4/);
      expect(firstLabel).not.toBeNull();
      expect(firstLabel?.[1]).toBe('[b3][b2][b1][b0]');
      expect(vstackInputs).not.toBeNull();
    });

    it('cas 1 bande : pas de vstack, simple crop + pad', () => {
      const one = computeFoldGeometry({ ribbonWidth: 1200, ribbonHeight: 160, bandWidth: 1920 });
      const graph = buildFoldFilterGraph(one);
      expect(graph).not.toContain('vstack');
      expect(graph).not.toContain('split');
      expect(graph).toContain('crop=1200:160:0:0');
      expect(graph).toContain('pad=1920:160:0:0');
    });
  });

  describe('buildFoldFfmpegArgs', () => {
    it('assemble une commande ffmpeg valide (input, filter_complex, codec, output)', () => {
      const args = buildFoldFfmpegArgs(geom7, {
        inputPath: '/tmp/flat.mp4',
        outputPath: '/tmp/folded.mp4',
      });

      expect(args).toContain('-i');
      expect(args).toContain('/tmp/flat.mp4');
      expect(args).toContain('-filter_complex');
      expect(args[args.length - 1]).toBe('/tmp/folded.mp4');
      // Overwrite + codec h264 (cohérent avec video-compression.service.ts).
      expect(args).toContain('-y');
      expect(args).toContain('libx264');
      // Le graphe de filtres est bien passé en argument.
      const fcIndex = args.indexOf('-filter_complex');
      expect(args[fcIndex + 1]).toContain('vstack=inputs=7');
    });

    it('permet de surcharger la couleur de padding', () => {
      const args = buildFoldFfmpegArgs(geom7, {
        inputPath: '/tmp/flat.mp4',
        outputPath: '/tmp/folded.mp4',
        padColor: 'white',
      });
      const fcIndex = args.indexOf('-filter_complex');
      expect(args[fcIndex + 1]).toContain('pad=1920:160:0:0:white');
    });
  });
});

describe('led-fold.service — singleton', () => {
  it('expose les helpers purs + applyFold + isFfmpegAvailable', () => {
    expect(typeof ledFoldService.computeFoldGeometry).toBe('function');
    expect(typeof ledFoldService.buildFoldFfmpegArgs).toBe('function');
    expect(typeof ledFoldService.applyFold).toBe('function');
    expect(typeof ledFoldService.isFfmpegAvailable).toBe('function');
  });
});
