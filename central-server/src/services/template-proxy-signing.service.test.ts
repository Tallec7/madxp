// Mute Winston during tests
jest.mock('../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const TEST_SECRET = 'a'.repeat(32);

describe('templateProxySigningService', () => {
  let service: typeof import('./template-proxy-signing.service');

  beforeEach(() => {
    jest.resetModules();
    process.env['TEMPLATE_PROXY_HMAC_SECRET'] = TEST_SECRET;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = require('./template-proxy-signing.service');
  });

  it('signUrl returns {url, sig, exp} and verifyUrl validates a fresh signature', () => {
    const url = 'https://kalonpartners.bzh/templates/x.webm';
    const signed = service.signUrl(url, 3600);
    expect(signed.url).toBe(url);
    expect(signed.sig).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const result = service.verifyUrl(signed.url, signed.sig, signed.exp);
    expect(result).toEqual({ valid: true });
  });

  it('verifyUrl rejects an expired signature with reason="expired"', () => {
    const url = 'https://kalonpartners.bzh/templates/expired.webm';
    const signed = service.signUrl(url, -10); // already in the past
    const result = service.verifyUrl(signed.url, signed.sig, signed.exp);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('verifyUrl rejects a tampered URL with reason="invalid_signature"', () => {
    const original = 'https://kalonpartners.bzh/templates/legit.webm';
    const signed = service.signUrl(original, 3600);
    const tamperedUrl = 'https://kalonpartners.bzh/templates/EVIL.webm';
    const result = service.verifyUrl(tamperedUrl, signed.sig, signed.exp);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('verifyUrl rejects a tampered signature with reason="invalid_signature"', () => {
    const url = 'https://kalonpartners.bzh/templates/legit.webm';
    const signed = service.signUrl(url, 3600);
    const tamperedSig = signed.sig.replace(/^./, signed.sig[0] === 'a' ? 'b' : 'a');
    const result = service.verifyUrl(signed.url, tamperedSig, signed.exp);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('verifyUrl returns reason="missing" when sig or exp is absent', () => {
    const url = 'https://kalonpartners.bzh/x.webm';
    expect(service.verifyUrl(url, undefined, 12345)).toEqual({
      valid: false,
      reason: 'missing',
    });
    expect(service.verifyUrl(url, 'aabbcc', undefined)).toEqual({
      valid: false,
      reason: 'missing',
    });
  });

  it('throws at import time when TEMPLATE_PROXY_HMAC_SECRET is missing', () => {
    jest.isolateModules(() => {
      delete process.env['TEMPLATE_PROXY_HMAC_SECRET'];
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./template-proxy-signing.service');
      }).toThrow(/TEMPLATE_PROXY_HMAC_SECRET/);
    });
  });

  it('throws at import time when TEMPLATE_PROXY_HMAC_SECRET is shorter than 32 chars', () => {
    jest.isolateModules(() => {
      process.env['TEMPLATE_PROXY_HMAC_SECRET'] = 'short';
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./template-proxy-signing.service');
      }).toThrow(/min 32 chars/);
    });
  });
});
