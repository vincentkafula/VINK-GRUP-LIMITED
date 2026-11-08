import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * ENCRYPTS FILES BEFORE THEY ARE STORED (docs/OWNER_DASHBOARD.md, slice C2). AES-256-GCM, the same key as the platform's field encryption (DATA_ENCRYPTION_KEY: 32 random bytes, base64).
 * A stored file is one byte of version, a 12-byte nonce, a 16-byte authentication tag, then the ciphertext: any change to it is detected when it is opened.
 * In production there is NO fallback: with no key the vault is unavailable and nothing is stored, rather than storing a readable copy. In development only, a key is derived from a secret so the app still runs.
 */
export class VaultUnavailable extends Error { constructor() { super("DATA_ENCRYPTION_KEY is not configured"); } }
export interface FileVault { readonly available: boolean; seal(plain: Buffer): Buffer; open(sealed: Buffer): Buffer }
const VERSION = 1, NONCE = 12, TAG = 16;

export function createFileVault(env: NodeJS.ProcessEnv = process.env, devFallbackSecret = ""): FileVault {
  const configured = env.DATA_ENCRYPTION_KEY?.trim(); let key: Buffer | null = null;
  if (configured) { key = Buffer.from(configured, "base64"); if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded"); }
  else if (env.NODE_ENV !== "production" && devFallbackSecret) key = createHash("sha256").update("vink-file-vault-dev:" + devFallbackSecret).digest();
  const need = () => { if (!key) throw new VaultUnavailable(); return key; };
  return {
    available: key !== null,
    seal(plain) { const nonce = randomBytes(NONCE), c = createCipheriv("aes-256-gcm", need(), nonce), ct = Buffer.concat([c.update(plain), c.final()]); return Buffer.concat([Buffer.from([VERSION]), nonce, c.getAuthTag(), ct]); },
    open(sealed) {
      if (sealed.length < 1 + NONCE + TAG || sealed[0] !== VERSION) throw new Error("Unrecognised stored file");
      const d = createDecipheriv("aes-256-gcm", need(), sealed.subarray(1, 1 + NONCE)); d.setAuthTag(sealed.subarray(1 + NONCE, 1 + NONCE + TAG));
      return Buffer.concat([d.update(sealed.subarray(1 + NONCE + TAG)), d.final()]);
    },
  };
}
