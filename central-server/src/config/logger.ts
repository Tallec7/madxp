import winston from 'winston';
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';
import { CorrelationRequest } from '../middleware/correlation';
import { AuthRequest } from '../types';

const logLevel = process.env.LOG_LEVEL || 'info';

// Initialize Logtail if token is provided
let logtail: Logtail | null = null;
if (process.env.LOGTAIL_TOKEN) {
  logtail = new Logtail(process.env.LOGTAIL_TOKEN);
}

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'neopro-central' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaString}`;
        })
      ),
    }),
  ],
});

/**
 * Create a child logger with request context
 *
 * Use this in controllers and services to automatically include
 * correlation ID and user context in all log entries.
 *
 * @example
 * const log = getRequestLogger(req);
 * log.info('Processing request', { siteId: '123' });
 * // Output: { correlationId: 'abc', userId: 'xyz', siteId: '123', ... }
 */
export function getRequestLogger(req: AuthRequest): winston.Logger {
  const correlationReq = req as CorrelationRequest;

  return logger.child({
    correlationId: correlationReq.correlationId || 'no-correlation-id',
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
  });
}

/**
 * Log context builder for non-request contexts (e.g., cron jobs, socket handlers)
 *
 * @example
 * const log = createContextLogger({ jobName: 'dailyStats', correlationId: uuid() });
 * log.info('Starting daily stats calculation');
 */
export function createContextLogger(context: Record<string, unknown>): winston.Logger {
  return logger.child(context);
}

// Add Logtail transport in production if configured
if (process.env.NODE_ENV === 'production') {
  // File transports REMOVED - Railway has no persistent disk,
  // file buffers waste ~8MB of memory for logs that are lost on redeploy.
  // All logs go to console (captured by Railway) + Logtail (if configured).

  // Logtail transport for centralized logging
  if (logtail) {
    logger.add(new LogtailTransport(logtail));
    logger.info('Logtail transport initialized');
  }
}

export default logger;
export { logtail };
