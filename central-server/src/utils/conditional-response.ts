import crypto from 'crypto';
import { Request, Response } from 'express';

const CACHE_CONTROL_DEFAULT = 'private, must-revalidate';

/**
 * Envoie un body JSON avec ETag + Cache-Control pour permettre au browser
 * de retourner 304 Not Modified au prochain hit si le body n'a pas changé.
 *
 * Pourquoi : Express built-in `etag` génère bien un ETag, mais ne pose pas
 * de Cache-Control. Sans Cache-Control, le browser (Angular HttpClient) ne
 * met pas la response en cache → `If-None-Match` jamais renvoyé → toujours
 * 200 avec body complet, jamais 304.
 *
 * Usage typique : endpoints dashboard qui polling régulièrement et dont le
 * body change rarement (ex: `/sites/:id/local-content` 16 MB sur 44 min en
 * audit 2026-05-20, ~50% de l'egress HTTP du projet Railway).
 *
 * Le hash est `W/"<sha1>"` (weak ETag) calculé sur la sérialisation JSON
 * stable du body. Si le body inclut des timestamps volatiles non métier,
 * passer un `etagKey` explicite (subset stable du body).
 */
export function sendJsonWithEtag(
  req: Request,
  res: Response,
  body: unknown,
  options: { cacheControl?: string; etagKey?: unknown } = {}
): Response {
  const hashSource = options.etagKey !== undefined ? JSON.stringify(options.etagKey) : JSON.stringify(body);
  const etag = `W/"${crypto.createHash('sha1').update(hashSource).digest('base64').replace(/=+$/, '')}"`;
  const cacheControl = options.cacheControl ?? CACHE_CONTROL_DEFAULT;

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', cacheControl);

  const clientEtag = req.headers['if-none-match'];
  if (typeof clientEtag === 'string' && clientEtag === etag) {
    return res.status(304).end();
  }

  return res.json(body);
}
