import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Field-level encryption for sensitive values kept in Postgres (business names and registration numbers), on top of whatever
 * encryption the database volume has. AES-256-GCM: each value gets its own random 12-byte nonce, and the authentication tag makes a
 * tampered or wrong-key value fail loudly instead of decrypting to garbage.
 *
 * Stored form:  v1.<nonce>.<tag>.<ciphertext>   (all base64url)
 *
 * The key is DATA_ENCRYPTION_KEY: 32 random bytes, base64 (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))").
 * In production it is REQUIRED; without it nothing sensitive is stored. Outside production a key derived from the JWT secret is used so
 * development and tests work without setup. Losing the key makes stored values unreadable, so keep a copy in your secrets manager.
 */
export class CryptoUnavailable extends Error { constructor() { super("DATA_ENCRYPTION_KEY is not configured"); } }

export interface FieldCrypto { encrypt(plain: string): string; decrypt(stored: string): string }

export function createFieldCrypto(env: NodeJS.ProcessEnv = process.env, devFallbackSecret = ""): FieldCrypto {
  const configured = env.DATA_ENCRYPTION_KEY?.trim();
  let key: Buffer | null = null;
  if (configured) {
    key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  } else if (env.NODE_ENV !== "production" && devFallbackSecret) {
    key = createHash("sha256").update("vink-field-crypto-dev:" + devFallbackSecret).digest();
  }
  const need = () => { if (!key) throw new CryptoUnavailable(); return key; };
  const b64 = (b: Buffer) => b.toString("base64url");
  return {
    encrypt(plain) {
      const nonce = randomBytes(12), c = createCipheriv("aes-256-gcm", need(), nonce);
      const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return ["v1", b64(nonce), b64(c.getAuthTag()), b64(ct)].join(".");
    },
    decrypt(stored) {
      const [v, nonce, tag, ct] = stored.split(".");
      if (v !== "v1" || !nonce || !tag || !ct) throw new Error("Unrecognised encrypted value");
      const d = createDecipheriv("aes-256-gcm", need(), Buffer.from(nonce, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
    },
  };
}
