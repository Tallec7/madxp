/**
 * Tests unitaires pour le service d'audit
 *
 * Ce service est CRITIQUE pour la conformité car il gère:
 * - L'enregistrement de toutes les actions administratives
 * - La traçabilité des opérations
 * - La récupération des logs avec filtres
 *
 * @module audit.service.test
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

// Import after mocks
import { auditService, AuditAction } from './audit.service';
import { Request } from 'express';
import { AuthRequest } from '../types';

describe('AuditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset tableChecked state
    (auditService as any).tableChecked = false;
  });

  describe('log', () => {
    const mockRequest = {
      headers: {
        'x-forwarded-for': '192.168.1.100, 10.0.0.1',
        'user-agent': 'Mozilla/5.0 Test Browser',
      },
      socket: {
        remoteAddress: '127.0.0.1',
      },
    } as unknown as Request;

    it('should log an audit entry', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // ensureTable - CREATE TABLE
        .mockResolvedValueOnce({ rows: [] }) // ensureTable - CREATE INDEX 1
        .mockResolvedValueOnce({ rows: [] }) // ensureTable - CREATE INDEX 2
        .mockResolvedValueOnce({ rows: [] }) // ensureTable - CREATE INDEX 3
        .mockResolvedValueOnce({ rows: [] }) // ensureTable - CREATE INDEX 4
        .mockResolvedValueOnce({ rows: [] }); // INSERT

      await auditService.log({
        action: 'USER_LOGIN',
        userId: 'user-123',
      }, mockRequest);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'USER_LOGIN',
          'user-123',
          null, // targetType
          null, // targetId
          null, // details
          '192.168.1.100', // IP from x-forwarded-for
          'Mozilla/5.0 Test Browser',
        ])
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Audit log recorded',
        expect.objectContaining({
          action: 'USER_LOGIN',
          userId: 'user-123',
        })
      );
    });

    it('should extract IP from x-forwarded-for header', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      (auditService as any).tableChecked = true;

      await auditService.log({ action: 'USER_LOGIN' }, mockRequest);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['192.168.1.100'])
      );
    });

    it('should fallback to socket remoteAddress if no x-forwarded-for', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      (auditService as any).tableChecked = true;

      const reqWithoutForwarded = {
        headers: {
          'user-agent': 'Test',
        },
        socket: {
          remoteAddress: '10.0.0.50',
        },
      } as unknown as Request;

      await auditService.log({ action: 'USER_LOGIN' }, reqWithoutForwarded);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['10.0.0.50'])
      );
    });

    it('should use system as IP when no request provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      (auditService as any).tableChecked = true;

      await auditService.log({ action: 'SETTINGS_UPDATED' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['system'])
      );
    });

    it('should extract userId from AuthRequest if not provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      (auditService as any).tableChecked = true;

      const authReq = {
        ...mockRequest,
        user: { id: 'auth-user-456' },
      } as unknown as AuthRequest;

      await auditService.log({ action: 'VIDEO_UPLOADED' }, authReq);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['auth-user-456'])
      );
    });

    it('should include details as JSON', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      (auditService as any).tableChecked = true;

      const details = { filename: 'video.mp4', size: 1024 };

      await auditService.log({
        action: 'VIDEO_UPLOADED',
        details,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(details)])
      );
    });

    it('should not throw if database fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));
      (auditService as any).tableChecked = true;

      // Should not throw
      await expect(auditService.log({ action: 'USER_LOGIN' })).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to record audit log:',
        expect.any(Error)
      );
    });
  });

  describe('getLogs', () => {
    beforeEach(() => {
      (auditService as any).tableChecked = true;
    });

    it('should return paginated logs', async () => {
      const mockLogs = [
        { id: '1', action: 'USER_LOGIN', created_at: new Date() },
        { id: '2', action: 'USER_LOGOUT', created_at: new Date() },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: mockLogs })
        .mockResolvedValueOnce({ rows: [{ total: '50' }] });

      const result = await auditService.getLogs({ page: 1, limit: 10 });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(50);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(5);
    });

    it('should apply action filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await auditService.getLogs({ action: 'USER_LOGIN' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('action = $1'),
        expect.arrayContaining(['USER_LOGIN'])
      );
    });

    it('should apply userId filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await auditService.getLogs({ userId: 'user-123' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $'),
        expect.arrayContaining(['user-123'])
      );
    });

    it('should apply targetType filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await auditService.getLogs({ targetType: 'site' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('target_type = $'),
        expect.arrayContaining(['site'])
      );
    });

    it('should apply date range filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await auditService.getLogs({ startDate, endDate });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= $'),
        expect.arrayContaining([startDate])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at <= $'),
        expect.arrayContaining([endDate])
      );
    });

    it('should combine multiple filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await auditService.getLogs({
        action: 'VIDEO_UPLOADED',
        userId: 'user-123',
        targetType: 'video',
      });

      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('action = $1');
      expect(call[0]).toContain('user_id = $2');
      expect(call[0]).toContain('target_type = $3');
    });

    it('should use default pagination values', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await auditService.getLogs();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        expect.arrayContaining([50, 0])
      );
    });

    it('should calculate correct offset for pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await auditService.getLogs({ page: 3, limit: 20 });

      // Offset should be (3-1) * 20 = 40
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([20, 40])
      );
    });

    it('should return empty result on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await auditService.getLogs();

      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get audit logs:',
        expect.any(Error)
      );
    });
  });

  describe('Helper methods', () => {
    beforeEach(() => {
      (auditService as any).tableChecked = true;
      mockQuery.mockResolvedValue({ rows: [] });
    });

    describe('logUserLogin', () => {
      it('should log user login action', async () => {
        const mockReq = { headers: {}, socket: {} } as unknown as Request;

        await auditService.logUserLogin('user-123', mockReq);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO audit_logs'),
          expect.arrayContaining(['USER_LOGIN', 'user-123'])
        );
      });
    });

    describe('logSiteCreated', () => {
      it('should log site creation', async () => {
        const mockReq = { headers: {}, socket: {}, user: { id: 'admin-1' } } as unknown as AuthRequest;

        await auditService.logSiteCreated('site-123', 'New Site', mockReq);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO audit_logs'),
          expect.arrayContaining([
            'SITE_CREATED',
            'admin-1',
            'site',
            'site-123',
            JSON.stringify({ siteName: 'New Site' }),
          ])
        );
      });
    });

    describe('logSiteDeleted', () => {
      it('should log site deletion', async () => {
        const mockReq = { headers: {}, socket: {}, user: { id: 'admin-1' } } as unknown as AuthRequest;

        await auditService.logSiteDeleted('site-123', 'Deleted Site', mockReq);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO audit_logs'),
          expect.arrayContaining([
            'SITE_DELETED',
            'admin-1',
            'site',
            'site-123',
          ])
        );
      });
    });

    describe('logVideoUploaded', () => {
      it('should log video upload', async () => {
        const mockReq = { headers: {}, socket: {}, user: { id: 'user-1' } } as unknown as AuthRequest;

        await auditService.logVideoUploaded('video-123', 'promo.mp4', mockReq);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO audit_logs'),
          expect.arrayContaining([
            'VIDEO_UPLOADED',
            'user-1',
            'video',
            'video-123',
            JSON.stringify({ filename: 'promo.mp4' }),
          ])
        );
      });
    });

    describe('logVideoDeployed', () => {
      it('should log video deployment to site', async () => {
        const mockReq = { headers: {}, socket: {}, user: { id: 'user-1' } } as unknown as AuthRequest;

        await auditService.logVideoDeployed('video-123', 'site', 'site-456', mockReq);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO audit_logs'),
          expect.arrayContaining([
            'VIDEO_DEPLOYED',
            'user-1',
            'video',
            'video-123',
            JSON.stringify({ deployTarget: 'site', deployTargetId: 'site-456' }),
          ])
        );
      });

      it('should log video deployment to group', async () => {
        const mockReq = { headers: {}, socket: {}, user: { id: 'user-1' } } as unknown as AuthRequest;

        await auditService.logVideoDeployed('video-123', 'group', 'group-789', mockReq);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([
            JSON.stringify({ deployTarget: 'group', deployTargetId: 'group-789' }),
          ])
        );
      });
    });

    describe('logCommandSent', () => {
      it('should log command sent to site', async () => {
        const mockReq = { headers: {}, socket: {}, user: { id: 'admin-1' } } as unknown as AuthRequest;

        await auditService.logCommandSent('site-123', 'reboot', 'cmd-456', mockReq);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO audit_logs'),
          expect.arrayContaining([
            'COMMAND_SENT',
            'admin-1',
            'site',
            'site-123',
            JSON.stringify({ commandType: 'reboot', commandId: 'cmd-456' }),
          ])
        );
      });
    });

    describe('logApiKeyRegenerated', () => {
      it('should log API key regeneration', async () => {
        const mockReq = { headers: {}, socket: {}, user: { id: 'admin-1' } } as unknown as AuthRequest;

        await auditService.logApiKeyRegenerated('site-123', mockReq);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO audit_logs'),
          expect.arrayContaining([
            'API_KEY_REGENERATED',
            'admin-1',
            'site',
            'site-123',
          ])
        );
      });
    });
  });

  describe('ensureTable', () => {
    it('should create table and indexes on first call', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      (auditService as any).tableChecked = false;

      await auditService.log({ action: 'USER_LOGIN' });

      // Should have called CREATE TABLE
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS audit_logs')
      );

      // Should have created indexes
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_audit_logs_action')
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_audit_logs_user')
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_audit_logs_date')
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_audit_logs_target')
      );
    });

    it('should not recreate table on subsequent calls', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      (auditService as any).tableChecked = true;

      await auditService.log({ action: 'USER_LOGIN' });
      await auditService.log({ action: 'USER_LOGOUT' });

      // CREATE TABLE should not be called
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE'),
        expect.anything()
      );
    });

    it('should handle table creation error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Permission denied'));
      (auditService as any).tableChecked = false;

      // Should not throw, but log error
      await auditService.log({ action: 'USER_LOGIN' });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create audit_logs table:',
        expect.any(Error)
      );
    });
  });

  describe('AuditAction types', () => {
    const allActions: AuditAction[] = [
      'USER_LOGIN',
      'USER_LOGOUT',
      'USER_CREATED',
      'USER_UPDATED',
      'USER_DELETED',
      'SITE_CREATED',
      'SITE_UPDATED',
      'SITE_DELETED',
      'API_KEY_REGENERATED',
      'VIDEO_UPLOADED',
      'VIDEO_DELETED',
      'VIDEO_DEPLOYED',
      'CONFIG_PUSHED',
      'COMMAND_SENT',
      'GROUP_CREATED',
      'GROUP_UPDATED',
      'GROUP_DELETED',
      'SETTINGS_UPDATED',
    ];

    it.each(allActions)('should accept %s as valid action', async (action) => {
      mockQuery.mockResolvedValue({ rows: [] });
      (auditService as any).tableChecked = true;

      await auditService.log({ action });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([action])
      );
    });
  });
});
