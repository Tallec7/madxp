import { Response } from 'express';
import { AuthRequest } from '../types';

// Mock repositories BEFORE importing controller
jest.mock('../repositories', () => {
  const mockAnalyticsRepository = {
    getLatestMetrics: jest.fn(),
    getHeartbeatStats30d: jest.fn(),
    getAlertStats: jest.fn(),
    get24hAverages: jest.fn(),
    getHeartbeatCount24h: jest.fn(),
    getAlertCount24h: jest.fn(),
    getDailyHeartbeats: jest.fn(),
    getClubAlerts: jest.fn(),
    getUsageStats: jest.fn(),
    getDailyStats: jest.fn(),
    getCategoryStats: jest.fn(),
    getTopVideos: jest.fn(),
    getDashboardHealth: jest.fn(),
    getDashboardUsage: jest.fn(),
    getDashboardCategories: jest.fn(),
    getDashboardTopVideos: jest.fn(),
    getDashboardAlerts: jest.fn(),
    recordVideoPlays: jest.fn(),
    startSession: jest.fn(),
    endSession: jest.fn(),
    calculateDailyStats: jest.fn(),
    getSiteCounts: jest.fn(),
    getPlayCounts: jest.fn(),
    getFleetAvailability: jest.fn(),
    getSitesSummary: jest.fn(),
    exportVideoPlays: jest.fn(),
    exportDailyStats: jest.fn(),
    exportMetrics: jest.fn(),
  };

  const mockSiteRepository = {
    findById: jest.fn(),
    exists: jest.fn(),
  };

  return {
    analyticsRepository: mockAnalyticsRepository,
    siteRepository: mockSiteRepository,
  };
});

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

/**
 * Tests unitaires pour analytics.controller.ts
 *
 * Ces tests valident les endpoints d'analytics du dashboard central:
 * - getClubHealth: Métriques de santé d'un site
 * - getClubAvailability: Historique de disponibilité
 * - getClubAlerts: Alertes d'un site
 * - recordVideoPlays: Enregistrement des lectures vidéo
 * - manageSession: Gestion des sessions utilisateur
 * - exportClubData: Export CSV des données
 * - getClubUsage: Statistiques d'utilisation
 * - getClubContent: Analytics de contenu
 * - getClubDashboard: Vue complète du dashboard
 * - calculateDailyStats: Calcul des stats quotidiennes
 * - getAnalyticsOverview: Vue d'ensemble globale
 */

import {
  getClubHealth,
  getClubAvailability,
  getClubAlerts,
  recordVideoPlays,
  manageSession,
  exportClubData,
  getClubUsage,
  getClubContent,
  getClubDashboard,
  calculateDailyStats,
  getAnalyticsOverview,
} from './analytics.controller';
import { analyticsRepository, siteRepository } from '../repositories';

// Type the mocked repositories for convenience
const mockedAnalytics = analyticsRepository as jest.Mocked<typeof analyticsRepository>;
const mockedSite = siteRepository as unknown as jest.Mocked<Pick<typeof siteRepository, 'findById' | 'exists'>>;

// Helper to create mock response
const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Helper to create authenticated request
const createAuthRequest = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    user: { id: 'user-123', email: 'admin@example.com', role: 'admin' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as AuthRequest);

describe('Analytics Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getClubHealth', () => {
    it('should return health data for a site', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedSite.findById.mockResolvedValueOnce({
        id: 'site-123',
        site_name: 'Site 123',
        club_name: 'Club 123',
        status: 'online',
        last_seen_at: new Date('2025-12-01T00:00:00Z'),
        location: null,
        sports: null,
        software_version: null,
        hardware_model: 'pi4',
        api_key: 'key-123',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
        pending_config_version_id: null,
        remote_pin_hash: null,
      });

      mockedAnalytics.getLatestMetrics.mockResolvedValueOnce({
        cpu_usage: 25,
        memory_usage: 35,
        temperature: 65,
        disk_usage: 45,
        uptime: 1234,
        recorded_at: new Date('2025-12-01T00:00:00Z'),
      });

      mockedAnalytics.getHeartbeatStats30d.mockResolvedValueOnce({
        heartbeat_count: '2000',
        first_heartbeat: new Date('2025-11-01T00:00:00Z'),
        last_heartbeat: new Date('2025-12-01T00:00:00Z'),
      });

      mockedAnalytics.getAlertStats.mockResolvedValueOnce({
        active_alerts: '1',
        alerts_last_30d: '5',
      });

      mockedAnalytics.get24hAverages.mockResolvedValueOnce({
        avg_cpu: 22,
        avg_memory: 33,
        avg_temperature: 45,
        max_temperature: 70,
      });

      mockedAnalytics.getHeartbeatCount24h.mockResolvedValueOnce(1000);

      mockedAnalytics.getAlertCount24h.mockResolvedValueOnce(3);

      await getClubHealth(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          site_id: 'site-123',
          availability_24h: expect.any(Number),
          alerts_24h: 3,
          status: 'healthy',
          current_metrics: expect.objectContaining({ cpu_usage: 25 }),
        })
      );
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({ params: { siteId: 'nonexistent' } });
      const res = createMockResponse();

      mockedSite.findById.mockResolvedValueOnce(null);

      await getClubHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site non trouvé' });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedSite.findById.mockRejectedValueOnce(new Error('DB Error'));

      await getClubHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getClubAvailability', () => {
    it('should return availability data', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { days: '7' },
      });
      const res = createMockResponse();

      mockedAnalytics.getDailyHeartbeats.mockResolvedValueOnce([
        { date: new Date('2025-12-01'), heartbeat_count: '2880', avg_cpu: 45.5, avg_temp: 52.3 },
      ]);

      await getClubAvailability(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          availability: [
            expect.objectContaining({
              date: expect.anything(),
              online_minutes: 1440,
              availability_percent: 100,
            }),
          ],
        })
      );
    });

    it('should limit days to 90 maximum', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { days: '365' },
      });
      const res = createMockResponse();

      mockedAnalytics.getDailyHeartbeats.mockResolvedValueOnce([]);

      await getClubAvailability(req, res);

      expect(mockedAnalytics.getDailyHeartbeats).toHaveBeenCalledWith('site-123', 90);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedAnalytics.getDailyHeartbeats.mockRejectedValueOnce(new Error('DB Error'));

      await getClubAvailability(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getClubAlerts', () => {
    it('should return alerts data', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedAnalytics.getClubAlerts.mockResolvedValueOnce([
        {
          id: 'alert-1',
          type: 'temperature',
          severity: 'warning',
          message: 'Trop chaud',
          status: 'active',
          created_at: new Date('2025-12-01T00:00:00Z'),
          resolved_at: null,
        },
      ]);

      await getClubAlerts(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          alerts: expect.arrayContaining([
            expect.objectContaining({ id: 'alert-1', severity: 'warning' }),
          ]),
        })
      );
    });

    it('should filter by status and severity', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { status: 'active', severity: 'critical' },
      });
      const res = createMockResponse();

      mockedAnalytics.getClubAlerts.mockResolvedValueOnce([]);

      await getClubAlerts(req, res);

      expect(mockedAnalytics.getClubAlerts).toHaveBeenCalledWith(
        'site-123',
        30,
        { status: 'active', severity: 'critical', limit: 50 }
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedAnalytics.getClubAlerts.mockRejectedValueOnce(new Error('DB Error'));

      await getClubAlerts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('recordVideoPlays', () => {
    it('should record video plays', async () => {
      const req = createAuthRequest({
        body: {
          site_id: 'site-123',
          plays: [{ video_filename: 'video1.mp4', category: 'sponsors' }],
        },
      });
      const res = createMockResponse();

      mockedSite.exists.mockResolvedValueOnce(true);
      mockedAnalytics.recordVideoPlays.mockResolvedValueOnce(undefined);

      await recordVideoPlays(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should ignore invalid session ids when recording plays', async () => {
      const req = createAuthRequest({
        body: {
          site_id: 'site-123',
          plays: [{
            video_filename: 'video1.mp4',
            category: 'sponsors',
            session_id: 'session_123', // not a UUID
          }],
        },
      });
      const res = createMockResponse();

      mockedSite.exists.mockResolvedValueOnce(true);
      mockedAnalytics.recordVideoPlays.mockResolvedValueOnce(undefined);

      await recordVideoPlays(req, res);

      // Verify that recordVideoPlays was called with items where sessionId is empty string
      // (invalid UUIDs are replaced with null -> then coerced to empty string)
      const callArgs = mockedAnalytics.recordVideoPlays.mock.calls[0][0];
      expect(callArgs[0].sessionId).toBe('');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return 400 if site_id or plays missing', async () => {
      const req = createAuthRequest({ body: {} });
      const res = createMockResponse();

      await recordVideoPlays(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'site_id et plays[] requis' });
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({
        body: { site_id: 'nonexistent', plays: [{ video_filename: 'test.mp4' }] },
      });
      const res = createMockResponse();

      mockedSite.exists.mockResolvedValueOnce(false);

      await recordVideoPlays(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        body: { site_id: 'site-123', plays: [{ video_filename: 'test.mp4' }] },
      });
      const res = createMockResponse();

      mockedSite.exists.mockRejectedValueOnce(new Error('DB Error'));

      await recordVideoPlays(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('manageSession', () => {
    it('should start a new session', async () => {
      const req = createAuthRequest({
        body: { site_id: 'site-123', action: 'start' },
      });
      const res = createMockResponse();

      mockedAnalytics.startSession.mockResolvedValueOnce({
        id: 'session-123',
        started_at: new Date(),
      });

      await manageSession(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, session_id: 'session-123' })
      );
    });

    it('should end an existing session', async () => {
      const req = createAuthRequest({
        body: { site_id: 'site-123', action: 'end', session_id: 'session-123' },
      });
      const res = createMockResponse();

      mockedAnalytics.endSession.mockResolvedValueOnce({
        id: 'session-123',
        started_at: new Date(),
        ended_at: new Date(),
        duration_seconds: 3600,
        videos_played: null,
        manual_triggers: null,
        auto_plays: null,
      });

      await manageSession(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return 400 if site_id or action missing', async () => {
      const req = createAuthRequest({ body: {} });
      const res = createMockResponse();

      await manageSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'site_id et action requis' });
    });

    it('should return 400 for invalid action', async () => {
      const req = createAuthRequest({
        body: { site_id: 'site-123', action: 'end' }, // Missing session_id
      });
      const res = createMockResponse();

      await manageSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if session not found', async () => {
      const req = createAuthRequest({
        body: { site_id: 'site-123', action: 'end', session_id: 'nonexistent' },
      });
      const res = createMockResponse();

      mockedAnalytics.endSession.mockResolvedValueOnce(null);

      await manageSession(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        body: { site_id: 'site-123', action: 'start' },
      });
      const res = createMockResponse();

      mockedAnalytics.startSession.mockRejectedValueOnce(new Error('DB Error'));

      await manageSession(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('exportClubData', () => {
    it('should export video_plays as CSV', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { type: 'video_plays' },
      });
      const res = createMockResponse();

      mockedAnalytics.exportVideoPlays.mockResolvedValueOnce([
        { played_at: '2025-12-01', video_filename: 'video1.mp4', category: 'sponsors' },
      ]);

      await exportClubData(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.send).toHaveBeenCalled();
    });

    it('should export daily_stats as CSV', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { type: 'daily_stats' },
      });
      const res = createMockResponse();

      mockedAnalytics.exportDailyStats.mockResolvedValueOnce([
        { date: '2025-12-01', videos: '50' },
      ]);

      await exportClubData(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    });

    it('should export metrics as CSV', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { type: 'metrics' },
      });
      const res = createMockResponse();

      mockedAnalytics.exportMetrics.mockResolvedValueOnce([
        { recorded_at: new Date().toISOString(), cpu_usage: 45 },
      ]);

      await exportClubData(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    });

    it('should return 400 for invalid type', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { type: 'invalid' },
      });
      const res = createMockResponse();

      await exportClubData(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if no data', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { type: 'video_plays' },
      });
      const res = createMockResponse();

      mockedAnalytics.exportVideoPlays.mockResolvedValueOnce([]);

      await exportClubData(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { type: 'video_plays' },
      });
      const res = createMockResponse();

      mockedAnalytics.exportVideoPlays.mockRejectedValueOnce(new Error('DB Error'));

      await exportClubData(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getClubUsage', () => {
    it('should return usage statistics', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
      });
      const res = createMockResponse();

      mockedAnalytics.getUsageStats.mockResolvedValueOnce({
        screen_time_seconds: '3600',
        videos_played: '50',
        unique_videos: '10',
        sessions_count: '5',
        active_days: '4',
        manual_triggers: '2',
        auto_plays: '3',
        avg_completion: 85.2,
      });

      mockedAnalytics.getDailyStats.mockResolvedValueOnce([
        { date: new Date('2025-12-01'), screen_time: '1800', videos: '25' },
      ]);

      await getClubUsage(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          period: expect.stringContaining('days'),
          total_plays: 50,
          daily_breakdown: expect.arrayContaining([
            expect.objectContaining({ plays: 25 }),
          ]),
        })
      );
    });

    it('should respect days query parameter', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-123' },
        query: { days: '7' },
      });
      const res = createMockResponse();

      mockedAnalytics.getUsageStats.mockResolvedValueOnce({
        screen_time_seconds: '0',
        videos_played: '0',
        unique_videos: '0',
        sessions_count: '0',
        active_days: '0',
        manual_triggers: '0',
        auto_plays: '0',
        avg_completion: null,
      });

      mockedAnalytics.getDailyStats.mockResolvedValueOnce([]);

      await getClubUsage(req, res);

      // Verify getUsageStats was called with correct from/to dates (7 days apart)
      const callArgs = mockedAnalytics.getUsageStats.mock.calls[0];
      const fromDate = new Date(callArgs[1]);
      const toDate = new Date(callArgs[2]);
      const diffDays = Math.round((toDate.valueOf() - fromDate.valueOf()) / (1000 * 60 * 60 * 24));
      expect(Math.abs(diffDays - 7)).toBeLessThanOrEqual(1);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedAnalytics.getUsageStats.mockRejectedValueOnce(new Error('DB Error'));

      await getClubUsage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getClubContent', () => {
    it('should return content analytics', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedAnalytics.getCategoryStats.mockResolvedValueOnce([
        { category: 'sponsors', plays: '30', total_duration: '1800' },
      ]);

      mockedAnalytics.getTopVideos.mockResolvedValueOnce([
        {
          video_filename: 'video1.mp4',
          category: 'sponsors',
          plays: '15',
          total_duration: '900',
          avg_completion: 90,
        },
      ]);

      await getClubContent(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          categories_breakdown: expect.arrayContaining([
            expect.objectContaining({ category: 'sponsors', play_count: 30 }),
          ]),
          top_videos: expect.arrayContaining([
            expect.objectContaining({ filename: 'video1.mp4', play_count: 15 }),
          ]),
        })
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedAnalytics.getCategoryStats.mockRejectedValueOnce(new Error('DB Error'));

      await getClubContent(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getClubDashboard', () => {
    it('should return complete dashboard data', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedAnalytics.getDashboardHealth.mockResolvedValueOnce({
        status: 'online',
        last_seen_at: new Date('2025-12-01T00:00:00Z'),
        cpu_usage: 45,
        memory_usage: 60,
        temperature: 55,
        disk_usage: 30,
      });

      mockedAnalytics.getDashboardUsage.mockResolvedValueOnce({
        screen_time_seconds: '3600',
        videos_played: '50',
        active_days: '10',
        manual_triggers: '20',
        auto_plays: '30',
      });

      mockedAnalytics.getDashboardCategories.mockResolvedValueOnce([
        { category: 'sponsors', plays: '30' },
      ]);

      mockedAnalytics.getDashboardTopVideos.mockResolvedValueOnce([
        { video_filename: 'video1.mp4', plays: '15' },
      ]);

      mockedAnalytics.getDashboardAlerts.mockResolvedValueOnce([
        {
          alert_type: 'temperature',
          severity: 'warning',
          message: 'Alerte',
          created_at: '2025-12-01T00:00:00Z',
          resolved_at: null,
        },
      ]);

      mockedAnalytics.getDailyStats.mockResolvedValueOnce([
        { date: new Date('2025-12-01'), screen_time: '1800', videos: '25' },
      ]);

      await getClubDashboard(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          site_id: 'site-123',
          health: expect.objectContaining({ status: 'online' }),
          usage: expect.objectContaining({ videos_played: 50 }),
          content: expect.objectContaining({ top_videos: expect.any(Array) }),
          alerts: expect.any(Array),
          daily_activity: expect.any(Array),
        })
      );
    });

    it('should handle missing health metrics', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedAnalytics.getDashboardHealth.mockResolvedValueOnce({
        status: 'offline',
        last_seen_at: null,
        cpu_usage: null,
        memory_usage: null,
        temperature: null,
        disk_usage: null,
      });

      mockedAnalytics.getDashboardUsage.mockResolvedValueOnce({
        screen_time_seconds: '0',
        videos_played: '0',
        active_days: '0',
        manual_triggers: '0',
        auto_plays: '0',
      });

      mockedAnalytics.getDashboardCategories.mockResolvedValueOnce([]);
      mockedAnalytics.getDashboardTopVideos.mockResolvedValueOnce([]);
      mockedAnalytics.getDashboardAlerts.mockResolvedValueOnce([]);
      mockedAnalytics.getDailyStats.mockResolvedValueOnce([]);

      await getClubDashboard(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          health: expect.objectContaining({ current: null }),
        })
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-123' } });
      const res = createMockResponse();

      mockedAnalytics.getDashboardHealth.mockRejectedValueOnce(new Error('DB Error'));

      await getClubDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('calculateDailyStats', () => {
    it('should calculate daily stats for all sites', async () => {
      const req = createAuthRequest({
        body: { date: '2025-12-01' },
      });
      const res = createMockResponse();

      mockedAnalytics.calculateDailyStats.mockResolvedValueOnce(10);

      await calculateDailyStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          date: '2025-12-01',
          sites_processed: 10,
        })
      );
    });

    it('should use yesterday as default date', async () => {
      const req = createAuthRequest({ body: {} });
      const res = createMockResponse();

      mockedAnalytics.calculateDailyStats.mockResolvedValueOnce(5);

      await calculateDailyStats(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          sites_processed: 5,
        })
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ body: {} });
      const res = createMockResponse();

      mockedAnalytics.calculateDailyStats.mockRejectedValueOnce(new Error('DB Error'));

      await calculateDailyStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getAnalyticsOverview', () => {
    it('should return global analytics overview', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      mockedAnalytics.getSiteCounts.mockResolvedValueOnce({
        total_sites: '20',
        online_sites: '10',
      });

      mockedAnalytics.getPlayCounts.mockResolvedValueOnce({
        plays_today: '5',
        plays_week: '35',
      });

      mockedAnalytics.getFleetAvailability.mockResolvedValueOnce(90);

      mockedAnalytics.getSitesSummary.mockResolvedValueOnce([
        {
          site_id: 'site-1',
          club_name: 'Club A',
          status: 'online',
          plays_today: '5',
          heartbeat_count: '2880',
        },
      ]);

      await getAnalyticsOverview(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total_sites: 20,
          online_sites: 10,
          total_plays_today: 5,
          avg_availability: 90,
          sites_summary: expect.arrayContaining([
            expect.objectContaining({ site_id: 'site-1' }),
          ]),
        })
      );
    });

    it('should handle empty data', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      mockedAnalytics.getSiteCounts.mockResolvedValueOnce({
        total_sites: '0',
        online_sites: '0',
      });

      mockedAnalytics.getPlayCounts.mockResolvedValueOnce({
        plays_today: '0',
        plays_week: '0',
      });

      mockedAnalytics.getFleetAvailability.mockResolvedValueOnce(null);

      mockedAnalytics.getSitesSummary.mockResolvedValueOnce([]);

      await getAnalyticsOverview(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total_sites: 0,
          total_plays_today: 0,
          avg_availability: 0,
        })
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      mockedAnalytics.getSiteCounts.mockRejectedValueOnce(new Error('DB Error'));

      await getAnalyticsOverview(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
