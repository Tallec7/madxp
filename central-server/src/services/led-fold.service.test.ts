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
  computeFoldGeometryPerSide,
  computeRibbonDimensions,
  buildPerSideFoldFilterGraph,
  buildPerSideFoldComposeArgs,
  validateLedFormat,
  fitFromLayout,
  normalizeLayout,
  buildFoldFilterGraph,
  buildFoldFfmpegArgs,
  buildFoldExportFilterGraph,
  buildFoldExportLayoutGraph,
  buildFoldExportFfmpegArgs,
  ledFoldService,
  type FoldGeometry,
  computeSiteCanvas,
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

describe('led-fold.service — pliage par côté (computeFoldGeometryPerSide, ADR-135)', () => {
  it('[40,20,20] P6 h160 bw1920 → 4+2+2 = 8 bandes empilées', () => {
    const g = computeFoldGeometryPerSide({ sides: [40, 20, 20], pitchMm: 6, height: 160, bandWidth: 1920 });
    expect(g.segments).toHaveLength(3);
    // côté 0 : 40 m → round(6666.67)=6667 → ceil(6667/1920)=4 bandes
    expect(g.segments[0].ribbonWidth).toBe(6667);
    expect(g.segments[0].bandCount).toBe(4);
    // côtés 1 & 2 : 20 m → 3333 → 2 bandes chacun
    expect(g.segments[1].bandCount).toBe(2);
    expect(g.segments[2].bandCount).toBe(2);
    expect(g.bandCount).toBe(8);
    expect(g.canvasWidth).toBe(1920);
    expect(g.canvasHeight).toBe(8 * 160); // 1280
  });

  it('empile les blocs dans l’ordre des côtés (dstYStart cumulatif)', () => {
    const g = computeFoldGeometryPerSide({ sides: [40, 20, 20], pitchMm: 6, height: 160, bandWidth: 1920 });
    expect(g.segments[0].dstYStart).toBe(0);
    expect(g.segments[1].dstYStart).toBe(4 * 160); // après les 4 bandes du côté 0
    expect(g.segments[2].dstYStart).toBe(6 * 160); // après 4+2 bandes
    // dstY des bandes est GLOBAL : 1re bande du côté 1 commence à y=640
    expect(g.segments[1].bands[0].dstY).toBe(640);
  });

  it('chaque côté est un bloc contigu → le contenu ne traverse jamais un angle', () => {
    const g = computeFoldGeometryPerSide({ sides: [40, 20, 20], pitchMm: 6, height: 160, bandWidth: 1920 });
    // srcX des bandes est LOCAL au ruban du côté (repart de 0 à chaque côté).
    g.segments.forEach((seg) => {
      expect(seg.bands[0].srcX).toBe(0);
      const totalW = seg.bands.reduce((a, b) => a + b.w, 0);
      expect(totalW).toBe(seg.ribbonWidth); // les bandes couvrent exactement le ruban du côté
    });
  });

  it('un seul côté de 9 m P10 h110 → 900 px → 1 bande (sous la largeur de bande)', () => {
    const g = computeFoldGeometryPerSide({ sides: [9], pitchMm: 10, height: 110, bandWidth: 1920 });
    expect(g.segments).toHaveLength(1);
    expect(g.segments[0].ribbonWidth).toBe(900);
    expect(g.bandCount).toBe(1);
    expect(g.canvasHeight).toBe(110);
    // 1 seule bande, padding à droite = 1920 - 900
    expect(g.segments[0].bands[0].padRight).toBe(1020);
  });

  it('coûte ≥ autant de bandes que le pliage continu (padding par côté)', () => {
    const sides = [40, 20, 20];
    const perSide = computeFoldGeometryPerSide({ sides, pitchMm: 6, height: 160, bandWidth: 1920 });
    const { ribbonWidth } = computeRibbonDimensions({ sides, pitchMm: 6, height: 160 });
    const continuous = computeFoldGeometry({ ribbonWidth, ribbonHeight: 160, bandWidth: 1920 });
    expect(perSide.bandCount).toBeGreaterThanOrEqual(continuous.bandCount); // 8 ≥ 7
  });

  it('rejette une entrée invalide (0 côté, pitch ≤ 0, height non entière)', () => {
    expect(() => computeFoldGeometryPerSide({ sides: [], pitchMm: 6, height: 160, bandWidth: 1920 })).toThrow();
    expect(() => computeFoldGeometryPerSide({ sides: [40], pitchMm: 0, height: 160, bandWidth: 1920 })).toThrow();
    expect(() => computeFoldGeometryPerSide({ sides: [40], pitchMm: 6, height: 160.5, bandWidth: 1920 })).toThrow();
  });

  it('exposé via le singleton ledFoldService', () => {
    expect(typeof ledFoldService.computeFoldGeometryPerSide).toBe('function');
  });
});

describe('led-fold.service — composition par côté (buildPerSideFold*, ADR-135 étape 3)', () => {
  const geom = () => computeFoldGeometryPerSide({ sides: [40, 20, 20], pitchMm: 6, height: 160, bandWidth: 1920 });

  it('adapte CHAQUE source à son ruban puis empile les blocs des côtés', () => {
    const g = buildPerSideFoldFilterGraph(geom());
    // une entrée par côté, adaptée à la largeur de SON ruban
    expect(g).toContain('[0:v]scale=6667:160,setsar=1[rib0]');
    expect(g).toContain('[1:v]scale=3333:160,setsar=1[rib1]');
    expect(g).toContain('[2:v]scale=3333:160,setsar=1[rib2]');
    // chaque côté produit son bloc, puis vstack final des 3 blocs → [out]
    expect(g).toContain('[block0]');
    expect(g).toContain('[block1]');
    expect(g).toContain('[block2]');
    expect(g).toMatch(/\[block0\]\[block1\]\[block2\]vstack=inputs=3\[out\]$/);
  });

  it('plie chaque côté en bandes (split + crop/pad + vstack interne)', () => {
    const g = buildPerSideFoldFilterGraph(geom());
    // côté 0 (4 bandes) : split en 4 puis vstack de 4
    expect(g).toContain('[rib0]split=4');
    expect(g).toContain('vstack=inputs=4[block0]');
    // côté 1 (2 bandes)
    expect(g).toContain('vstack=inputs=2[block1]');
  });

  it('un seul côté : sort directement [out], sans vstack de blocs', () => {
    const g1 = buildPerSideFoldFilterGraph(
      computeFoldGeometryPerSide({ sides: [9], pitchMm: 10, height: 110, bandWidth: 1920 })
    );
    // 1 côté, 1 bande → crop/pad direct → [out]
    expect(g1).toContain('[0:v]scale=900:110,setsar=1[rib0]');
    expect(g1).toMatch(/\[rib0\]crop=900:110:0:0,pad=1920:110:0:0:black\[out\]$/);
    expect(g1).not.toContain('block');
  });

  it('args ffmpeg : une entrée -i par côté, map [out], encodage h264', () => {
    const args = buildPerSideFoldComposeArgs(geom(), {
      inputs: ['/t/c0.mp4', '/t/c1.mp4', '/t/c2.mp4'],
      outputPath: '/t/out.mp4',
    });
    expect(args.filter((a) => a === '-i')).toHaveLength(3);
    expect(args).toContain('/t/c0.mp4');
    expect(args).toContain('/t/c2.mp4');
    expect(args[args.indexOf('-map') + 1]).toBe('[out]');
    expect(args).toContain('libx264');
    expect(args[args.length - 1]).toBe('/t/out.mp4');
  });

  it('rejette un nombre de sources ≠ nombre de côtés', () => {
    expect(() =>
      buildPerSideFoldComposeArgs(geom(), { inputs: ['/t/a.mp4'], outputPath: '/t/o.mp4' })
    ).toThrow(/3 côté/);
  });

  it('exposé via le singleton ledFoldService', () => {
    expect(typeof ledFoldService.buildPerSideFoldFilterGraph).toBe('function');
    expect(typeof ledFoldService.applyPerSideFold).toBe('function');
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

describe('led-fold.service — validateur de format (validateLedFormat)', () => {
  const ribbon = { ribbonWidth: 13333, ribbonHeight: 160 };

  it('exact : dimensions = profil → pliage direct', () => {
    const r = validateLedFormat({ videoWidth: 13333, videoHeight: 160, ...ribbon });
    expect(r.verdict).toBe('exact');
    expect(r.message).toMatch(/exact/i);
  });

  it('resize : même ratio, autre taille → redimensionne + plie', () => {
    // 6666×80 = même ratio 83.3:1 que 13333×160
    const r = validateLedFormat({ videoWidth: 6666, videoHeight: 80, ...ribbon });
    expect(r.verdict).toBe('resize');
  });

  it('incompatible : ratio 6:1 (créa club) vs ruban ~83:1 → note non bloquante', () => {
    // Cas réel PROP-014 : LED_ENTREE 4800×800 (6:1)
    const r = validateLedFormat({ videoWidth: 4800, videoHeight: 800, ...ribbon });
    expect(r.verdict).toBe('incompatible');
    expect(r.message).toMatch(/blocs|studio|format ruban/i);
  });

  it('unknown : dimensions inconnues → impossible de juger (non bloquant)', () => {
    expect(validateLedFormat({ videoWidth: null, videoHeight: null, ...ribbon }).verdict).toBe('unknown');
    expect(validateLedFormat({ videoWidth: 0, videoHeight: 160, ...ribbon }).verdict).toBe('unknown');
  });

  it('respecte la tolérance de ratio (2 % par défaut)', () => {
    // 13333×161 : ratio très proche → resize (dans la tolérance)
    expect(validateLedFormat({ videoWidth: 13333, videoHeight: 161, ...ribbon }).verdict).toBe('resize');
  });

  it('ne lève jamais — toujours un verdict + message', () => {
    const r = validateLedFormat({ videoWidth: -5, videoHeight: 160, ...ribbon });
    expect(r.message).toBeTruthy();
    expect(['exact', 'resize', 'incompatible', 'unknown']).toContain(r.verdict);
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

describe('led-fold.service — export par mise en page (pavage réel)', () => {
  const geom: FoldGeometry = computeFoldGeometry({
    ribbonWidth: 6667,
    ribbonHeight: 160,
    bandWidth: 1920,
  });
  const cellPx = 1667;

  it('normalizeLayout : défaut = repeated, sinon valeur reconnue', () => {
    expect(normalizeLayout(null)).toBe('repeated');
    expect(normalizeLayout(undefined)).toBe('repeated');
    expect(normalizeLayout('repeated')).toBe('repeated');
    expect(normalizeLayout('scrolling')).toBe('scrolling');
    expect(normalizeLayout('stretched')).toBe('stretched');
    expect(normalizeLayout('centered')).toBe('centered');
    expect(normalizeLayout('n_importe_quoi')).toBe('repeated');
  });

  it('repeated : pave la cellule (split+hstack) puis crop au ruban, puis plie', () => {
    const g = buildFoldExportLayoutGraph(geom, 'repeated', cellPx, 'black');
    // Cellule interne arrondie au pair (1667 → 1668) pour éviter le mismatch
    // scale-decrease/pad sur source yuv420p (incident banc d'essai 2026-07-23) —
    // le crop final ci-dessous retaille à la largeur nominale du ruban (6667).
    expect(g).toContain('scale=1668:160:force_original_aspect_ratio=decrease'); // cellule
    expect(g).toContain('hstack=inputs='); // pavage
    expect(g).toContain('crop=6667:160:0:0[rib]'); // crop au ruban (valeur nominale, pas arrondie)
    expect(g).toContain('vstack=inputs=4'); // pliage en 4 bandes
  });

  it('scrolling : pave + défile (crop x = expression mod, virgule protégée)', () => {
    const g = buildFoldExportLayoutGraph(geom, 'scrolling', cellPx, 'black');
    expect(g).toContain('hstack=inputs=');
    expect(g).toMatch(/crop=6667:160:'mod\(t\*\d+,1667\)':0/); // x animé, comma quotée
    expect(g).toContain('vstack=inputs=4');
  });

  it('stretched : étire au ruban (déforme), pas de pavage', () => {
    const g = buildFoldExportLayoutGraph(geom, 'stretched', cellPx, 'black');
    expect(g).toContain('[0:v]scale=6667:160,setsar=1[rib]');
    expect(g).not.toContain('hstack');
  });

  it('centered : une copie centrée + padding, pas de pavage', () => {
    const g = buildFoldExportLayoutGraph(geom, 'centered', cellPx, 'black');
    // Boîte scale/pad arrondie au pair (6667 → 6668) — même garde-fou que `repeated`.
    expect(g).toContain('scale=6668:160:force_original_aspect_ratio=decrease');
    expect(g).toContain('pad=6668:160:(ow-iw)/2:(oh-ih)/2:black');
    expect(g).not.toContain('hstack');
  });

  it('buildFoldExportFfmpegArgs : layout prend le pas sur fit', () => {
    const args = buildFoldExportFfmpegArgs(geom, {
      inputPath: '/tmp/in.mp4',
      outputPath: '/tmp/out.mp4',
      layout: 'repeated',
      cellPx,
    });
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(fc).toContain('hstack=inputs=');
  });

  describe('régression — hauteur de ruban impaire (incident banc d\'essai 2026-07-23)', () => {
    // Profil réel Piraths Strasbourg ATH : pitch P3.9, 4×10m, height=205 (impair).
    // Sur une source yuv420p, `scale=W:H:decrease` peut produire un résultat 1px
    // plus grand qu'une cible impaire littérale → le `pad` qui suit refusait
    // l'entrée ("Padded dimensions cannot be smaller than input dimensions").
    // Toutes les boîtes scale/pad doivent donc être arrondies au pair — le crop
    // final, lui, reste sur la valeur nominale (205) : c'est lui qui retaille.
    const oddGeom = computeFoldGeometry({ ribbonWidth: 10256, ribbonHeight: 205, bandWidth: 1920 });
    const oddCellPx = 2564;

    it('repeated : la cellule est arrondie au pair, le crop final reste à 205', () => {
      const g = buildFoldExportLayoutGraph(oddGeom, 'repeated', oddCellPx, 'black');
      expect(g).toContain('scale=2564:206:force_original_aspect_ratio=decrease');
      expect(g).toContain('pad=2564:206:(ow-iw)/2:(oh-ih)/2:black');
      expect(g).toContain('crop=10256:205:0:0[rib]');
    });

    it('centered : la boîte scale/pad est arrondie au pair', () => {
      const g = buildFoldExportLayoutGraph(oddGeom, 'centered', oddCellPx, 'black');
      expect(g).toContain('scale=10256:206:force_original_aspect_ratio=decrease');
      expect(g).toContain('pad=10256:206:(ow-iw)/2:(oh-ih)/2:black');
    });

    it('contain (fit d\'export) : la boîte scale/pad est arrondie au pair', () => {
      const g = buildFoldExportFilterGraph(oddGeom, 'contain');
      expect(g).toContain('[0:v]scale=10256:206:force_original_aspect_ratio=decrease');
      expect(g).toContain('pad=10256:206:(ow-iw)/2:(oh-ih)/2:black');
    });
  });
});

describe('led-fold.service — export (scale→pad→fold)', () => {
  const geom7: FoldGeometry = computeFoldGeometry({
    ribbonWidth: 13333,
    ribbonHeight: 160,
    bandWidth: 1920,
  });

  describe('fitFromLayout', () => {
    it('stretched → stretch, tout le reste → contain', () => {
      expect(fitFromLayout('stretched')).toBe('stretch');
      expect(fitFromLayout('repeated')).toBe('contain');
      expect(fitFromLayout('scrolling')).toBe('contain');
      expect(fitFromLayout(null)).toBe('contain');
      expect(fitFromLayout(undefined)).toBe('contain');
    });
  });

  describe('buildFoldExportFilterGraph', () => {
    it('contain : scale fit-decrease + pad au ruban, puis fold depuis [rib]', () => {
      const g = buildFoldExportFilterGraph(geom7, 'contain');
      // Boîte scale/pad arrondie au pair (13333 → 13334), cf. evenUp().
      expect(g).toContain('[0:v]scale=13334:160:force_original_aspect_ratio=decrease');
      expect(g).toContain('pad=13334:160:(ow-iw)/2:(oh-ih)/2:black');
      expect(g).toContain('[rib]');
      expect(g).toContain('[rib]split=7'); // le fold part bien de [rib], pas [0:v]
      expect(g).toContain('vstack=inputs=7');
    });

    it('cover : scale fit-increase + crop', () => {
      const g = buildFoldExportFilterGraph(geom7, 'cover');
      expect(g).toContain('force_original_aspect_ratio=increase');
      expect(g).toContain('crop=13333:160');
    });

    it('stretch : scale au ratio du ruban (déforme)', () => {
      const g = buildFoldExportFilterGraph(geom7, 'stretch');
      expect(g).toContain('[0:v]scale=13333:160,setsar=1[rib]');
      expect(g).not.toContain('force_original_aspect_ratio');
    });

    it('cas 1 bande : pas de split, fold depuis [rib]', () => {
      const one = computeFoldGeometry({ ribbonWidth: 1200, ribbonHeight: 160, bandWidth: 1920 });
      const g = buildFoldExportFilterGraph(one, 'contain');
      expect(g).not.toContain('split');
      expect(g).toContain('[rib]crop=1200:160:0:0');
    });
  });

  describe('buildFoldExportFfmpegArgs', () => {
    it('assemble une commande complète avec le filtre d’export', () => {
      const args = buildFoldExportFfmpegArgs(geom7, {
        inputPath: '/tmp/club.mp4',
        outputPath: '/tmp/folded.mp4',
        fit: 'contain',
      });
      expect(args).toContain('/tmp/club.mp4');
      expect(args[args.length - 1]).toBe('/tmp/folded.mp4');
      const fc = args[args.indexOf('-filter_complex') + 1];
      expect(fc).toContain('scale=13334:160');
      expect(fc).toContain('vstack=inputs=7');
    });
  });
});

describe('computeSiteCanvas — la largeur d’entrée se dérive du terrain', () => {
  it('sans valeur figée, le canvas fait la largeur du plus long côté', () => {
    // Piraths : 4 côtés de 10 m en P6.25 → 1600 px/côté. Le canvas plié
    // fabriqué à la main sur place fait 1600×640, pas 1920×640.
    const canvas = computeSiteCanvas({ sides: [10, 10, 10, 10], pitch: 'P6.25', height: 160 });
    expect(canvas.canvasWidth).toBe(1600);
    expect(canvas.derivedBandCount).toBe(4);
    expect(canvas.canvasHeight).toBe(640);
  });

  it('des côtés inégaux se calent sur le plus long (aucun côté n’est coupé)', () => {
    const canvas = computeSiteCanvas({ sides: [10, 6, 10, 6], pitch: 'P6.25', height: 160 });
    expect(canvas.canvasWidth).toBe(1600);
    // Chaque côté tient dans une bande, y compris les courts (padding à droite).
    expect(canvas.derivedBandCount).toBe(4);
  });

  it('une largeur relevée à l’installation prime sur le dérivé', () => {
    // Elle décrit ce qui est gravé dans le processeur — la corriger en douce
    // ferait diverger le canvas émis de la config matérielle réelle.
    const canvas = computeSiteCanvas({
      sides: [10, 10, 10, 10],
      pitch: 'P6.25',
      height: 160,
      canvas_in: { band_width: 1920 },
    });
    expect(canvas.canvasWidth).toBe(1920);
  });
});

describe('led-fold.service — singleton', () => {
  it('expose les helpers purs + applyFold/applyFoldExport + isFfmpegAvailable', () => {
    expect(typeof ledFoldService.computeFoldGeometry).toBe('function');
    expect(typeof ledFoldService.buildFoldFfmpegArgs).toBe('function');
    expect(typeof ledFoldService.buildFoldExportFfmpegArgs).toBe('function');
    expect(typeof ledFoldService.applyFold).toBe('function');
    expect(typeof ledFoldService.applyFoldExport).toBe('function');
    expect(typeof ledFoldService.validateLedFormat).toBe('function');
    expect(typeof ledFoldService.isFfmpegAvailable).toBe('function');
  });
});
