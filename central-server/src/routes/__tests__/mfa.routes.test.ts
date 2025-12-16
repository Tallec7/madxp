/**
 * Tests d'intégration pour les routes MFA
 *
 * @module mfa.routes.test
 */

// Mock dependencies BEFORE any imports
const mockMfaService = {
  isMfaEnabled: jest.fn(),
  setupMfa: jest.fn(),
  enableMfa: jest.fn(),
  disableMfa: jest.fn(),
  verifyMfaLogin: jest.fn(),
  regenerateBackupCodes: jest.fn(),
};

jest.mock('../../services/mfa.service', () => ({
  mfaService: mockMfaService,
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
import mfaRoutes from '../mfa.routes';

describe('MFA Routes', () => {
  let app: Express;
  const adminToken = generateToken({ id: 'admin-1', email: 'admin@example.com', role: 'admin' });
  const operatorToken = generateToken({ id: 'operator-1', email: 'operator@example.com', role: 'operator' });
  const viewerToken = generateToken({ id: 'viewer-1', email: 'viewer@example.com', role: 'viewer' });

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mfa', mfaRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/mfa/status', () => {
    it('should return MFA status for authenticated user', async () => {
      mockMfaService.isMfaEnabled.mockResolvedValue(true);

      const response = await request(app)
        .get('/api/mfa/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        enabled: true,
        required: true, // Admin role requires MFA
      });
      expect(mockMfaService.isMfaEnabled).toHaveBeenCalledWith('admin-1');
    });

    it('should return MFA not required for non-admin', async () => {
      mockMfaService.isMfaEnabled.mockResolvedValue(false);

      const response = await request(app)
        .get('/api/mfa/status')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        enabled: false,
        required: false, // Operator role doesn't require MFA
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/mfa/status');

      expect(response.status).toBe(401);
    });

    it('should return 500 on service error', async () => {
      mockMfaService.isMfaEnabled.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/mfa/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Erreur');
    });
  });

  describe('POST /api/mfa/setup', () => {
    it('should setup MFA for admin', async () => {
      mockMfaService.setupMfa.mockResolvedValue({
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeDataUrl: 'data:image/png;base64,qrcode',
        manualEntryKey: 'JBSW Y3DP EHPK 3PXP',
        backupCodes: ['ABCD-1234', 'EFGH-5678'],
      });

      const response = await request(app)
        .post('/api/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.qrCodeDataUrl).toBeDefined();
      expect(response.body.manualEntryKey).toBeDefined();
      expect(response.body.backupCodes).toHaveLength(2);
      expect(response.body.message).toContain('Scannez');
    });

    it('should setup MFA for operator', async () => {
      mockMfaService.setupMfa.mockResolvedValue({
        secret: 'SECRET',
        qrCodeDataUrl: 'data:image/png;base64,qrcode',
        manualEntryKey: 'SECR ET',
        backupCodes: [],
      });

      const response = await request(app)
        .post('/api/mfa/setup')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(200);
    });

    it('should reject setup for viewer role', async () => {
      const response = await request(app)
        .post('/api/mfa/setup')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 400 if MFA already enabled', async () => {
      mockMfaService.setupMfa.mockRejectedValue(new Error('MFA déjà activé pour cet utilisateur'));

      const response = await request(app)
        .post('/api/mfa/setup')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('MFA déjà activé');
    });
  });

  describe('POST /api/mfa/enable', () => {
    it('should enable MFA with valid code', async () => {
      mockMfaService.enableMfa.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/mfa/enable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: '123456' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('MFA activé');
      expect(mockMfaService.enableMfa).toHaveBeenCalledWith('admin-1', '123456');
    });

    it('should return 400 for invalid code format', async () => {
      const response = await request(app)
        .post('/api/mfa/enable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: '12345' }); // 5 digits instead of 6

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('6 chiffres');
    });

    it('should return 400 for missing code', async () => {
      const response = await request(app)
        .post('/api/mfa/enable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 400 for incorrect code', async () => {
      mockMfaService.enableMfa.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/mfa/enable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: '000000' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('incorrect');
    });

    it('should reject for viewer role', async () => {
      const response = await request(app)
        .post('/api/mfa/enable')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ code: '123456' });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/mfa/disable', () => {
    it('should disable MFA with valid code', async () => {
      mockMfaService.disableMfa.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/mfa/disable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: '123456' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('désactivé');
    });

    it('should return 400 for missing code', async () => {
      const response = await request(app)
        .post('/api/mfa/disable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('requis');
    });

    it('should return 400 for incorrect code', async () => {
      mockMfaService.disableMfa.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/mfa/disable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: '000000' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('incorrect');
    });

    it('should return 400 if MFA not enabled', async () => {
      mockMfaService.disableMfa.mockRejectedValue(new Error('MFA non activé'));

      const response = await request(app)
        .post('/api/mfa/disable')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: '123456' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('MFA non activé');
    });
  });

  describe('POST /api/mfa/verify', () => {
    it('should verify valid MFA code', async () => {
      mockMfaService.verifyMfaLogin.mockResolvedValue({ valid: true });

      const response = await request(app)
        .post('/api/mfa/verify')
        .send({ userId: 'user-123', code: '123456' });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.message).toContain('vérifié');
    });

    it('should return 401 for invalid code', async () => {
      mockMfaService.verifyMfaLogin.mockResolvedValue({ valid: false, reason: 'Code invalide' });

      const response = await request(app)
        .post('/api/mfa/verify')
        .send({ userId: 'user-123', code: '000000' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('invalide');
    });

    it('should return 400 for missing parameters', async () => {
      const response = await request(app)
        .post('/api/mfa/verify')
        .send({ userId: 'user-123' }); // Missing code

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('requis');
    });

    it('should return 500 on service error', async () => {
      mockMfaService.verifyMfaLogin.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/mfa/verify')
        .send({ userId: 'user-123', code: '123456' });

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/mfa/backup-codes/regenerate', () => {
    it('should regenerate backup codes with valid TOTP', async () => {
      const newBackupCodes = ['NEW1-CODE', 'NEW2-CODE', 'NEW3-CODE'];
      mockMfaService.regenerateBackupCodes.mockResolvedValue(newBackupCodes);

      const response = await request(app)
        .post('/api/mfa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: '123456' });

      expect(response.status).toBe(200);
      expect(response.body.backupCodes).toEqual(newBackupCodes);
      expect(response.body.message).toContain('Nouveaux codes');
    });

    it('should return 400 for missing code', async () => {
      const response = await request(app)
        .post('/api/mfa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('requis');
    });

    it('should return 400 for invalid TOTP', async () => {
      mockMfaService.regenerateBackupCodes.mockRejectedValue(new Error('Code TOTP invalide'));

      const response = await request(app)
        .post('/api/mfa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: '000000' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('invalide');
    });

    it('should reject for viewer role', async () => {
      const response = await request(app)
        .post('/api/mfa/backup-codes/regenerate')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ code: '123456' });

      expect(response.status).toBe(403);
    });
  });
});
