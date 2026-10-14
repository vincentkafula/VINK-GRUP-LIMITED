import { createCipheriv, createDecipheriv } from "node:crypto";

/** AES building blocks without padding. Key length picks AES-128 (16 bytes) or AES-256 (32 bytes). */
const algo = (key: Buffer, mode: "ecb" | "cbc") => {
  if (key.length !== 16 && key.length !== 32) throw new Error("AES key must be 16 or 32 bytes");
  return `aes-${key.length * 8}-${mode}`;
};

export function aesEcbEncryptBlock(key: Buffer, block: Buffer): Buffer {
  const c = createCipheriv(algo(key, "ecb"), key, null);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(block), c.final()]);
}

export function aesCbcEncrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  if (data.length % 16) throw new Error("CBC data must be a multiple of 16 bytes");
  const c = createCipheriv(algo(key, "cbc"), key, iv);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(data), c.final()]);
}

export function aesCbcDecrypt(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  if (data.length % 16) throw new Error("CBC data must be a multiple of 16 bytes");
  const d = createDecipheriv(algo(key, "cbc"), key, iv);
  d.setAutoPadding(false);
  return Buffer.concat([d.update(data), d.final()]);
}

export const xor = (a: Buffer, b: Buffer): Buffer => {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
};
