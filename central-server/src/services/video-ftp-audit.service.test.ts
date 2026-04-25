// Mocks must be hoisted BEFORE the service import.
jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

jest.mock('./storage.service', () => ({
  getVideoUrl: jest.fn((path: string) => `https://kalonpartners.bzh/neopro-video/${path}`),
}));

jest.mock('./metrics.service', () => ({
  __esModule: true,
  default: { recordVideoFtpAudit: jest.fn() },
  metricsService: { recordVideoFtpAudit: jest.fn() },
}));

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

import { videoFtpAuditService } from './video-ftp-audit.service';
import { query } from '../config/database';
import metricsService from './metrics.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockRecord = metricsService.recordVideoFtpAudit as jest.MockedFunction<typeof metricsService.recordVideoFtpAudit>;

describe('VideoFtpAuditService.auditAllVideos (PR2.2)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns zero counters when no videos in DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.scanned).toBe(0);
    expect(result.missing).toBe(0);
    expect(result.unreachable).toBe(0);
    expect(result.resolved).toBe(0);
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ scanned: 0, missing: 0 }));
  });

  it('records a warning when HEAD returns 404', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'v-missing', storage_path: 'videos/ac/dead.mp4' }],
      } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // upsertWarning UPDATE

    globalThis.fetch = jest.fn().mockResolvedValue({ status: 404, ok: false } as Response);

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.scanned).toBe(1);
    expect(result.missing).toBe(1);
    expect(result.unreachable).toBe(0);
    // upsertWarning called with status='missing'
    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/INSERT INTO video_ftp_audit_warnings/);
    expect(lastCall[1]).toEqual(expect.arrayContaining(['v-missing', 'videos/ac/dead.mp4', 'missing', 404]));
  });

  it('records "unreachable" when HEAD throws (timeout / network error)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'v-net', storage_path: 'videos/xx/x.mp4' }],
      } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never);

    globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.unreachable).toBe(1);
    expect(result.missing).toBe(0);
    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(lastCall[1]).toEqual(expect.arrayContaining(['v-net', 'unreachable']));
  });

  it('auto-resolves (DELETE warning) when HEAD returns 200 and a warning existed', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'v-ok', storage_path: 'videos/ok.mp4' }],
      } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // clearWarning DELETE

    globalThis.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true } as Response);

    const result = await videoFtpAuditService.auditAllVideos();

    expect(result.resolved).toBe(1);
    expect(result.missing).toBe(0);
    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/DELETE FROM video_ftp_audit_warnings/);
  });

  it('handles a mixed batch (200 OK + 404 + ECONNRESET) in a single run', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 'ok', storage_path: 'a.mp4' },
          { id: 'gone', storage_path: 'b.mp4' },
          { id: 'down', storage_path: 'c.mp4' },
        ],
      } as never)
      // 3 follow-up writes (1 DELETE + 2 INSERT/UPDATE) — order depends on
      // concurrency, just resolve them all.
      .mockResolvedValue({ rowCount: 1 } as never);

    let n = 0;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      n++;
      if (n === 1) return Promise.resolve({ status: 200, ok: true } as Response);
      if (n === 2) return Promise.resolve({ status: 404, ok: false } as Response);
      return Promise.reject(new Error('timeout'));
    });

    const result = await videoFtpAuditService.auditAllVideos({ batchSize: 10, concurrency: 1 });

    expect(result.scanned).toBe(3);
    expect(result.missing).toBe(1);
    expect(result.unreachable).toBe(1);
    expect(result.resolved).toBe(1);
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });
});
