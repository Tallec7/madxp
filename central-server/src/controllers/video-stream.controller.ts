/**
 * Video streaming proxy controller (ADR-068).
 *
 * Validates a short-lived JWT, then pipes the FTP HTTPS mirror response
 * through to the client. Range headers are forwarded for seek support.
 * Replaces direct FTP public URL exposure for SaaS clients.
 */

import { Request, Response } from 'express';
import { Readable } from 'stream';
import { verifyVideoStreamToken } from '../services/video-token.service';
import { getVideoUrl } from '../services/storage.service';
import logger from '../config/logger';

export const streamVideo = async (req: Request, res: Response): Promise<void> => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  const verdict = verifyVideoStreamToken(token);
  if (!verdict.ok) {
    res.status(401).json({ error: verdict.reason === 'expired' ? 'Token expired' : 'Invalid token' });
    return;
  }

  const upstreamUrl = getVideoUrl(verdict.path);
  const upstreamHeaders: Record<string, string> = {};
  if (req.headers.range) upstreamHeaders['Range'] = String(req.headers.range);

  try {
    const upstream = await fetch(upstreamUrl, { headers: upstreamHeaders });

    if (!upstream.ok && upstream.status !== 206) {
      logger.warn('Video stream upstream error', {
        status: upstream.status,
        path: verdict.path,
        siteId: verdict.siteId,
      });
      res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Upstream unavailable' });
      return;
    }

    res.status(upstream.status);
    const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
    for (const h of forwardHeaders) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Cache-Control', 'private, max-age=300');

    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream).pipe(res);
  } catch (err) {
    logger.error('Video stream proxy error', { err: (err as Error).message, path: verdict.path });
    if (!res.headersSent) res.status(502).json({ error: 'Proxy error' });
  }
};
