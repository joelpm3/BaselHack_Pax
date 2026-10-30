import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptBuffer, encryptBuffer, parseEncryptionKey, sha256Hex } from "./crypto";
import { sniffMimeType } from "./sniff";

const key = parseEncryptionKey("a".repeat(64));

describe("document encryption", () => {
  it("round-trips a buffer", () => {
    const plain = randomBytes(4096);
    const sealed = encryptBuffer(plain, key, "doc-1");
    expect(sealed.includes(plain.subarray(0, 32))).toBe(false);
    expect(decryptBuffer(sealed, key, "doc-1").equals(plain)).toBe(true);
  });

  it("uses a fresh IV per file", () => {
    const plain = Buffer.from("same content");
    expect(encryptBuffer(plain, key, "d").equals(encryptBuffer(plain, key, "d"))).toBe(false);
  });

  it("rejects a file bound to another document", () => {
    const sealed = encryptBuffer(Buffer.from("secret"), key, "doc-1");
    expect(() => decryptBuffer(sealed, key, "doc-2")).toThrow();
  });

  it("rejects tampered ciphertext and the wrong key", () => {
    const sealed = encryptBuffer(Buffer.from("secret salary 100000"), key, "doc-1");
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptBuffer(tampered, key, "doc-1")).toThrow();
    expect(() => decryptBuffer(sealed, parseEncryptionKey("b".repeat(64)), "doc-1")).toThrow();
  });

  it("parses hex and base64 keys to 32 bytes and hashes anything else", () => {
    expect(parseEncryptionKey("0f".repeat(32))).toHaveLength(32);
    expect(parseEncryptionKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(parseEncryptionKey("a long passphrase that is not hex or base64!")).toHaveLength(32);
  });

  it("hashes content for dedupe", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("sniffMimeType", () => {
  it("detects supported formats from magic bytes", () => {
    expect(sniffMimeType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png",
    );
    expect(sniffMimeType(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects everything else", () => {
    expect(sniffMimeType(Buffer.from("<html>"))).toBeNull();
    expect(sniffMimeType(Buffer.from("PK\x03\x04"))).toBeNull();
  });
});
