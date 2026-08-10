/**
 * Classement d'une vidéo contre un ruban LED.
 *
 * Cas de référence : le profil réel de Piraths Strasbourg (4 côtés de 10 m, P6.25)
 * et la vidéo sponsor réellement livrée par son agence (1600×120). Si le
 * classement se trompe sur ce couple-là, il se trompera sur tous.
 */

import { classifyVideoForRibbon } from './led-content-fit.service';

/** Piraths : 4 × 10 m à P6.25 → 1600 px par côté, 6400 px de tour. */
const PIRATHS = { sides: [10, 10, 10, 10], pitchMm: 6.25, height: 160 };

describe('classifyVideoForRibbon — cas réel Piraths', () => {
  it('la vidéo sponsor 1600×120 est reconnue comme cadrée sur UN CÔTÉ', () => {
    // Le ratio (13,3:1) s'écarte pourtant de 33 % de celui du côté (10:1) :
    // c'est la largeur EXACTE qui doit trancher, pas le ratio.
    const r = classifyVideoForRibbon({ videoWidth: 1600, videoHeight: 120, ...PIRATHS });
    expect(r.scope).toBe('one-side');
    expect(r.target).toEqual({ width: 1600, height: 160 });
  });

  it('elle est proposée en « telle quelle », pas étirée', () => {
    const r = classifyVideoForRibbon({ videoWidth: 1600, videoHeight: 120, ...PIRATHS });
    expect(r.layout).toBe('centered');
    expect(r.explanation).toContain('1600×120');
    expect(r.explanation).toContain('20 px noirs en haut et en bas');
  });

  it('elle avertit que « Étalé » déformerait le logo de 33 %', () => {
    const r = classifyVideoForRibbon({ videoWidth: 1600, videoHeight: 120, ...PIRATHS });
    expect(r.warnings.join(' ')).toMatch(/Étalé.*33 %/);
  });

  it('elle annonce la répétition sur les 4 côtés', () => {
    const r = classifyVideoForRibbon({ videoWidth: 1600, videoHeight: 120, ...PIRATHS });
    expect(r.explanation).toContain('identique sur les 4 côtés');
  });
});

describe('classifyVideoForRibbon — cadrages', () => {
  it('une vidéo exactement à la taille d’un côté est « telle quelle », sans avertissement', () => {
    const r = classifyVideoForRibbon({ videoWidth: 1600, videoHeight: 160, ...PIRATHS });
    expect(r.exact).toBe(true);
    expect(r.layout).toBe('centered');
    expect(r.explanation).toContain('tombe pile');
    expect(r.warnings).toHaveLength(0);
  });

  it('une vidéo à la taille du TOUR est cadrée sur le tour', () => {
    const r = classifyVideoForRibbon({ videoWidth: 6400, videoHeight: 160, ...PIRATHS });
    expect(r.scope).toBe('full-ribbon');
    expect(r.target.width).toBe(6400);
    expect(r.exact).toBe(true);
    // Pas de promesse de répétition : elle fait le tour, une seule fois.
    expect(r.explanation).not.toContain('identique sur les');
  });

  it('un 16:9 ordinaire est proposé en RÉPÉTÉ, avec l’alerte de flou', () => {
    const r = classifyVideoForRibbon({ videoWidth: 1920, videoHeight: 1080, ...PIRATHS });
    expect(r.layout).toBe('repeated');
    expect(r.warnings.join(' ')).toMatch(/flou/);
  });

  it('une vidéo à demi-côté est répétée le long du ruban', () => {
    const r = classifyVideoForRibbon({ videoWidth: 800, videoHeight: 160, ...PIRATHS });
    expect(r.scope).toBe('one-side');
    expect(r.layout).toBe('repeated');
    expect(r.explanation).toContain('répétée');
  });

  it('une vidéo au ratio proche d’un côté, sans largeur exacte, reste sur un côté', () => {
    // 1500×150 = 10:1, exactement le ratio d'un côté.
    const r = classifyVideoForRibbon({ videoWidth: 1500, videoHeight: 150, ...PIRATHS });
    expect(r.scope).toBe('one-side');
    expect(r.layout).toBe('centered');
  });
});

describe('classifyVideoForRibbon — côtés inégaux', () => {
  const HANDBALL = { sides: [40, 20, 20], pitchMm: 6, height: 160 };

  it('signale que le rendu ne sera pas identique partout', () => {
    const r = classifyVideoForRibbon({ videoWidth: 3333, videoHeight: 160, ...HANDBALL });
    expect(r.scope).toBe('one-side');
    expect(r.warnings.join(' ')).toMatch(/ne font pas la même longueur/);
  });

  it('une largeur qui matche UN des côtés suffit à trancher', () => {
    // 3333 px = le côté de 20 m à P6.
    const r = classifyVideoForRibbon({ videoWidth: 3333, videoHeight: 160, ...HANDBALL });
    expect(r.target.width).toBe(3333);
    expect(r.exact).toBe(true);
  });
});

describe('classifyVideoForRibbon — robustesse', () => {
  it('refuse une entrée invalide plutôt que de deviner', () => {
    expect(() =>
      classifyVideoForRibbon({ videoWidth: 0, videoHeight: 120, ...PIRATHS })
    ).toThrow(/invalide/);
    expect(() =>
      classifyVideoForRibbon({ videoWidth: 1600, videoHeight: 120, ...PIRATHS, sides: [] })
    ).toThrow(/invalide/);
  });

  it('produit toujours une explication non vide', () => {
    for (const [w, h] of [[1600, 120], [6400, 160], [1920, 1080], [100, 100], [12000, 200]]) {
      const r = classifyVideoForRibbon({ videoWidth: w, videoHeight: h, ...PIRATHS });
      expect(r.explanation.length).toBeGreaterThan(20);
      expect(['one-side', 'full-ribbon']).toContain(r.scope);
    }
  });
});
