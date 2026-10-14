import { diversifyAes128 } from "./crypto/kdf";
import { SYSTEM_IDENTIFIER, AFC_AID } from "./desfire/layout";

/**
 * Where card keys come from. Master keys are NEVER stored in source code, in a committed env file, or in the database.
 *
 *   KeyProvider           the interface everything else depends on
 *   DevKeyProvider        master keys from environment variables, for development and tests only (refuses to start in production)
 *   ExternalKeyProvider   the production shape: ask a KMS, an HSM or a NXP SAM AV3 to diversify. A stub with the contract documented;
 *                         plug your module in here. With a SAM the master key never leaves the chip and the validator never sees it.
 *
 * Roles: PICC (the card's own master key), ADMIN/DEBIT/CREDIT (application keys 0/1/2). Each role has its OWN master key, so a validator
 * (which holds only DEBIT) cannot derive the key that adds money, and a top-up terminal (CREDIT) cannot derive the spending key.
 */
export type CardKeyRole = "PICC" | "ADMIN" | "DEBIT" | "CREDIT";
export const CARD_KEY_ROLES: CardKeyRole[] = ["PICC", "ADMIN", "DEBIT", "CREDIT"];
const ROLE_BYTE: Record<CardKeyRole, number> = { PICC: 0x50, ADMIN: 0x41, DEBIT: 0x44, CREDIT: 0x43 };

export interface KeyProvider {
  readonly name: string;
  /** The AES-128 key for this role on the card with this 7-byte UID. */
  cardKey(uid: Buffer, role: CardKeyRole): Promise<Buffer>;
}

export class KeyNotAvailable extends Error {}

export class DevKeyProvider implements KeyProvider {
  readonly name = "dev";
  constructor(private readonly masters: Partial<Record<CardKeyRole, Buffer>>) {
    for (const [role, k] of Object.entries(masters)) if (k && k.length !== 16) throw new Error(`Master key for ${role} must be 16 bytes`);
  }

  /** AFC_MASTER_KEY_PICC / _ADMIN / _DEBIT / _CREDIT as 32 hex characters. Only the roles that are set can be used. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): DevKeyProvider {
    if (env.NODE_ENV === "production" && env.AFC_ALLOW_DEV_KEYS !== "1") {
      throw new Error("Development key provider refused in production. Implement ExternalKeyProvider (KMS/HSM/SAM), or set AFC_ALLOW_DEV_KEYS=1 knowing the master keys are in the environment.");
    }
    const masters: Partial<Record<CardKeyRole, Buffer>> = {};
    for (const role of CARD_KEY_ROLES) {
      const v = env[`AFC_MASTER_KEY_${role}`]?.trim();
      if (!v) continue;
      if (!/^[0-9a-fA-F]{32}$/.test(v)) throw new Error(`AFC_MASTER_KEY_${role} must be 32 hex characters (16 bytes)`);
      masters[role] = Buffer.from(v, "hex");
    }
    return new DevKeyProvider(masters);
  }

  async cardKey(uid: Buffer, role: CardKeyRole): Promise<Buffer> {
    const master = this.masters[role];
    if (!master) throw new KeyNotAvailable(`This station does not hold the ${role} master key`);
    return diversifyAes128(master, uid, AFC_AID, Buffer.concat([SYSTEM_IDENTIFIER, Buffer.from([ROLE_BYTE[role]])]));
  }
}

/**
 * Production key custody. Implement `diversify` against your KMS / HSM (for example a PKCS#11 AES-CMAC key) or an NXP SAM AV3
 * (command "SAM_DumpSessionKey" is NOT used: ask the SAM to authenticate the card itself so the key never leaves it).
 * Input to diversify is exactly `01 || UID || AID || systemIdentifier || roleByte` (NXP AN10922, AES-128); the result is the 16-byte card key.
 */
export class ExternalKeyProvider implements KeyProvider {
  readonly name = "external";
  constructor(private readonly diversify: (role: CardKeyRole, input: Buffer) => Promise<Buffer>) {}
  async cardKey(uid: Buffer, role: CardKeyRole): Promise<Buffer> {
    const input = Buffer.concat([Buffer.from([0x01]), uid, AFC_AID, SYSTEM_IDENTIFIER, Buffer.from([ROLE_BYTE[role]])]);
    const key = await this.diversify(role, input);
    if (key.length !== 16) throw new Error("The key service returned a key of the wrong length");
    return key;
  }
}

export const productionKeyProviderStub = (): KeyProvider => new ExternalKeyProvider(async () => {
  throw new KeyNotAvailable("No production key service is connected. Implement ExternalKeyProvider with your KMS, HSM or SAM (see afc-system/README.md, section Keys).");
});
