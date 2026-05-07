import crypto from 'crypto';
import logger from '../config/logger';

/**
 * Audit P1 #7 — HMAC-SHA256 signature service for Template Studio proxy URLs.
 *
 * Threat model : the asset proxy `/api/remotion-templates/asset-proxy?url=…`
 * relays arbitrary HTTPS GETs to `kalonpartners.bzh`. Without a signature, any
 * leaked URL can be replayed indefinitely, and a tampered `?url=` parameter
 * could exfiltrate other tenants' assets if the host check is ever weakened.
 *
 * Contract :
 *   - `signUrl(url, ttlSec)` → `{ url, sig, exp }` ; `exp` is a Unix epoch
 *     second (not millisecond, to match RFC 7519 `exp` semantics).
 *   - `verifyUrl(url, sig, exp)` returns `{ valid, reason? }` with reasons
 *     `'expired' | 'invalid_signature' | 'missing'`.
 *   - Comparison is constant-time via `crypto.timingSafeEqual` (anti
 *     timing-attack — see https://owasp.org/www-community/attacks/Timing_attack).
 *
 * Fail-fast at boot : if `TEMPLATE_PROXY_HMAC_SECRET` is missing or shorter
 * than 32 chars, the module throws on import. This is intentional — we'd
 * rather Railway crashloop visibly than serve unsigned proxy URLs silently.
 * In dev/test, set the env var via `.env.test` or `setupFiles`.
 */
const SECRET = process.env['TEMPLATE_PROXY_HMAC_SECRET'];
if (!SECRET || SECRET.length < 32) {
  throw new Error(
    'TEMPLATE_PROXY_HMAC_SECRET is required (min 32 chars) — set it on Railway production env',
  );
}
const SECRET_BUF = Buffer.from(SECRET, 'utf8');

logger.info('Template proxy signing service initialized');

export interface SignedUrl {
  url: string;
  sig: string;
  exp: number;
}

export type VerifyReason = 'expired' | 'invalid_signature' | 'missing';

export interface VerifyResult {
  valid: boolean;
  reason?: VerifyReason;
}

const computeSig = (url: string, exp: number): string =>
  crypto.createHmac('sha256', SECRET_BUF).update(`${url}|${exp}`).digest('hex');

/**
 * Sign a proxy URL with a TTL. Returns the original URL plus `sig` + `exp`
 * to be appended as query string parameters.
 */
export function signUrl(url: string, ttlSec: number): SignedUrl {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = computeSig(url, exp);
  return { url, sig, exp };
}

/**
 * Verify a signed URL. Soft-fails with `reason: 'missing'` when sig/exp are
 * absent so the controller can apply a 24h migration grace period (cf. ADR-113).
 */
export function verifyUrl(
  url: string,
  sig: string | undefined,
  exp: number | undefined,
): VerifyResult {
  if (!sig || !exp) {
    return { valid: false, reason: 'missing' };
  }
  if (exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'expired' };
  }
  try {
    const expectedSig = computeSig(url, exp);
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length) {
      return { valid: false, reason: 'invalid_signature' };
    }
    if (crypto.timingSafeEqual(a, b)) {
      return { valid: true };
    }
    return { valid: false, reason: 'invalid_signature' };
  } catch (err) {
    logger.error('Template proxy signature verify threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { valid: false, reason: 'invalid_signature' };
  }
}

export const templateProxySigningService = {
  signUrl,
  verifyUrl,
};

export default templateProxySigningService;
