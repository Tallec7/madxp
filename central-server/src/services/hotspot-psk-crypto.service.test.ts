import { randomBytes } from 'crypto';
import { encryptPsk, decryptPsk } from './hotspot-psk-crypto.service';

describe('hotspot-psk-crypto (ADR-074)', () => {
  const originalKey = process.env.HOTSPOT_PSK_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.HOTSPOT_PSK_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.HOTSPOT_PSK_ENCRYPTION_KEY;
    } else {
      process.env.HOTSPOT_PSK_ENCRYPTION_KEY = originalKey;
    }
  });

  it('round-trips a PSK through encrypt/decrypt', () => {
    const psk = 'NantesLoireFeminin26!';
    const encrypted = encryptPsk(psk);
    expect(decryptPsk(encrypted)).toBe(psk);
  });

  it('produces a different ciphertext for the same plaintext (fresh IV)', () => {
    const a = encryptPsk('samePassword123');
    const b = encryptPsk('samePassword123');
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it('rejects PSKs outside WPA2 length range', () => {
    expect(() => encryptPsk('short')).toThrow();
    expect(() => encryptPsk('x'.repeat(64))).toThrow();
  });

  it('fails auth tag verification if ciphertext tampered', () => {
    const enc = encryptPsk('validPsk123456');
    const tampered = { ...enc, ciphertext: Buffer.concat([enc.ciphertext, Buffer.from([0])]) };
    expect(() => decryptPsk(tampered)).toThrow();
  });

  it('throws if encryption key is missing', () => {
    const saved = process.env.HOTSPOT_PSK_ENCRYPTION_KEY;
    delete process.env.HOTSPOT_PSK_ENCRYPTION_KEY;
    expect(() => encryptPsk('validPsk123456')).toThrow(/HOTSPOT_PSK_ENCRYPTION_KEY/);
    process.env.HOTSPOT_PSK_ENCRYPTION_KEY = saved;
  });

  it('throws if encryption key has wrong length', () => {
    const saved = process.env.HOTSPOT_PSK_ENCRYPTION_KEY;
    process.env.HOTSPOT_PSK_ENCRYPTION_KEY = 'abcd';
    expect(() => encryptPsk('validPsk123456')).toThrow();
    process.env.HOTSPOT_PSK_ENCRYPTION_KEY = saved;
  });
});
