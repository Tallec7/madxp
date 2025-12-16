/**
 * Tests d'intégration pour les routes d'audit
 *
 * @module audit.routes.test
 */

// Mock dependencies BEFORE any imports
const mockAuditService = {
  getLogs: jest.fn(),
};

jest.mock('../../services/audit.service', () => ({
  auditService: mockAuditService,
  AuditAction: {},
}));

jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock database for auth middleware
jest.mock('../../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

import request from 'supertest';
import express, { Express } from 'express';
import { generateToken } from '../../middleware/auth';
import auditRoutes from '../audit.routes';

describe('Audit Routes', () => {
  let app: Express;
  const adminToken = generateToken({ id: 'admin-1', email: 'admin@example.com', role: 'admin' });
  const operatorToken = generateToken({ id: 'operator-1', email: 'operator@example.com', role: 'operator' });

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/audit', auditRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/audit', () => {
    it('should return audit logs for admin', async () => {
      const mockLogs = [
        { id: '1', action: 'USER_LOGIN', user_email: 'user@example.com', created_at: new Date() },
        { id: '2', action: 'SITE_CREATED', user_email: 'admin@example.com', created_at: new Date() },
      ];

      mockAuditService.getLogs.mockResolvedValue({
        logs: mockLogs,
        total: 100,
        page: 1,
        totalPages: 10,
      });

      const response = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(2);
      expect(response.body.total).toBe(100);
      expect(response.body.page).toBe(1);
      expect(response.body.totalPages).toBe(10);
    });

    it('should reject access for non-admin', async () => {
      const response = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('administrateurs');
    });

    it('should apply pagination parameters', async () => {
      mockAuditService.getLogs.mockResolvedValue({
        logs: [],
        total: 0,
        page: 3,
        totalPages: 0,
      });

      const response = await request(app)
        .get('/api/audit?page=3&limit=25')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(mockAuditService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 3,
          limit: 25,
        })
      );
    });

    it('should limit max results to 100', async () => {
      mockAuditService.getLogs.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });

      const response = await request(app)
        .get('/api/audit?limit=500')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(mockAuditService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100, // Capped at 100
        })
      );
    });

    it('should apply action filter', async () => {
      mockAuditService.getLogs.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });

      const response = await request(app)
        .get('/api/audit?action=USER_LOGIN')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(mockAuditService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOGIN',
        })
      );
    });

    it('should apply userId filter', async () => {
      mockAuditService.getLogs.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });

      const response = await request(app)
        .get('/api/audit?userId=user-123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(mockAuditService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
        })
      );
    });

    it('should apply targetType filter', async () => {
      mockAuditService.getLogs.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });

      const response = await request(app)
        .get('/api/audit?targetType=site')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(mockAuditService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'site',
        })
      );
    });

    it('should apply date range filters', async () => {
      mockAuditService.getLogs.mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        totalPages: 0,
      });

      const response = await request(app)
        .get('/api/audit?startDate=2024-01-01&endDate=2024-12-31')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(mockAuditService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      );
    });

    it('should return 500 on service error', async () => {
      mockAuditService.getLogs.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Erreur');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/audit');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/audit/actions', () => {
    it('should return list of audit actions', async () => {
      const response = await request(app)
        .get('/api/audit/actions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.actions).toBeDefined();
      expect(Array.isArray(response.body.actions)).toBe(true);
      expect(response.body.actions).toContain('USER_LOGIN');
      expect(response.body.actions).toContain('SITE_CREATED');
      expect(response.body.actions).toContain('VIDEO_UPLOADED');
    });

    it('should return all expected actions', async () => {
      const expectedActions = [
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

      const response = await request(app)
        .get('/api/audit/actions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body.actions).toEqual(expect.arrayContaining(expectedActions));
      expect(response.body.actions).toHaveLength(expectedActions.length);
    });

    it('should be accessible by authenticated users', async () => {
      const response = await request(app)
        .get('/api/audit/actions')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(200);
    });
  });
});
