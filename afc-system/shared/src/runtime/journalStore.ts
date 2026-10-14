import type { Category, FareTable } from "../fare/types";
import type { SyncTransaction } from "../sync";
import type { Intent, TapStore } from "./types";

/**
 * A TapStore for devices that have no synchronous database (the P18Q's web view): everything lives in memory and every change is also written to an
 * append-only journal. `durable()` writes the changes made since the last call in ONE append and resolves when the platform says they have reached
 * storage (on the P18Q: written and fsync'd by the native layer). Opening the store replays the journal, so a power cut loses at most what was not yet
 * made durable, and the tap flow only ever relies on what it has made durable. A half-written last line (power cut during an append) is ignored.
 * When the journal grows long it is replaced by one snapshot line, written atomically by the platform.
 */
export interface JournalIo {
  /** Every line stored so far, oldest first: a snapshot line (if any) followed by changes. */
  load(): Promise<string[]>;
  /** Appends lines and resolves once they are safely stored. */
  append(lines: string[]): Promise<void>;
  /** Atomically replaces the whole journal with this single line. */
  replace(line: string): Promise<void>;
}

/** An in-memory JournalIo for tests and for running without storage. `survive()` models what is still there after a power cut. */
export class MemoryJournalIo implements JournalIo {
  lines: string[] = [];
  appendFailures = 0;
  async load() { return [...this.lines]; }
  async append(lines: string[]) { if (this.appendFailures > 0) { this.appendFailures--; throw new Error("storage write failed"); } this.lines.push(...lines); }
  async replace(line: string) { this.lines = [line]; }
}

interface Row { seq: number; payload: SyncTransaction; status: "pending" | "sent" | "rejected"; note?: string; at: number }
interface State {
  meta: Record<string, string>;
  queue: Record<string, Row>;
  intents: Record<string, Intent>;
  hotlist: string[];
  profiles: Record<string, Category>;
  ticketUses: Record<string, { completed: boolean; at: number }>;
}
const empty = (): State => ({ meta: {}, queue: {}, intents: {}, hotlist: [], profiles: {}, ticketUses: {} });

type Op =
  | ["meta", string, string] | ["enq", Row] | ["sent", string[]] | ["rej", string, string] | ["trim", number]
  | ["intent", Intent] | ["intentDel", string] | ["hot", string[]] | ["prof", [string, Category][]] | ["tuse", number, boolean, number];

const COMPACT_AFTER = 1500;

export class JournalStore implements TapStore {
  private s = empty();
  private hot = new Set<string>();
  private buffer: string[] = [];
  private lines = 0;
  private flushing: Promise<void> = Promise.resolve();

  private constructor(private readonly io: JournalIo, private readonly now: () => number) {}

  static async open(io: JournalIo, now: () => number = () => Date.now()): Promise<JournalStore> {
    const st = new JournalStore(io, now);
    for (const line of await io.load()) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { continue; }                      // a line cut short by a power cut
      if (parsed && typeof parsed === "object" && "snapshot" in (parsed as object)) { st.s = { ...empty(), ...((parsed as { snapshot: State }).snapshot) }; st.hot = new Set(st.s.hotlist); }
      else if (Array.isArray(parsed)) st.apply(parsed as Op);
      st.lines++;
    }
    return st;
  }

  /* ───────── journal ───────── */
  private apply(op: Op): void {
    switch (op[0]) {
      case "meta": this.s.meta[op[1]] = op[2]; break;
      case "enq": if (!this.s.queue[op[1].payload.id]) this.s.queue[op[1].payload.id] = op[1]; break;
      case "sent": for (const id of op[1]) if (this.s.queue[id]) this.s.queue[id].status = "sent"; break;
      case "rej": if (this.s.queue[op[1]]) { this.s.queue[op[1]].status = "rejected"; this.s.queue[op[1]].note = op[2]; } break;
      case "trim": for (const [id, r] of Object.entries(this.s.queue)) if (r.status === "sent" && r.at < op[1]) delete this.s.queue[id]; break;
      case "intent": this.s.intents[op[1].uid] = op[1]; break;
      case "intentDel": delete this.s.intents[op[1]]; break;
      case "hot": this.s.hotlist = op[1]; this.hot = new Set(op[1]); break;
      case "prof": this.s.profiles = Object.fromEntries(op[1]); break;
      case "tuse": this.s.ticketUses[op[1]] = { completed: op[2], at: op[3] }; break;
    }
  }
  private log(op: Op): void { this.apply(op); this.buffer.push(JSON.stringify(op)); }

  /** Writes what changed since the last call, in one append. Calls queue up in order; each resolves when its own changes are stored. */
  durable(): Promise<void> {
    const run = async () => {
      if (this.buffer.length) {
        const batch = this.buffer; this.buffer = [];
        try { await this.io.append(batch); this.lines += batch.length; }
        catch (e) { this.buffer = [...batch, ...this.buffer]; throw e; }          // keep them: the next durable() tries again
      }
      if (this.lines > COMPACT_AFTER && !this.buffer.length) {
        this.s.hotlist = [...this.hot];
        await this.io.replace(JSON.stringify({ snapshot: this.s })); this.lines = 1;
      }
    };
    this.flushing = this.flushing.then(run, run);
    return this.flushing;
  }

  /* ───────── meta ───────── */
  getMeta(key: string) { return this.s.meta[key]; }
  setMeta(key: string, value: string) { this.log(["meta", key, value]); }
  private num(key: string, d: number) { const v = this.s.meta[key]; return v === undefined ? d : Number(v); }
  nextSeq() { const n = this.num("seq", 0) + 1; this.setMeta("seq", String(n)); return n; }
  get hotlistVersion() { return this.num("hotlistVersion", -1); }
  get profilesVersion() { return this.num("profilesVersion", -1); }
  get fareTableVersion() { return this.num("fareTableVersion", 0); }
  get ticketKeysVersion() { return this.num("ticketKeysVersion", 0); }
  get online() { return this.s.meta.online !== "0"; }
  setOnline(v: boolean) { if (this.online !== v) this.setMeta("online", v ? "1" : "0"); }

  /* ───────── queue ───────── */
  enqueue(t: SyncTransaction) { this.log(["enq", { seq: t.deviceSeq, payload: t, status: "pending", at: this.now() }]); }
  pending(limit = 200) { return Object.values(this.s.queue).filter((r) => r.status === "pending").sort((a, b) => a.seq - b.seq).slice(0, limit).map((r) => r.payload); }
  pendingCount() { return Object.values(this.s.queue).filter((r) => r.status === "pending").length; }
  markSent(ids: string[]) { if (ids.length) this.log(["sent", ids]); }
  markRejected(id: string, reason: string) { this.log(["rej", id, reason]); }
  rejected() { return Object.values(this.s.queue).filter((r) => r.status === "rejected").map((r) => ({ id: r.payload.id, note: r.note ?? "" })); }
  trimSent(olderThanMs = 30 * 86400_000) { this.log(["trim", this.now() - olderThanMs]); }

  /* ───────── intents ───────── */
  putIntent(i: Intent) { this.log(["intent", i]); }
  getIntent(uid: string) { return this.s.intents[uid]; }
  deleteIntent(uid: string) { if (this.s.intents[uid]) this.log(["intentDel", uid]); }
  openIntents() { return Object.keys(this.s.intents).length; }

  /* ───────── hotlist, profiles, fares ───────── */
  setHotlist(version: number, uids: string[]) { this.log(["hot", uids]); this.setMeta("hotlistVersion", String(version)); }
  isHotlisted(uid: string) { return this.hot.has(uid); }
  setProfiles(version: number, cards: { uid: string; category: Category }[]) { this.log(["prof", cards.map((c): [string, Category] => [c.uid, c.category])]); this.setMeta("profilesVersion", String(version)); }
  categoryOf(uid: string): Category { return this.s.profiles[uid] ?? "adult"; }
  setFareTable(t: FareTable) { this.setMeta("fareTable", JSON.stringify(t)); this.setMeta("fareTableVersion", String(t.version)); }
  fareTable() { const v = this.s.meta.fareTable; return v ? (JSON.parse(v) as FareTable) : undefined; }

  /* ───────── tickets ───────── */
  setTicketKeys(version: number, keys: { id: number; publicKey: string }[]) { this.setMeta("ticketKeys", JSON.stringify(keys)); this.setMeta("ticketKeysVersion", String(version)); }
  ticketKeys() { const v = this.s.meta.ticketKeys; return new Map<number, string>(v ? (JSON.parse(v) as { id: number; publicKey: string }[]).map((k) => [k.id, k.publicKey]) : []); }
  ticketUse(id: number) { const u = this.s.ticketUses[id]; return u ? { completed: u.completed } : undefined; }
  startTicketUse(id: number) { this.log(["tuse", id, this.s.ticketUses[id]?.completed ?? false, this.now()]); }
  completeTicketUse(id: number) { this.log(["tuse", id, true, this.now()]); }
}
