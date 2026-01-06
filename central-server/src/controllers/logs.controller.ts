import { Response, NextFunction } from 'express';
import { getRequestLogger } from '../config/logger';
import { CorrelationRequest } from '../middleware/correlation';
import { AuthRequest } from '../types';

/**
 * Frontend log entry structure
 */
interface FrontendLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
  timestamp?: string;
  userAgent?: string;
  url?: string;
  breadcrumbs?: Array<{
    timestamp: string;
    type: 'navigation' | 'action' | 'error' | 'http';
    message: string;
    data?: Record<string, unknown>;
  }>;
}

/**
 * Valid log levels for validation
 */
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/**
 * Ingest frontend log entry
 *
 * Receives logs from the Angular dashboard and forwards them
 * to the backend logging system with enriched context.
 *
 * This enables:
 * - Frontend error tracking in production
 * - Correlation between frontend and backend logs
 * - User journey tracking via breadcrumbs
 */
export const ingestFrontendLog = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const correlationReq = req as CorrelationRequest;
    const logger = getRequestLogger(correlationReq);
    const logEntry = req.body as FrontendLogEntry;

    // Validate required fields
    if (!logEntry.message || typeof logEntry.message !== 'string') {
      res.status(400).json({ error: 'Missing or invalid message field' });
      return;
    }

    if (!logEntry.level || !VALID_LOG_LEVELS.includes(logEntry.level)) {
      res.status(400).json({
        error: 'Missing or invalid level field',
        validLevels: VALID_LOG_LEVELS,
      });
      return;
    }

    // Build enriched log context
    const enrichedContext = {
      source: 'frontend',
      // Frontend context
      frontend: {
        timestamp: logEntry.timestamp,
        userAgent: logEntry.userAgent,
        url: logEntry.url,
      },
      // User context from auth
      user: {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role,
      },
      // Additional context from client
      ...logEntry.context,
    };

    // Include breadcrumbs for error logs
    if (logEntry.level === 'error' && logEntry.breadcrumbs?.length) {
      (enrichedContext as Record<string, unknown>).breadcrumbs = logEntry.breadcrumbs;
    }

    // Log with appropriate level
    const logMessage = `[FRONTEND] ${logEntry.message}`;

    switch (logEntry.level) {
      case 'debug':
        logger.debug(logMessage, enrichedContext);
        break;
      case 'info':
        logger.info(logMessage, enrichedContext);
        break;
      case 'warn':
        logger.warn(logMessage, enrichedContext);
        break;
      case 'error':
        logger.error(logMessage, enrichedContext);
        break;
    }

    // Return 204 No Content (fire and forget from client perspective)
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
