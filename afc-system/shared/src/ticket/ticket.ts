import { ed25519 } from "@noble/curves/ed25519.js";
import type { KeyProvider } from "../keys";
import { UL21, UltralightError, type UltralightIo } from "./ultralight";

/**
 * Single-trip tickets on MIFARE Ultralight.
 *
 *   pages 4-7    ticket data, 16 bytes:  version, key id, route (0 = any), ticket number, valid from, valid until
 *   pages 8-23   Ed25519 signature, 64 bytes, over "AFC-TICKET1" || data || the card's UID
 *   pages 24-25  "used" record: unused = zeros; used = flag + device + time
 *
 * Why this is safe to hand to validators: they hold only the PUBLIC key, so they can check a ticket but never make one. The signature covers the
 * card's UID, so copying the data onto another card does not verify. Writes are protected by a per-card password derived from the TICKET master key, so a
 * passenger with a phone cannot reset the "used" record. What it cannot stop: a full copy of an UNUSED ticket onto a card with the same UID
 * (needs special cards). The server notices when one ticket number is used twice and flags it, and tickets are short-lived and cheap.
 */
export const TICKET = { DATA: 4, SIG: 8, USED: 24, LAST: 25, VERSION: 1 } as const;
export const MAGIC = Buffer.from("AFC-TICKET1");

export interface TicketData { keyId: number; routeId: number; ticketId: number; validFrom: number; validUntil: number }

export function encodeTicket(t: TicketData): Buffer {
  const b = Buffer.alloc(16);
  b[0] = TICKET.VERSION; b[1] = t.keyId; b.writeUInt16LE(t.routeId, 2); b.writeUInt32LE(t.ticketId >>> 0, 4); b.writeUInt32LE(t.validFrom >>> 0, 8); b.writeUInt32LE(t.validUntil >>> 0, 12);
  return b;
}
export function decodeTicket(b: Buffer): TicketData | null {
  if (b.length !== 16 || b[0] !== TICKET.VERSION) return null;
  return { keyId: b[1], routeId: b.readUInt16LE(2), ticketId: b.readUInt32LE(4), validFrom: b.readUInt32LE(8), validUntil: b.readUInt32LE(12) };
}

const message = (data: Buffer, uid: Buffer) => Buffer.concat([MAGIC, data, uid]);

/* ───────── checking a signature (portable: runs on a validator, in a web view, anywhere) ───────── */
/** The raw 32-byte Ed25519 public key from its hex form. */
export const publicKeyFromHex = (hex: string): Uint8Array => { const b = Buffer.from(hex, "hex"); if (b.length !== 32) throw new Error("An Ed25519 public key is 32 bytes"); return b; };
export const verifyTicket = (publicKey: Uint8Array, data: Buffer, sig: Buffer, uid: Buffer): boolean => {
  if (sig.length !== 64) return false;
  try { return ed25519.verify(sig, message(data, uid), publicKey); } catch { return false; }
};

/* ───────── the card's write password, from the TICKET master key ───────── */
export async function ticketPassword(keys: KeyProvider, uid: Buffer): Promise<{ pwd: Buffer; pack: Buffer }> {
  const k = await keys.cardKey(uid, "TICKET");
  const pwd = Buffer.from(k.subarray(0, 4));
  if (pwd.equals(Buffer.alloc(4, 0xff))) pwd[0] = 0xfe;       // all FF is the factory password; never use it
  return { pwd, pack: Buffer.from(k.subarray(4, 6)) };
}

/* ───────── reading and writing a card ───────── */
export interface TicketRead { uid: Buffer; data: Buffer; signature: Buffer; ticket: TicketData | null; used: { usedAt: number; deviceTag: number } | null; blank: boolean }

export async function readTicket(io: UltralightIo): Promise<TicketRead> {
  const uid = await io.uid();
  const raw = Buffer.concat(await Promise.all([4, 8, 12, 16, 20, 24].map((p) => io.read(p))));      // pages 4..27
  const data = raw.subarray(0, 16), signature = raw.subarray(16, 80), usedPages = raw.subarray(80, 88);
  const blank = raw.subarray(0, 96).every((b) => b === 0);
  const flagged = usedPages[0] !== 0;
  return { uid, data: Buffer.from(data), signature: Buffer.from(signature), ticket: decodeTicket(data), blank, used: flagged ? { deviceTag: usedPages.readUInt16LE(1), usedAt: usedPages.readUInt32LE(4) } : null };
}

const pageWrite = async (io: UltralightIo, first: number, bytes: Buffer) => { for (let i = 0; i < bytes.length; i += 4) await io.write(first + i / 4, bytes.subarray(i, i + 4)); };

/**
 * Puts a ticket on a card. A factory-fresh card is written, given its password and protected from page 4 up, then its configuration is
 * locked. A card that already holds one of our tickets is re-authenticated with its password and rewritten (its configuration is already locked).
 * Everything is read back and compared before reporting success.
 */
export async function writeTicket(io: UltralightIo, keys: KeyProvider, data: Buffer, signature: Buffer): Promise<void> {
  if (data.length !== 16 || signature.length !== 64) throw new Error("ticket data or signature has the wrong size");
  const uid = await io.uid();
  const { pwd, pack } = await ticketPassword(keys, uid);
  const cfg0 = (await io.read(UL21.CFG0)).subarray(0, 4);
  const protectedAlready = cfg0[3] !== 0xff && cfg0[3] <= TICKET.DATA;
  const payload = Buffer.concat([data, signature, Buffer.alloc(8)]);       // data, signature, an empty "used" record

  if (protectedAlready) {
    const got = await io.pwdAuth(pwd).catch(() => { throw new Error("This card holds a ticket from somewhere else (its password is not ours), or has been locked by wrong attempts"); });
    if (!got.equals(pack)) throw new Error("The card answered the password but not with our acknowledge: it is not our card");
    await pageWrite(io, TICKET.DATA, payload);
  } else {
    await pageWrite(io, TICKET.DATA, payload);
    await io.write(UL21.PWD, pwd);
    await io.write(UL21.PACK, Buffer.concat([pack, Buffer.alloc(2)]));
    await io.write(UL21.CFG1, Buffer.from([0x05, 0, 0, 0]));                                 // PROT=0 (read free, write needs password), AUTHLIM=5, not yet locked
    await io.write(UL21.CFG0, Buffer.from([0, 0, 0, TICKET.DATA]));                          // AUTH0 = 4: writes from page 4 up now need the password
    await io.pwdAuth(pwd);
    await io.write(UL21.CFG1, Buffer.from([0x45, 0, 0, 0]));                                 // set CFGLCK: the configuration can never change again
  }

  const back = await readTicket(io);
  if (!back.data.equals(data) || !back.signature.equals(signature) || back.used) throw new Error("The card did not hold what was written");
  // prove the protection took: writes protected from page 4 up, and the configuration locked for good
  const c = await io.read(UL21.CFG0);
  if (c[3] !== TICKET.DATA) throw new Error("The card did not accept write protection (AUTH0)");
  if ((c[4] & 0x40) === 0) throw new Error("The card did not lock its configuration (CFGLCK)");
}

/**
 * Records the ticket as used: password, then the time page, then the flag page (so a half-written record never looks used-without-a-time).
 * Returns once the record has been read back.
 */
export async function markTicketUsed(io: UltralightIo, keys: KeyProvider, nowSeconds: number, deviceTag: number): Promise<void> {
  const uid = await io.uid();
  const { pwd, pack } = await ticketPassword(keys, uid);
  const got = await io.pwdAuth(pwd);
  if (!got.equals(pack)) throw new UltralightError("not our card");
  const t = Buffer.alloc(4); t.writeUInt32LE(nowSeconds >>> 0);
  await io.write(TICKET.USED + 1, t);
  await io.write(TICKET.USED, Buffer.from([0x55, deviceTag & 0xff, (deviceTag >> 8) & 0xff, 0]));
  const back = await readTicket(io);
  if (!back.used) throw new UltralightError("the used record did not stick");
}
