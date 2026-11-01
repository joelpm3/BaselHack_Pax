import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";
import { decryptBuffer, encryptBuffer, parseEncryptionKey } from "./crypto";

/** Encrypted originals under DATA_DIR/uploads/<customerId>/<documentId>.bin. */

// Read lazily so importing this module (e.g. while `next build` collects page data) needs no env.
let cachedKey: Buffer | undefined;
const key = () => (cachedKey ??= parseEncryptionKey(env.DOCUMENT_ENCRYPTION_KEY));
const uploadsRoot = () => path.resolve(env.DATA_DIR, "uploads");
const SAFE_ID = /^[0-9a-f-]{36}$/;

/** Relative to DATA_DIR, as stored in `documents.storage_path`. */
export function storagePathFor(customerId: string, documentId: string): string {
  if (!SAFE_ID.test(customerId) || !SAFE_ID.test(documentId)) throw new Error("Invalid id");
  return path.join("uploads", customerId, `${documentId}.bin`);
}

function absolute(storagePath: string): string {
  const resolved = path.resolve(env.DATA_DIR, storagePath);
  if (!resolved.startsWith(uploadsRoot() + path.sep)) throw new Error("Path outside uploads");
  return resolved;
}

export async function writeEncrypted(
  storagePath: string,
  documentId: string,
  data: Buffer,
): Promise<void> {
  const file = absolute(storagePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, encryptBuffer(data, key(), documentId), { mode: 0o600 });
}

export async function readDecrypted(storagePath: string, documentId: string): Promise<Buffer> {
  return decryptBuffer(await readFile(absolute(storagePath)), key(), documentId);
}

export async function removeStored(storagePath: string): Promise<void> {
  await rm(absolute(storagePath), { force: true });
}
