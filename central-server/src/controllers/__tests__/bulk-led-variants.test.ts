/**
 * Création en masse des variantes ruban (ADR-139, prérequis du pliage automatique).
 *
 * Deux comportements portent tout : ne JAMAIS écraser une variante existante (un
 * opérateur a pu y mettre un recadrage manuel), et ne JAMAIS annuler les neuf autres
 * parce qu'une vidéo échoue — l'opérateur veut avancer, pas recommencer.
 */

import { bulkCreateLedVariants } from '../content-variant.controller';
import { videoRepository, videoVariantRepository, siteRepository } from '../../repositories';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videos.findForSitePaginated.mockResolvedValue({ rows: ids.map(video), total: ids.length } as any);
  variants.findVariantCountsByVideoIds.mockResolvedValue(
    new Map(Object.entries(existing).map(([k, types]) => [k, { count: types.length, types }]))
  );
}

describe('bulkCreateLedVariants', () => {
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

  it('un club sans vidéo répond 0, sans erreur', async () => {
    withVideos([]);
    const r = res();

    await bulkCreateLedVariants(req, r as never);

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ created: 0, total: 0 }));
    expect(variants.create).not.toHaveBeenCalled();
  });
});
