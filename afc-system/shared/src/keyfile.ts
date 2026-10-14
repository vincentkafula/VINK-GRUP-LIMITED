import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { diversifyAes128 } from "./crypto/kdf";
import { AFC_AID, SYSTEM_IDENTIFIER } from "./desfire/layout";
import { CARD_KEY_ROLES, KeyNotAvailable, ROLE_BYTE, type CardKeyRole, type KeyProvider } from "./keys";

/**
 * Sealed key files: master keys encrypted with a passphrase (scrypt -> AES-256-GCM), so they are never sitting in an environment variable or a
 * plain file. A station gets a file holding ONLY the roles it needs (a validator: DEBIT and TICKET; a top-up terminal: CREDIT), so losing that
 * station loses only those keys. The passphrase comes from a secret store at start-up (a systemd credential, a secrets manager), not from the file's folder.
 *
 * This is software custody: while the process runs, the keys are in its memory. A hardware security module or an NXP SAM keeps them out of
 * memory entirely and remains the stronger choice; this is the sensible step up from plain environment variables.
 */
export interface SealedFile {
  format: "afc-sealed-keys"; version: 1;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher: "aes-256-gcm"; nonce: string; tag: string; ciphertext: string;
  /** Which roles are inside (not secret; shown so people know what a file is for). Authenticated: changing it breaks the file. */
  roles: CardKeyRole[];
}

const KDF = { N: 1 << 15, r: 8, p: 1 };
const aad = (roles: string[]) => Buffer.from("afc-sealed-keys/1/" + roles.join(","));
const kek = (pass: string, salt: Buffer, p = KDF) => scryptSync(pass.normalize("NFKC"), salt, 32, { N: p.N, r: p.r, p: p.p, maxmem: 256 * 1024 * 1024 });

export function sealKeys(masters: Partial<Record<CardKeyRole, Buffer>>, passphrase: string): SealedFile {
  if (passphrase.length < 12) throw new Error("Use a passphrase of at least 12 characters");
  const roles = CARD_KEY_ROLES.filter((r) => masters[r]);
  if (!roles.length) throw new Error("Nothing to seal");
  const plain: Record<string, string> = {};
  for (const r of roles) { if (masters[r]!.length !== 16) throw new Error(`${r} key must be 16 bytes`); plain[r] = masters[r]!.toString("hex"); }
  const salt = randomBytes(16), nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kek(passphrase, salt), nonce);
  c.setAAD(aad(roles));
  const ct = Buffer.concat([c.update(JSON.stringify(plain), "utf8"), c.final()]);
  return { format: "afc-sealed-keys", version: 1, kdf: { name: "scrypt", ...KDF, salt: salt.toString("hex") }, cipher: "aes-256-gcm", nonce: nonce.toString("hex"), tag: c.getAuthTag().toString("hex"), ciphertext: ct.toString("hex"), roles };
}

export function unsealKeys(file: SealedFile, passphrase: string): Partial<Record<CardKeyRole, Buffer>> {
  if (file.format !== "afc-sealed-keys" || file.version !== 1 || file.cipher !== "aes-256-gcm" || file.kdf?.name !== "scrypt") throw new Error("This is not a sealed key file this version can read");
  if (file.kdf.N > 1 << 20 || file.kdf.r > 16 || file.kdf.p > 4) throw new Error("The key file asks for an unreasonable amount of memory");
  try {
    const d = createDecipheriv("aes-256-gcm", kek(passphrase, Buffer.from(file.kdf.salt, "hex"), file.kdf), Buffer.from(file.nonce, "hex"));
    d.setAAD(aad(file.roles)); d.setAuthTag(Buffer.from(file.tag, "hex"));
    const plain = JSON.parse(Buffer.concat([d.update(Buffer.from(file.ciphertext, "hex")), d.final()]).toString("utf8")) as Record<string, string>;
    const out: Partial<Record<CardKeyRole, Buffer>> = {};
    for (const r of CARD_KEY_ROLES) if (plain[r]) out[r] = Buffer.from(plain[r], "hex");
    return out;
  } catch { throw new Error("The key file could not be opened: wrong passphrase, or the file was changed"); }
}

/** Short, non-secret fingerprint of a key, for checking that a backup or another station holds the same key. */
export const keyFingerprint = (k: Buffer): string => createHash("sha256").update(Buffer.concat([Buffer.from("afc-fp"), k])).digest("hex").slice(0, 8);

export class SealedKeyProvider implements KeyProvider {
  readonly name = "sealed-file";
  private constructor(private readonly masters: Partial<Record<CardKeyRole, Buffer>>) {}
  static fromFile(path: string, passphrase: string): SealedKeyProvider { return new SealedKeyProvider(unsealKeys(JSON.parse(readFileSync(path, "utf8")) as SealedFile, passphrase)); }
  static fromMasters(masters: Partial<Record<CardKeyRole, Buffer>>): SealedKeyProvider { return new SealedKeyProvider(masters); }
  get roles(): CardKeyRole[] { return CARD_KEY_ROLES.filter((r) => this.masters[r]); }
  async cardKey(uid: Buffer, role: CardKeyRole): Promise<Buffer> {
    const m = this.masters[role];
    if (!m) throw new KeyNotAvailable(`This key file does not hold the ${role} master key`);
    const roleByte = ROLE_BYTE[role];
    return diversifyAes128(m, uid, AFC_AID, Buffer.concat([SYSTEM_IDENTIFIER, Buffer.from([roleByte])]));
  }
}

/** Reads the passphrase from AFC_KEY_PASSPHRASE_FILE (a path: a systemd credential or a mounted secret) or, failing that, AFC_KEY_PASSPHRASE. */
export function passphraseFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.AFC_KEY_PASSPHRASE_FILE) return readFileSync(env.AFC_KEY_PASSPHRASE_FILE, "utf8").replace(/[\r\n]+$/, "");
  return env.AFC_KEY_PASSPHRASE;
}

/** The provider every program should use: a sealed file if AFC_KEY_FILE is set, otherwise the development environment variables. */
export async function keyProviderFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<KeyProvider> {
  if (env.AFC_KEY_FILE) {
    const pass = passphraseFromEnv(env);
    if (!pass) throw new Error("AFC_KEY_FILE is set but there is no passphrase (AFC_KEY_PASSPHRASE_FILE or AFC_KEY_PASSPHRASE)");
    return SealedKeyProvider.fromFile(env.AFC_KEY_FILE, pass);
  }
  const { DevKeyProvider } = await import("./keys");
  return DevKeyProvider.fromEnv(env);
}
