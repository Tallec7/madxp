/**
 * Route GET /preview.mjpeg — multipart/x-mixed-replace JPEG stream.
 *
 * Cf. SPEC-V2-TVMON-01 §5 + ADR-101.
 *
 * Single-subscriber : 1 connexion concurrente max. 2e → HTTP 429.
 * Auth : si `security.socketAuthToken` est défini dans configuration.json, le token
 * doit être passé en query (?token=...). Sinon legacy LAN, accepté (cohérent avec
 * `io.use` du socket-server, cf. ADR-073 S2).
 */

const express = require('express');

const BOUNDARY = 'frame';

/**
 * @param {Object} deps
 * @param {import('../services/tv-preview.service')} deps.tvPreviewService
 * @param {() => string|null} [deps.getAuthToken] - Returns required token or null (no auth)
 */
module.exports = function createTvPreviewRouter({ tvPreviewService, getAuthToken }) {
  if (!tvPreviewService) {
    throw new Error('createTvPreviewRouter: tvPreviewService is required');
  }
  const router = express.Router();
  const requireAuth = typeof getAuthToken === 'function' ? getAuthToken : () => null;

  router.get('/preview.mjpeg', (req, res) => {
    // Auth
    const required = requireAuth();
    if (required) {
      const provided = req.query.token || req.headers['x-preview-token'];
      if (!provided || provided !== required) {
        res.status(401).type('text/plain').send('preview auth required');
        return;
      }
    }

    // Single-subscriber
    if (tvPreviewService.subscriberCount() >= 1) {
      res.status(429).type('text/plain').send('preview already streaming');
      return;
    }

    // Capability check (Pi 4 / GPU fallback / disabled)
    const cap = tvPreviewService.capability();
    if (!cap.available) {
      res.status(503).type('text/plain').send('preview unavailable');
      return;
    }

    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Connection: 'close',
      'X-Accel-Buffering': 'no',
    });

    let closed = false;
    const sub = tvPreviewService.subscribe((jpeg) => {
      if (closed) return;
      try {
        res.write(`--${BOUNDARY}\r\n`);
        res.write(`Content-Type: image/jpeg\r\n`);
        res.write(`Content-Length: ${jpeg.length}\r\n\r\n`);
        res.write(jpeg);
        res.write('\r\n');
      } catch (err) {
        // backpressure / socket clos par client → unsubscribe
        closed = true;
        sub.unsubscribe();
      }
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      sub.unsubscribe();
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
  });

  return router;
};
