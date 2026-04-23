/**
 * ADR-088 — Scoreboard live routes (F-15.2 SaaS-first).
 *
 * Mount : app.use('/api/scoreboard', scoreboardRoutes)
 */

import { Router } from 'express';
import { authenticate, authenticateSiteApiKey, requireRole } from '../middleware/auth';
import { validate, validateParams, paramSchemas } from '../middleware/validation';
import { remoteRateLimit, apiRateLimit, scoreboardPushRateLimit } from '../middleware/user-rate-limit';
import { scoreboardStateSchema } from '../validators/scoreboard.validator';
import {
  postScoreboardState,
  postScoreboardStateManual,
  getScoreboardState,
} from '../controllers/scoreboard.controller';

const router = Router();

// Pi / sim pushes the decoded match state every ~200ms.
router.post(
  '/:siteId/state',
  remoteRateLimit,
  authenticateSiteApiKey,
  validateParams(paramSchemas.siteId),
  validate(scoreboardStateSchema),
  postScoreboardState
);

// F-15.2 Phase 2 — manual push depuis le dashboard (simulateur Table de marque).
// Auth JWT + requireRole gère le scope club → son propre site uniquement.
router.post(
  '/:siteId/state-manual',
  scoreboardPushRateLimit,
  authenticate,
  requireRole('admin', 'operator', 'club'),
  validateParams(paramSchemas.siteId),
  validate(scoreboardStateSchema),
  postScoreboardStateManual
);

// Dashboard hydration (JWT) — returns last cached state on overlay load.
router.get(
  '/:siteId/state',
  apiRateLimit,
  authenticate,
  validateParams(paramSchemas.siteId),
  getScoreboardState
);

export default router;
