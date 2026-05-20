import { randomBytes } from 'crypto';
import { encryptPiPassword, decryptPiPassword } from './pi-password-crypto.service';

describe('pi-password-crypto (ADR-132)', () => {
  const originalKey = process.env.PI_PASSWORD_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.PI_PASSWORD_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.PI_PASSWORD_ENCRYPTION_KEY;
    } else {
      process.env.PI_PASSWORD_ENCRYPTION_KEY = originalKey;
    }
  });

  const VALID_HASH = '$6$rounds=656000$salt$hashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhash';

  it('round-trips a SHA-512-crypt hash through encrypt/decrypt', () => {
    const encrypted = encryptPiPassword(VALID_HASH);
    expect(decryptPiPassword(encrypted)).toBe(VALID_HASH);
  });

  it('produces a different ciphertext for the same hash (fresh IV each call)', () => {
    const a = encryptPiPassword(VALID_HASH);
    const b = encryptPiPassword(VALID_HASH);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it('rejects a plaintext that does not start with $6$', () => {
    expect(() => encryptPiPassword('notahash')).toThrow();
    expect(() => encryptPiPassword('$5$md5hash')).toThrow();
  });

  it('fails auth tag verification if ciphertext is tampered', () => {
    const enc = encryptPiPassword(VALID_HASH);
    const tampered = { ...enc, ciphertext: Buffer.concat([enc.ciphertext, Buffer.from([0xff])]) };
    expect(() => decryptPiPassword(tampered)).toThrow();
  });

  it('throws if PI_PASSWORD_ENCRYPTION_KEY is missing', () => {
    const saved = process.env.PI_PASSWORD_ENCRYPTION_KEY;
    delete process.env.PI_PASSWORD_ENCRYPTION_KEY;
    expect(() => encryptPiPassword(VALID_HASH)).toThrow(/PI_PASSWORD_ENCRYPTION_KEY/);
    process.env.PI_PASSWORD_ENCRYPTION_KEY = saved;
  });

  it('throws if PI_PASSWORD_ENCRYPTION_KEY has wrong length', () => {
    const saved = process.env.PI_PASSWORD_ENCRYPTION_KEY;
    process.env.PI_PASSWORD_ENCRYPTION_KEY = 'tooshort';
    expect(() => encryptPiPassword(VALID_HASH)).toThrow();
    process.env.PI_PASSWORD_ENCRYPTION_KEY = saved;
  });
});
