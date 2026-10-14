import { createInterface } from "node:readline";
import { DesfireSession, DevKeyProvider, personalizeCard, SAMPLE_CARDS, SimulatedDesfireCard, SimulatedUltralight, UltralightError, type Transceiver, type UltralightIo } from "@afc/shared";

/** What a reader gives the tap flow: the card's UID and a way to talk to it. */
/** A fare card (DESFire, talks ISO 14443-4 through `transceiver`) or a single-trip ticket card (Ultralight, read and written by page through `ultralight`). */
export interface CardEvent { uid: Buffer; transceiver?: Transceiver; ultralight?: UltralightIo }

/**
 * An Ultralight through a PC/SC reader's pseudo-APDUs (ACR122U / ACR1252U): Get UID FF CA 00 00 00, Read Binary FF B0 00 <page> 10, Update Binary
 * FF D6 00 <page> 04 <4 bytes>, and the chip's own PWD_AUTH (1B) through the reader's pass-through FF 00 00 00 <len> D4 42 <command>.
 * Written from the ACR122U manual; not exercised on hardware here: run a ticket write and read on the bench first.
 */
export class PcscUltralight implements UltralightIo {
  constructor(private readonly tx: Transceiver, private readonly cachedUid: Buffer) {}
  private async send(apdu: number[], what: string): Promise<Buffer> {
    const r = await this.tx.transmit(Buffer.from(apdu));
    if (r.length < 2) throw new UltralightError(`${what}: short answer`, "io");
    const sw = r.subarray(r.length - 2);
    if (sw[0] !== 0x90 || sw[1] !== 0x00) throw new UltralightError(`${what} refused (${sw.toString("hex")})`, sw[0] === 0x63 ? "nak" : "io");
    return r.subarray(0, r.length - 2);
  }
  async uid() { return this.cachedUid; }
  async read(page: number) { const d = await this.send([0xff, 0xb0, 0x00, page, 0x10], "read"); if (d.length !== 16) throw new UltralightError("read returned the wrong length", "io"); return d; }
  async write(page: number, data: Buffer) { await this.send([0xff, 0xd6, 0x00, page, 0x04, ...data], "write"); }
  async pwdAuth(pwd: Buffer) {
    const d = await this.send([0xff, 0x00, 0x00, 0x00, 0x07, 0xd4, 0x42, 0x1b, ...pwd], "password");
    if (d.length < 5 || d[0] !== 0xd5 || d[1] !== 0x43 || d[2] !== 0x00) throw new UltralightError("wrong password", "nak");
    return Buffer.from(d.subarray(3, 5));
  }
}
export interface CardReader {
  start(onCard: (c: CardEvent) => void | Promise<void>): Promise<void>;
  stop(): Promise<void>;
}

/**
 * A real PC/SC reader (ACR122U, ACR1252U, any CCID reader) through the `nfc-pcsc` package, which needs the PC/SC service:
 * `sudo apt install pcscd libpcsclite-dev` on the Pi, nothing to install on Windows or macOS.
 * autoProcessing is off: this library's own NDEF handling is for NTAG tags, not DESFire.
 */
export class PcscReader implements CardReader {
  private nfc: { close(): void } | undefined;
  async start(onCard: (c: CardEvent) => void | Promise<void>): Promise<void> {
    let mod: { NFC: new (logger?: unknown) => { on(e: string, f: (r: any) => void): void; close(): void } };   // eslint-disable-line @typescript-eslint/no-explicit-any
    try { mod = (await import("nfc-pcsc")) as never; }
    catch { throw new Error("The nfc-pcsc package is not installed or could not load the PC/SC library. Install pcscd (Linux) and run `npm install` again, or use the simulator (SIMULATOR=1)."); }
    const nfc = new mod.NFC(); this.nfc = nfc;
    nfc.on("reader", (reader: any) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
      reader.autoProcessing = false;
      console.log(`[reader] ${reader.reader.name} ready`);
      reader.on("card", (card: { uid?: string; atr?: Buffer; type?: string }) => {
        const uid = card.uid ? Buffer.from(card.uid, "hex") : undefined;
        if (!uid || uid.length !== 7) { console.log(`[reader] ignoring a card with a ${uid?.length ?? 0}-byte UID (DESFire cards have 7)`); return; }
        // PC/SC returns the response followed by the 2 status bytes, which is exactly what DesfireSession expects
        const transceiver: Transceiver = { transmit: (apdu) => reader.transmit(apdu, 64) };
        // an Ultralight (ISO 14443-3, no APDU layer) is a ticket card; a DESFire (ISO 14443-4) is a fare card
        if (card.type === "TAG_ISO_14443_3") void onCard({ uid, ultralight: new PcscUltralight(transceiver, uid) });
        else void onCard({ uid, transceiver });
      });
      reader.on("error", (e: Error) => console.error("[reader] error:", e.message));
    });
    nfc.on("error", (e: Error) => console.error("[nfc] error:", e.message));
  }
  async stop(): Promise<void> { this.nfc?.close(); }
}

/**
 * No hardware needed: a handful of software DESFire cards (the demo cards, personalised with the same keys the validator uses) and a
 * command line to tap them. Commands: `tap <uid|name>`, `list`, `stop <stopId>`, `tear <n>` (the next card loses contact after n commands),
 * `lose-reply` (the next commit succeeds but the reply is lost), `topup <uid> <cents>`, `quit`.
 */
export class SimulatedReader implements CardReader {
  readonly cards = new Map<string, SimulatedDesfireCard>();
  /** Ticket cards by UID. Tickets are written by the encoding station (scripts/ticket.ts) or by tests. */
  readonly tickets = new Map<string, SimulatedUltralight>();
  private rl: ReturnType<typeof createInterface> | undefined;
  private onCard: ((c: CardEvent) => void | Promise<void>) | undefined;
  constructor(private readonly keys: DevKeyProvider, private readonly hooks: { setStop?: (id: number) => void; topup?: (uid: Buffer, cents: number) => Promise<number>; log?: (m: string) => void } = {}) {}

  /** Prepares the demo cards on the "card" side. */
  async personalizeDemoCards(): Promise<void> {
    for (const c of SAMPLE_CARDS) {
      const uid = Buffer.from(c.uid, "hex");
      const card = new SimulatedDesfireCard({ uid });
      await personalizeCard(new DesfireSession(card), uid, this.keys, { initialBalance: c.balance });
      card.removeFromField();
      this.cards.set(c.uid, card);
    }
  }

  /** Taps a ticket card. */
  async tapTicket(uid: string): Promise<void> {
    const card = this.tickets.get(uid);
    if (!card || !this.onCard) { this.hooks.log?.(`no such ticket card: ${uid}`); return; }
    card.removeFromField();
    await this.onCard({ uid: card.serial, ultralight: card });
  }

  /** Programmatic tap, used by tests and by the command line. */
  async tap(uidOrName: string): Promise<void> {
    const key = [...this.cards.keys()].find((k) => k === uidOrName || SAMPLE_CARDS.find((c) => c.uid === k)?.holder.toLowerCase().includes(uidOrName.toLowerCase()));
    const card = key ? this.cards.get(key) : undefined;
    if (!card || !this.onCard) { this.hooks.log?.(`no such card: ${uidOrName}`); return; }
    card.removeFromField();
    await this.onCard({ uid: card.uid, transceiver: card });
  }

  async start(onCard: (c: CardEvent) => void | Promise<void>): Promise<void> {
    this.onCard = onCard;
    if (!process.stdin.isTTY && !process.env.SIM_FORCE_STDIN) return;
    const say = this.hooks.log ?? console.log;
    say("Simulator ready. Commands: tap <uid|name>, list, stop <id>, tear <n>, lose-reply, topup <uid> <cents>, quit");
    this.rl = createInterface({ input: process.stdin });
    this.rl.on("line", async (line) => {
      const [cmd, a, b] = line.trim().split(/\s+/);
      try {
        if (cmd === "tap") await this.tap(a);
        else if (cmd === "ticket") await this.tapTicket(a);
        else if (cmd === "list") for (const c of SAMPLE_CARDS) say(`  ${c.uid}  ${c.holder}`);
        else if (cmd === "stop") { this.hooks.setStop?.(Number(a)); say(`stop is now ${a}`); }
        else if (cmd === "tear") { const c = this.cards.get(a); if (c) { c.tearAfterCommands = Number(b ?? 2); say("will tear"); } else say("tear <uid> <n>"); }
        else if (cmd === "lose-reply") { const c = this.cards.get(a); if (c) { c.dropReplyToCommit = true; say("next commit reply will be lost"); } else say("lose-reply <uid>"); }
        else if (cmd === "topup") { const c = this.cards.get(a); if (c && this.hooks.topup) say(`balance now ${await this.hooks.topup(c.uid, Number(b))} cents`); }
        else if (cmd === "quit") process.exit(0);
        else if (cmd) say("unknown command");
      } catch (e) { say("error: " + (e instanceof Error ? e.message : String(e))); }
    });
  }
  async stop(): Promise<void> { this.rl?.close(); }
}
