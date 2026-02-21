/**
 * Sponsor Alerts Routes (F-AUD-07)
 *
 * Endpoints for the advertiser health matrix and proactive alert checks.
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { authenticate, requireRole } from '../middleware/auth';
import { AuthRequest } from '../types';
import { sponsorAlertService } from '../services/sponsor-alert.service';
import { metricsService } from '../services/metrics.service';
import logger from '../config/logger';

const router = Router();

// --------------------------------------------------------------------------
// Validation schemas
// --------------------------------------------------------------------------

const healthQuerySchema = Joi.object({
  advertiserId: Joi.string().uuid().optional(),
  warningThresholdDaily: Joi.number().integer().min(0).max(1000).optional(),
  criticalThresholdDays: Joi.number().integer().min(1).max(90).optional(),
}).options({ stripUnknown: true });

const checkBodySchema = Joi.object({
  warningThresholdDaily: Joi.number().integer().min(0).max(1000).optional(),
  criticalThresholdDays: Joi.number().integer().min(1).max(90).optional(),
}).options({ stripUnknown: true });

const advertiserIdParamSchema = Joi.object({
  advertiserId: Joi.string().uuid().required(),
}).options({ allowUnknown: true });

// --------------------------------------------------------------------------
// Validation middleware helpers
// --------------------------------------------------------------------------

function validateQuery(schema: Joi.ObjectSchema) {
  return (req: AuthRequest, res: Response, next: () => void) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false });
    if (error) {
      const details = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
      logger.warn('Sponsor alert validation error (query)', { details, path: req.path });
      return res.status(400).json({ error: 'Parametres invalides', details });
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
      (req.query as Record<string, unknown>)[key] = (value as Record<string, unknown>)[key];
    }
    return next();
  };
}

function validateBody(schema: Joi.ObjectSchema) {
  return (req: AuthRequest, res: Response, next: () => void) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const details = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
      logger.warn('Sponsor alert validation error (body)', { details, path: req.path });
      return res.status(400).json({ error: 'Donnees invalides', details });
    }
    req.body = value;
    return next();
  };
}

function validateParams(schema: Joi.ObjectSchema) {
  return (req: AuthRequest, res: Response, next: () => void) => {
    const { error } = schema.validate(req.params, { abortEarly: false, allowUnknown: true });
    if (error) {
      const details = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
      logger.warn('Sponsor alert validation error (params)', { details, path: req.path });
      return res.status(400).json({ error: 'Parametres de route invalides', details });
    }
    return next();
  };
}

// --------------------------------------------------------------------------
// GET /api/sponsor-alerts/health
// Returns the full health matrix (all advertisers x sites)
// --------------------------------------------------------------------------
router.get(
  '/health',
  authenticate,
  requireRole('operator'),
  validateQuery(healthQuerySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { advertiserId, warningThresholdDaily, criticalThresholdDays } = req.query;

      // Apply per-request threshold overrides if provided
      if (warningThresholdDaily !== undefined || criticalThresholdDays !== undefined) {
        sponsorAlertService.configure({
          warningThresholdDaily: warningThresholdDaily !== undefined
            ? Number(warningThresholdDaily)
            : undefined,
          criticalThresholdDays: criticalThresholdDays !== undefined
            ? Number(criticalThresholdDays)
            : undefined,
        });
      }

      const matrix = await sponsorAlertService.getSponsorHealth(
        advertiserId as string | undefined
      );

      return res.json({
        success: true,
        data: matrix,
      });
    } catch (error) {
      logger.error('Error fetching sponsor health matrix', { error });
      return res.status(500).json({ error: 'Erreur lors de la recuperation de la matrice de sante' });
    }
  }
);

// --------------------------------------------------------------------------
// GET /api/sponsor-alerts/health/:advertiserId
// Returns health matrix filtered for a single advertiser
// --------------------------------------------------------------------------
router.get(
  '/health/:advertiserId',
  authenticate,
  requireRole('operator'),
  validateParams(advertiserIdParamSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { advertiserId } = req.params;
      const matrix = await sponsorAlertService.getSponsorHealth(advertiserId);

      return res.json({
        success: true,
        data: matrix,
      });
    } catch (error) {
      logger.error('Error fetching sponsor health for advertiser', {
        error,
        advertiserId: req.params.advertiserId,
      });
      return res.status(500).json({ error: 'Erreur lors de la recuperation de la sante annonceur' });
    }
  }
);

// --------------------------------------------------------------------------
// GET /api/sponsor-alerts/config
// Returns current alert thresholds
// --------------------------------------------------------------------------
router.get(
  '/config',
  authenticate,
  requireRole('admin'),
  (_req: AuthRequest, res: Response) => {
    return res.json({
      success: true,
      data: sponsorAlertService.getConfig(),
    });
  }
);

// --------------------------------------------------------------------------
// POST /api/sponsor-alerts/check
// Manual trigger for the alert check (admin only)
// --------------------------------------------------------------------------
router.post(
  '/check',
  authenticate,
  requireRole('admin'),
  validateBody(checkBodySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { warningThresholdDaily, criticalThresholdDays } = req.body as {
        warningThresholdDaily?: number;
        criticalThresholdDays?: number;
      };

      // Apply overrides if provided
      if (warningThresholdDaily !== undefined || criticalThresholdDays !== undefined) {
        sponsorAlertService.configure({
          warningThresholdDaily,
          criticalThresholdDays,
        });
      }

      const startTime = Date.now();
      const result = await sponsorAlertService.checkAlerts();
      const durationSeconds = (Date.now() - startTime) / 1000;

      // Record Prometheus metrics for sponsor health monitoring
      const matrix = await sponsorAlertService.getSponsorHealth();
      metricsService.recordSponsorHealthCheck(
        'manual',
        matrix.summary.healthy,
        matrix.summary.warning,
        matrix.summary.critical,
        result.created,
        durationSeconds,
      );

      logger.info('Manual sponsor alert check triggered', {
        userId: req.user?.id,
        result,
        durationSeconds,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error running sponsor alert check', { error });
      return res.status(500).json({ error: 'Erreur lors de la verification des alertes sponsor' });
    }
  }
);

export default router;
