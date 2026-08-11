/**
 * Création en masse des variantes ruban (ADR-139, prérequis du pliage automatique).
 *
 * Deux comportements portent tout : ne JAMAIS écraser une variante existante (un
 * opérateur a pu y mettre un recadrage manuel), et ne JAMAIS annuler les neuf autres
 * parce qu'une vidéo échoue — l'opérateur veut avancer, pas recommencer.
 */

import { bulkCreateLedVariants, getLedCanvasOverview } from '../content-variant.controller';
import { videoRepository, videoVariantRepository, siteRepository, ledExportJobRepository } from '../../repositories';
import { AuthRequest } from '../../types';

jest.mock('../../repositories');
jest.mock('../../services/deployment.service');
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const videos = videoRepository as jest.Mocked<typeof videoRepository>;
const variants = videoVariantRepository as jest.Mocked<typeof videoVariantRepository>;
const sites = siteRepository as jest.Mocked<typeof siteRepository>;
const jobs = ledExportJobRepository as jest.Mocked<typeof ledExportJobRepository>;

const SITE = 'site-1';
const req = { params: { siteId: SITE }, user: { id: 'u1' } } as unknown as AuthRequest;

function res() {
  const r = { status: jest.fn(), json: jest.fn() } as { status: jest.Mock; json: jest.Mock };
  r.status.mockReturnValue(r);
  return r;
}

const video = (id: string) => ({
  id, filename: `${id}.mp4`, original_name: `${id}.mp4`, url: `videos/x/${id}.mp4`,
  file_size: 100, checksum: 'abc', duration: 10, metadata: {},
});

beforeEach(() => {
  jest.clearAllMocks();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  sites.getDisplays.mockResolvedValue([{ type: 'led-perimeter' }] as any);
  videos.findVideoById.mockImplementation(((id: string) => Promise.resolve(video(id))) as any);
  variants.create.mockImplementation((() => Promise.resolve({ id: 'var-x' })) as any);
  /* eslint-enable @typescript-eslint/no-explicit-any */
});

function withVideos(ids: string[], existing: Record<string, string[]> = {}) {
  videos.findIdsOwnedBySite.mockResolvedValue(ids);
  variants.findVariantCountsByVideoIds.mockResolvedValue(
    new Map(Object.entries(existing).map(([k, types]) => [k, { count: types.length, types }]))
  );
}

describe('bulkCreateLedVariants', () => {
  it('ne travaille QUE sur les vidéos du site (incident 2026-08-11)', async () => {
    withVideos(['a']);
    await bulkCreateLedVariants(req, res() as never);

    // `findForSitePaginated` ne filtre PAS : malgré son nom, le siteId n'y sert qu'au
    // tri, elle retourne toute la bibliothèque. L'avoir utilisée a créé 492 variantes
    // sur 7 clubs au lieu d'un seul. Ce test interdit le retour en arrière.
    expect(videos.findIdsOwnedBySite).toHaveBeenCalledWith(SITE, expect.any(Number));
    expect(videos.findForSitePaginated).not.toHaveBeenCalled();
  });

  it('crée la variante manquante et LAISSE INTACTES celles qui existent', async () => {
    withVideos(['a', 'b', 'c'], { b: ['led-perimeter'] });
    const r = res();

    await bulkCreateLedVariants(req, r as never);

    expect(variants.create).toHaveBeenCalledTimes(2);
    const touched = variants.create.mock.calls.map((c) => (c[0] as { video_id: string }).video_id);
    expect(touched).toEqual(['a', 'c']);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ created: 2, skipped: 1, failed: 0, total: 3 })
    );
  });

  it('la variante pointe vers la vidéo elle-même — aucun encodage', async () => {
    withVideos(['a']);
    await bulkCreateLedVariants(req, res() as never);

    expect(variants.create).toHaveBeenCalledWith(
      expect.objectContaining({
        video_id: 'a',
        display_type: 'led-perimeter',
        storage_path: 'videos/x/a.mp4',
        metadata: expect.objectContaining({ source_video_id: 'a' }),
      })
    );
  });

  it('une vidéo en échec n’annule pas les autres', async () => {
    withVideos(['a', 'b', 'c']);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    variants.create
      .mockImplementationOnce((() => Promise.resolve({ id: 'v1' })) as any)
      .mockImplementationOnce(() => Promise.reject(new Error('FTP down')))
      .mockImplementationOnce((() => Promise.resolve({ id: 'v3' })) as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const r = res();

    await bulkCreateLedVariants(req, r as never);

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ created: 2, failed: 1 }));
  });

  it('refuse un site sans ruban déclaré, plutôt que d’échouer vidéo par vidéo', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sites.getDisplays.mockResolvedValue([{ type: 'tv' }, { type: 'secondary' }] as any);
    const r = res();

    await bulkCreateLedVariants(req, r as never);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(variants.create).not.toHaveBeenCalled();
  });

  /**
   * Le bouton déclarait TOUTES les vidéos du club. Chez Piraths, les faits de jeu
   * (CARTON JAUNE, TEMPS MORT…) sont des 16:9 destinés à la télécommande sur la TV :
   * écrasés à 120 px de haut, ils donnent des vignettes noires illisibles.
   */
  describe('filtre de format', () => {
    const led = { sides: [10, 10, 10, 10], pitch: 'P6.25', height: 120 };

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sites.getDisplays.mockResolvedValue([{ type: 'led-perimeter', led }] as any);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withDims = (dims: Record<string, { width: number; height: number } | null>) =>
      videos.findVideoById.mockImplementation(((id: string) =>
        Promise.resolve({ ...video(id), metadata: dims[id] ?? {} })) as any);

    it('écarte un 16:9 — c’est un clip TV, pas du contenu de ruban', async () => {
      withVideos(['tv-clip']);
      withDims({ 'tv-clip': { width: 1920, height: 1080 } });
      const r = res();

      await bulkCreateLedVariants(req, r as never);

      expect(variants.create).not.toHaveBeenCalled();
      const body = r.json.mock.calls[0][0];
      expect(body).toEqual(expect.objectContaining({ created: 0, excluded: 1 }));
      // Une exclusion muette se lit comme « tout a été traité » : le motif est le livrable.
      expect(body.exclusions[0].video_id).toBe('tv-clip');
      expect(body.exclusions[0].reason).toMatch(/1920×1080/);
    });

    it('NE PAS écarter une vidéo jamais mesurée — un null n’est pas un false', async () => {
      withVideos(['jamais-mesuree']);
      withDims({ 'jamais-mesuree': null });
      const r = res();

      await bulkCreateLedVariants(req, r as never);

      // Tant que `backfill:video-dimensions` n'a pas tourné, aucun critère n'est
      // fiable : mieux vaut déclarer et laisser l'opérateur retirer que sauter en silence.
      expect(variants.create).toHaveBeenCalledTimes(1);
      expect(r.json.mock.calls[0][0]).toEqual(
        expect.objectContaining({ created: 1, excluded: 0, exclusions: [] })
      );
    });

    it('garde une vidéo au format du ruban', async () => {
      withVideos(['ruban']);
      withDims({ ruban: { width: 1600, height: 120 } });
      const r = res();

      await bulkCreateLedVariants(req, r as never);

      expect(r.json.mock.calls[0][0]).toEqual(expect.objectContaining({ created: 1, excluded: 0 }));
    });

    it('sans profil LED lisible, ne filtre rien plutôt que de filtrer à tort', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sites.getDisplays.mockResolvedValue([{ type: 'led-perimeter', led: null }] as any);
      withVideos(['tv-clip']);
      withDims({ 'tv-clip': { width: 1920, height: 1080 } });
      const r = res();

      await bulkCreateLedVariants(req, r as never);

      expect(r.json.mock.calls[0][0]).toEqual(expect.objectContaining({ created: 1, excluded: 0 }));
    });
  });

  it('un club sans vidéo répond 0, sans erreur', async () => {
    withVideos([]);
    const r = res();

    await bulkCreateLedVariants(req, r as never);

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ created: 0, total: 0 }));
    expect(variants.create).not.toHaveBeenCalled();
  });
});

/**
 * Vue d'ensemble des canvas — ce qu'un opérateur doit voir AVANT le match.
 *
 * Ce qui casse le rendu n'est presque jamais le pliage : c'est le FORMAT SOURCE.
 * Cette vue rapproche donc livré / attendu / état, par vidéo.
 */
describe('getLedCanvasOverview', () => {
  const led = { sides: [10, 10, 10, 10], pitch: 'P6.25', height: 120, spacing_m: 5 };

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sites.getDisplays.mockResolvedValue([{ type: 'led-perimeter', led }] as any);
  });

  it('compare le format livré au format attendu, par vidéo', async () => {
    withVideos(['a']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    videos.findVideoById.mockResolvedValue({
      ...video('a'), metadata: { width: 1920, height: 1080 },
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variants.findByVideoAndDisplay.mockResolvedValue({ layout: 'repeated' } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jobs.findLatestForVideo.mockResolvedValue({ status: 'ready', output_url: 'u', updated_at: 'd' } as any);
    const r = res();

    await getLedCanvasOverview(req, r as never);

    const body = r.json.mock.calls[0][0];
    // 10 m à P6.25 = 1600 px, dalle 120 → c'est le chiffre à donner aux agences.
    expect(body.expected).toEqual({ width: 1600, height: 120 });
    expect(body.videos[0].source).toEqual({ width: 1920, height: 1080 });
    expect(body.videos[0].matches_expected).toBe(false);
  });

  it('dimensions inconnues → `null`, jamais « inadapté »', async () => {
    withVideos(['a']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    videos.findVideoById.mockResolvedValue({ ...video('a'), metadata: {} } as any);
    variants.findByVideoAndDisplay.mockResolvedValue(null);
    jobs.findLatestForVideo.mockResolvedValue(null);
    const r = res();

    await getLedCanvasOverview(req, r as never);

    // Un upload antérieur à la sonde ffprobe n'a pas de dimensions : ne pas
    // conclure qu'il est au mauvais format.
    expect(r.json.mock.calls[0][0].videos[0].matches_expected).toBeNull();
  });

  it('un canvas jamais fabriqué est « missing », pas une absence de ligne', async () => {
    withVideos(['a']);
    variants.findByVideoAndDisplay.mockResolvedValue(null);
    jobs.findLatestForVideo.mockResolvedValue(null);
    const r = res();

    await getLedCanvasOverview(req, r as never);

    // C'est le cas CALICEO : sans ligne, l'opérateur ne voit pas le trou.
    expect(r.json.mock.calls[0][0].videos[0].canvas.status).toBe('missing');
  });

  it('les échecs sont visibles — tout l’intérêt de la vue', async () => {
    withVideos(['a']);
    variants.findByVideoAndDisplay.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jobs.findLatestForVideo.mockResolvedValue({ status: 'failed', output_url: null } as any);
    const r = res();

    await getLedCanvasOverview(req, r as never);

    expect(r.json.mock.calls[0][0].videos[0].canvas.status).toBe('failed');
  });

  it('refuse un site sans ruban', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sites.getDisplays.mockResolvedValue([{ type: 'tv' }] as any);
    const r = res();
    await getLedCanvasOverview(req, r as never);
    expect(r.status).toHaveBeenCalledWith(400);
  });
});
