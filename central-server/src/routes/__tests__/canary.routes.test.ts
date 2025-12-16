/**
 * Tests d'intégration pour les routes de déploiement canary
 *
 * @module canary.routes.test
 */

// Mock dependencies BEFORE any imports
const mockCanaryService = {
  createCanaryDeployment: jest.fn(),
  startCanaryPhase: jest.fn(),
  advanceToNextPhase: jest.fn(),
  rollback: jest.fn(),
  getActiveDeployments: jest.fn(),
  getCanaryDeployment: jest.fn(),
  getMetrics: jest.fn(),
  updateSiteStatus: jest.fn(),
};

jest.mock('../../services/canary-deployment.service', () => ({
  canaryDeploymentService: mockCanaryService,
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
import canaryRoutes from '../canary.routes';

describe('Canary Routes', () => {
  let app: Express;
  const adminToken = generateToken({ id: 'admin-1', email: 'admin@example.com', role: 'admin' });
  const operatorToken = generateToken({ id: 'operator-1', email: 'operator@example.com', role: 'operator' });
  const viewerToken = generateToken({ id: 'viewer-1', email: 'viewer@example.com', role: 'viewer' });

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/canary', canaryRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/canary/deployments', () => {
    const validPayload = {
      deploymentType: 'content',
      resourceId: 'video-123',
      targetType: 'group',
      targetId: 'group-456',
    };

    it('should create canary deployment for admin', async () => {
      mockCanaryService.createCanaryDeployment.mockResolvedValue({
        id: 'canary-123',
        canarySites: ['site-1', 'site-2'],
      });

      const response = await request(app)
        .post('/api/canary/deployments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPayload);

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('canary-123');
      expect(response.body.canarySites).toHaveLength(2);
      expect(response.body.message).toContain('/start');
      expect(mockCanaryService.createCanaryDeployment).toHaveBeenCalledWith(
        'content',
        'video-123',
        'group',
        'group-456',
        'admin-1',
        undefined
      );
    });

    it('should create canary deployment for operator', async () => {
      mockCanaryService.createCanaryDeployment.mockResolvedValue({
        id: 'canary-123',
        canarySites: ['site-1'],
      });

      const response = await request(app)
        .post('/api/canary/deployments')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(validPayload);

      expect(response.status).toBe(201);
    });

    it('should reject for viewer role', async () => {
      const response = await request(app)
        .post('/api/canary/deployments')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(validPayload);

      expect(response.status).toBe(403);
    });

    it('should accept custom configuration', async () => {
      mockCanaryService.createCanaryDeployment.mockResolvedValue({
        id: 'canary-123',
        canarySites: ['site-1', 'site-2', 'site-3', 'site-4'],
      });

      const payload = {
        ...validPayload,
        config: {
          canaryPercentage: 20,
          successThreshold: 90,
          autoAdvance: false,
        },
      };

      const response = await request(app)
        .post('/api/canary/deployments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(response.status).toBe(201);
      expect(mockCanaryService.createCanaryDeployment).toHaveBeenCalledWith(
        'content',
        'video-123',
        'group',
        'group-456',
        'admin-1',
        payload.config
      );
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/canary/deployments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ deploymentType: 'content' }); // Missing other fields

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('requis');
    });

    it('should return 400 for invalid deploymentType', async () => {
      const response = await request(app)
        .post('/api/canary/deployments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validPayload, deploymentType: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('deploymentType');
    });

    it('should return 400 for invalid targetType', async () => {
      const response = await request(app)
        .post('/api/canary/deployments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validPayload, targetType: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('targetType');
    });

    it('should return 400 on service error', async () => {
      mockCanaryService.createCanaryDeployment.mockRejectedValue(
        new Error('Aucun site cible trouvé')
      );

      const response = await request(app)
        .post('/api/canary/deployments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPayload);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Aucun site');
    });
  });

  describe('POST /api/canary/deployments/:id/start', () => {
    it('should start canary phase', async () => {
      mockCanaryService.startCanaryPhase.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/canary/deployments/canary-123/start')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('canary démarrée');
      expect(mockCanaryService.startCanaryPhase).toHaveBeenCalledWith('canary-123');
    });

    it('should return 400 if deployment not found', async () => {
      mockCanaryService.startCanaryPhase.mockRejectedValue(
        new Error('Déploiement canary non trouvé')
      );

      const response = await request(app)
        .post('/api/canary/deployments/nonexistent/start')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
    });

    it('should reject for viewer role', async () => {
      const response = await request(app)
        .post('/api/canary/deployments/canary-123/start')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/canary/deployments/:id/advance', () => {
    it('should advance to next phase', async () => {
      mockCanaryService.advanceToNextPhase.mockResolvedValue({ advanced: true });

      const response = await request(app)
        .post('/api/canary/deployments/canary-123/advance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('phase suivante');
    });

    it('should return 400 if cannot advance', async () => {
      mockCanaryService.advanceToNextPhase.mockResolvedValue({
        advanced: false,
        reason: 'Taux de succès insuffisant',
      });

      const response = await request(app)
        .post('/api/canary/deployments/canary-123/advance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Impossible d'avancer");
      expect(response.body.reason).toContain('Taux de succès');
    });
  });

  describe('POST /api/canary/deployments/:id/rollback', () => {
    it('should rollback deployment', async () => {
      mockCanaryService.rollback.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/canary/deployments/canary-123/rollback')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Manual rollback' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Rollback effectué');
      expect(mockCanaryService.rollback).toHaveBeenCalledWith('canary-123', 'Manual rollback');
    });

    it('should use default reason if not provided', async () => {
      mockCanaryService.rollback.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/canary/deployments/canary-123/rollback')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(mockCanaryService.rollback).toHaveBeenCalledWith('canary-123', 'Rollback manuel');
    });

    it('should return 400 on error', async () => {
      mockCanaryService.rollback.mockRejectedValue(new Error('Deployment not found'));

      const response = await request(app)
        .post('/api/canary/deployments/nonexistent/rollback')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/canary/deployments', () => {
    it('should return active deployments', async () => {
      const mockDeployments = [
        {
          id: 'canary-1',
          deploymentType: 'content',
          currentPhase: 'gradual',
          metrics: { totalSites: 10, successRate: 95 },
        },
        {
          id: 'canary-2',
          deploymentType: 'update',
          currentPhase: 'canary',
          metrics: { totalSites: 5, successRate: 100 },
        },
      ];

      mockCanaryService.getActiveDeployments.mockResolvedValue(mockDeployments);

      const response = await request(app)
        .get('/api/canary/deployments')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.deployments).toHaveLength(2);
    });

    it('should be accessible by all authenticated users', async () => {
      mockCanaryService.getActiveDeployments.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/canary/deployments')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
    });

    it('should return 500 on error', async () => {
      mockCanaryService.getActiveDeployments.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/canary/deployments')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/canary/deployments/:id', () => {
    it('should return deployment details', async () => {
      const mockDeployment = {
        id: 'canary-123',
        deploymentType: 'content',
        resourceId: 'video-456',
        currentPhase: 'gradual',
        currentStep: 1,
        metrics: {
          totalSites: 10,
          deployedSites: 5,
          successfulSites: 5,
          failedSites: 0,
          pendingSites: 5,
          successRate: 100,
        },
      };

      mockCanaryService.getCanaryDeployment.mockResolvedValue(mockDeployment);

      const response = await request(app)
        .get('/api/canary/deployments/canary-123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.deployment).toEqual(mockDeployment);
    });

    it('should return 404 if not found', async () => {
      mockCanaryService.getCanaryDeployment.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/canary/deployments/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('non trouvé');
    });
  });

  describe('GET /api/canary/deployments/:id/metrics', () => {
    it('should return deployment metrics', async () => {
      const mockMetrics = {
        totalSites: 20,
        deployedSites: 15,
        successfulSites: 14,
        failedSites: 1,
        pendingSites: 5,
        successRate: 93.33,
      };

      mockCanaryService.getMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/api/canary/deployments/canary-123/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.metrics).toEqual(mockMetrics);
    });

    it('should return 500 on error', async () => {
      mockCanaryService.getMetrics.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/canary/deployments/canary-123/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(500);
    });
  });

  describe('PUT /api/canary/deployments/:id/site/:siteId/status', () => {
    it('should update site status to deployed', async () => {
      mockCanaryService.updateSiteStatus.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/canary/deployments/canary-123/site/site-456/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'deployed' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Statut mis à jour');
      expect(mockCanaryService.updateSiteStatus).toHaveBeenCalledWith(
        'canary-123',
        'site-456',
        'deployed',
        undefined
      );
    });

    it('should update site status to failed with error message', async () => {
      mockCanaryService.updateSiteStatus.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/canary/deployments/canary-123/site/site-456/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'failed', errorMessage: 'Download timeout' });

      expect(response.status).toBe(200);
      expect(mockCanaryService.updateSiteStatus).toHaveBeenCalledWith(
        'canary-123',
        'site-456',
        'failed',
        'Download timeout'
      );
    });

    it('should return 400 for invalid status', async () => {
      const response = await request(app)
        .put('/api/canary/deployments/canary-123/site/site-456/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('invalide');
    });

    it('should return 500 on error', async () => {
      mockCanaryService.updateSiteStatus.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .put('/api/canary/deployments/canary-123/site/site-456/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'deployed' });

      expect(response.status).toBe(500);
    });
  });
});
