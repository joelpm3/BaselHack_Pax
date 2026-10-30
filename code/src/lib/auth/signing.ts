import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/** `value.signature` with an HMAC-SHA256 over the value. */
export function sign(value: string): string {
  const mac = createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  const expected = Buffer.from(sign(value).slice(dot + 1));
  const actual = Buffer.from(signed.slice(dot + 1));
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? value : null;
}
