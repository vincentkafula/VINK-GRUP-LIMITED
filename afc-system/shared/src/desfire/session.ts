import { randomBytes, timingSafeEqual } from "../crypto/prims";
import { aesCbcDecrypt, aesCbcEncrypt } from "../crypto/aes";
import { aesCmac } from "../crypto/cmac";
import { CMD, STATUS, STATUS_NAME } from "./constants";
import { crc32Desfire } from "./crc32";

/**
 * Reader-side MIFARE DESFire session: ISO 7816-4 wrapped native commands, AES authentication (AuthenticateEV1 with an AES key,
 * which EV2/EV3 cards accept in their EV1-compatible mode), session key derivation, and CMAC chaining for MACed communication.
 *
 * Written from NXP's MF3ICDx1 / MF3D(H)x2 datasheets. It is exercised against the card simulator in this repository
 * (SimulatedDesfireCard, which implements the card side of the same rules); run `npm run selftest` against a real card
 * before trusting it in production, and keep a spare card for the first personalisation.
 */

export interface Transceiver { transmit(apdu: Buffer): Promise<Buffer> }

export class DesfireError extends Error {
  constructor(public readonly status: number, context = "") {
    super(`DESFire ${STATUS_NAME[status] ?? "0x" + status.toString(16)}${context ? " (" + context + ")" : ""}`);
  }
}

const ZERO16 = Buffer.alloc(16);
const rotl = (b: Buffer) => Buffer.concat([b.subarray(1), b.subarray(0, 1)]);
const le = (n: number, bytes: number) => { const b = Buffer.alloc(bytes); b.writeUIntLE(n >>> 0, 0, bytes); return b; };

export class DesfireSession {
  private key?: Buffer;          // session key once authenticated
  private iv: Buffer = ZERO16;  // CMAC chain value
  private authKeyNo = -1;

  constructor(private readonly transceiver: Transceiver) {}

  get authenticated(): boolean { return !!this.key; }
  get authenticatedKeyNo(): number { return this.authKeyNo; }

  /* ───────── framing ───────── */

  private async native(ins: number, data: Buffer = Buffer.alloc(0)): Promise<{ status: number; data: Buffer }> {
    const apdu = data.length
      ? Buffer.concat([Buffer.from([0x90, ins, 0x00, 0x00, data.length]), data, Buffer.from([0x00])])
      : Buffer.from([0x90, ins, 0x00, 0x00, 0x00]);
    const r = await this.transceiver.transmit(apdu);
    if (r.length < 2) throw new Error("The card sent a response that is too short");
    if (r[r.length - 2] !== 0x91) throw new Error(`Unexpected ISO status ${r.subarray(r.length - 2).toString("hex")}`);
    return { status: r[r.length - 1], data: r.subarray(0, r.length - 2) };
  }

  private drop(): void { this.key = undefined; this.iv = ZERO16; this.authKeyNo = -1; }

  /** Runs one authenticated command. `macCommand` sends the 8-byte CMAC with it (files in MACed mode, for commands that carry data). */
  private async exec(ins: number, header: Buffer, body: Buffer = Buffer.alloc(0), macCommand = false): Promise<Buffer> {
    let wire = Buffer.concat([header, body]);
    if (this.key) {
      const mac = aesCmac(this.key, Buffer.concat([Buffer.from([ins]), header, body]), this.iv);
      this.iv = mac;
      if (macCommand) wire = Buffer.concat([wire, mac.subarray(0, 8)]);
    }
    const r = await this.native(ins, wire);
    if (r.status !== STATUS.OK) { this.drop(); throw new DesfireError(r.status, "command 0x" + ins.toString(16)); }
    return this.verify(r.data);
  }

  /** Checks the CMAC the card puts at the end of every response once authenticated, and returns the data without it. */
  private verify(data: Buffer): Buffer {
    if (!this.key) return data;
    if (data.length < 8) { this.drop(); throw new DesfireError(STATUS.INTEGRITY_ERROR, "response has no MAC"); }
    const payload = data.subarray(0, data.length - 8), got = data.subarray(data.length - 8);
    const full = aesCmac(this.key, Buffer.concat([payload, Buffer.from([STATUS.OK])]), this.iv);
    this.iv = full;
    if (!timingSafeEqual(full.subarray(0, 8), got)) { this.drop(); throw new DesfireError(STATUS.INTEGRITY_ERROR, "response MAC does not match"); }
    return payload;
  }

  /* ───────── selecting and authenticating ───────── */

  /** Selects an application (000000 = the card itself). Ends any authentication. */
  async selectApplication(aid: Buffer): Promise<void> {
    this.drop();
    const r = await this.native(CMD.SELECT_APP, Buffer.from([aid[0], aid[1], aid[2]]));
    if (r.status !== STATUS.OK) throw new DesfireError(r.status, "select application");
  }

  /** AES authentication with key number `keyNo`. Proves both sides hold the key without sending it. */
  async authenticate(keyNo: number, key: Buffer): Promise<void> {
    this.drop();
    if (key.length !== 16) throw new Error("AES key must be 16 bytes");
    const s1 = await this.native(CMD.AUTH_AES, Buffer.from([keyNo]));
    if (s1.status !== STATUS.ADDITIONAL_FRAME || s1.data.length !== 16) throw new DesfireError(s1.status, "authentication start");
    const encRndB = s1.data;
    const rndB = aesCbcDecrypt(key, ZERO16, encRndB);
    const rndA = randomBytes(16);
    const token = aesCbcEncrypt(key, encRndB, Buffer.concat([rndA, rotl(rndB)]));
    const s2 = await this.native(CMD.ADDITIONAL_FRAME, token);
    if (s2.status !== STATUS.OK || s2.data.length !== 16) throw new DesfireError(s2.status, "authentication");
    const rndA2 = aesCbcDecrypt(key, token.subarray(16, 32), s2.data);
    if (!timingSafeEqual(rndA2, rotl(rndA))) throw new DesfireError(STATUS.AUTHENTICATION_ERROR, "the card does not know the key");
    this.key = Buffer.concat([rndA.subarray(0, 4), rndB.subarray(0, 4), rndA.subarray(12, 16), rndB.subarray(12, 16)]);
    this.iv = ZERO16;
    this.authKeyNo = keyNo;
  }

  /* ───────── fare operations ───────── */

  async getValue(fileNo: number): Promise<number> {
    const d = await this.exec(CMD.GET_VALUE, Buffer.from([fileNo]));
    if (d.length !== 4) throw new DesfireError(STATUS.LENGTH_ERROR, "value");
    return d.readInt32LE(0);
  }
  /** Takes `amount` from a value file. Nothing changes on the card until commit(). */
  async debit(fileNo: number, amount: number): Promise<void> { await this.exec(CMD.DEBIT, Buffer.from([fileNo]), le(amount, 4), true); }
  async credit(fileNo: number, amount: number): Promise<void> { await this.exec(CMD.CREDIT, Buffer.from([fileNo]), le(amount, 4), true); }
  /** Applies every change made since authentication in one step: all of them, or none. */
  async commit(): Promise<void> { await this.exec(CMD.COMMIT, Buffer.alloc(0)); }
  async abort(): Promise<void> { await this.exec(CMD.ABORT, Buffer.alloc(0)); }

  async readData(fileNo: number, offset: number, length: number): Promise<Buffer> {
    const d = await this.exec(CMD.READ_DATA, Buffer.concat([Buffer.from([fileNo]), le(offset, 3), le(length, 3)]));
    if (d.length !== length) throw new DesfireError(STATUS.LENGTH_ERROR, "data");
    return d;
  }
  /** Writes into a backup data file; becomes permanent at the next commit(). */
  async writeData(fileNo: number, offset: number, data: Buffer): Promise<void> {
    await this.exec(CMD.WRITE_DATA, Buffer.concat([Buffer.from([fileNo]), le(offset, 3), le(data.length, 3)]), data, true);
  }

  /* ───────── personalisation (needs the card or application master key) ───────── */

  async formatCard(): Promise<void> { await this.exec(CMD.FORMAT_PICC, Buffer.alloc(0)); }
  async deleteApplication(aid: Buffer): Promise<void> { await this.exec(CMD.DELETE_APP, aid); }
  async createApplication(aid: Buffer, keySettings: number, numKeysWithType: number): Promise<void> {
    await this.exec(CMD.CREATE_APP, Buffer.concat([aid, Buffer.from([keySettings, numKeysWithType])]));
  }
  async createValueFile(f: { fileNo: number; comm: number; access: Buffer; lower: number; upper: number; initial: number; limitedCredit?: boolean }): Promise<void> {
    await this.exec(CMD.CREATE_VALUE_FILE, Buffer.concat([Buffer.from([f.fileNo, f.comm]), f.access, le(f.lower, 4), le(f.upper, 4), le(f.initial, 4), Buffer.from([f.limitedCredit ? 1 : 0])]));
  }
  async createBackupFile(f: { fileNo: number; comm: number; access: Buffer; size: number }): Promise<void> {
    await this.exec(CMD.CREATE_BACKUP_FILE, Buffer.concat([Buffer.from([f.fileNo, f.comm]), f.access, le(f.size, 3)]));
  }
  async getKeyVersion(keyNo: number): Promise<number> { return (await this.exec(CMD.GET_KEY_VERSION, Buffer.from([keyNo])))[0]; }

  /**
   * Replaces key `keyNo`. `oldKey` is the current value of that key, needed when it is not the key this session authenticated with.
   * Changing the key you are authenticated with ends the session (authenticate again with the new key). `cardLevel` is for the card's
   * own master key (selected application 000000), which carries the AES type flag in the key number.
   */
  async changeKey(keyNo: number, newKey: Buffer, version: number, oldKey?: Buffer, cardLevel = false): Promise<void> {
    if (!this.key) throw new Error("Authenticate before changing a key");
    const keyByte = cardLevel ? (keyNo | 0x80) : keyNo;
    const same = keyNo === this.authKeyNo;
    let body: Buffer;
    if (same) {
      body = Buffer.concat([newKey, Buffer.from([version])]);
      body = Buffer.concat([body, crc32Desfire(Buffer.concat([Buffer.from([CMD.CHANGE_KEY, keyByte]), body]))]);
    } else {
      if (!oldKey) throw new Error("The current value of the key is needed to change it from another key");
      const xored = Buffer.alloc(16); for (let i = 0; i < 16; i++) xored[i] = newKey[i] ^ oldKey[i];
      body = Buffer.concat([xored, Buffer.from([version])]);
      body = Buffer.concat([body, crc32Desfire(Buffer.concat([Buffer.from([CMD.CHANGE_KEY, keyByte]), body])), crc32Desfire(newKey)]);
    }
    const padded = Buffer.concat([body, Buffer.alloc((16 - (body.length % 16)) % 16)]);
    const cipher = aesCbcEncrypt(this.key, this.iv, padded);
    this.iv = cipher.subarray(cipher.length - 16);
    const r = await this.native(CMD.CHANGE_KEY, Buffer.concat([Buffer.from([keyByte]), cipher]));
    if (r.status !== STATUS.OK) { this.drop(); throw new DesfireError(r.status, "change key"); }
    if (same) { this.drop(); return; }                       // the key that authenticated this session no longer exists
    this.verify(r.data);
  }
}
