import { Router } from 'express';
import { authenticate, requireRole, authenticateSiteApiKey } from '../middleware/auth';
import { validateParams, paramSchemas, validate, schemas } from '../middleware/validation';
import { sensitiveRateLimit, adminRateLimit } from '../middleware/user-rate-limit';
import * as piPasswordController from '../controllers/pi-password.controller';

/**
 * ADR-132 — Routes pour la rotation OTA du mot de passe système `pi`.
 *
 * Deux familles d'endpoints :
 *   - /api/fleet/* : déclenchement par le super_admin (JWT + role)
 *   - /api/sites/* : consommation par le sync-agent Pi (api_key)
 *
 * Montage dans server.ts :
 *   app.use('/api/fleet', piPasswordFleetRouter);
 *   app.use('/api/sites', piPasswordSitesRouter);
 */

/** Router fleet — monté sur /api/fleet */
export const piPasswordFleetRouter = Router();

piPasswordFleetRouter.post(
  '/rotate-pi-password',
  authenticate,
  requireRole('super_admin'),
  sensitiveRateLimit,
  validate(schemas.rotatePiPassword),
  piPasswordController.rotateFleetPiPassword
);

/** Router sites — monté sur /api/sites */
export const piPasswordSitesRouter = Router();

piPasswordSitesRouter.get(
  '/:id/pi-system-password',
  authenticateSiteApiKey,
  adminRateLimit,
  validateParams(paramSchemas.id),
  piPasswordController.getPiSystemPassword
);

piPasswordSitesRouter.post(
  '/:id/pi-password-applied',
  authenticateSiteApiKey,
  adminRateLimit,
  validateParams(paramSchemas.id),
  piPasswordController.markPiPasswordApplied
);
