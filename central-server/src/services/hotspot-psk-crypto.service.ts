import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * ADR-074 — PSK crypto service
 *
 * AES-256-GCM encryption for hotspot PSKs stored in sites.wifi_psk_encrypted.
 * Key source: HOTSPOT_PSK_ENCRYPTION_KEY env var (Railway secret), 64 hex chars = 32 bytes.
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export interface EncryptedPsk {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

function getKey(): Buffer {
  const hex = process.env.HOTSPOT_PSK_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('HOTSPOT_PSK_ENCRYPTION_KEY env var missing (ADR-074)');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`HOTSPOT_PSK_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (64 hex chars), got ${key.length}`);
  }
  return key;
}

export function encryptPsk(plaintext: string): EncryptedPsk {
  if (!plaintext || plaintext.length < 8 || plaintext.length > 63) {
    throw new Error('PSK must be between 8 and 63 characters (WPA2 spec)');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function decryptPsk(encrypted: EncryptedPsk): string {
  const decipher = createDecipheriv(ALGO, getKey(), encrypted.iv);
  decipher.setAuthTag(encrypted.authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
