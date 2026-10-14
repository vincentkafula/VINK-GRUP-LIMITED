/**
 * The 32-bit CRC DESFire uses inside enciphered payloads (ChangeKey): reflected polynomial 0xEDB88320, initial value 0xFFFFFFFF,
 * and NO final complement (which is what separates it from zlib's crc32). Returned little-endian, as it travels on the wire.
 * Check this against your first real card with `npm run selftest` before relying on the personalisation script in production.
 */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32Desfire(data: Buffer): Buffer {
  let crc = 0xffffffff;
  for (const b of data) crc = TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  const out = Buffer.alloc(4);
  out.writeUInt32LE(crc >>> 0);
  return out;
}
