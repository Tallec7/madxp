/**
 * Tests unitaires pour le controller sponsor-analytics
 *
 * @module sponsor-analytics.controller.test
 */

const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

jest.mock('../services/pdf-report.service', () => ({
  generateSponsorReport: jest.fn(),
  generateClubReport: jest.fn(),
}));

import { Response } from 'express';
import { AuthRequest } from '../types';
import {
  listSponsors,
  getSponsor,
  createSponsor,
  updateSponsor,
  deleteSponsor,
  addVideosToSponsor,
  removeVideoFromSponsor,
  getSponsorStats,
  recordImpressions,
  exportSponsorData,
  calculateDailyStats,
  generateSponsorPdfReport,
  generateClubPdfReport,
} from './sponsor-analytics.controller';

describe('Sponsor Analytics Controller', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;
  let setHeaderMock: jest.Mock;

  const validUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  beforeEach(() => {
    jest.clearAllMocks();

    jsonMock = jest.fn();
    sendMock = jest.fn();
    setHeaderMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock, send: sendMock });

    mockReq = {
      user: { id: 'user-1', email: 'test@example.com', role: 'admin' },
      body: {},
      params: {},
      query: {},
    };

    mockRes = {
      json: jsonMock,
      status: statusMock,
      send: sendMock,
      setHeader: setHeaderMock,
    };
  });

  describe('listSponsors', () => {
    it('should return list of sponsors', async () => {
      const mockSponsors = [
        { id: 'sponsor-1', name: 'Sponsor A', status: 'active' },
        { id: 'sponsor-2', name: 'Sponsor B', status: 'active' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockSponsors, rowCount: 2 });

      await listSponsors(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: {
          sponsors: mockSponsors,
          total: 2,
        },
      });
    });

    it('should return 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await listSponsors(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to list sponsors',
      });
    });
  });

  describe('getSponsor', () => {
    it('should return sponsor by id', async () => {
      mockReq.params = { id: validUuid };
      const mockSponsor = { id: validUuid, name: 'Test Sponsor' };
      mockQuery.mockResolvedValueOnce({ rows: [mockSponsor], rowCount: 1 });

      await getSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: { sponsor: mockSponsor },
      });
    });

    it('should return 400 for invalid UUID', async () => {
      mockReq.params = { id: 'invalid-uuid' };

      await getSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid sponsor ID',
      });
    });

    it('should return 404 if sponsor not found', async () => {
      mockReq.params = { id: validUuid };
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await getSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Sponsor not found',
      });
    });
  });

  describe('createSponsor', () => {
    it('should create a new sponsor', async () => {
      mockReq.body = {
        name: 'New Sponsor',
        logo_url: 'https://example.com/logo.png',
        contact_email: 'sponsor@example.com',
      };
      const mockCreated = { id: 'new-id', ...mockReq.body };
      mockQuery.mockResolvedValueOnce({ rows: [mockCreated] });

      await createSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: mockCreated,
      });
    });

    it('should return 400 if name is missing', async () => {
      mockReq.body = { logo_url: 'https://example.com/logo.png' };

      await createSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'Sponsor name is required',
      });
    });
  });

  describe('updateSponsor', () => {
    it('should update a sponsor', async () => {
      mockReq.params = { id: validUuid };
      mockReq.body = { name: 'Updated Sponsor', status: 'inactive' };
      const mockUpdated = { id: validUuid, ...mockReq.body };
      mockQuery.mockResolvedValueOnce({ rows: [mockUpdated], rowCount: 1 });

      await updateSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: mockUpdated,
      });
    });

    it('should return 400 for invalid UUID', async () => {
      mockReq.params = { id: 'invalid' };

      await updateSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should return 404 if sponsor not found', async () => {
      mockReq.params = { id: validUuid };
      mockReq.body = { name: 'Updated' };
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await updateSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteSponsor', () => {
    it('should delete a sponsor', async () => {
      mockReq.params = { id: validUuid };
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await deleteSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: 'Sponsor deleted successfully',
      });
    });

    it('should return 404 if sponsor not found', async () => {
      mockReq.params = { id: validUuid };
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await deleteSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
    });
  });

  describe('addVideosToSponsor', () => {
    it('should add videos to sponsor', async () => {
      mockReq.params = { id: validUuid };
      mockReq.body = { video_ids: ['video-1', 'video-2'], is_primary: true };
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: validUuid }], rowCount: 1 }) // Sponsor exists
        .mockResolvedValueOnce({ rows: [] }); // Insert

      await addVideosToSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: '2 video(s) associated with sponsor',
      });
    });

    it('should return 400 for invalid sponsor ID', async () => {
      mockReq.params = { id: 'invalid' };
      mockReq.body = { video_ids: ['video-1'] };

      await addVideosToSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should return 400 for empty video_ids', async () => {
      mockReq.params = { id: validUuid };
      mockReq.body = { video_ids: [] };

      await addVideosToSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'video_ids must be a non-empty array',
      });
    });

    it('should return 404 if sponsor not found', async () => {
      mockReq.params = { id: validUuid };
      mockReq.body = { video_ids: ['video-1'] };
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await addVideosToSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
    });
  });

  describe('removeVideoFromSponsor', () => {
    const videoUuid = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

    it('should remove video from sponsor', async () => {
      mockReq.params = { id: validUuid, videoId: videoUuid };
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await removeVideoFromSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: 'Video removed from sponsor',
      });
    });

    it('should return 400 for invalid IDs', async () => {
      mockReq.params = { id: 'invalid', videoId: 'invalid' };

      await removeVideoFromSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should return 404 if association not found', async () => {
      mockReq.params = { id: validUuid, videoId: videoUuid };
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await removeVideoFromSponsor(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
    });
  });

  describe('getSponsorStats', () => {
    it('should return sponsor stats with videos', async () => {
      mockReq.params = { id: validUuid };
      mockReq.query = { from: '2024-01-01', to: '2024-01-31' };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ video_id: 'vid-1' }], rowCount: 1 }) // Videos
        .mockResolvedValueOnce({ // Summary
          rows: [{
            total_impressions: '100',
            total_screen_time_seconds: '5000',
            completion_rate: '85.5',
            estimated_reach: '500',
            active_sites: '5',
            active_days: '20',
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // By video
        .mockResolvedValueOnce({ rows: [] }) // By site
        .mockResolvedValueOnce({ rows: [] }) // By period
        .mockResolvedValueOnce({ rows: [] }) // By event
        .mockResolvedValueOnce({ rows: [] }); // Daily trends

      await getSponsorStats(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            period: '2024-01-01/2024-01-31',
            summary: expect.objectContaining({
              total_impressions: 100,
              active_sites: 5,
            }),
          }),
        })
      );
    });

    it('should return empty stats when no videos', async () => {
      mockReq.params = { id: validUuid };
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await getSponsorStats(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            summary: expect.objectContaining({
              total_impressions: 0,
            }),
            by_video: [],
          }),
        })
      );
    });

    it('should return 400 for invalid sponsor ID', async () => {
      mockReq.params = { id: 'invalid' };

      await getSponsorStats(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('recordImpressions', () => {
    it('should record valid impressions', async () => {
      mockReq.body = {
        impressions: [
          {
            site_id: validUuid,
            video_id: validUuid,
            played_at: '2024-01-15T10:00:00Z',
            duration_played: 30,
            video_duration: 60,
            completed: false,
          },
        ],
      };
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await recordImpressions(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: '1 impression(s) recorded',
      });
    });

    it('should return 400 for empty impressions', async () => {
      mockReq.body = { impressions: [] };

      await recordImpressions(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'impressions must be a non-empty array',
      });
    });

    it('should skip invalid impressions', async () => {
      mockReq.body = {
        impressions: [
          { site_id: 'invalid', video_id: 'invalid' }, // Invalid - skipped
        ],
      };

      await recordImpressions(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: 'No valid impressions to insert',
      });
    });
  });

  describe('exportSponsorData', () => {
    it('should export data as CSV', async () => {
      mockReq.params = { id: validUuid };
      mockReq.query = { from: '2024-01-01', to: '2024-01-31', format: 'csv' };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ video_id: 'vid-1' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            id: 'imp-1',
            video_id: 'vid-1',
            video_name: 'Video 1',
            site_id: 'site-1',
            site_name: 'Site 1',
            club_name: 'Club 1',
            played_at: '2024-01-15T10:00:00Z',
            duration_played: 30,
            completed: true,
            event_type: 'match',
            period: 'halftime',
            trigger_type: 'auto',
            audience_estimate: 100,
          }],
        });

      await exportSponsorData(mockReq as AuthRequest, mockRes as Response);

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(setHeaderMock).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('sponsor-')
      );
      expect(sendMock).toHaveBeenCalled();
    });

    it('should return JSON when format is not csv', async () => {
      mockReq.params = { id: validUuid };
      mockReq.query = { format: 'json' };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ video_id: 'vid-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'imp-1' }] });

      await exportSponsorData(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Array),
      });
    });

    it('should return 404 when no videos found', async () => {
      mockReq.params = { id: validUuid };
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await exportSponsorData(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
    });
  });

  describe('calculateDailyStats', () => {
    it('should calculate daily stats', async () => {
      mockReq.body = { date: '2024-01-15' };
      mockQuery.mockResolvedValueOnce({
        rows: [{ calculate_all_sponsor_daily_stats: 25 }],
      });

      await calculateDailyStats(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        message: 'Calculated stats for 25 video/site combinations',
        date: '2024-01-15',
      });
    });

    it('should use yesterday date if not provided', async () => {
      mockReq.body = {};
      mockQuery.mockResolvedValueOnce({
        rows: [{ calculate_all_sponsor_daily_stats: 10 }],
      });

      await calculateDailyStats(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });
  });

  describe('generateSponsorPdfReport', () => {
    it('should generate PDF report', async () => {
      const { generateSponsorReport } = require('../services/pdf-report.service');
      mockReq.params = { id: validUuid };
      mockReq.query = { from: '2024-01-01', to: '2024-01-31' };
      generateSponsorReport.mockResolvedValueOnce(Buffer.from('PDF content'));

      await generateSponsorPdfReport(mockReq as AuthRequest, mockRes as Response);

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(sendMock).toHaveBeenCalled();
    });

    it('should return 400 for invalid ID', async () => {
      mockReq.params = { id: 'invalid' };

      await generateSponsorPdfReport(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should return 500 on generation error', async () => {
      const { generateSponsorReport } = require('../services/pdf-report.service');
      mockReq.params = { id: validUuid };
      generateSponsorReport.mockRejectedValueOnce(new Error('PDF generation failed'));

      await generateSponsorPdfReport(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe('generateClubPdfReport', () => {
    it('should generate club PDF report', async () => {
      const { generateClubReport } = require('../services/pdf-report.service');
      mockReq.params = { siteId: validUuid };
      mockReq.query = { from: '2024-01-01', to: '2024-01-31' };
      generateClubReport.mockResolvedValueOnce(Buffer.from('Club PDF'));

      await generateClubPdfReport(mockReq as AuthRequest, mockRes as Response);

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(sendMock).toHaveBeenCalled();
    });

    it('should return 400 for invalid site ID', async () => {
      mockReq.params = { siteId: 'invalid' };

      await generateClubPdfReport(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });
});
