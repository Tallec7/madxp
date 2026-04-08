/**
 * Client Errors Routes
 *
 * Endpoint public léger pour capturer les erreurs JavaScript côté client
 * (dashboard, portail club, SaaS). Rate-limité, logué via Winston.
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { remoteRateLimit } from '../middleware/user-rate-limit';
import logger from '../config/logger';

const router = Router();

const schema = Joi.object({
  message: Joi.string().max(1000).required(),
  source: Joi.string().max(100).required(), // 'dashboard' | 'club-portal' | 'saas-tv' | 'saas-remote'
  url: Joi.string().uri().allow('').max(2000).optional(),
  stack: Joi.string().allow('').max(4000).optional(),
  siteId: Joi.string().uuid().optional(),
  version: Joi.string().max(32).optional(),
  userAgent: Joi.string().max(500).optional(),
  context: Joi.object().optional(),
});

router.post('/', remoteRateLimit, (req: Request, res: Response) => {
  const { error, value } = schema.validate(req.body, { stripUnknown: true });
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  logger.warn('Client error reported', {
    source: value.source,
    message: value.message,
    siteId: value.siteId,
    version: value.version,
    url: value.url,
    userAgent: value.userAgent ?? req.get('user-agent'),
    stack: value.stack,
    context: value.context,
    ip: req.ip,
  });

  res.status(204).end();
});

export default router;
