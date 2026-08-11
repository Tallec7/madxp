/**
 * Détourage des marges LED (PROP-015) — la partie qui décide.
 *
 * Les cas de ce fichier sont ceux qui rendent la feature acceptable : ce n'est pas
 * « sait-on trouver un rectangle », c'est « sait-on se taire quand il ne faut pas
 * proposer », et « une frame noire fausse-t-elle la mesure ».
 */

import {
  computeSampleTimes,
  buildCropdetectArgs,
  parseCropdetectOutput,
  unionRects,
  normalizeRect,
  isRectWithin,
  evaluateCropProposal,
  CROPDETECT_LIMIT,
} from './led-autocrop.service';

/** Le fichier réel qui a motivé PROP-015 (mesuré par ffprobe le 2026-08-11). */
const STRASOL = { width: 4096, height: 1416 };
/** Son bandeau utile, mesuré par cropdetect sur 5 instants — identique partout. */
const BANDEAU = { x: 0, y: 554, w: 4096, h: 306 };
/** Un côté du ruban de Piraths : 10 m à P6.25, dalle 120 px. */
const PIRATHS = { width: 1600, height: 120 };

describe('led-autocrop — échantillonnage', () => {
  it('analyse PLUSIEURS instants répartis, jamais un seul', () => {
    const times = computeSampleTimes(15);
    expect(times).toHaveLength(5);
    // Répartis, et bornés loin des extrémités où traînent les fondus.
    expect(times[0]).toBeGreaterThan(0);
    expect(times[times.length - 1]).toBeLessThan(15);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('une durée illisible ne fait pas planter la sonde', () => {
    expect(computeSampleTimes(0)).toEqual([0]);
    expect(computeSampleTimes(NaN)).toEqual([0]);
  });

  it('la commande ffmpeg décode plusieurs frames par instant', () => {
    const args = buildCropdetectArgs('/tmp/a.mp4', 3.75);
    expect(args).toContain('-ss');
    expect(args[args.indexOf('-ss') + 1]).toBe('3.75');
    // Avec `-frames:v 1`, cropdetect n'émet RIEN après un seek — la sonde
    // resterait muette, ce qui se lirait à tort comme « aucune marge ».
    expect(Number(args[args.indexOf('-frames:v') + 1])).toBeGreaterThan(1);
    expect(args.join(' ')).toContain(`cropdetect=limit=${CROPDETECT_LIMIT}`);
  });
});

describe('led-autocrop — lecture de cropdetect', () => {
  it('retient la DERNIÈRE mesure (celle qui a vu le plus d’images)', () => {
    const out = [
      'crop=4096:1416:0:0',
      '[Parsed_cropdetect_0] x1:0 x2:4095 crop=4096:306:0:554',
    ].join('\n');
    expect(parseCropdetectOutput(out)).toEqual(BANDEAU);
  });

  it('une sortie sans mesure rend null, pas un rectangle inventé', () => {
    expect(parseCropdetectOutput('frame= 6 fps=0.0')).toBeNull();
  });
});

describe('led-autocrop — union des frames', () => {
  it('un fondu au noir ne rétrécit PAS le détourage', () => {
    // C'est l'invariant qui justifie le multi-frames : avec une intersection, la
    // frame du fondu (quasi vide) dicterait le rectangle et on couperait tout le
    // contenu des autres. On sous-détoure, jamais on ne rogne.
    const fondu = { x: 2000, y: 700, w: 40, h: 20 };
    expect(unionRects([BANDEAU, fondu, BANDEAU])).toEqual(BANDEAU);
  });

  it('deux contenus décalés donnent le rectangle qui contient les deux', () => {
    expect(unionRects([{ x: 0, y: 100, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 }])).toEqual({
      x: 0,
      y: 50,
      w: 150,
      h: 150,
    });
  });

  it('aucune frame exploitable → null (« je ne sais pas »)', () => {
    expect(unionRects([])).toBeNull();
  });
});

describe('led-autocrop — normalisation', () => {
  it('arrondit vers l’EXTÉRIEUR, en pair, sans sortir du cadre', () => {
    // Pair : une source yuv420p (chroma 4:2:0) refuse un crop impair. Extérieur :
    // l'arrondi ne doit pas devenir une façon détournée de couper du contenu.
    const r = normalizeRect({ x: 3, y: 555, w: 4090, h: 305 }, STRASOL.width, STRASOL.height);
    expect(r.x % 2).toBe(0);
    expect(r.w % 2).toBe(0);
    expect(r.x).toBeLessThanOrEqual(3);
    expect(r.x + r.w).toBeGreaterThanOrEqual(3 + 4090);
    expect(r.x + r.w).toBeLessThanOrEqual(STRASOL.width);
    expect(r.y + r.h).toBeLessThanOrEqual(STRASOL.height);
  });

  it('rejette un rectangle qui déborde du cadre', () => {
    expect(isRectWithin(BANDEAU, STRASOL.width, STRASOL.height)).toBe(true);
    expect(isRectWithin({ x: 0, y: 1400, w: 4096, h: 306 }, STRASOL.width, STRASOL.height)).toBe(false);
    expect(isRectWithin({ x: -2, y: 0, w: 10, h: 10 }, STRASOL.width, STRASOL.height)).toBe(false);
  });
});

describe('led-autocrop — quand PROPOSER, et quand se taire', () => {
  const target = { targetWidth: PIRATHS.width, targetHeight: PIRATHS.height };

  it('le cas STRASOL : marges massives, ratio de ruban → proposé', () => {
    const p = evaluateCropProposal({
      sourceWidth: STRASOL.width,
      sourceHeight: STRASOL.height,
      crop: BANDEAU,
      ...target,
    });

    expect(p.recommended).toBe(true);
    expect(p.marginFraction).toBeGreaterThan(0.7); // ~78 % de remplissage noir
    expect(p.croppedRatio).toBeCloseTo(4096 / 306, 2);
    // La phrase est lue telle quelle par l'opérateur : elle doit porter les deux
    // formats, et rappeler que l'export propre reste la meilleure réponse.
    expect(p.reason).toContain('4096 × 306');
    expect(p.reason).toContain('export sans marges');
  });

  it('un 16:9 PLEIN CADRE ne se voit rien proposer', () => {
    // Carton jaune, temps mort : aucune marge à retirer. Suggérer un détourage
    // laisserait croire à une solution — la bonne réponse est « Retirer ».
    const p = evaluateCropProposal({
      sourceWidth: 1920,
      sourceHeight: 1080,
      crop: { x: 0, y: 0, w: 1920, h: 1080 },
      ...target,
    });

    expect(p.recommended).toBe(false);
    expect(p.reason).toContain('Aucune marge');
    expect(p.reason).toContain('retire-la du ruban');
  });

  it('un 16:9 légèrement letterboxé reste un 16:9 — pas de proposition', () => {
    // Détourer 60 px de bandes ne rapproche pas d'un ruban 13,3:1. Proposer ici
    // ferait perdre du temps sur une vidéo qui n'a rien à faire sur le ruban.
    const p = evaluateCropProposal({
      sourceWidth: 1920,
      sourceHeight: 1080,
      crop: { x: 0, y: 60, w: 1920, h: 960 },
      ...target,
    });

    expect(p.recommended).toBe(false);
    expect(p.reason).toContain('Le détourage ne réglerait rien');
  });

  it('une entrée invalide lève plutôt que de rendre un verdict au hasard', () => {
    expect(() =>
      evaluateCropProposal({
        sourceWidth: 0,
        sourceHeight: 1080,
        crop: BANDEAU,
        ...target,
      })
    ).toThrow(/entrée invalide/);
  });
});
