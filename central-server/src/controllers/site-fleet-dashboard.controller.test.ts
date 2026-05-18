/**
 * Tests pour `site-fleet-dashboard.controller`. Couvre les chemins
 * d'erreur de `unlinkSiteFtpOrphan` et `getSiteFtpOrphans` — assez pour
 * passer le seuil de couverture fonctions sans rentrer dans la cascade
 * cleanup complète (qui demande de mocker 6 services en chaîne).
 */
import { Response } from 'express';
import { AuthRequest } from '../types';
import { getSiteFtpOrphans, unlinkSiteFtpOrphan } from './site-fleet-dashboard.controller';

jest.mock('../repositories', () => {
  const findActiveForSite = jest.fn();
  const countActiveForSite = jest.fn();
  return {
    siteRepository: { findConnectionInfo: jest.fn() },
    metricsRepository: { findBySiteId: jest.fn() },
    analyticsRepository: {},
    configProfileRepository: { findBySite: jest.fn(), replaceConfiguration: jest.fn() },
    siteSponsorRepository: {},
    alertRepository: {},
    softwareUpdateRepository: {},
    videoFtpAuditRepository: {
      findActiveForSite,
      countActiveForSite,
    },
  };
});

jest.mock('../repositories/video.repository', () => ({
  videoRepository: {
    findVideoById: jest.fn(),
  },
}));

const repos = jest.requireMock('../repositories') as {
  videoFtpAuditRepository: {
    findActiveForSite: jest.Mock;
    countActiveForSite: jest.Mock;
  };
};
const videoRepoMock = jest.requireMock('../repositories/video.repository') as {
  videoRepository: { findVideoById: jest.Mock };
};

const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const createAuthRequest = (overrides: Partial<AuthRequest> = {}): AuthRequest => ({
  user: { id: 'user-1', email: 'admin@example.com', role: 'admin' },
  params: {},
  query: {},
  body: {},
  ...overrides,
} as AuthRequest);

describe('site-fleet-dashboard.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getSiteFtpOrphans', () => {
    it('returns warnings list with siteId + total', async () => {
      const req = createAuthRequest({ params: { id: 'site-1' } });
      const res = createMockResponse();

      repos.videoFtpAuditRepository.findActiveForSite.mockResolvedValue([
        { id: 'w1', video_id: 'v1', video_filename: 'a.mp4', status: 'missing' },
        { id: 'w2', video_id: 'v2', video_filename: 'b.mp4', status: 'unreachable' },
      ]);

      await getSiteFtpOrphans(req, res);

      expect(res.json).toHaveBeenCalledWith({
        siteId: 'site-1',
        total: 2,
        warnings: expect.any(Array),
      });
    });

    it('returns 500 on repository error', async () => {
      const req = createAuthRequest({ params: { id: 'site-1' } });
      const res = createMockResponse();

      repos.videoFtpAuditRepository.findActiveForSite.mockRejectedValue(new Error('db down'));

      await getSiteFtpOrphans(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('unlinkSiteFtpOrphan', () => {
    it('returns 404 when video not found', async () => {
      const req = createAuthRequest({ params: { id: 'site-1', videoId: 'v-missing' } });
      const res = createMockResponse();

      videoRepoMock.videoRepository.findVideoById.mockResolvedValue(null);

      await unlinkSiteFtpOrphan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Vidéo introuvable' });
    });

    it('returns 400 when video is not flagged as orphan for this site', async () => {
      const req = createAuthRequest({ params: { id: 'site-1', videoId: 'v1' } });
      const res = createMockResponse();

      videoRepoMock.videoRepository.findVideoById.mockResolvedValue({
        id: 'v1', filename: 'foo.mp4',
      });
      // No orphan warning for this site_id × video_id pair
      repos.videoFtpAuditRepository.findActiveForSite.mockResolvedValue([
        { id: 'w-other', video_id: 'v-other', video_filename: 'bar.mp4', status: 'missing' },
      ]);

      await unlinkSiteFtpOrphan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect((res.json as jest.Mock).mock.calls[0][0].error).toMatch(/orpheline FTP/);
    });
  });
});
