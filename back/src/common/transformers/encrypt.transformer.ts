import { ValueTransformer } from 'typeorm';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY env var no definida');
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY debe ser 64 chars hex (256 bits)');
  return buf;
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(data: string): string {
  const [ivB64, tagB64, encB64] = data.split(':');
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return decipher.update(Buffer.from(encB64, 'base64')) + decipher.final('utf8');
}

// Deterministic HMAC — used for unique-index lookups without decrypting
export function hmacLookup(value: string): string {
  const secret = process.env.HMAC_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('HMAC_SECRET env var no definida');
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export const encryptTransformer: ValueTransformer = {
  to: (value: string | null) => (value ? encrypt(value) : value),
  from: (value: string | null) => (value ? decrypt(value) : value),
};
