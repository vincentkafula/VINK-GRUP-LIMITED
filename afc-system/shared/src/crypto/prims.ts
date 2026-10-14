import { hmac } from "@noble/hashes/hmac.js";
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

/** Small portable replacements for the parts of node:crypto the shared code needs. No Node-only imports, so everything here runs in a web view too. */
export function randomBytes(n: number): Buffer {
  const b = Buffer.alloc(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/** Compares in time that does not depend on where the first difference is. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

const buf = (u: Uint8Array) => Buffer.from(u.buffer, u.byteOffset, u.byteLength);
export const sha256 = (data: string | Uint8Array): Buffer => buf(nobleSha256(typeof data === "string" ? Buffer.from(data, "utf8") : data));
export const hmacSha256 = (key: Uint8Array, data: string | Uint8Array): Buffer => buf(hmac(nobleSha256, key, typeof data === "string" ? Buffer.from(data, "utf8") : data));

/** A random UUID (v4). */
export const uuid = (): string => globalThis.crypto.randomUUID();
