import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for documents at rest. File layout: MAGIC | IV (12) | auth tag (16) | ciphertext.
 * The document id is bound as additional authenticated data, so an encrypted file cannot be
 * swapped onto another document record without failing authentication.
 */
const MAGIC = Buffer.from("PAXDOC1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Accepts a 32-byte key as hex (64 chars) or base64; any other secret is hashed to 32 bytes. */
export function parseEncryptionKey(raw: string): Buffer {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  if (/^[A-Za-z0-9+/_-]{43,44}={0,2}$/.test(value)) {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === 32) return decoded;
  }
  return createHash("sha256").update(value).digest();
}

export function encryptBuffer(plain: Buffer, key: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBuffer(sealed: Buffer, key: Buffer, aad: string): Buffer {
  if (sealed.length < MAGIC.length + IV_BYTES + TAG_BYTES || !sealed.subarray(0, 7).equals(MAGIC))
    throw new Error("Not an encrypted Pax document");
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = sealed.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(sealed.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]);
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
