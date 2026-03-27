/**
 * AES-256-GCM encryption for storing user API keys.
 * Uses TELEGRAM_ENCRYPTION_KEY from env (64-char hex = 32 bytes).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '@/lib/shared/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = config.telegram.encryptionKey;
  if (!hex || hex.length !== 64) {
    throw new Error('TELEGRAM_ENCRYPTION_KEY must be a 64-char hex string');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: base64(iv + authTag + encrypted)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertext, 'base64');

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final('utf8');
}

/** Returns last 4 characters of the decrypted key (for UI display). */
export function getKeyHint(encryptedKey: string): string {
  try {
    const key = decrypt(encryptedKey);
    return key.length > 4 ? `...${key.slice(-4)}` : '****';
  } catch {
    return '****';
  }
}
