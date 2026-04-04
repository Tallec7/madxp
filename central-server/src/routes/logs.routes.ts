import express from 'express';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';
import { ingestFrontendLog } from '../controllers/logs.controller';

const router = express.Router();

/**
 * Frontend Log Ingestion Routes
 *
 * Receives logs from the central-dashboard Angular app
 * and forwards them to the backend logging system (Winston/Logtail)
 */

/**
 * POST /api/logs/frontend
 *
 * Ingest a log entry from the frontend application.
 * Requires authentication to associate logs with user context.
 *
 * @body {string} level - Log level (debug, info, warn, error)
 * @body {string} message - Log message
 * @body {object} [context] - Additional context data
 * @body {string} [timestamp] - Client-side timestamp
 * @body {string} [userAgent] - Browser user agent
 * @body {string} [url] - Current page URL
 * @body {object[]} [breadcrumbs] - User journey breadcrumbs (for errors)
 */
router.post('/frontend', authenticate, validate(schemas.frontendLog), ingestFrontendLog);

export default router;
