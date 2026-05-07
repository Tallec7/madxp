import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

/**
 * Audit P1 #8 — Request timeout middleware.
 *
 * Bounds how long a single HTTP request can keep the connection open before
 * the server replies with a clean 408. Used in front of multer-heavy routes
 * (Template Studio uploads) where a 200 MB WebM behind a flaky uplink would
 * otherwise hang the connection and exhaust Railway HTTP slots.
 *
 * Implementation notes :
 *   - We use a JS `setTimeout` (NOT `req.setTimeout`) so we control the
 *     response shape. `req.setTimeout` aborts the socket without writing a
 *     status line — the dashboard gets `ERR_NETWORK` instead of HTTP 408.
 *   - The timer is cleared on `res.finish` / `res.close` to avoid leaking.
 *   - If headers are already flushed (large streamed response in progress),
 *     we DO NOT re-write the body — just log + destroy the socket so the
 *     client unblocks. This guards against `Cannot set headers after they
 *     are sent`.
 *   - Logger Winston `warn` with `{ method, path, timeoutMs }` so a spike
 *     surfaces in Logtail / Grafana logs panel.
 */
export function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      logger.warn('Request timeout fired', {
        method: req.method,
        path: req.path,
        timeoutMs: ms,
      });
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request Timeout',
          code: 'REQUEST_TIMEOUT',
          message: 'Upload trop long, vérifie ta connexion',
        });
      } else {
        // Headers already flushed — destroy the socket so the client unblocks.
        try {
          req.socket.destroy();
        } catch {
          // non-bloquant
        }
      }
    }, ms);

    const cleanup = (): void => {
      clearTimeout(timer);
    };
    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
  };
}
