import { cbc, ecb } from "@noble/ciphers/aes.js";

/**
 * AES building blocks without padding, on audited pure-JavaScript code (@noble/ciphers) so the same code runs in Node, in a browser and in the
 * Android web view of the P18Q terminal. Key length picks AES-128 (16 bytes) or AES-256 (32 bytes).
 */
const check = (key: Buffer) => { if (key.length !== 16 && key.length !== 32) throw new Error("AES key must be 16 or 32 bytes"); };
const out = (u: Uint8Array): Buffer => Buffer.from(u.buffer, u.byteOffset, u.byteLength);

export function aesEcbEncryptBlock(key: Buffer, block: Buffer): Buffer {
  check(key);
  return out(ecb(key, { disablePadding: true }).encrypt(block));
}

export function aesCbcEncrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  check(key);
  if (data.length % 16) throw new Error("CBC data must be a multiple of 16 bytes");
  return out(cbc(key, iv, { disablePadding: true }).encrypt(data));
}

export function aesCbcDecrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  check(key);
  if (data.length % 16) throw new Error("CBC data must be a multiple of 16 bytes");
  return out(cbc(key, iv, { disablePadding: true }).decrypt(data));
}

export const xor = (a: Buffer, b: Buffer): Buffer => {
  const o = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] ^ b[i];
  return o;
};
