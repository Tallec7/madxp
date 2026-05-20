import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * ADR-132 — Crypto service pour le hash du mot de passe système `pi`.
 *
 * AES-256-GCM encryption du hash SHA-512-crypt Linux stocké dans
 * sites.pi_password_ciphertext.
 * Clé : PI_PASSWORD_ENCRYPTION_KEY (Railway secret), 64 hex chars = 32 bytes.
 *
 * Pattern identique à hotspot-psk-crypto.service.ts (ADR-074).
 * La clé est différente pour cloisonner les secrets.
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export interface EncryptedPiPassword {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

function getKey(): Buffer {
  const hex = process.env.PI_PASSWORD_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('PI_PASSWORD_ENCRYPTION_KEY env var missing (ADR-132)');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `PI_PASSWORD_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (64 hex chars), got ${key.length}`
    );
  }
  return key;
}

export function encryptPiPassword(hash: string): EncryptedPiPassword {
  if (!hash || !hash.startsWith('$6$')) {
    throw new Error('Pi password hash must be a SHA-512-crypt hash starting with $6$');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(hash, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function decryptPiPassword(encrypted: EncryptedPiPassword): string {
  const decipher = createDecipheriv(ALGO, getKey(), encrypted.iv);
  decipher.setAuthTag(encrypted.authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
