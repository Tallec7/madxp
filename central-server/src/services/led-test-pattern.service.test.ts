/**
 * Mire de diagnostic LED — parties pures.
 *
 * La mire est un outil de terrain : elle est générée une fois, diffusée sur un
 * ruban, photographiée. Si elle est fausse, on tire une conclusion fausse sur le
 * montage d'un club — d'où des tests serrés sur la géométrie et le filtre.
 */

import {
  computeMireBlocks,
  buildMireFilter,
  buildMireFfmpegArgs,
  escapeFontPath,
  findFont,
  MIRE_COLORS,
} from './led-test-pattern.service';

describe('computeMireBlocks', () => {
  it('découpe la largeur en blocs numérotés à partir de 1', () => {
    const b = computeMireBlocks({ width: 800, height: 100, blocks: 4 });
    expect(b.map((x) => x.label)).toEqual([1, 2, 3, 4]);
    expect(b.map((x) => x.x)).toEqual([0, 200, 400, 600]);
  });

  it('la somme des largeurs vaut EXACTEMENT la largeur du signal', () => {
    // Sinon une colonne noire au bord serait lue comme un artefact de mapping.
    for (const [width, blocks] of [[1920, 7], [6400, 8], [1000, 3], [13333, 12]]) {
      const b = computeMireBlocks({ width, height: 160, blocks });
      expect(b.reduce((a, x) => a + x.width, 0)).toBe(width);
    }
  });

  it('le dernier bloc absorbe le reste de la division', () => {
    const b = computeMireBlocks({ width: 1000, height: 100, blocks: 3 });
    expect(b.map((x) => x.width)).toEqual([333, 333, 334]);
  });

  it('marque le premier et le dernier bloc — un ruban peut être câblé à l’envers', () => {
    const b = computeMireBlocks({ width: 800, height: 100, blocks: 4 });
    expect(b[0].edge).toBe('start');
    expect(b[3].edge).toBe('end');
    expect(b[1].edge).toBeNull();
    expect(b[2].edge).toBeNull();
  });

  it('donne une couleur distincte à chaque bloc', () => {
    const b = computeMireBlocks({ width: 1200, height: 100, blocks: 6 });
    expect(new Set(b.map((x) => x.color)).size).toBe(6);
    expect(b[0].color).toBe(MIRE_COLORS[0]);
  });

  it('accepte une largeur de ruban ultra-wide (là où Chromium OOM)', () => {
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
  });
});

describe('buildMireFilter', () => {
  const blocks = computeMireBlocks({ width: 800, height: 100, blocks: 4 });

  it('peint un drawbox par bloc', () => {
    const f = buildMireFilter(blocks, { height: 100, fontFile: null });
    for (const b of blocks) {
      expect(f).toContain(`drawbox=x=${b.x}:y=0:w=${b.width}:h=100:color=${b.color}`);
    }
  });

  it('écrit les numéros quand une police est fournie', () => {
    const f = buildMireFilter(blocks, { height: 100, fontFile: '/f/Arial.ttf' });
    expect(f).toContain('drawtext=');
    expect(f).toContain("text='1'");
    expect(f).toContain("text='4'");
  });

  it('retombe sur un codage par barres sans police — jamais une mire muette', () => {
    const f = buildMireFilter(blocks, { height: 100, fontFile: null });
    expect(f).not.toContain('drawtext=');
    // bloc n → n barres blanches ; total 1+2+3+4 = 10, plus les 2 marqueurs de bord.
    const barres = (f.match(/color=white@1\.0/g) || []).length;
    expect(barres).toBe(10 + 1); // +1 = marqueur de début (blanc)
  });

  it('pose un marqueur clair au début et à la fin', () => {
    const f = buildMireFilter(blocks, { height: 100, fontFile: null });
    expect(f).toContain('drawbox=x=0:y=0:w=10:h=100:color=white@1.0:t=fill');
    // fin = dernier bloc, aligné à droite : 800 - 10
    expect(f).toContain('drawbox=x=790:y=0:w=10:h=100:color=black@1.0:t=fill');
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
  const base = { width: 1920, height: 160, blocks: 4, outputPath: '/tmp/m.mp4' };

  it('génère la source à la taille exacte demandée', () => {
    const a = buildMireFfmpegArgs(base, null);
    expect(a).toContain('lavfi');
    expect(a.join(' ')).toContain('color=c=black:s=1920x160');
  });

  it('respecte durée et fps', () => {
    const a = buildMireFfmpegArgs({ ...base, durationSec: 20, fps: 30 }, null);
    expect(a.join(' ')).toContain('r=30:d=20');
  });

  it('sort un MP4 sans audio (un ruban LED n’a pas de son)', () => {
    const a = buildMireFfmpegArgs(base, null);
    expect(a).toContain('-an');
    expect(a).toContain('libx264');
    expect(a[a.length - 1]).toBe('/tmp/m.mp4');
  });

  it('n’explose pas sur les options de rendu — seule la géométrie est validée', () => {
    // Régression : passer l'objet complet à computeMireBlocks levait
    // « "durationSec" is not allowed » et rendait le CLI inutilisable.
    expect(() => buildMireFfmpegArgs({ ...base, durationSec: 10, fps: 25 }, null)).not.toThrow();
  });
});
