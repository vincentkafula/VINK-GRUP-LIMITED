import { JournalStore, SyncClient, TapProcessor, TicketProcessor, type Feedback, type KeyProvider, type TapOutcome, type TapStore } from "@afc/shared";
import { DecardTransceiver, DecardUltralightC, DeviceFeedback, keystoreKeyProvider, pluginJournalIo } from "./decard";
import type { AfcDevicePlugin } from "./plugin";

export interface TerminalOptions {
  plugin: AfcDevicePlugin;
  deviceId: string;
  /** Current route and stop. */
  place: () => { routeId: number; stopId: number };
  /** Needed to talk to the server. Without it the terminal runs on its own and taps wait in the journal. */
  sync?: { serverUrl: string; secret: Buffer; fetchImpl?: typeof fetch };
  show?: (kind: "ok" | "no" | "busy", message: string) => void;
  /** Overrides, for tests. */
  keys?: KeyProvider;
  feedback?: Feedback;
  store?: TapStore;
  now?: () => number;
  pollMs?: number;
}

/**
 * The whole tap flow on the P18Q: opens the reader, keeps the journal, and for every card put on the reader either charges the fare (DESFire) or checks and
 * uses up the ticket (Ultralight C). A card is handled once per visit: it has to leave the reader before the next tap counts, so a card left lying on it is never charged twice.
 */
export class AfcTerminal {
  readonly store: TapStore;
  private readonly fare: TapProcessor;
  private readonly tickets: TicketProcessor;
  private readonly sync: SyncClient | undefined;
  private running = false;
  private present = false;                    // the card currently on the reader has been handled

  constructor(private readonly o: TerminalOptions, store: TapStore) {
    this.store = store;
    const keys = o.keys ?? keystoreKeyProvider(o.plugin);
    const feedback = o.feedback ?? new DeviceFeedback(o.plugin, o.show);
    this.fare = new TapProcessor({ keys, store, feedback, deviceId: o.deviceId, place: o.place, now: o.now });
    this.tickets = new TicketProcessor({ keys, store, feedback, deviceId: o.deviceId, place: o.place, now: o.now });
    this.feedback = feedback;
    this.sync = o.sync ? new SyncClient({ serverUrl: o.sync.serverUrl, deviceId: o.deviceId, secret: o.sync.secret, store, fetchImpl: o.sync.fetchImpl }) : undefined;
  }
  private readonly feedback: Feedback;

  /** Opens the reader and the journal (replaying whatever the last run left, including a fare it was in the middle of). */
  static async create(o: TerminalOptions): Promise<AfcTerminal> {
    const opened = await o.plugin.open();
    if (!opened.open) throw new Error("The card reader could not be opened");
    const store = o.store ?? (await JournalStore.open(pluginJournalIo(o.plugin)));
    return new AfcTerminal(o, store);
  }

  /** One look at the reader. Returns what happened to a newly arrived card, or null when there is nothing new. */
  async tickOnce(): Promise<TapOutcome | null> {
    const p = await this.o.plugin.poll();
    if (!p.present || !p.uid) { this.present = false; return null; }
    if (this.present) return null;                       // the same card, still lying there
    this.present = true;
    const uid = Buffer.from(p.uid, "hex");
    if (uid.length !== 7) { this.feedback.fail("Card not supported"); return { status: "denied", reason: "INVALID_CARD", message: "Only cards with a 7-byte UID are supported" }; }
    const out = p.iso4
      ? await this.fare.handle(uid, new DecardTransceiver(this.o.plugin))
      : await this.tickets.handle(new DecardUltralightC(this.o.plugin, uid));
    if (out.status === "charged" || out.status === "already_paid" || out.status === "denied") void this.drain();
    return out;
  }

  /** Sends what is waiting. Safe to call at any time; failures leave everything queued. */
  async drain() {
    if (!this.sync) return undefined;
    try { return await this.sync.drain(); } catch { return undefined; }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void (async () => {
      let lastSync = 0;
      while (this.running) {
        try { await this.tickOnce(); } catch { /* a read that failed: look again */ }
        if (Date.now() - lastSync > 60_000) { lastSync = Date.now(); void this.drain(); }
        await new Promise((r) => setTimeout(r, this.o.pollMs ?? 300));
      }
    })();
  }
  async stop(): Promise<void> { this.running = false; await this.o.plugin.close().catch(() => {}); }
}
