/**
 * Video streaming token service (ADR-068).
 *
 * Signs short-lived JWTs scoped to a single video path + site. Tokens gate
 * access to the streaming proxy (`GET /api/videos/stream`). Replaces the
 * public FTP URL exposure for SaaS clients.
 *
 * Type `video-stream` is distinct from auth JWTs — a leaked auth token
 * cannot be replayed against the stream endpoint and vice-versa.
 */

import jwt, { Secret } from 'jsonwebtoken';
import logger from '../config/logger';

const TOKEN_TYPE = 'video-stream';
const DEFAULT_TTL_SECONDS = 2 * 60 * 60; // 2h

interface VideoStreamPayload {
  type: typeof TOKEN_TYPE;
  path: string;
  siteId: string;
  exp: number;
}

function getSecret(): Secret {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

export const signVideoStreamToken = (
  storagePath: string,
  siteId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string => {
  const payload: Omit<VideoStreamPayload, 'exp'> = {
    type: TOKEN_TYPE,
    path: storagePath,
    siteId,
  };
  return jwt.sign(payload, getSecret(), { expiresIn: ttlSeconds });
};

export type VerifyResult =
  | { ok: true; path: string; siteId: string }
  | { ok: false; reason: 'expired' | 'invalid' };

export const verifyVideoStreamToken = (token: string): VerifyResult => {
  try {
    const decoded = jwt.verify(token, getSecret()) as Partial<VideoStreamPayload>;
    if (decoded.type !== TOKEN_TYPE || !decoded.path || !decoded.siteId) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, path: decoded.path, siteId: decoded.siteId };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, reason: 'expired' };
    logger.debug('Video stream token verify failed', { err: (err as Error).message });
    return { ok: false, reason: 'invalid' };
  }
};
