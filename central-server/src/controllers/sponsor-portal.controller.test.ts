import request from 'supertest';
import express from 'express';
import sponsorPortalRoutes from '../routes/sponsor-portal.routes';

// Mock dependencies
jest.mock('../services/sponsor-access.service', () => ({
  sponsorAccessService: {
    verifyToken: jest.fn(),
    createAccessLink: jest.fn(),
    cleanupExpiredTokens: jest.fn(),
  },
}));

jest.mock('../repositories/site-sponsor.repository', () => ({
  siteSponsorRepository: {
    getStatsSummary: jest.fn(),
    getDailyTrends: jest.fn(),
    getVideos: jest.fn(),
    getStatsByVideo: jest.fn(),
    getStatsByPeriod: jest.fn(),
    getBenchmark: jest.fn(),
  },
}));

jest.mock('../services/pdf-report.service', () => ({
  generateSiteSponsorReport: jest.fn(),
}));

jest.mock('../config/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  __esModule: true,
}));

import { sponsorAccessService } from '../services/sponsor-access.service';
import { siteSponsorRepository } from '../repositories/site-sponsor.repository';
import { generateSiteSponsorReport } from '../services/pdf-report.service';

const mockVerifyToken = sponsorAccessService.verifyToken as jest.MockedFunction<typeof sponsorAccessService.verifyToken>;
const mockGetStatsSummary = siteSponsorRepository.getStatsSummary as jest.Mock;
const mockGetDailyTrends = siteSponsorRepository.getDailyTrends as jest.Mock;
const mockGetVideos = siteSponsorRepository.getVideos as jest.Mock;
const mockGetStatsByVideo = siteSponsorRepository.getStatsByVideo as jest.Mock;
const mockGetStatsByPeriod = siteSponsorRepository.getStatsByPeriod as jest.Mock;
const mockGenerateReport = generateSiteSponsorReport as jest.Mock;

// Create test app
const app = express();
app.use(express.json());
app.use('/api/sponsor-portal', sponsorPortalRoutes);

describe('Sponsor Portal Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/sponsor-portal/verify', () => {
    it('should return 400 when token is missing', async () => {
      const res = await request(app).get('/api/sponsor-portal/verify');
      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });

    it('should return 401 for invalid token', async () => {
      mockVerifyToken.mockResolvedValue(null);

      const res = await request(app).get('/api/sponsor-portal/verify?token=invalid');
      expect(res.status).toBe(401);
      expect(res.body.valid).toBe(false);
    });

    it('should return sponsor info for valid token', async () => {
      mockVerifyToken.mockResolvedValue({
        siteSponsorId: 'sponsor-1',
        siteId: 'site-1',
        sponsorName: 'Sponsor A',
        clubName: 'Club FC',
        contactEmail: 'test@test.com',
      });

      const res = await request(app).get('/api/sponsor-portal/verify?token=valid-token');
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.sponsor.id).toBe('sponsor-1');
      expect(res.body.sponsor.name).toBe('Sponsor A');
      expect(res.body.sponsor.clubName).toBe('Club FC');
    });
  });

  describe('GET /api/sponsor-portal/stats', () => {
    it('should return 400 when token is missing', async () => {
      const res = await request(app).get('/api/sponsor-portal/stats');
      expect(res.status).toBe(400);
    });

    it('should return 401 for invalid token', async () => {
      mockVerifyToken.mockResolvedValue(null);

      const res = await request(app).get('/api/sponsor-portal/stats?token=invalid');
      expect(res.status).toBe(401);
    });

    it('should return stats for valid token', async () => {
      mockVerifyToken.mockResolvedValue({
        siteSponsorId: 'sponsor-1',
        siteId: 'site-1',
        sponsorName: 'Sponsor A',
        clubName: 'Club FC',
        contactEmail: null,
      });

      mockGetStatsSummary.mockResolvedValue({
        total_impressions: 100,
        total_screen_time_seconds: 3600,
        completion_rate: 95.5,
        estimated_reach: 500,
        active_days: 10,
      });

      mockGetDailyTrends.mockResolvedValue([
        { date: '2026-01-15', impressions: 10, screen_time: 360 },
      ]);

      mockGetVideos.mockResolvedValue([
        { id: 'v-1', video_filename: 'pub.mp4', is_primary: true },
      ]);

      mockGetStatsByVideo.mockResolvedValue({ rows: [
        { video_filename: 'pub.mp4', impressions: '100', screen_time_seconds: '3600', completion_rate: '95.5', avg_duration_played: '15.0' },
      ] });

      mockGetStatsByPeriod.mockResolvedValue({ rows: [
        { period: 'halftime', impressions: '50', screen_time_seconds: '1800', completion_rate: '97.0' },
      ] });

      const res = await request(app).get('/api/sponsor-portal/stats?token=valid-token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sponsor.name).toBe('Sponsor A');
      expect(res.body.data.summary.total_impressions).toBe(100);
      expect(res.body.data.daily_trends).toHaveLength(1);
      expect(res.body.data.videos).toHaveLength(1);
      expect(res.body.data.video_stats).toHaveLength(1);
      expect(res.body.data.video_stats[0].video_filename).toBe('pub.mp4');
      expect(res.body.data.period_breakdown).toHaveLength(1);
      expect(res.body.data.period_breakdown[0].period).toBe('halftime');
    });
  });

  describe('GET /api/sponsor-portal/report', () => {
    it('should return 400 when token is missing', async () => {
      const res = await request(app).get('/api/sponsor-portal/report');
      expect(res.status).toBe(400);
    });

    it('should return 401 for invalid token', async () => {
      mockVerifyToken.mockResolvedValue(null);

      const res = await request(app).get('/api/sponsor-portal/report?token=invalid');
      expect(res.status).toBe(401);
    });

    it('should return PDF for valid token', async () => {
      mockVerifyToken.mockResolvedValue({
        siteSponsorId: 'sponsor-1',
        siteId: 'site-1',
        sponsorName: 'Sponsor A',
        clubName: 'Club FC',
        contactEmail: null,
      });

      const fakePdf = Buffer.from('fake-pdf-content');
      mockGenerateReport.mockResolvedValue(fakePdf);

      const res = await request(app).get('/api/sponsor-portal/report?token=valid-token');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
    });
  });
});
