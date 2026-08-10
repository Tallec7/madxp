/**
 * Mire de diagnostic LED — parties pures.
 *
 * La mire est un outil de terrain : générée une fois, diffusée sur un ruban,
 * photographiée. Si elle est fausse, on tire une conclusion fausse sur le montage
 * d'un club — d'où des tests serrés sur la géométrie et sur la lisibilité du
 * codage de repli.
 */

import {
  computeMireBlocks,
  buildMireFilter,
  buildMireFfmpegArgs,
  escapeFontPath,
  findFont,
  MIRE_COLORS,
} from './led-test-pattern.service';

describe('computeMireBlocks — bande simple', () => {
  it('découpe la largeur en colonnes numérotées à partir de 1', () => {
    const b = computeMireBlocks({ width: 800, height: 100, blocks: 4 });
    expect(b.map((x) => x.label)).toEqual([1, 2, 3, 4]);
    expect(b.map((x) => x.x)).toEqual([0, 200, 400, 600]);
    expect(b.every((x) => x.row === 0)).toBe(true);
  });

  it('la somme des largeurs vaut EXACTEMENT la largeur du signal', () => {
    // Sinon un liseré noir au bord passerait pour un artefact de mapping.
    for (const [width, blocks] of [[1920, 7], [6400, 8], [1000, 3], [13333, 12]]) {
      const b = computeMireBlocks({ width, height: 160, blocks });
      expect(b.reduce((a, x) => a + x.width, 0)).toBe(width);
    }
  });

  it('le dernier bloc absorbe le reste de la division', () => {
    const b = computeMireBlocks({ width: 1000, height: 100, blocks: 3 });
    expect(b.map((x) => x.width)).toEqual([333, 333, 334]);
  });

  it('accepte une largeur ultra-wide (là où Chromium OOM)', () => {
    const b = computeMireBlocks({ width: 13333, height: 160, blocks: 8 });
    expect(b).toHaveLength(8);
    expect(b.reduce((a, x) => a + x.width, 0)).toBe(13333);
  });

  it('refuse une entrée invalide', () => {
    expect(() => computeMireBlocks({ width: 0, height: 100, blocks: 4 })).toThrow(/invalide/);
    expect(() => computeMireBlocks({ width: 800, height: 100, blocks: 1 })).toThrow(/invalide/);
    expect(() => computeMireBlocks({ width: 800.5, height: 100, blocks: 4 })).toThrow(/invalide/);
    expect(() =>
      computeMireBlocks({ width: 800, height: 100, blocks: MIRE_COLORS.length + 1 })
    ).toThrow(/invalide/);
    expect(() => computeMireBlocks({ width: 800, height: 100, blocks: 4, rows: 0 })).toThrow(
      /invalide/
    );
  });
});

describe('computeMireBlocks — grille', () => {
  it('produit colonnes × rangées cases, numérotées en lecture', () => {
    const b = computeMireBlocks({ width: 800, height: 400, blocks: 4, rows: 2 });
    expect(b).toHaveLength(8);
    expect(b.map((x) => x.label)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(b.map((x) => x.row)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(b.map((x) => x.colIndex)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('la grille couvre EXACTEMENT le cadre, en largeur comme en hauteur', () => {
    const b = computeMireBlocks({ width: 1920, height: 1080, blocks: 8, rows: 4 });
    const rang0 = b.filter((x) => x.row === 0);
    expect(rang0.reduce((a, x) => a + x.width, 0)).toBe(1920);
    const col0 = b.filter((x) => x.colIndex === 0);
    expect(col0.reduce((a, x) => a + x.height, 0)).toBe(1080);
  });

  it('la dernière rangée absorbe le reste de la division verticale', () => {
    const b = computeMireBlocks({ width: 100, height: 1000, blocks: 2, rows: 3 });
    expect(b.filter((x) => x.colIndex === 0).map((x) => x.height)).toEqual([333, 333, 334]);
  });

  it('marque la première et la dernière case — un ruban peut être câblé à l’envers', () => {
    const b = computeMireBlocks({ width: 800, height: 400, blocks: 4, rows: 2 });
    expect(b[0].edge).toBe('start');
    expect(b[b.length - 1].edge).toBe('end');
    expect(b.filter((x) => x.edge !== null)).toHaveLength(2);
  });

  it('donne une couleur distincte à chaque case tant qu’il reste des couleurs', () => {
    const b = computeMireBlocks({ width: 1200, height: 200, blocks: 6, rows: 2 });
    expect(new Set(b.slice(0, MIRE_COLORS.length).map((x) => x.color)).size).toBe(
      MIRE_COLORS.length
    );
  });
});

describe('buildMireFilter', () => {
  const grille = computeMireBlocks({ width: 800, height: 400, blocks: 4, rows: 2 });

  it('peint un drawbox par case, à sa position 2D', () => {
    const f = buildMireFilter(grille, { fontFile: null });
    for (const b of grille) {
      expect(f).toContain(`drawbox=x=${b.x}:y=${b.y}:w=${b.width}:h=${b.height}:color=${b.color}`);
    }
  });

  it('écrit les numéros quand une police est disponible', () => {
    const f = buildMireFilter(grille, { fontFile: '/f/Arial.ttf' });
    expect(f).toContain('drawtext=');
    expect(f).toContain("text='1'");
    expect(f).toContain("text='8'");
  });

  it('sans police, code la POSITION et non le numéro absolu', () => {
    // Régression : coder la case 27 par 27 barres donnait un code-barres
    // illisible dès la 2ᵉ rangée. On code col (verticales) + row (horizontales).
    const f = buildMireFilter(grille, { fontFile: null });
    expect(f).not.toContain('drawtext=');

    // 2 rangées × (1+2+3+4) verticales = 20, plus (4×1 + 4×2) horizontales = 12,
    // plus le marqueur de début (blanc). Le marqueur de fin est noir.
    const blanches = (f.match(/color=white@1\.0/g) || []).length;
    expect(blanches).toBe(20 + 12 + 1);
  });

  it('sans police, les zones colonne et rangée ne se chevauchent pas', () => {
    // Régression visuelle : la rangée 4 empiétait sur les colonnes, glyphe illisible.
    const g = computeMireBlocks({ width: 1920, height: 1080, blocks: 8, rows: 4 });
    const f = buildMireFilter(g, { fontFile: null });
    const boxes = [...f.matchAll(/drawbox=x=(\d+):y=(\d+):w=(\d+):h=(\d+):color=white/g)].map(
      (m) => ({ y: +m[2], h: +m[4] })
    );
    const derniere = g[g.length - 1]; // case (row 3, col 7)
    const dansCase = boxes.filter((b) => b.y >= derniere.y && b.y < derniere.y + derniere.height);
    const verticales = dansCase.filter((b) => b.h > derniere.height * 0.2);
    const horizontales = dansCase.filter((b) => b.h <= derniere.height * 0.2);
    const basDesVerticales = Math.max(...verticales.map((b) => b.y + b.h));
    const hautDesHorizontales = Math.min(...horizontales.map((b) => b.y));
    expect(basDesVerticales).toBeLessThanOrEqual(hautDesHorizontales);
  });

  it('pose un repère clair au début et à la fin', () => {
    const f = buildMireFilter(grille, { fontFile: null });
    expect(f).toMatch(/drawbox=x=0:y=0:w=\d+:h=\d+:color=white@1\.0:t=fill/);
    expect(f).toMatch(/color=black@1\.0:t=fill/);
  });
});

describe('escapeFontPath', () => {
  it('échappe les deux-points, qui cassent le parseur de filtres ffmpeg', () => {
    expect(escapeFontPath('C:/Windows/Fonts/arial.ttf')).toBe('C\\:/Windows/Fonts/arial.ttf');
  });

  it('normalise les antislashs Windows', () => {
    expect(escapeFontPath('C:\\Fonts\\arial.ttf')).toBe('C\\:/Fonts/arial.ttf');
  });

  it('laisse un chemin POSIX intact', () => {
    expect(escapeFontPath('/usr/share/fonts/a.ttf')).toBe('/usr/share/fonts/a.ttf');
  });
});

describe('findFont', () => {
  it('renvoie null quand aucune candidate n’existe', () => {
    expect(findFont(['/n/existe/pas.ttf', '/non/plus.ttf'])).toBeNull();
  });
});

describe('buildMireFfmpegArgs', () => {
  const base = { width: 1920, height: 1080, blocks: 8, rows: 4, outputPath: '/tmp/m.mp4' };

  it('génère la source à la taille exacte demandée', () => {
    const a = buildMireFfmpegArgs(base, null);
    expect(a).toContain('lavfi');
    expect(a.join(' ')).toContain('color=c=black:s=1920x1080');
  });

  it('respecte durée et fps', () => {
    const a = buildMireFfmpegArgs({ ...base, durationSec: 30, fps: 30 }, null);
    expect(a.join(' ')).toContain('r=30:d=30');
  });

  it('sort un MP4 sans audio (un ruban LED n’a pas de son)', () => {
    const a = buildMireFfmpegArgs(base, null);
    expect(a).toContain('-an');
    expect(a).toContain('libx264');
    expect(a[a.length - 1]).toBe('/tmp/m.mp4');
  });

  it('propage bien le nombre de rangées jusqu’au filtre', () => {
    const uneRangee = buildMireFfmpegArgs({ ...base, rows: 1 }, null).join(' ');
    const quatre = buildMireFfmpegArgs(base, null).join(' ');
    expect((quatre.match(/drawbox/g) || []).length).toBeGreaterThan(
      (uneRangee.match(/drawbox/g) || []).length
    );
  });

  it('n’explose pas sur les options de rendu — seule la géométrie est validée', () => {
    // Régression : passer l'objet complet à computeMireBlocks levait
    // « "durationSec" is not allowed » et rendait le CLI inutilisable.
    expect(() => buildMireFfmpegArgs({ ...base, durationSec: 10, fps: 25 }, null)).not.toThrow();
  });
});
