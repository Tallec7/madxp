/**
 * Tests unitaires pour advertiserPortalRepository
 *
 * Teste les methodes portal dashboard, sites, videos,
 * stats detaillees, video ownership/CRUD et advertiser-sites admin CRUD.
 */

const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { advertiserPortalRepository } from './advertiser-portal.repository';

describe('AdvertiserPortalRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // Portal Dashboard
  // ========================================================================

  describe('getDashboardStats', () => {
    it('should return 30-day stats for advertiser', async () => {
      const mockStats = {
        total_videos: '5',
        total_sites: '3',
        total_impressions_30d: '1500',
        total_screen_time_30d: '7200',
        avg_completion_rate: '85.3',
      };
      mockQuery.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      const result = await advertiserPortalRepository.getDashboardStats('adv-1');

      expect(result).toEqual(mockStats);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('advertiser_daily_stats'),
        ['adv-1']
      );
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INTERVAL \'30 days\'');
    });

    it('should return null when no data', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await advertiserPortalRepository.getDashboardStats('adv-x');

      expect(result).toBeNull();
    });
  });

  describe('getDashboardTrends', () => {
    it('should return 7-day trends', async () => {
      const mockTrends = [
        { date: '2024-01-01', impressions: '10', screen_time: '300' },
        { date: '2024-01-02', impressions: '15', screen_time: '450' },
      ];
      mockQuery.mockResolvedValue({ rows: mockTrends, rowCount: 2 });

      const result = await advertiserPortalRepository.getDashboardTrends('adv-1');

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INTERVAL \'7 days\'');
      expect(sql).toContain('ORDER BY date ASC');
    });
  });

  describe('getDashboardReach', () => {
    it('should return reach stats from impressions and sessions', async () => {
      const mockReach = {
        total_reach: '5000',
        matches_with_ads: '25',
        avg_audience_per_match: '200',
      };
      mockQuery.mockResolvedValue({ rows: [mockReach], rowCount: 1 });

      const result = await advertiserPortalRepository.getDashboardReach('adv-1');

      expect(result).toEqual(mockReach);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('club_sessions cs');
      expect(sql).toContain('video_plays vp');
    });

    it('should return null when no data', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await advertiserPortalRepository.getDashboardReach('adv-x');

      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // Portal Sites
  // ========================================================================

  describe('getPortalSites', () => {
    it('should return sites with contract and stats', async () => {
      const mockSites = [
        {
          site_id: 's1', site_name: 'Club A', club_name: 'Club A FC',
          contract_status: 'active', impressions_30d: '100',
        },
      ];
      mockQuery.mockResolvedValue({ rows: mockSites, rowCount: 1 });

      const result = await advertiserPortalRepository.getPortalSites('adv-1', 'ads.is_active = true');

      expect(result.rows).toHaveLength(1);
      expect(result.rowCount).toBe(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('advertiser_sites ads');
      expect(sql).toContain('JOIN sites s');
    });
  });

  // ========================================================================
  // Portal Videos
  // ========================================================================

  describe('getPortalVideos', () => {
    it('should return videos with 30-day stats', async () => {
      const mockVideos = [
        { video_id: 'v1', filename: 'ad1.mp4', impressions_30d: '200', completion_rate: '92.5' },
      ];
      mockQuery.mockResolvedValue({ rows: mockVideos, rowCount: 1 });

      const result = await advertiserPortalRepository.getPortalVideos('adv-1');

      expect(result.rows).toHaveLength(1);
      expect(result.rowCount).toBe(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('advertiser_videos av');
      expect(sql).toContain('JOIN videos v');
    });
  });

  // ========================================================================
  // Detailed Stats
  // ========================================================================

  describe('getDailyStatsSummary', () => {
    it('should return summary for video IDs in date range', async () => {
      const mockSummary = { total_impressions: '500', active_sites: '3' };
      mockQuery.mockResolvedValue({ rows: [mockSummary], rowCount: 1 });

      const result = await advertiserPortalRepository.getDailyStatsSummary(
        ['v1', 'v2'], '2024-01-01', '2024-01-31'
      );

      expect(result?.total_impressions).toBe('500');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ANY($1::uuid[])'),
        [['v1', 'v2'], '2024-01-01', '2024-01-31']
      );
    });

    it('should return null when no data', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await advertiserPortalRepository.getDailyStatsSummary([], '2024-01-01', '2024-01-31');

      expect(result).toBeNull();
    });
  });

  describe('getDailyStatsByVideo', () => {
    it('should return per-video breakdown', async () => {
      const mockData = [{ video_id: 'v1', filename: 'test.mp4', impressions: '50' }];
      mockQuery.mockResolvedValue({ rows: mockData, rowCount: 1 });

      const result = await advertiserPortalRepository.getDailyStatsByVideo(
        ['v1'], '2024-01-01', '2024-01-31'
      );

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('GROUP BY v.id, v.filename');
    });
  });

  describe('getDailyStatsBySite', () => {
    it('should return per-site breakdown with limit 20', async () => {
      const mockData = [{ site_id: 's1', site_name: 'Club A', impressions: '30' }];
      mockQuery.mockResolvedValue({ rows: mockData, rowCount: 1 });

      const result = await advertiserPortalRepository.getDailyStatsBySite(
        ['v1'], '2024-01-01', '2024-01-31'
      );

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('LIMIT 20');
    });
  });

  describe('getDailyStatsTrends', () => {
    it('should return daily trends in date range', async () => {
      const mockTrends = [
        { date: '2024-01-01', impressions: '10', screen_time: '300' },
      ];
      mockQuery.mockResolvedValue({ rows: mockTrends, rowCount: 1 });

      const result = await advertiserPortalRepository.getDailyStatsTrends(
        ['v1'], '2024-01-01', '2024-01-31'
      );

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY date ASC');
    });
  });

  // ========================================================================
  // Video Stats (single video)
  // ========================================================================

  describe('getVideoStatsGlobal', () => {
    it('should return global stats for a single video', async () => {
      const mockStats = { total_impressions: '100', sites_count: '5' };
      mockQuery.mockResolvedValue({ rows: [mockStats], rowCount: 1 });

      const result = await advertiserPortalRepository.getVideoStatsGlobal('v1', '2024-01-01', '2024-01-31');

      expect(result?.total_impressions).toBe('100');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE video_id = $1'),
        ['v1', '2024-01-01', '2024-01-31']
      );
    });
  });

  describe('getVideoStatsBySite', () => {
    it('should return per-site breakdown for a video', async () => {
      const mockData = [{ site_id: 's1', site_name: 'Club A', impressions: '30' }];
      mockQuery.mockResolvedValue({ rows: mockData, rowCount: 1 });

      const result = await advertiserPortalRepository.getVideoStatsBySite('v1', '2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE adst.video_id = $1');
    });
  });

  describe('getVideoStatsTrends', () => {
    it('should return daily trends for a video', async () => {
      const mockTrends = [{ date: '2024-01-01', impressions: '10', screen_time: '300' }];
      mockQuery.mockResolvedValue({ rows: mockTrends, rowCount: 1 });

      const result = await advertiserPortalRepository.getVideoStatsTrends('v1', '2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
    });
  });

  // ========================================================================
  // Video Ownership & Management
  // ========================================================================

  describe('findVideoByOwner', () => {
    it('should return video owned by advertiser', async () => {
      const mockVideo = { id: 'v1', filename: 'ad.mp4', storage_path: '/path' };
      mockQuery.mockResolvedValue({ rows: [mockVideo], rowCount: 1 });

      const result = await advertiserPortalRepository.findVideoByOwner('v1', 'adv-1');

      expect(result).toEqual(mockVideo);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('advertiser_videos av'),
        ['v1', 'adv-1']
      );
    });

    it('should return null when not owned', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await advertiserPortalRepository.findVideoByOwner('v1', 'adv-x');

      expect(result).toBeNull();
    });
  });

  describe('findDuplicateVideo', () => {
    it('should return duplicate video by checksum', async () => {
      const mockDup = { id: 'v1', filename: 'dup.mp4' };
      mockQuery.mockResolvedValue({ rows: [mockDup], rowCount: 1 });

      const result = await advertiserPortalRepository.findDuplicateVideo('abc123', 'adv-1');

      expect(result).toEqual(mockDup);
    });

    it('should return null when no duplicate', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await advertiserPortalRepository.findDuplicateVideo('abc123', 'adv-1');

      expect(result).toBeNull();
    });
  });

  describe('countActiveDeployments', () => {
    it('should return count of active deployments', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '3' }], rowCount: 1 });

      const result = await advertiserPortalRepository.countActiveDeployments('v1');

      expect(result).toBe(3);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('content_deployments');
    });
  });

  describe('insertVideo', () => {
    it('should insert and return new video', async () => {
      const mockVideo = { id: 'v1', filename: 'new.mp4' };
      mockQuery.mockResolvedValue({ rows: [mockVideo], rowCount: 1 });

      const result = await advertiserPortalRepository.insertVideo(
        'new.mp4', 'original.mp4', 'sponsor', 1024, 'video/mp4',
        '/path', 'checksum', '{}', 'user-1'
      );

      expect(result).toEqual(mockVideo);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO videos');
      expect(sql).toContain('RETURNING *');
    });
  });

  describe('linkVideoToAdvertiser', () => {
    it('should insert advertiser_videos association', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await advertiserPortalRepository.linkVideoToAdvertiser('adv-1', 'v1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO advertiser_videos');
      expect(mockQuery.mock.calls[0][1]).toEqual(['adv-1', 'v1']);
    });
  });

  describe('deleteVideo', () => {
    it('should delete video by ID', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await advertiserPortalRepository.deleteVideo('v1');

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM videos WHERE id = $1',
        ['v1']
      );
    });
  });

  describe('updateVideo', () => {
    it('should update video with dynamic fields', async () => {
      const mockVideo = { id: 'v1', filename: 'updated.mp4' };
      mockQuery.mockResolvedValue({ rows: [mockVideo], rowCount: 1 });

      const result = await advertiserPortalRepository.updateVideo(
        'v1',
        ['metadata = $1', 'category = $2'],
        ['{"title":"new"}', 'sponsor', 'v1']
      );

      expect(result).toEqual(mockVideo);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE videos SET');
      expect(sql).toContain('RETURNING *');
    });
  });

  // ========================================================================
  // Advertiser-Sites CRUD (admin)
  // ========================================================================

  describe('getAdvertiserSites', () => {
    it('should return sites for advertiser with contract status', async () => {
      const mockSites = [
        { advertiser_id: 'adv-1', site_id: 's1', site_name: 'Club A', contract_status: 'active' },
      ];
      mockQuery.mockResolvedValue({ rows: mockSites, rowCount: 1 });

      const result = await advertiserPortalRepository.getAdvertiserSites('adv-1', false);

      expect(result.rows).toHaveLength(1);
      expect(result.rowCount).toBe(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ads.is_active = true');
    });

    it('should include inactive when requested', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await advertiserPortalRepository.getAdvertiserSites('adv-1', true);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('ads.is_active = true');
    });
  });

  describe('findSitesByIds', () => {
    it('should return found site IDs', async () => {
      const mockSites = [{ id: 's1' }, { id: 's2' }];
      mockQuery.mockResolvedValue({ rows: mockSites, rowCount: 2 });

      const result = await advertiserPortalRepository.findSitesByIds(['s1', 's2']);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ANY($1::uuid[])'),
        [['s1', 's2']]
      );
    });
  });

  describe('addSites', () => {
    it('should upsert advertiser-site associations', async () => {
      mockQuery.mockResolvedValue({ rowCount: 2 });

      await advertiserPortalRepository.addSites('adv-1', ['s1', 's2'], null, null);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO advertiser_sites');
      expect(sql).toContain('ON CONFLICT');
    });
  });

  describe('findAssociation', () => {
    it('should return association when exists', async () => {
      const mockAssoc = { advertiser_id: 'adv-1', site_id: 's1' };
      mockQuery.mockResolvedValue({ rows: [mockAssoc], rowCount: 1 });

      const result = await advertiserPortalRepository.findAssociation('adv-1', 's1');

      expect(result).toEqual(mockAssoc);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await advertiserPortalRepository.findAssociation('adv-1', 's-x');

      expect(result).toBeNull();
    });
  });

  describe('updateAssociation', () => {
    it('should update association with dynamic fields', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await advertiserPortalRepository.updateAssociation(
        'adv-1', 's1',
        ['contract_start = $1', 'is_active = $2'],
        [new Date('2024-01-01'), true]
      );

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE advertiser_sites');
      expect(sql).toContain('contract_start = $1');
    });
  });

  describe('deactivateAssociation', () => {
    it('should soft-delete and return true', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await advertiserPortalRepository.deactivateAssociation('adv-1', 's1');

      expect(result).toBe(true);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('is_active = false');
    });

    it('should return false when not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await advertiserPortalRepository.deactivateAssociation('adv-1', 's-x');

      expect(result).toBe(false);
    });
  });

  describe('deleteAssociation', () => {
    it('should hard-delete and return true', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await advertiserPortalRepository.deleteAssociation('adv-1', 's1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM advertiser_sites'),
        ['adv-1', 's1']
      );
    });

    it('should return false when not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await advertiserPortalRepository.deleteAssociation('adv-1', 's-x');

      expect(result).toBe(false);
    });
  });

  describe('getSiteAdvertisers', () => {
    it('should return advertisers for a site (active only)', async () => {
      const mockAdvs = [
        { advertiser_id: 'adv-1', advertiser_name: 'Corp A', contract_status: 'active' },
      ];
      mockQuery.mockResolvedValue({ rows: mockAdvs, rowCount: 1 });

      const result = await advertiserPortalRepository.getSiteAdvertisers('s1', true);

      expect(result.rows).toHaveLength(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ads.is_active = true');
    });

    it('should include all when activeOnly is false', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await advertiserPortalRepository.getSiteAdvertisers('s1', false);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).not.toContain('ads.is_active = true');
    });
  });
});
