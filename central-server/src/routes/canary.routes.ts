/**
 * Routes pour les déploiements canary (progressifs)
 */

import { Router, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { AuthRequest } from '../types';
import { canaryDeploymentService } from '../services/canary-deployment.service';
import logger from '../config/logger';

const router = Router();

/**
 * POST /api/canary/deployments
 * Crée un nouveau déploiement canary
 */
router.post(
  '/deployments',
  authenticate,
  requireRole('admin', 'operator'),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        deploymentType,
        resourceId,
        targetType,
        targetId,
        config,
      } = req.body as {
        deploymentType: 'content' | 'update';
        resourceId: string;
        targetType: 'site' | 'group';
        targetId: string;
        config?: {
          canaryPercentage?: number;
          gradualSteps?: number[];
          stabilityPeriodMs?: number;
          successThreshold?: number;
          autoAdvance?: boolean;
        };
      };

      if (!deploymentType || !resourceId || !targetType || !targetId) {
        return res.status(400).json({
          error: 'Paramètres requis: deploymentType, resourceId, targetType, targetId',
        });
      }

      if (!['content', 'update'].includes(deploymentType)) {
        return res.status(400).json({
          error: 'deploymentType doit être "content" ou "update"',
        });
      }

      if (!['site', 'group'].includes(targetType)) {
        return res.status(400).json({
          error: 'targetType doit être "site" ou "group"',
        });
      }

      const result = await canaryDeploymentService.createCanaryDeployment(
        deploymentType,
        resourceId,
        targetType,
        targetId,
        req.user!.id,
        config
      );

      res.status(201).json({
        id: result.id,
        canarySites: result.canarySites,
        message: 'Déploiement canary créé. Appelez /start pour démarrer.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors de la création';
      logger.error('Create canary deployment error:', error);
      res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/canary/deployments/:id/start
 * Démarre la phase canary d'un déploiement
 */
router.post(
  '/deployments/:id/start',
  authenticate,
  requireRole('admin', 'operator'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      await canaryDeploymentService.startCanaryPhase(id);

      res.json({
        message: 'Phase canary démarrée',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors du démarrage';
      logger.error('Start canary phase error:', error);
      res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/canary/deployments/:id/advance
 * Force l'avancement vers la phase suivante
 */
router.post(
  '/deployments/:id/advance',
  authenticate,
  requireRole('admin', 'operator'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const result = await canaryDeploymentService.advanceToNextPhase(id);

      if (result.advanced) {
        res.json({ message: 'Avancé vers la phase suivante' });
      } else {
        res.status(400).json({
          error: 'Impossible d\'avancer',
          reason: result.reason,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'avancement';
      logger.error('Advance canary phase error:', error);
      res.status(400).json({ error: message });
    }
  }
);

/**
 * POST /api/canary/deployments/:id/rollback
 * Effectue un rollback du déploiement
 */
router.post(
  '/deployments/:id/rollback',
  authenticate,
  requireRole('admin', 'operator'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason?: string };

      await canaryDeploymentService.rollback(
        id,
        reason || 'Rollback manuel'
      );

      res.json({ message: 'Rollback effectué' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors du rollback';
      logger.error('Rollback canary deployment error:', error);
      res.status(400).json({ error: message });
    }
  }
);

/**
 * GET /api/canary/deployments
 * Liste les déploiements canary actifs
 */
router.get(
  '/deployments',
  authenticate,
  async (_req: AuthRequest, res: Response) => {
    try {
      const deployments = await canaryDeploymentService.getActiveDeployments();

      res.json({ deployments });
    } catch (error) {
      logger.error('Get active canary deployments error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des déploiements' });
    }
  }
);

/**
 * GET /api/canary/deployments/:id
 * Récupère les détails d'un déploiement canary
 */
router.get(
  '/deployments/:id',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const deployment = await canaryDeploymentService.getCanaryDeployment(id);

      if (!deployment) {
        return res.status(404).json({ error: 'Déploiement canary non trouvé' });
      }

      res.json({ deployment });
    } catch (error) {
      logger.error('Get canary deployment error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération du déploiement' });
    }
  }
);

/**
 * GET /api/canary/deployments/:id/metrics
 * Récupère les métriques d'un déploiement canary
 */
router.get(
  '/deployments/:id/metrics',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const metrics = await canaryDeploymentService.getMetrics(id);

      res.json({ metrics });
    } catch (error) {
      logger.error('Get canary metrics error:', error);
      res.status(500).json({ error: 'Erreur lors de la récupération des métriques' });
    }
  }
);

/**
 * PUT /api/canary/deployments/:id/site/:siteId/status
 * Met à jour le statut d'un site (appelé par le callback de déploiement)
 */
router.put(
  '/deployments/:id/site/:siteId/status',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id, siteId } = req.params;
      const { status, errorMessage } = req.body as {
        status: 'deployed' | 'failed';
        errorMessage?: string;
      };

      if (!['deployed', 'failed'].includes(status)) {
        return res.status(400).json({ error: 'Status invalide' });
      }

      await canaryDeploymentService.updateSiteStatus(
        id,
        siteId,
        status,
        errorMessage
      );

      res.json({ message: 'Statut mis à jour' });
    } catch (error) {
      logger.error('Update site status error:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour du statut' });
    }
  }
);

export default router;
