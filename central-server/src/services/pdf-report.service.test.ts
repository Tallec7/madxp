/**
 * Tests unitaires pour le service de génération de rapports PDF
 *
 * Ce service génère des rapports PDF pour:
 * - Analytics Sponsors (rapports mensuels)
 * - Analytics Clubs (rapports mensuels)
 *
 * @module pdf-report.service.test
 */

// Mock dependencies before importing the service
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

// Mock PDFKit - create a chainable mock
const createChainableMock = () => {
  const mock: Record<string, jest.Mock | unknown> = {};
  const chainMethods = [
    'text', 'fontSize', 'moveDown', 'addPage', 'image', 'rect', 'fill',
    'fillColor', 'stroke', 'strokeColor', 'lineWidth', 'moveTo', 'lineTo',
    'font', 'save', 'restore', 'rotate', 'translate', 'scale', 'circle',
    'ellipse', 'polygon', 'path', 'fillAndStroke', 'opacity', 'fillOpacity',
    'strokeOpacity', 'dash', 'undash', 'clip', 'link', 'goTo', 'addContent',
    'registerFont', 'widthOfString', 'currentLineHeight', 'list', 'switchToPage',
    'flushPages',
  ];

  chainMethods.forEach(method => {
    mock[method] = jest.fn().mockReturnValue(mock);
  });

  mock.pipe = jest.fn().mockReturnValue(mock);
  mock.end = jest.fn();
  mock.on = jest.fn().mockReturnValue(mock);
  mock.bufferedPageRange = jest.fn().mockReturnValue({ start: 0, count: 1 });

  return mock;
};

jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => {
    const doc = createChainableMock();
    doc.page = { width: 595, height: 842 };
    doc.y = 100;
    doc.x = 50;
    return doc;
  });
});

// Mock chartjs-node-canvas
const mockRenderToBuffer = jest.fn().mockResolvedValue(Buffer.from('fake-chart'));
jest.mock('chartjs-node-canvas', () => ({
  ChartJSNodeCanvas: jest.fn().mockImplementation(() => ({
    renderToBuffer: mockRenderToBuffer,
  })),
}));

// Import after mocks
import {
  generateSponsorReport,
  generateClubReport,
} from './pdf-report.service';

describe('PdfReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('generateSponsorReport', () => {
    const mockSponsor = {
      id: 'sponsor-123',
      name: 'Test Sponsor',
      logo_url: 'https://example.com/logo.png',
    };

    const mockVideoIds = [
      { video_id: 'video-1' },
      { video_id: 'video-2' },
    ];

    const mockSummary = {
      total_impressions: '1000',
      total_screen_time_seconds: '5000',
      completion_rate: '85.5',
      estimated_reach: '500',
      active_sites: '10',
      active_days: '25',
    };

    const mockDailyTrends = [
      { date: '2024-01-01', impressions: '100', screen_time: '500' },
      { date: '2024-01-02', impressions: '150', screen_time: '750' },
    ];

    it('should throw error if sponsor not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        generateSponsorReport('nonexistent', '2024-01-01', '2024-01-31')
      ).rejects.toThrow('Sponsor not found');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw error if no videos found for sponsor', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockSponsor], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        generateSponsorReport('sponsor-123', '2024-01-01', '2024-01-31')
      ).rejects.toThrow('No videos found for sponsor');
    });
  });

  describe('generateClubReport', () => {
    it('should throw error if site not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        generateClubReport('nonexistent', '2024-01-01', '2024-01-31')
      ).rejects.toThrow('Site not found');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should log and rethrow database errors in generateSponsorReport', async () => {
      const dbError = new Error('Database connection failed');
      mockQuery.mockRejectedValueOnce(dbError);

      await expect(
        generateSponsorReport('sponsor-123', '2024-01-01', '2024-01-31')
      ).rejects.toThrow('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error generating sponsor report:',
        dbError
      );
    });

    it('should log and rethrow database errors in generateClubReport', async () => {
      const dbError = new Error('Query timeout');
      mockQuery.mockRejectedValueOnce(dbError);

      await expect(
        generateClubReport('site-123', '2024-01-01', '2024-01-31')
      ).rejects.toThrow('Query timeout');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error generating club report:',
        dbError
      );
    });

  });

  describe('Query validation', () => {
    it('should query sponsor with correct ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(generateSponsorReport('sponsor-123', '2024-01-01', '2024-01-31'))
        .rejects.toThrow();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM sponsors'),
        ['sponsor-123']
      );
    });

    it('should query site with correct ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(generateClubReport('site-123', '2024-01-01', '2024-01-31'))
        .rejects.toThrow();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM sites'),
        ['site-123']
      );
    });

    it('should query video IDs for sponsor', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'sponsor-1', name: 'Test' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(generateSponsorReport('sponsor-1', '2024-01-01', '2024-01-31'))
        .rejects.toThrow('No videos found');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('sponsor_videos'),
        ['sponsor-1']
      );
    });
  });
});
