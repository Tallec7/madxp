/**
 * Étape D (ADR-139) — servir le canvas plié au lieu du fichier brut.
 *
 * Ce que ces tests protègent, concrètement : deux clubs LED sont en production
 * et leur processeur (Novastar/Colorlight) est gravé une fois pour toutes à
 * l'installation. Lui envoyer un canvas qu'il n'attend pas donne un ruban noir
 * un soir de match. D'où quatre comportements non négociables :
 *
 *   1. sans `serve_folded`, RIEN ne change (le parc actuel n'a pas la bascule) ;
 *   2. avec, on sert le canvas déjà fabriqué ;
 *   3. s'il n'existe pas encore, on sert le brut ET on met en file ;
 *   4. si la DB tousse, on sert le brut — jamais d'échec de déploiement.
 */

import { enrichConfigWithDisplayVariants } from '../config-secondary-variants';
import { videoVariantRepository } from '../../repositories/video-variant.repository';
import { siteRepository } from '../../repositories/site.repository';
import { ledExportJobRepository } from '../../repositories/led-export-job.repository';
import { computeFoldedCanvasHash } from '../../services/led-fold.service';
import { SiteConfiguration } from '../../types';

jest.mock('../../repositories/video-variant.repository');
jest.mock('../../repositories/site.repository');
jest.mock('../../repositories/led-export-job.repository');
jest.mock('../../services/storage.service', () => ({
  getVideoUrl: (p: string) => `https://cdn.test/neopro-video/${p}`,
}));
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const variantRepo = videoVariantRepository as jest.Mocked<typeof videoVariantRepository>;
const sites = siteRepository as jest.Mocked<typeof siteRepository>;
const jobs = ledExportJobRepository as jest.Mocked<typeof ledExportJobRepository>;

const SITE = '11111111-1111-1111-1111-111111111111';
const VIDEO = '22222222-2222-2222-2222-222222222222';
const BRUT = 'videos-led-perimeter/source.mp4';

/** Profil Piraths : 4 côtés de 10 m en P6.25 → 1600 px/côté, 4 bandes. */
const PROFIL_LED = {
  sides: [10, 10, 10, 10],
  pitch: '6.25',
  height: 160,
  canvas_in: { band_width: 1920, order: 'top-to-bottom' },
};

function config(): SiteConfiguration {
  return {
    sponsors: [{ path: 'videos/source.mp4', name: 'Sponsor' }],
  } as unknown as SiteConfiguration;
}

function servedPath(c: SiteConfiguration): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (c.sponsors?.[0] as any)?.variants?.['led-perimeter']?.path;
}

function mockDisplays(led: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sites.getDisplays.mockResolvedValue([{ type: 'led-perimeter', led }] as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variantRepo.findVariantsByFilenamesAndTypes.mockResolvedValue([
    {
      source_filename: 'source.mp4',
      display_type: 'led-perimeter',
      storage_path: BRUT,
      filename: 'source.mp4',
      video_id: VIDEO,
      layout: 'repeated',
    },
  ] as any);
  jobs.findReadyByGeometry.mockResolvedValue(null);
  jobs.hasPendingForGeometry.mockResolvedValue(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs.create.mockResolvedValue({ id: 'job-1' } as any);
});

describe('computeFoldedCanvasHash — l’invalidation vient de la clé, pas d’une expiration', () => {
  const base = {
    sides: [10, 10, 10, 10],
    pitch: '6.25',
    height: 160,
    bandWidth: 1920,
    order: 'top-to-bottom' as const,
    sourcePath: BRUT,
    layout: 'repeated',
  };

  it('même géométrie + même source → même empreinte', () => {
    expect(computeFoldedCanvasHash(base)).toBe(computeFoldedCanvasHash({ ...base }));
  });

  it.each([
    ['un côté ajouté', { sides: [10, 10, 10, 10, 10] }],
    ['le pitch', { pitch: '10' }],
    ['la hauteur du ruban', { height: 110 }],
    ['la largeur de bande', { bandWidth: 1024 }],
    ['l’ordre des bandes', { order: 'bottom-to-top' as const }],
    ['la source', { sourcePath: 'videos-led-perimeter/autre.mp4' }],
    ['le cadrage', { layout: 'stretched' }],
  ])('changer %s périme le canvas', (_label, patch) => {
    // C'est TOUT le mécanisme d'invalidation : un canvas dont la clé a changé
    // devient inatteignable. Pas de TTL, pas de purge à écrire.
    expect(computeFoldedCanvasHash({ ...base, ...patch })).not.toBe(computeFoldedCanvasHash(base));
  });

  it('le défaut d’ordre vaut top-to-bottom (une géométrie, une empreinte)', () => {
    const { order, ...sansOrdre } = base;
    expect(order).toBe('top-to-bottom');
    expect(computeFoldedCanvasHash(sansOrdre)).toBe(computeFoldedCanvasHash(base));
  });
});

describe('substituteFoldedCanvas — le canvas plié derrière l’interrupteur', () => {
  it('serve_folded absent → le fichier brut est servi, rien n’est mis en file', async () => {
    mockDisplays(PROFIL_LED); // exactement le profil du parc actuel
    const c = config();

    await enrichConfigWithDisplayVariants(c, ['led-perimeter'], { siteId: SITE });

    expect(servedPath(c)).toBe(BRUT);
    expect(jobs.findReadyByGeometry).not.toHaveBeenCalled();
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it('serve_folded: false → même chose (l’interrupteur n’est pas seulement « défini »)', async () => {
    mockDisplays({ ...PROFIL_LED, canvas_in: { ...PROFIL_LED.canvas_in, serve_folded: false } });
    const c = config();

    await enrichConfigWithDisplayVariants(c, ['led-perimeter'], { siteId: SITE });

    expect(servedPath(c)).toBe(BRUT);
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it('sans siteId, la substitution n’est même pas tentée', async () => {
    mockDisplays({ ...PROFIL_LED, canvas_in: { ...PROFIL_LED.canvas_in, serve_folded: true } });
    const c = config();

    await enrichConfigWithDisplayVariants(c, ['led-perimeter']);

    expect(servedPath(c)).toBe(BRUT);
    expect(sites.getDisplays).not.toHaveBeenCalled();
  });

  describe('interrupteur allumé', () => {
    const LED_ON = { ...PROFIL_LED, canvas_in: { ...PROFIL_LED.canvas_in, serve_folded: true } };

    it('canvas déjà fabriqué → c’est LUI qui part sur le fil', async () => {
      const attendu = computeFoldedCanvasHash({
        sides: LED_ON.sides,
        pitch: LED_ON.pitch,
        height: LED_ON.height,
        bandWidth: 1920,
        order: 'top-to-bottom',
        sourcePath: BRUT,
        layout: 'repeated',
      });
      mockDisplays(LED_ON);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // Le repo rend une URL PUBLIQUE complète — c'est ce qui doublait le préfixe.
      jobs.findReadyByGeometry.mockResolvedValue({
        output_url: 'https://cdn.test/neopro-video/led-exports/2026-08/plie.mp4',
      } as any);
      const c = config();

      await enrichConfigWithDisplayVariants(c, ['led-perimeter'], { siteId: SITE });

      // Chemin RELATIF : la base est rajoutée au moment de servir. Une URL absolue
      // ici donnait `https://…/neopro-video/https://…` → 404 sur chaque canvas.
      expect(servedPath(c)).toBe('led-exports/2026-08/plie.mp4');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((c.sponsors?.[0] as any).variants['led-perimeter'].folded).toBe(true);
      expect(jobs.findReadyByGeometry).toHaveBeenCalledWith(SITE, VIDEO, attendu);
      expect(jobs.create).not.toHaveBeenCalled();
    });

    it('canvas manquant → brut servi ET fabrication mise en file', async () => {
      mockDisplays(LED_ON);
      const c = config();

      await enrichConfigWithDisplayVariants(c, ['led-perimeter'], { siteId: SITE });

      // Dégradation, pas panne : le club diffuse, le prochain déploiement pliera.
      expect(servedPath(c)).toBe(BRUT);
      expect(jobs.create).toHaveBeenCalledWith(
        expect.objectContaining({ site_id: SITE, video_id: VIDEO, display_type: 'led-perimeter', layout: 'repeated' })
      );
    });

    it('fabrication déjà en file → on n’en empile pas une deuxième', async () => {
      mockDisplays(LED_ON);
      jobs.hasPendingForGeometry.mockResolvedValue(true);
      const c = config();

      await enrichConfigWithDisplayVariants(c, ['led-perimeter'], { siteId: SITE });

      expect(servedPath(c)).toBe(BRUT);
      expect(jobs.create).not.toHaveBeenCalled();
    });

    it('cache injoignable → le déploiement passe quand même', async () => {
      mockDisplays(LED_ON);
      jobs.findReadyByGeometry.mockRejectedValue(new Error('DB down'));
      const c = config();

      await expect(
        enrichConfigWithDisplayVariants(c, ['led-perimeter'], { siteId: SITE })
      ).resolves.toBeDefined();
      expect(servedPath(c)).toBe(BRUT);
    });

    it('profil illisible → le déploiement passe quand même', async () => {
      sites.getDisplays.mockRejectedValue(new Error('DB down'));
      const c = config();

      await expect(
        enrichConfigWithDisplayVariants(c, ['led-perimeter'], { siteId: SITE })
      ).resolves.toBeDefined();
      expect(servedPath(c)).toBe(BRUT);
    });

    it('géométrie incomplète (sides vide) → pas de pliage, pas de crash', async () => {
      mockDisplays({ ...LED_ON, sides: [] });
      const c = config();

      await enrichConfigWithDisplayVariants(c, ['led-perimeter'], { siteId: SITE });

      expect(servedPath(c)).toBe(BRUT);
      expect(jobs.create).not.toHaveBeenCalled();
    });

    it('un site sans display LED n’est jamais concerné', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sites.getDisplays.mockResolvedValue([{ type: 'secondary' }] as any);
      const c = config();

      await enrichConfigWithDisplayVariants(c, ['led-perimeter'], { siteId: SITE });

      expect(servedPath(c)).toBe(BRUT);
      expect(jobs.findReadyByGeometry).not.toHaveBeenCalled();
    });
  });
});
