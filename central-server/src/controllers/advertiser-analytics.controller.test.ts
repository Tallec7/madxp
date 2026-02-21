import { Response } from 'express';
import { AuthRequest } from '../types';
import { SiteAuthRequest } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the controller
// ---------------------------------------------------------------------------

const mockAdvertiserRepository = {
  listAll: jest.fn(),
  findByIdFull: jest.fn(),
  findName: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  exists: jest.fn(),
  addVideos: jest.fn(),
  removeVideo: jest.fn(),
  getVideos: jest.fn(),
  getVideoIds: jest.fn(),
  getStatsSummary: jest.fn(),
  getStatsByVideo: jest.fn(),
  getStatsBySite: jest.fn(),
  getStatsByPeriod: jest.fn(),
  getStatsByEventType: jest.fn(),
  getDailyTrends: jest.fn(),
  recordImpressions: jest.fn(),
  exportImpressions: jest.fn(),
  calculateDailyStats: jest.fn(),
  getKpisSummary: jest.fn(),
  getKpisPeakHours: jest.fn(),
  getKpisRotationData: jest.fn(),
};

const mockSiteRepository = {
  exists: jest.fn(),
};

jest.mock('../repositories', () => ({
  advertiserRepository: mockAdvertiserRepository,
  siteRepository: mockSiteRepository,
}));

const mockSiteSponsorRepository = {
  resolveSiteSponsorIdsBulk: jest.fn(),
  resolveSiteSponsorIdsByFilenameBulk: jest.fn(),
};

jest.mock('../repositories/site-sponsor.repository', () => ({
  siteSponsorRepository: mockSiteSponsorRepository,
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../services/metrics.service', () => ({
  __esModule: true,
  default: {
    recordImpressionResolution: jest.fn(),
    recordSponsorResolutionFailure: jest.fn(),
  },
}));

jest.mock('../services/pdf-report.service', () => ({
  generateAdvertiserReport: jest.fn(),
  generateClubReport: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  listAdvertisers,
  getAdvertiser,
  createAdvertiser,
  updateAdvertiser,
  deleteAdvertiser,
  addVideosToAdvertiser,
  removeVideoFromAdvertiser,
  getAdvertiserVideos,
  getAdvertiserStats,
  getAdvertiserKpis,
  recordImpressions,
  exportAdvertiserData,
  calculateDailyStats,
  generateAdvertiserPdfReport,
  generateClubPdfReport,
} from './advertiser-analytics.controller';
import { generateAdvertiserReport, generateClubReport } from '../services/pdf-report.service';
import metricsService from '../services/metrics.service';

const mockedGenerateAdvertiserReport = generateAdvertiserReport as jest.MockedFunction<typeof generateAdvertiserReport>;
const mockedGenerateClubReport = generateClubReport as jest.MockedFunction<typeof generateClubReport>;
const mockedMetrics = metricsService as jest.Mocked<typeof metricsService>;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '11111111-1111-4111-a111-111111111111';
const VALID_UUID_2 = '22222222-2222-4222-a222-222222222222';
const VALID_SITE_ID = '33333333-3333-4333-a333-333333333333';
const VALID_VIDEO_ID = '44444444-4444-4444-a444-444444444444';
const VALID_EVENT_ID = '55555555-5555-4555-a555-555555555555';

const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const createAuthRequest = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    user: { id: 'user-123', email: 'admin@example.com', role: 'admin' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  }) as AuthRequest;

const createSiteAuthRequest = (overrides: Partial<SiteAuthRequest> = {}): SiteAuthRequest =>
  ({
    user: { id: 'user-123', email: 'admin@example.com', role: 'admin' },
    params: {},
    query: {},
    body: {},
    siteId: VALID_SITE_ID,
    siteName: 'Test Club',
    ...overrides,
  }) as SiteAuthRequest;

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Advertiser Analytics Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // listAdvertisers
  // =========================================================================

  describe('listAdvertisers', () => {
    it('should return all advertisers', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      const advertisers = [
        { id: VALID_UUID, name: 'Sponsor A', status: 'active' },
        { id: VALID_UUID_2, name: 'Sponsor B', status: 'active' },
      ];
      mockAdvertiserRepository.listAll.mockResolvedValueOnce(advertisers);

      await listAdvertisers(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          advertisers,
          total: 2,
        },
      });
    });

    it('should return empty list when no advertisers exist', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      mockAdvertiserRepository.listAll.mockResolvedValueOnce([]);

      await listAdvertisers(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          advertisers: [],
          total: 0,
        },
      });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      mockAdvertiserRepository.listAll.mockRejectedValueOnce(new Error('DB Error'));

      await listAdvertisers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to list advertisers',
      });
    });
  });

  // =========================================================================
  // getAdvertiser
  // =========================================================================

  describe('getAdvertiser', () => {
    it('should return advertiser by valid UUID', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID } });
      const res = createMockResponse();

      const advertiser = { id: VALID_UUID, name: 'Sponsor A', status: 'active' };
      mockAdvertiserRepository.findByIdFull.mockResolvedValueOnce(advertiser);

      await getAdvertiser(req, res);

      expect(mockAdvertiserRepository.findByIdFull).toHaveBeenCalledWith(VALID_UUID);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { advertiser },
      });
    });

    it('should return 400 for invalid UUID', async () => {
      const req = createAuthRequest({ params: { id: 'not-a-uuid' } });
      const res = createMockResponse();

      await getAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid advertiser ID',
      });
      expect(mockAdvertiserRepository.findByIdFull).not.toHaveBeenCalled();
    });

    it('should return 404 when advertiser does not exist', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID } });
      const res = createMockResponse();

      mockAdvertiserRepository.findByIdFull.mockResolvedValueOnce(null);

      await getAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Advertiser not found',
      });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID } });
      const res = createMockResponse();

      mockAdvertiserRepository.findByIdFull.mockRejectedValueOnce(new Error('DB Error'));

      await getAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // createAdvertiser
  // =========================================================================

  describe('createAdvertiser', () => {
    it('should create an advertiser with all fields', async () => {
      const req = createAuthRequest({
        body: {
          name: 'New Sponsor',
          logo_url: 'https://example.com/logo.png',
          contact_email: 'contact@sponsor.com',
          contact_name: 'John Doe',
          contact_phone: '+33612345678',
          metadata: { industry: 'sports' },
        },
      });
      const res = createMockResponse();

      const createdAdvertiser = { id: VALID_UUID, name: 'New Sponsor', status: 'active' };
      mockAdvertiserRepository.create.mockResolvedValueOnce(createdAdvertiser);

      await createAdvertiser(req, res);

      expect(mockAdvertiserRepository.create).toHaveBeenCalledWith({
        name: 'New Sponsor',
        logoUrl: 'https://example.com/logo.png',
        contactEmail: 'contact@sponsor.com',
        contactName: 'John Doe',
        contactPhone: '+33612345678',
        metadata: { industry: 'sports' },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { advertiser: createdAdvertiser },
      });
    });

    it('should create advertiser with only required name field', async () => {
      const req = createAuthRequest({ body: { name: 'Minimal Sponsor' } });
      const res = createMockResponse();

      const created = { id: VALID_UUID, name: 'Minimal Sponsor' };
      mockAdvertiserRepository.create.mockResolvedValueOnce(created);

      await createAdvertiser(req, res);

      expect(mockAdvertiserRepository.create).toHaveBeenCalledWith({
        name: 'Minimal Sponsor',
        logoUrl: null,
        contactEmail: null,
        contactName: null,
        contactPhone: null,
        metadata: null,
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 400 when name is missing', async () => {
      const req = createAuthRequest({ body: {} });
      const res = createMockResponse();

      await createAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Advertiser name is required',
      });
      expect(mockAdvertiserRepository.create).not.toHaveBeenCalled();
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ body: { name: 'Sponsor' } });
      const res = createMockResponse();

      mockAdvertiserRepository.create.mockRejectedValueOnce(new Error('DB Error'));

      await createAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // updateAdvertiser
  // =========================================================================

  describe('updateAdvertiser', () => {
    it('should update an advertiser', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        body: { name: 'Updated Name', contact_email: 'new@email.com' },
      });
      const res = createMockResponse();

      const updated = { id: VALID_UUID, name: 'Updated Name' };
      mockAdvertiserRepository.update.mockResolvedValueOnce(updated);

      await updateAdvertiser(req, res);

      expect(mockAdvertiserRepository.update).toHaveBeenCalledWith(VALID_UUID, expect.objectContaining({
        name: 'Updated Name',
        contactEmail: 'new@email.com',
      }));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { advertiser: updated },
      });
    });

    it('should return 400 for invalid UUID', async () => {
      const req = createAuthRequest({ params: { id: 'bad-id' }, body: { name: 'X' } });
      const res = createMockResponse();

      await updateAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when advertiser not found', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID }, body: { name: 'X' } });
      const res = createMockResponse();

      mockAdvertiserRepository.update.mockResolvedValueOnce(null);

      await updateAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID }, body: {} });
      const res = createMockResponse();

      mockAdvertiserRepository.update.mockRejectedValueOnce(new Error('DB Error'));

      await updateAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // deleteAdvertiser
  // =========================================================================

  describe('deleteAdvertiser', () => {
    it('should delete an advertiser', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID } });
      const res = createMockResponse();

      mockAdvertiserRepository.delete.mockResolvedValueOnce(true);

      await deleteAdvertiser(req, res);

      expect(mockAdvertiserRepository.delete).toHaveBeenCalledWith(VALID_UUID);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Advertiser deleted successfully',
      });
    });

    it('should return 400 for invalid UUID', async () => {
      const req = createAuthRequest({ params: { id: 'xxx' } });
      const res = createMockResponse();

      await deleteAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when advertiser not found', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID } });
      const res = createMockResponse();

      mockAdvertiserRepository.delete.mockResolvedValueOnce(false);

      await deleteAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID } });
      const res = createMockResponse();

      mockAdvertiserRepository.delete.mockRejectedValueOnce(new Error('DB Error'));

      await deleteAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // addVideosToAdvertiser
  // =========================================================================

  describe('addVideosToAdvertiser', () => {
    it('should associate videos with an advertiser', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        body: { video_ids: [VALID_VIDEO_ID], is_primary: true },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.exists.mockResolvedValueOnce(true);
      mockAdvertiserRepository.addVideos.mockResolvedValueOnce(undefined);

      await addVideosToAdvertiser(req, res);

      expect(mockAdvertiserRepository.exists).toHaveBeenCalledWith(VALID_UUID);
      expect(mockAdvertiserRepository.addVideos).toHaveBeenCalledWith(VALID_UUID, [VALID_VIDEO_ID], true);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '1 video(s) associated with advertiser',
      });
    });

    it('should return 400 for invalid advertiser UUID', async () => {
      const req = createAuthRequest({
        params: { id: 'bad' },
        body: { video_ids: [VALID_VIDEO_ID] },
      });
      const res = createMockResponse();

      await addVideosToAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid advertiser ID',
      });
    });

    it('should return 400 when video_ids is empty', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        body: { video_ids: [] },
      });
      const res = createMockResponse();

      await addVideosToAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'video_ids must be a non-empty array',
      });
    });

    it('should return 400 when video_ids is not an array', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        body: { video_ids: 'not-array' },
      });
      const res = createMockResponse();

      await addVideosToAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when advertiser not found', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        body: { video_ids: [VALID_VIDEO_ID] },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.exists.mockResolvedValueOnce(false);

      await addVideosToAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        body: { video_ids: [VALID_VIDEO_ID] },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.exists.mockRejectedValueOnce(new Error('DB Error'));

      await addVideosToAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // removeVideoFromAdvertiser
  // =========================================================================

  describe('removeVideoFromAdvertiser', () => {
    it('should remove video association', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID, videoId: VALID_VIDEO_ID },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.removeVideo.mockResolvedValueOnce(true);

      await removeVideoFromAdvertiser(req, res);

      expect(mockAdvertiserRepository.removeVideo).toHaveBeenCalledWith(VALID_UUID, VALID_VIDEO_ID);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Video removed from advertiser',
      });
    });

    it('should return 400 for invalid advertiser ID', async () => {
      const req = createAuthRequest({
        params: { id: 'bad', videoId: VALID_VIDEO_ID },
      });
      const res = createMockResponse();

      await removeVideoFromAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for invalid video ID', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID, videoId: 'bad' },
      });
      const res = createMockResponse();

      await removeVideoFromAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when association not found', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID, videoId: VALID_VIDEO_ID },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.removeVideo.mockResolvedValueOnce(false);

      await removeVideoFromAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID, videoId: VALID_VIDEO_ID },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.removeVideo.mockRejectedValueOnce(new Error('DB Error'));

      await removeVideoFromAdvertiser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // getAdvertiserVideos
  // =========================================================================

  describe('getAdvertiserVideos', () => {
    it('should return videos for an advertiser', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID } });
      const res = createMockResponse();

      const videos = [{ video_id: VALID_VIDEO_ID, filename: 'pub.mp4', is_primary: true }];
      mockAdvertiserRepository.getVideos.mockResolvedValueOnce(videos);

      await getAdvertiserVideos(req, res);

      expect(mockAdvertiserRepository.getVideos).toHaveBeenCalledWith(VALID_UUID);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { videos },
      });
    });

    it('should return 400 for invalid UUID', async () => {
      const req = createAuthRequest({ params: { id: 'invalid' } });
      const res = createMockResponse();

      await getAdvertiserVideos(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID } });
      const res = createMockResponse();

      mockAdvertiserRepository.getVideos.mockRejectedValueOnce(new Error('DB Error'));

      await getAdvertiserVideos(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // getAdvertiserStats
  // =========================================================================

  describe('getAdvertiserStats', () => {
    it('should return full stats for an advertiser with videos', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        query: { from: '2025-01-01', to: '2025-01-31' },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.findName.mockResolvedValueOnce('Sponsor A');
      mockAdvertiserRepository.getVideoIds.mockResolvedValueOnce([VALID_VIDEO_ID]);
      mockAdvertiserRepository.getStatsSummary.mockResolvedValueOnce({
        total_impressions: '100',
        total_screen_time_seconds: '3600',
        completion_rate: '85.5',
        estimated_reach: '500',
        active_sites: '3',
        active_days: '15',
      });
      mockAdvertiserRepository.getStatsByVideo.mockResolvedValueOnce([
        {
          video_id: VALID_VIDEO_ID,
          video_name: 'pub.mp4',
          impressions: '50',
          screen_time_seconds: '1800',
          completion_rate: '90.0',
        },
      ]);
      mockAdvertiserRepository.getStatsBySite.mockResolvedValueOnce([
        {
          site_id: VALID_SITE_ID,
          site_name: 'Site A',
          club_name: 'Club A',
          impressions: '30',
          screen_time_seconds: '900',
        },
      ]);
      mockAdvertiserRepository.getStatsByPeriod.mockResolvedValueOnce([
        { period: 'match', count: '60' },
        { period: 'loop', count: '40' },
      ]);
      mockAdvertiserRepository.getStatsByEventType.mockResolvedValueOnce([
        { event_type: 'match', count: '60' },
      ]);
      mockAdvertiserRepository.getDailyTrends.mockResolvedValueOnce([
        { date: '2025-01-15', impressions: '10', screen_time: '360' },
      ]);

      await getAdvertiserStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            advertiser_name: 'Sponsor A',
            period: '2025-01-01/2025-01-31',
            summary: expect.objectContaining({
              total_impressions: 100,
              total_screen_time_seconds: 3600,
              total_screen_time: '1h 0min',
              completion_rate: 85.5,
              active_sites: 3,
              active_days: 15,
            }),
            by_video: expect.arrayContaining([
              expect.objectContaining({ video_id: VALID_VIDEO_ID, impressions: 50 }),
            ]),
            by_site: expect.arrayContaining([
              expect.objectContaining({ site_id: VALID_SITE_ID, impressions: 30 }),
            ]),
            by_period: { match: 60, loop: 40 },
            by_event_type: { match: 60 },
            trends: expect.objectContaining({
              daily: expect.arrayContaining([
                expect.objectContaining({ date: '2025-01-15', impressions: 10 }),
              ]),
            }),
          }),
        })
      );
    });

    it('should return empty stats when advertiser has no videos', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        query: { from: '2025-01-01', to: '2025-01-31' },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.findName.mockResolvedValueOnce('Sponsor A');
      mockAdvertiserRepository.getVideoIds.mockResolvedValueOnce([]);

      await getAdvertiserStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            summary: expect.objectContaining({
              total_impressions: 0,
              total_screen_time_seconds: 0,
            }),
            by_video: [],
            by_site: [],
          }),
        })
      );
      // Should NOT call stats queries when there are no videos
      expect(mockAdvertiserRepository.getStatsSummary).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid UUID', async () => {
      const req = createAuthRequest({ params: { id: 'invalid' }, query: {} });
      const res = createMockResponse();

      await getAdvertiserStats(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when advertiser not found', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID }, query: {} });
      const res = createMockResponse();

      mockAdvertiserRepository.findName.mockResolvedValueOnce(null);

      await getAdvertiserStats(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should use default 30-day range when from/to not provided', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID }, query: {} });
      const res = createMockResponse();

      mockAdvertiserRepository.findName.mockResolvedValueOnce('Sponsor');
      mockAdvertiserRepository.getVideoIds.mockResolvedValueOnce([VALID_VIDEO_ID]);
      mockAdvertiserRepository.getStatsSummary.mockResolvedValueOnce({
        total_impressions: '0', total_screen_time_seconds: '0',
        completion_rate: '0', estimated_reach: '0', active_sites: '0', active_days: '0',
      });
      mockAdvertiserRepository.getStatsByVideo.mockResolvedValueOnce([]);
      mockAdvertiserRepository.getStatsBySite.mockResolvedValueOnce([]);
      mockAdvertiserRepository.getStatsByPeriod.mockResolvedValueOnce([]);
      mockAdvertiserRepository.getStatsByEventType.mockResolvedValueOnce([]);
      mockAdvertiserRepository.getDailyTrends.mockResolvedValueOnce([]);

      await getAdvertiserStats(req, res);

      // The period string should contain two dates separated by /
      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.period).toMatch(/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID }, query: {} });
      const res = createMockResponse();

      mockAdvertiserRepository.findName.mockRejectedValueOnce(new Error('DB Error'));

      await getAdvertiserStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // getAdvertiserKpis
  // =========================================================================

  describe('getAdvertiserKpis', () => {
    it('should return enriched KPIs from video_plays', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        query: { from: '2025-01-01', to: '2025-01-31' },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.findName.mockResolvedValueOnce('Sponsor A');
      mockAdvertiserRepository.getKpisSummary.mockResolvedValueOnce({
        total_impressions: '200',
        verified_impressions: '150',
        tv_on_rate: '75.0',
        match_day_impressions: '80',
        completion_rate: '88.5',
        sites_coverage: '4',
        total_screen_time_seconds: '7200',
      });
      mockAdvertiserRepository.getKpisPeakHours.mockResolvedValueOnce([
        { hour: '14', impressions: '30', screen_time: '900' },
        { hour: '20', impressions: '50', screen_time: '1500' },
      ]);
      mockAdvertiserRepository.getKpisRotationData.mockResolvedValueOnce([
        { video_filename: 'pub1.mp4', play_count: '100' },
        { video_filename: 'pub2.mp4', play_count: '100' },
      ]);

      await getAdvertiserKpis(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            advertiser_name: 'Sponsor A',
            kpis: expect.objectContaining({
              total_impressions: 200,
              verified_impressions: 150,
              tv_on_rate: 75.0,
              match_day_impressions: 80,
              completion_rate: 88.5,
              sites_coverage: 4,
              rotation_fairness: 1,
              renewal_score: expect.any(Number),
            }),
            peak_hours: expect.any(Object),
            rotation: expect.arrayContaining([
              expect.objectContaining({ video: 'pub1.mp4', plays: 100 }),
            ]),
          }),
        })
      );
    });

    it('should return 404 for unknown advertiser', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID }, query: {} });
      const res = createMockResponse();

      mockAdvertiserRepository.findName.mockResolvedValueOnce(null);

      await getAdvertiserKpis(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 for invalid UUID', async () => {
      const req = createAuthRequest({ params: { id: 'not-a-uuid' }, query: {} });
      const res = createMockResponse();

      await getAdvertiserKpis(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // =========================================================================
  // recordImpressions
  // =========================================================================

  describe('recordImpressions', () => {
    const validImpression = {
      event_id: VALID_EVENT_ID,
      video_id: VALID_VIDEO_ID,
      played_at: '2025-01-15T10:00:00Z',
      duration_played: 30,
      video_duration: 30,
      completed: true,
      trigger_type: 'auto',
    };

    it('should record a valid batch of impressions', async () => {
      const req = createSiteAuthRequest({
        body: { impressions: [validImpression] },
      });
      const res = createMockResponse();

      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(new Map());
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(1);

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          recorded: 1,
          skipped: 0,
        })
      );
    });

    it('should return 401 when no auth and no site_id in body', async () => {
      const req = createSiteAuthRequest({
        body: { impressions: [validImpression] },
      });
      // Remove siteId to simulate unauthenticated request
      (req as SiteAuthRequest).siteId = undefined;
      const res = createMockResponse();

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Site identification required',
        })
      );
    });

    it('should fallback to site_id from body when auth is missing', async () => {
      const req = createSiteAuthRequest({
        body: {
          impressions: [{ ...validImpression, site_id: VALID_SITE_ID }],
        },
      });
      // Remove siteId to simulate no API key auth
      (req as SiteAuthRequest).siteId = undefined;
      const res = createMockResponse();

      mockSiteRepository.exists.mockResolvedValueOnce(true);
      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(new Map());
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(1);

      await recordImpressions(req, res);

      expect(mockSiteRepository.exists).toHaveBeenCalledWith(VALID_SITE_ID);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, recorded: 1 })
      );
    });

    it('should return 404 when fallback site_id does not exist', async () => {
      const req = createSiteAuthRequest({
        body: {
          impressions: [{ ...validImpression, site_id: VALID_SITE_ID }],
        },
      });
      (req as SiteAuthRequest).siteId = undefined;
      const res = createMockResponse();

      mockSiteRepository.exists.mockResolvedValueOnce(false);

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Site not found',
        })
      );
    });

    it('should return 400 when impressions is empty', async () => {
      const req = createSiteAuthRequest({
        body: { impressions: [] },
      });
      const res = createMockResponse();

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'impressions must be a non-empty array',
        })
      );
    });

    it('should return 400 when impressions is not an array', async () => {
      const req = createSiteAuthRequest({
        body: { impressions: 'not-array' },
      });
      const res = createMockResponse();

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when batch exceeds 500 limit', async () => {
      const bigBatch = Array.from({ length: 501 }, (_, i) => ({
        ...validImpression,
        event_id: `${VALID_EVENT_ID.slice(0, -3)}${String(i).padStart(3, '0')}`,
      }));
      const req = createSiteAuthRequest({
        body: { impressions: bigBatch },
      });
      const res = createMockResponse();

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Batch size exceeds limit of 500 impressions',
        })
      );
    });

    it('should skip impressions with missing required fields', async () => {
      const req = createSiteAuthRequest({
        body: {
          impressions: [
            { played_at: null, duration_played: 30, video_duration: 30 }, // missing played_at
            { played_at: '2025-01-15T10:00:00Z', duration_played: null, video_duration: 30 }, // missing duration_played
            validImpression, // valid
          ],
        },
      });
      const res = createMockResponse();

      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(new Map());
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(1);

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          recorded: 1,
          skipped: 2,
        })
      );
    });

    it('should skip impressions with invalid video_id UUID', async () => {
      const req = createSiteAuthRequest({
        body: {
          impressions: [
            { ...validImpression, video_id: 'not-a-uuid' },
          ],
        },
      });
      const res = createMockResponse();

      await recordImpressions(req, res);

      // All impressions skipped => 400
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'No valid impressions to insert',
        })
      );
    });

    it('should skip impressions with invalid event_id UUID', async () => {
      const req = createSiteAuthRequest({
        body: {
          impressions: [
            { ...validImpression, event_id: 'bad-event-id' },
          ],
        },
      });
      const res = createMockResponse();

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should resolve site_sponsor_id via video_id bulk resolution', async () => {
      const siteSponsorId = '66666666-6666-4666-a666-666666666666';
      const req = createSiteAuthRequest({
        body: {
          impressions: [validImpression],
        },
      });
      const res = createMockResponse();

      // video_id resolution returns a match
      const videoIdMap = new Map<string, string>();
      videoIdMap.set(`${VALID_VIDEO_ID}::${VALID_SITE_ID}`, siteSponsorId);
      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(videoIdMap);
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(1);

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      // Verify that the batch item has the resolved siteSponsorId
      const batchItems = mockAdvertiserRepository.recordImpressions.mock.calls[0][0];
      expect(batchItems[0].siteSponsorId).toBe(siteSponsorId);
    });

    it('should resolve site_sponsor_id via filename fallback', async () => {
      const siteSponsorId = '66666666-6666-4666-a666-666666666666';
      const req = createSiteAuthRequest({
        body: {
          impressions: [{
            ...validImpression,
            video_id: undefined,
            video_filename: 'sponsor-video.mp4',
          }],
        },
      });
      const res = createMockResponse();

      // video_id resolution returns nothing (no video_id)
      const filenameMap = new Map<string, string>();
      filenameMap.set(`sponsor-video.mp4::${VALID_SITE_ID}`, siteSponsorId);
      mockSiteSponsorRepository.resolveSiteSponsorIdsByFilenameBulk.mockResolvedValueOnce(filenameMap);
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(1);

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const batchItems = mockAdvertiserRepository.recordImpressions.mock.calls[0][0];
      expect(batchItems[0].siteSponsorId).toBe(siteSponsorId);
    });

    it('should use provided site_sponsor_id directly without resolution', async () => {
      const siteSponsorId = '66666666-6666-4666-a666-666666666666';
      const req = createSiteAuthRequest({
        body: {
          impressions: [{
            ...validImpression,
            site_sponsor_id: siteSponsorId,
          }],
        },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(1);

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const batchItems = mockAdvertiserRepository.recordImpressions.mock.calls[0][0];
      expect(batchItems[0].siteSponsorId).toBe(siteSponsorId);
      // No need to resolve when site_sponsor_id is provided
      expect(mockSiteSponsorRepository.resolveSiteSponsorIdsBulk).not.toHaveBeenCalled();
    });

    it('should handle bulk resolution failure gracefully', async () => {
      const req = createSiteAuthRequest({
        body: { impressions: [validImpression] },
      });
      const res = createMockResponse();

      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockRejectedValueOnce(new Error('Bulk resolution failed'));
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(1);

      await recordImpressions(req, res);

      // Should still succeed — impressions recorded with null site_sponsor_id
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockedMetrics.recordSponsorResolutionFailure).toHaveBeenCalledWith('resolve_impression');
    });

    it('should use bulk queries for resolution (N+1 fix)', async () => {
      // Send multiple impressions with different video_ids to verify bulk behaviour
      const videoId2 = '77777777-7777-4777-a777-777777777777';
      const req = createSiteAuthRequest({
        body: {
          impressions: [
            { ...validImpression, video_id: VALID_VIDEO_ID },
            { ...validImpression, video_id: videoId2, event_id: '88888888-8888-4888-a888-888888888888' },
          ],
        },
      });
      const res = createMockResponse();

      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(new Map());
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(2);

      await recordImpressions(req, res);

      // resolveSiteSponsorIdsBulk should be called ONCE with both pairs (not per-impression)
      expect(mockSiteSponsorRepository.resolveSiteSponsorIdsBulk).toHaveBeenCalledTimes(1);
      const pairs = mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mock.calls[0][0];
      expect(pairs).toHaveLength(2);
      expect(pairs).toEqual(
        expect.arrayContaining([
          { videoId: VALID_VIDEO_ID, siteId: VALID_SITE_ID },
          { videoId: videoId2, siteId: VALID_SITE_ID },
        ])
      );
    });

    it('should de-duplicate resolution pairs for identical video_ids', async () => {
      const req = createSiteAuthRequest({
        body: {
          impressions: [
            { ...validImpression, event_id: VALID_EVENT_ID },
            { ...validImpression, event_id: '88888888-8888-4888-a888-888888888888' },
          ],
        },
      });
      const res = createMockResponse();

      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(new Map());
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(2);

      await recordImpressions(req, res);

      // Both impressions use the same video_id, so only 1 unique pair
      const pairs = mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mock.calls[0][0];
      expect(pairs).toHaveLength(1);
    });

    it('should record metrics for each impression resolution method', async () => {
      const siteSponsorId = '66666666-6666-4666-a666-666666666666';
      const req = createSiteAuthRequest({
        body: {
          impressions: [
            { ...validImpression, site_sponsor_id: siteSponsorId }, // direct
            { ...validImpression, event_id: '88888888-8888-4888-a888-888888888888' }, // will be resolved by video_id
          ],
        },
      });
      const res = createMockResponse();

      const videoIdMap = new Map<string, string>();
      videoIdMap.set(`${VALID_VIDEO_ID}::${VALID_SITE_ID}`, 'resolved-id');
      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(videoIdMap);
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(2);

      await recordImpressions(req, res);

      expect(mockedMetrics.recordImpressionResolution).toHaveBeenCalledWith('site_sponsor_id');
      expect(mockedMetrics.recordImpressionResolution).toHaveBeenCalledWith('video_id');
    });

    it('should return 400 when all impressions are invalid', async () => {
      const req = createSiteAuthRequest({
        body: {
          impressions: [
            { played_at: null, duration_played: 30, video_duration: 30 },
            { played_at: '2025-01-01', duration_played: null, video_duration: 30 },
          ],
        },
      });
      const res = createMockResponse();

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'No valid impressions to insert',
          skipped: 2,
        })
      );
    });

    it('should use siteId from auth, not from body', async () => {
      const req = createSiteAuthRequest({
        body: {
          impressions: [validImpression],
        },
      });
      const res = createMockResponse();

      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(new Map());
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(1);

      await recordImpressions(req, res);

      const batchItems = mockAdvertiserRepository.recordImpressions.mock.calls[0][0];
      expect(batchItems[0].siteId).toBe(VALID_SITE_ID);
    });

    it('should return 500 on database error during insertion', async () => {
      const req = createSiteAuthRequest({
        body: { impressions: [validImpression] },
      });
      const res = createMockResponse();

      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(new Map());
      mockAdvertiserRepository.recordImpressions.mockRejectedValueOnce(new Error('DB Error'));

      await recordImpressions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    // Idempotence: event_id duplicate handling
    it('should pass event_id through for ON CONFLICT dedup in repository', async () => {
      const req = createSiteAuthRequest({
        body: { impressions: [validImpression] },
      });
      const res = createMockResponse();

      mockSiteSponsorRepository.resolveSiteSponsorIdsBulk.mockResolvedValueOnce(new Map());
      mockAdvertiserRepository.recordImpressions.mockResolvedValueOnce(1);

      await recordImpressions(req, res);

      const batchItems = mockAdvertiserRepository.recordImpressions.mock.calls[0][0];
      expect(batchItems[0].eventId).toBe(VALID_EVENT_ID);
    });
  });

  // =========================================================================
  // exportAdvertiserData
  // =========================================================================

  describe('exportAdvertiserData', () => {
    it('should export CSV data', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        query: { from: '2025-01-01', to: '2025-01-31', format: 'csv' },
      });
      const res = createMockResponse();

      mockAdvertiserRepository.getVideoIds.mockResolvedValueOnce([VALID_VIDEO_ID]);
      mockAdvertiserRepository.exportImpressions.mockResolvedValueOnce([
        {
          played_at: '2025-01-15T10:00:00Z',
          video_name: 'pub.mp4',
          site_name: 'Site A',
          club_name: 'Club A',
          duration_played: 30,
          completed: true,
          event_type: 'match',
          period: 'match',
          trigger_type: 'auto',
          audience_estimate: 100,
        },
      ]);

      await exportAdvertiserData(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('advertiser-')
      );
      expect(res.send).toHaveBeenCalled();
      const csvContent = (res.send as jest.Mock).mock.calls[0][0] as string;
      expect(csvContent).toContain('Date,Video,Site,Club');
      expect(csvContent).toContain('pub.mp4');
    });

    it('should export JSON data when format is not csv', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        query: { from: '2025-01-01', to: '2025-01-31', format: 'json' },
      });
      const res = createMockResponse();

      const rows = [{ played_at: '2025-01-15T10:00:00Z', video_name: 'pub.mp4' }];
      mockAdvertiserRepository.getVideoIds.mockResolvedValueOnce([VALID_VIDEO_ID]);
      mockAdvertiserRepository.exportImpressions.mockResolvedValueOnce(rows);

      await exportAdvertiserData(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: rows,
      });
    });

    it('should return 400 for invalid UUID', async () => {
      const req = createAuthRequest({ params: { id: 'bad' }, query: {} });
      const res = createMockResponse();

      await exportAdvertiserData(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when advertiser has no videos', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID }, query: {} });
      const res = createMockResponse();

      mockAdvertiserRepository.getVideoIds.mockResolvedValueOnce([]);

      await exportAdvertiserData(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID }, query: {} });
      const res = createMockResponse();

      mockAdvertiserRepository.getVideoIds.mockRejectedValueOnce(new Error('DB Error'));

      await exportAdvertiserData(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // calculateDailyStats
  // =========================================================================

  describe('calculateDailyStats', () => {
    it('should calculate stats for a given date', async () => {
      const req = createAuthRequest({ body: { date: '2025-01-15' } });
      const res = createMockResponse();

      mockAdvertiserRepository.calculateDailyStats.mockResolvedValueOnce(10);

      await calculateDailyStats(req, res);

      expect(mockAdvertiserRepository.calculateDailyStats).toHaveBeenCalledWith('2025-01-15');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Calculated stats for 10 video/site combinations',
        date: '2025-01-15',
      });
    });

    it('should use yesterday as default date', async () => {
      const req = createAuthRequest({ body: {} });
      const res = createMockResponse();

      mockAdvertiserRepository.calculateDailyStats.mockResolvedValueOnce(5);

      await calculateDailyStats(req, res);

      // Verify it was called with a date string (yesterday)
      const calledDate = mockAdvertiserRepository.calculateDailyStats.mock.calls[0][0] as string;
      expect(calledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ body: { date: '2025-01-15' } });
      const res = createMockResponse();

      mockAdvertiserRepository.calculateDailyStats.mockRejectedValueOnce(new Error('DB Error'));

      await calculateDailyStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // generateAdvertiserPdfReport
  // =========================================================================

  describe('generateAdvertiserPdfReport', () => {
    it('should generate and send a PDF', async () => {
      const req = createAuthRequest({
        params: { id: VALID_UUID },
        query: { from: '2025-01-01', to: '2025-01-31' },
      });
      const res = createMockResponse();

      const pdfBuffer = Buffer.from('fake-pdf');
      mockedGenerateAdvertiserReport.mockResolvedValueOnce(pdfBuffer);

      await generateAdvertiserPdfReport(req, res);

      expect(mockedGenerateAdvertiserReport).toHaveBeenCalledWith(
        VALID_UUID, '2025-01-01', '2025-01-31', { type: 'advertiser' }
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.send).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should return 400 for invalid UUID', async () => {
      const req = createAuthRequest({ params: { id: 'bad' }, query: {} });
      const res = createMockResponse();

      await generateAdvertiserPdfReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on PDF generation error', async () => {
      const req = createAuthRequest({ params: { id: VALID_UUID }, query: {} });
      const res = createMockResponse();

      mockedGenerateAdvertiserReport.mockRejectedValueOnce(new Error('PDF Error'));

      await generateAdvertiserPdfReport(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // =========================================================================
  // generateClubPdfReport
  // =========================================================================

  describe('generateClubPdfReport', () => {
    it('should generate and send a club PDF', async () => {
      const req = createAuthRequest({
        params: { siteId: VALID_SITE_ID },
        query: { from: '2025-01-01', to: '2025-01-31' },
      });
      const res = createMockResponse();

      const pdfBuffer = Buffer.from('fake-club-pdf');
      mockedGenerateClubReport.mockResolvedValueOnce(pdfBuffer);

      await generateClubPdfReport(req, res);

      expect(mockedGenerateClubReport).toHaveBeenCalledWith(
        VALID_SITE_ID, '2025-01-01', '2025-01-31', { type: 'club' }
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.send).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should return 400 for invalid site UUID', async () => {
      const req = createAuthRequest({ params: { siteId: 'bad' }, query: {} });
      const res = createMockResponse();

      await generateClubPdfReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on PDF generation error', async () => {
      const req = createAuthRequest({ params: { siteId: VALID_SITE_ID }, query: {} });
      const res = createMockResponse();

      mockedGenerateClubReport.mockRejectedValueOnce(new Error('PDF Error'));

      await generateClubPdfReport(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
