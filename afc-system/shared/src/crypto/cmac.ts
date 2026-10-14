import { aesEcbEncryptBlock, xor } from "./aes";

/**
 * AES-CMAC (RFC 4493 / NIST SP 800-38B).
 *
 * `iv` is the starting chaining value. For a plain CMAC it is 16 zero bytes. DESFire EV1/EV2 secure messaging chains CMACs by
 * starting each one from the previous result, which is the same algorithm with that value as the initial chaining block.
 */
const BLOCK = 16;

const shiftLeft = (b: Buffer): Buffer => {
  const out = Buffer.alloc(BLOCK);
  let carry = 0;
  for (let i = BLOCK - 1; i >= 0; i--) { out[i] = ((b[i] << 1) | carry) & 0xff; carry = (b[i] & 0x80) ? 1 : 0; }
  return out;
};

export function cmacSubkeys(key: Buffer): { k1: Buffer; k2: Buffer } {
  const l = aesEcbEncryptBlock(key, Buffer.alloc(BLOCK));
  const rb = (b: Buffer) => { const s = shiftLeft(b); if (b[0] & 0x80) s[BLOCK - 1] ^= 0x87; return s; };
  const k1 = rb(l);
  return { k1, k2: rb(k1) };
}

export function aesCmac(key: Buffer, message: Buffer, iv: Buffer = Buffer.alloc(BLOCK)): Buffer {
  const { k1, k2 } = cmacSubkeys(key);
  const n = Math.max(1, Math.ceil(message.length / BLOCK));
  const complete = message.length > 0 && message.length % BLOCK === 0;
  let x: Buffer = Buffer.from(iv);
  for (let i = 0; i < n - 1; i++) x = aesEcbEncryptBlock(key, xor(x, message.subarray(i * BLOCK, (i + 1) * BLOCK)));
  let last: Buffer;
  if (complete) last = xor(message.subarray((n - 1) * BLOCK, n * BLOCK), k1);
  else {
    const rem = message.subarray((n - 1) * BLOCK);
    const padded = Buffer.alloc(BLOCK); rem.copy(padded); padded[rem.length] = 0x80;
    last = xor(padded, k2);
  }
  return aesEcbEncryptBlock(key, xor(x, last));
}
