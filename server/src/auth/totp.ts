import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 time-based one-time passwords (SHA-1, 6 digits, 30 s) as used by Google Authenticator, Microsoft Authenticator and Authy. No dependency. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of s.replace(/=+$/, "").toUpperCase()) {
    const i = ALPHABET.indexOf(c); if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(randomBytes(20));

export function codeAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** The step the code matches (within one step either side for clock drift), or null. `after` rejects a step already used, so a code works once. */
export function verifyTotp(secret: string, code: string, now = Date.now(), after = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const cur = Math.floor(now / 1000 / STEP);
  for (const s of [cur - 1, cur, cur + 1]) {
    if (s <= after) continue;
    const a = Buffer.from(codeAt(secret, s)), b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) return s;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer = "VINK") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

/** Ten one-time recovery codes like "k3f9-a7xq"; only their hashes are stored. */
export const newRecoveryCodes = (n = 10) => Array.from({ length: n }, () => { const h = randomBytes(5).toString("hex"); return `${h.slice(0, 5)}-${h.slice(5)}`; });
