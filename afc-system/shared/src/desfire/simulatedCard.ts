import { randomBytes, timingSafeEqual } from "../crypto/prims";
import { aesCbcDecrypt, aesCbcEncrypt } from "../crypto/aes";
import { aesCmac } from "../crypto/cmac";
import { ACCESS, CMD, COMM, STATUS } from "./constants";
import { crc32Desfire } from "./crc32";
import type { Transceiver } from "./session";

/**
 * The card side of the protocol in DesfireSession: a software MIFARE DESFire card (AES keys, applications, value and backup files,
 * transactions with commit/abort, CMAC secure messaging). It exists so the whole system can be run and tested without hardware, and so
 * failure cases that are hard to produce with real cards (pulled away mid-transaction, reply lost after a commit) can be tested on demand.
 * It is not a security boundary and not a substitute for testing on real cards.
 */

const ZERO16 = Buffer.alloc(16);
const rotl = (b: Buffer) => Buffer.concat([b.subarray(1), b.subarray(0, 1)]);

interface ValueFile { kind: "value"; comm: number; access: Buffer; lower: number; upper: number; value: number; pending: number }
interface DataFile { kind: "backup"; comm: number; access: Buffer; data: Buffer; pending: Buffer | null }
type CardFile = ValueFile | DataFile;
interface App { keys: Buffer[]; versions: number[]; settings: number; files: Map<number, CardFile> }

export interface SimulatedCardOptions {
  uid: Buffer;
  /** Card master key; the factory default is sixteen zero bytes. */
  piccKey?: Buffer;
}

export class CardRemovedError extends Error { constructor() { super("The card was removed from the reader"); } }

export class SimulatedDesfireCard implements Transceiver {
  readonly uid: Buffer;
  private piccKey: Buffer;
  private apps = new Map<string, App>();
  private selected = "000000";
  private auth: { keyNo: number; key: Buffer; iv: Buffer } | null = null;
  private hand: { keyNo: number; key: Buffer; rndB: Buffer; encRndB: Buffer } | null = null;
  private commands = 0;

  /** Test hooks. */
  tearAfterCommands: number | null = null;       // the card leaves the field before handling this many-th command from now
  dropReplyToCommit = false;                    // the commit is applied, but the reply never reaches the reader
  log: string[] = [];

  constructor(o: SimulatedCardOptions) {
    this.uid = o.uid;
    this.piccKey = o.piccKey ?? Buffer.alloc(16);
  }

  /* ───────── test inspection ───────── */
  appIds(): string[] { return [...this.apps.keys()]; }
  value(aid: string, fileNo: number): number | undefined { const f = this.apps.get(aid)?.files.get(fileNo); return f?.kind === "value" ? f.value : undefined; }
  data(aid: string, fileNo: number): Buffer | undefined { const f = this.apps.get(aid)?.files.get(fileNo); return f?.kind === "backup" ? Buffer.from(f.data) : undefined; }
  appKey(aid: string, keyNo: number): Buffer | undefined { const k = this.apps.get(aid)?.keys[keyNo]; return k ? Buffer.from(k) : undefined; }
  piccMasterKey(): Buffer { return Buffer.from(this.piccKey); }

  /** The card leaves the field: authentication and any uncommitted change are lost. */
  private fieldLost(): void {
    this.auth = null; this.hand = null; this.selected = "000000";
    for (const app of this.apps.values()) for (const f of app.files.values()) { if (f.kind === "value") f.pending = 0; else f.pending = null; }
  }
  /** What an operator does between taps. */
  removeFromField(): void { this.fieldLost(); }

  async transmit(apdu: Buffer): Promise<Buffer> {
    this.commands++;
    if (this.tearAfterCommands !== null) {
      this.tearAfterCommands--;
      if (this.tearAfterCommands < 0) { this.tearAfterCommands = null; this.fieldLost(); throw new CardRemovedError(); }
    }
    if (apdu[0] !== 0x90 || apdu.length < 5) return Buffer.from([0x6e, 0x00]);
    const ins = apdu[1], lc = apdu[4];
    const data = apdu.subarray(5, 5 + lc);
    const { status, body, lostReply } = this.handle(ins, data);
    if (lostReply) throw new CardRemovedError();
    return Buffer.concat([body, Buffer.from([0x91, status])]);
  }

  /* ───────── command dispatch ───────── */

  private fail(status: number): { status: number; body: Buffer; lostReply?: boolean } {
    this.auth = null; this.hand = null;
    for (const app of this.apps.values()) for (const f of app.files.values()) { if (f.kind === "value") f.pending = 0; else f.pending = null; }
    return { status, body: Buffer.alloc(0) };
  }

  private appKeyFor(keyNo: number): Buffer | undefined {
    if (this.selected === "000000") return keyNo === 0 ? this.piccKey : undefined;
    return this.apps.get(this.selected)?.keys[keyNo];
  }

  private handle(ins: number, data: Buffer): { status: number; body: Buffer; lostReply?: boolean } {
    if (ins === CMD.AUTH_AES) {
      const key = this.appKeyFor(data[0]);
      if (!key) return this.fail(STATUS.NO_SUCH_KEY);
      const rndB = randomBytes(16);
      const encRndB = aesCbcEncrypt(key, ZERO16, rndB);
      this.auth = null; this.hand = { keyNo: data[0], key, rndB, encRndB };
      return { status: STATUS.ADDITIONAL_FRAME, body: encRndB };
    }
    if (ins === CMD.ADDITIONAL_FRAME) {
      const h = this.hand; this.hand = null;
      if (!h || data.length !== 32) return this.fail(STATUS.AUTHENTICATION_ERROR);
      const plain = aesCbcDecrypt(h.key, h.encRndB, data);
      const rndA = plain.subarray(0, 16), rndBr = plain.subarray(16, 32);
      if (!timingSafeEqual(rndBr, rotl(h.rndB))) return this.fail(STATUS.AUTHENTICATION_ERROR);
      const session = Buffer.concat([rndA.subarray(0, 4), h.rndB.subarray(0, 4), rndA.subarray(12, 16), h.rndB.subarray(12, 16)]);
      this.auth = { keyNo: h.keyNo, key: session, iv: ZERO16 };
      return { status: STATUS.OK, body: aesCbcEncrypt(h.key, data.subarray(16, 32), rotl(rndA)) };
    }
    if (ins === CMD.SELECT_APP) {
      const id = data.subarray(0, 3).toString("hex");
      this.fieldLostKeepingCard();
      if (id !== "000000" && !this.apps.has(id)) return { status: STATUS.APPLICATION_NOT_FOUND, body: Buffer.alloc(0) };
      this.selected = id;
      return { status: STATUS.OK, body: Buffer.alloc(0) };
    }

    // ChangeKey carries an enciphered payload, so it has its own handling
    if (ins === CMD.CHANGE_KEY) return this.changeKey(data);

    // From here on, once authenticated, every command is chained into the CMAC and every reply carries one.
    let args = data;
    const a = this.auth;
    if (a) {
      const needsMac = this.commandCarriesMac(ins, data);
      if (needsMac) {
        if (data.length < 8) return this.fail(STATUS.LENGTH_ERROR);
        args = data.subarray(0, data.length - 8);
      }
      const mac = aesCmac(a.key, Buffer.concat([Buffer.from([ins]), args]), a.iv);
      if (needsMac && !timingSafeEqual(mac.subarray(0, 8), data.subarray(data.length - 8))) return this.fail(STATUS.INTEGRITY_ERROR);
      a.iv = mac;
    }

    const r = this.execute(ins, args);
    if (r.status !== STATUS.OK) return this.fail(r.status);
    if (ins === CMD.COMMIT && this.dropReplyToCommit) { this.dropReplyToCommit = false; return { status: STATUS.OK, body: Buffer.alloc(0), lostReply: true }; }
    if (!this.auth) return { status: STATUS.OK, body: r.body };
    const full = aesCmac(this.auth.key, Buffer.concat([r.body, Buffer.from([STATUS.OK])]), this.auth.iv);
    this.auth.iv = full;
    return { status: STATUS.OK, body: Buffer.concat([r.body, full.subarray(0, 8)]) };
  }

  /** Select ends authentication and discards uncommitted changes, as on a real card. */
  private fieldLostKeepingCard(): void {
    this.auth = null; this.hand = null;
    for (const app of this.apps.values()) for (const f of app.files.values()) { if (f.kind === "value") f.pending = 0; else f.pending = null; }
  }

  private commandCarriesMac(ins: number, data: Buffer): boolean {
    if (ins !== CMD.DEBIT && ins !== CMD.CREDIT && ins !== CMD.WRITE_DATA) return false;
    const f = this.currentApp()?.files.get(data[0]);
    return !!f && f.comm === COMM.MACED;
  }

  private currentApp(): App | undefined { return this.selected === "000000" ? undefined : this.apps.get(this.selected); }

  /** True if the authenticated key (or free access) satisfies one of the allowed access-right nibbles. */
  private allowed(...nibbles: number[]): boolean {
    if (nibbles.includes(ACCESS.FREE)) return true;
    return !!this.auth && nibbles.includes(this.auth.keyNo);
  }
  private rights(f: CardFile) { return { rw: f.access[0] >> 4, change: f.access[0] & 0xf, read: f.access[1] >> 4, write: f.access[1] & 0xf }; }

  private execute(ins: number, a: Buffer): { status: number; body: Buffer } {
    const ok = (body: Buffer = Buffer.alloc(0)) => ({ status: STATUS.OK, body });
    const no = (status: number) => ({ status, body: Buffer.alloc(0) });
    const card = this.selected === "000000";
    const app = this.currentApp();

    switch (ins) {
      case CMD.FORMAT_PICC:
        if (!card || !this.auth || this.auth.keyNo !== 0) return no(STATUS.PERMISSION_DENIED);
        this.apps.clear(); return ok();
      case CMD.CREATE_APP: {
        if (!card || !this.auth || this.auth.keyNo !== 0) return no(STATUS.PERMISSION_DENIED);
        const id = a.subarray(0, 3).toString("hex");
        if (this.apps.has(id)) return no(STATUS.DUPLICATE_ERROR);
        const n = a[4] & 0x0f;
        if ((a[4] & 0x80) === 0 || n < 1 || n > 14) return no(STATUS.PARAMETER_ERROR);
        this.apps.set(id, { settings: a[3], keys: Array.from({ length: n }, () => Buffer.alloc(16)), versions: Array(n).fill(0), files: new Map() });
        return ok();
      }
      case CMD.DELETE_APP:
        if (!card || !this.auth || this.auth.keyNo !== 0) return no(STATUS.PERMISSION_DENIED);
        return this.apps.delete(a.subarray(0, 3).toString("hex")) ? ok() : no(STATUS.APPLICATION_NOT_FOUND);
      case CMD.GET_KEY_VERSION: {
        const v = app ? app.versions[a[0]] : a[0] === 0 ? 0 : undefined;
        return v === undefined ? no(STATUS.PARAMETER_ERROR) : ok(Buffer.from([v]));
      }
      case CMD.CREATE_VALUE_FILE:
      case CMD.CREATE_BACKUP_FILE: {
        if (!app || !this.auth || this.auth.keyNo !== 0) return no(STATUS.PERMISSION_DENIED);
        const fileNo = a[0];
        if (app.files.has(fileNo)) return no(STATUS.DUPLICATE_ERROR);
        const comm = a[1], access = Buffer.from(a.subarray(2, 4));
        if (ins === CMD.CREATE_VALUE_FILE) {
          const lower = a.readInt32LE(4), upper = a.readInt32LE(8), value = a.readInt32LE(12);
          if (lower > upper || value < lower || value > upper) return no(STATUS.PARAMETER_ERROR);
          app.files.set(fileNo, { kind: "value", comm, access, lower, upper, value, pending: 0 });
        } else {
          const size = a.readUIntLE(4, 3);
          app.files.set(fileNo, { kind: "backup", comm, access, data: Buffer.alloc(size), pending: null });
        }
        return ok();
      }
      case CMD.GET_VALUE: {
        const f = app?.files.get(a[0]);
        if (!f) return no(STATUS.FILE_NOT_FOUND);
        if (f.kind !== "value") return no(STATUS.ILLEGAL_COMMAND);
        const r = this.rights(f);
        if (!this.allowed(r.read, r.write, r.rw)) return no(STATUS.PERMISSION_DENIED);
        const b = Buffer.alloc(4); b.writeInt32LE(f.value); return ok(b);
      }
      case CMD.DEBIT:
      case CMD.CREDIT: {
        const f = app?.files.get(a[0]);
        if (!f) return no(STATUS.FILE_NOT_FOUND);
        if (f.kind !== "value") return no(STATUS.ILLEGAL_COMMAND);
        const r = this.rights(f);
        if (!(ins === CMD.DEBIT ? this.allowed(r.read, r.write, r.rw) : this.allowed(r.write, r.rw))) return no(STATUS.PERMISSION_DENIED);
        const amount = a.readInt32LE(1);
        if (amount < 0) return no(STATUS.PARAMETER_ERROR);
        const next = f.value + f.pending + (ins === CMD.DEBIT ? -amount : amount);
        if (next < f.lower || next > f.upper) return no(STATUS.BOUNDARY_ERROR);
        f.pending += ins === CMD.DEBIT ? -amount : amount;
        return ok();
      }
      case CMD.READ_DATA: {
        const f = app?.files.get(a[0]);
        if (!f) return no(STATUS.FILE_NOT_FOUND);
        if (f.kind !== "backup") return no(STATUS.ILLEGAL_COMMAND);
        const r = this.rights(f);
        if (!this.allowed(r.read, r.rw)) return no(STATUS.PERMISSION_DENIED);
        const off = a.readUIntLE(1, 3), len = a.readUIntLE(4, 3) || f.data.length - off;
        if (off + len > f.data.length) return no(STATUS.BOUNDARY_ERROR);
        return ok(Buffer.from(f.data.subarray(off, off + len)));
      }
      case CMD.WRITE_DATA: {
        const f = app?.files.get(a[0]);
        if (!f) return no(STATUS.FILE_NOT_FOUND);
        if (f.kind !== "backup") return no(STATUS.ILLEGAL_COMMAND);
        const r = this.rights(f);
        if (!this.allowed(r.write, r.rw)) return no(STATUS.PERMISSION_DENIED);
        const off = a.readUIntLE(1, 3), len = a.readUIntLE(4, 3), payload = a.subarray(7, 7 + len);
        if (payload.length !== len || off + len > f.data.length) return no(STATUS.BOUNDARY_ERROR);
        f.pending = f.pending ?? Buffer.from(f.data);
        payload.copy(f.pending, off);
        return ok();
      }
      case CMD.COMMIT: {
        if (!app) return no(STATUS.ILLEGAL_COMMAND);
        for (const f of app.files.values()) {
          if (f.kind === "value") { f.value += f.pending; f.pending = 0; }
          else if (f.pending) { f.data = f.pending; f.pending = null; }
        }
        return ok();
      }
      case CMD.ABORT: {
        if (!app) return no(STATUS.ILLEGAL_COMMAND);
        for (const f of app.files.values()) { if (f.kind === "value") f.pending = 0; else f.pending = null; }
        return ok();
      }
      default:
        return no(STATUS.ILLEGAL_COMMAND);
    }
  }

  private changeKey(data: Buffer): { status: number; body: Buffer } {
    const a = this.auth;
    if (!a || data.length < 33) return this.fail(STATUS.PERMISSION_DENIED);
    const keyByte = data[0], keyNo = keyByte & 0x0f;
    const decrypted = aesCbcDecrypt(a.key, a.iv, data.subarray(1));
    a.iv = data.subarray(data.length - 16);
    const app = this.currentApp();
    const cardLevel = this.selected === "000000";
    if (cardLevel ? (keyNo !== 0 || a.keyNo !== 0) : (!app || keyNo >= app.keys.length || a.keyNo !== 0)) return this.fail(STATUS.PERMISSION_DENIED);
    const oldKey = cardLevel ? this.piccKey : app!.keys[keyNo];
    const same = keyNo === a.keyNo;
    let newKey: Buffer, version: number;
    if (same) {
      newKey = decrypted.subarray(0, 16); version = decrypted[16];
      const crc = decrypted.subarray(17, 21);
      if (!crc32Desfire(Buffer.concat([Buffer.from([CMD.CHANGE_KEY, keyByte]), decrypted.subarray(0, 17)])).equals(crc)) return this.fail(STATUS.INTEGRITY_ERROR);
    } else {
      const xored = decrypted.subarray(0, 16); version = decrypted[16];
      const crc1 = decrypted.subarray(17, 21), crc2 = decrypted.subarray(21, 25);
      if (!crc32Desfire(Buffer.concat([Buffer.from([CMD.CHANGE_KEY, keyByte]), decrypted.subarray(0, 17)])).equals(crc1)) return this.fail(STATUS.INTEGRITY_ERROR);
      newKey = Buffer.alloc(16); for (let i = 0; i < 16; i++) newKey[i] = xored[i] ^ oldKey[i];
      if (!crc32Desfire(newKey).equals(crc2)) return this.fail(STATUS.INTEGRITY_ERROR);
    }
    if (cardLevel) this.piccKey = Buffer.from(newKey); else { app!.keys[keyNo] = Buffer.from(newKey); app!.versions[keyNo] = version; }
    if (same) { this.auth = null; return { status: STATUS.OK, body: Buffer.alloc(0) }; }
    const full = aesCmac(a.key, Buffer.from([STATUS.OK]), a.iv);
    a.iv = full;
    return { status: STATUS.OK, body: full.subarray(0, 8) };
  }
}
