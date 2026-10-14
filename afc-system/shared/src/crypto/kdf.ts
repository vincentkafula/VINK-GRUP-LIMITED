import { aesCmac } from "./cmac";

/**
 * Per-card key diversification for AES keys, following NXP AN10922 (AES-128, CMAC based):
 *
 *     diversified = CMAC(masterKey, 0x01 || UID || AID || systemIdentifier)
 *
 * so a key read from one card tells an attacker nothing about any other card, and the master key never leaves the KeyProvider.
 * UID is the 7-byte card UID, AID the 3-byte application id, systemIdentifier a fixed string naming this system (at most 31 - 7 - 3 bytes).
 * Each key slot of the application is made different by putting the key number into the system identifier suffix (see keyInput).
 */
export function diversifyAes128(masterKey: Buffer, uid: Buffer, aid: Buffer, systemIdentifier: Buffer): Buffer {
  if (masterKey.length !== 16) throw new Error("Master key must be 16 bytes (AES-128)");
  if (uid.length !== 7) throw new Error("UID must be 7 bytes (DESFire cards use 7-byte UIDs)");
  if (aid.length !== 3) throw new Error("AID must be 3 bytes");
  const input = Buffer.concat([Buffer.from([0x01]), uid, aid, systemIdentifier]);
  if (input.length > 32) throw new Error("Diversification input is limited to 32 bytes (AN10922)");
  return aesCmac(masterKey, input);
}
