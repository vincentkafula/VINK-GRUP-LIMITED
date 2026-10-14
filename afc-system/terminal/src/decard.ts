import { ExternalKeyProvider, UltralightError, type Feedback, type JournalIo, type KeyProvider, type Transceiver, type UlcIo } from "@afc/shared";
import type { AfcDevicePlugin } from "./plugin";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A DESFire card behind the reader: commands go through the SDK's ISO 14443-4 call, answers come back with their status bytes, as DesfireSession expects. */
export class DecardTransceiver implements Transceiver {
  constructor(private readonly plugin: AfcDevicePlugin, private readonly timeoutMs = 1000) {}
  async transmit(apdu: Buffer): Promise<Buffer> {
    const r = await this.plugin.apdu({ hex: apdu.toString("hex"), timeoutMs: this.timeoutMs });
    const out = Buffer.from(r.hex, "hex");
    if (out.length < 2) throw new Error("The card's answer was too short");
    return out;
  }
}

/**
 * An Ultralight C through the reader SDK (dc_read_hex / dc_write_hex / dc_auth_ulc_hex / dc_changekey_ulc_hex). The Decard SDK has no raw "type A" command, so the
 * Ultralight EV1 password check cannot be made through it: tickets on this device are Ultralight C.
 */
export class DecardUltralightC implements UlcIo {
  readonly chip = "ulc" as const;
  constructor(private readonly plugin: AfcDevicePlugin, private readonly cachedUid: Buffer) {}
  async uid() { return this.cachedUid; }
  async read(page: number): Promise<Buffer> {
    let hex: string;
    try { hex = (await this.plugin.ulRead({ page })).hex; } catch (e) { throw new UltralightError(`read refused: ${msg(e)}`, "nak"); }
    const b = Buffer.from(hex, "hex");
    if (b.length < 16) throw new UltralightError("read returned too little", "io");
    return b.subarray(0, 16);
  }
  async write(page: number, data: Buffer): Promise<void> {
    if (data.length !== 4) throw new UltralightError("a write is exactly one page (4 bytes)");
    try { await this.plugin.ulWrite({ page, hex: data.toString("hex") }); } catch (e) { throw new UltralightError(`write refused: ${msg(e)}`, "nak"); }
  }
  async pwdAuth(): Promise<Buffer> { throw new UltralightError("this reader cannot do the Ultralight EV1 password check: use Ultralight C tickets"); }
  async ulcAuth(key: Buffer): Promise<void> {
    try { await this.plugin.ulcAuth({ keyHex: key.toString("hex") }); } catch (e) { throw new UltralightError(`authentication refused: ${msg(e)}`, "nak"); }
  }
  async ulcSetKey(key: Buffer): Promise<void> {
    try { await this.plugin.ulcSetKey({ keyHex: key.toString("hex") }); } catch (e) { throw new UltralightError(`key change refused: ${msg(e)}`, "nak"); }
  }
}

/** The device's durable journal (see JournalStore): a file on the device, appended and fsync'd by the native layer. */
export const pluginJournalIo = (plugin: AfcDevicePlugin): JournalIo => ({
  load: async () => (await plugin.journalLoad()).lines,
  append: (lines) => plugin.journalAppend({ lines }),
  replace: (line) => plugin.journalReplace({ line }),
});

/**
 * Card keys from the master keys held in the Android Keystore: the master key is never in the web view. Each call asks the native layer for
 * AES-CMAC(master key, 01 || UID || AID || system id || role), which is the NXP AN10922 diversification the whole system uses.
 */
export const keystoreKeyProvider = (plugin: AfcDevicePlugin): KeyProvider =>
  new ExternalKeyProvider(async (role, input) => Buffer.from((await plugin.keyDiversify({ role, inputHex: input.toString("hex") })).keyHex, "hex"));

/** Beeps on the reader and tells the screen what to show: one beep for success, two for a refusal. */
export class DeviceFeedback implements Feedback {
  constructor(private readonly plugin: AfcDevicePlugin, private readonly show: (kind: "ok" | "no" | "busy", message: string) => void = () => {}) {}
  private beeps(n: number) { void (async () => { for (let i = 0; i < n; i++) { await this.plugin.beep({ units: 10 }).catch(() => {}); } })(); }
  success(message: string) { this.show("ok", message); this.beeps(1); }
  fail(message: string) { this.show("no", message); this.beeps(2); }
  busy() { this.show("busy", "Reading card…"); }
}
