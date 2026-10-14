import { createRequire } from "node:module";
import type { DatabaseSync as Db } from "node:sqlite";
import type { Category, FareTable, Intent, SyncTransaction, TapStore } from "@afc/shared";

/**
 * The validator's own memory, in SQLite (WAL, so a power cut loses at most the last write, never the file):
 *   queue     every tap waiting to be sent (and those sent, kept for a while for audit)
 *   intents   a fare the validator started to take but has not seen confirmed (see TapProcessor)
 *   meta      sequence number, versions of the hotlist / profiles / fare table, last sync result
 *   hotlist, profiles, fare table copies from the server
 */

// loaded with require so bundlers/test runners that do not know the newer built-in module leave it alone
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export class Store implements TapStore {
  private readonly db: Db;
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS queue(id TEXT PRIMARY KEY, seq INTEGER NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', note TEXT, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS queue_pending ON queue(status, seq);
      CREATE TABLE IF NOT EXISTS intents(uid TEXT PRIMARY KEY, txn_id TEXT NOT NULL, expected_counter INTEGER NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS hotlist(uid TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS profiles(uid TEXT PRIMARY KEY, category TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ticket_uses(id INTEGER PRIMARY KEY, completed INTEGER NOT NULL, at INTEGER NOT NULL);
    `);
  }
  close(): void { this.db.close(); }
  /** SQLite writes with fsync on every statement (WAL, synchronous=FULL), so everything written is already durable. */
  async durable(): Promise<void> { /* nothing to wait for */ }

  /* meta */
  getMeta(key: string): string | undefined { return (this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value; }
  setMeta(key: string, value: string): void { this.db.prepare("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value); }
  private num(key: string, d: number) { const v = this.getMeta(key); return v === undefined ? d : Number(v); }

  /** Next per-device sequence number. Strictly increasing and never reused, even across restarts. */
  nextSeq(): number { const n = this.num("seq", 0) + 1; this.setMeta("seq", String(n)); return n; }

  get hotlistVersion(): number { return this.num("hotlistVersion", -1); }
  get profilesVersion(): number { return this.num("profilesVersion", -1); }
  get fareTableVersion(): number { return this.num("fareTableVersion", 0); }
  get online(): boolean { return this.getMeta("online") !== "0"; }
  setOnline(v: boolean): void { this.setMeta("online", v ? "1" : "0"); }

  /* queue */
  enqueue(t: SyncTransaction): void {
    this.db.prepare("INSERT OR IGNORE INTO queue(id, seq, payload, created_at) VALUES(?, ?, ?, ?)").run(t.id, t.deviceSeq, JSON.stringify(t), Date.now());
  }
  pending(limit = 200): SyncTransaction[] {
    return (this.db.prepare("SELECT payload FROM queue WHERE status = 'pending' ORDER BY seq LIMIT ?").all(limit) as { payload: string }[]).map((r) => JSON.parse(r.payload) as SyncTransaction);
  }
  pendingCount(): number { return (this.db.prepare("SELECT COUNT(*) AS n FROM queue WHERE status = 'pending'").get() as { n: number }).n; }
  markSent(ids: string[]): void { const st = this.db.prepare("UPDATE queue SET status = 'sent' WHERE id = ?"); for (const id of ids) st.run(id); }
  markRejected(id: string, reason: string): void { this.db.prepare("UPDATE queue SET status = 'rejected', note = ? WHERE id = ?").run(reason, id); }
  rejected(): { id: string; note: string }[] { return this.db.prepare("SELECT id, note FROM queue WHERE status = 'rejected'").all() as { id: string; note: string }[]; }
  /** Sent records are only kept for audit; trim old ones so the SD card does not fill up. */
  trimSent(olderThanMs = 30 * 86400_000): void { this.db.prepare("DELETE FROM queue WHERE status = 'sent' AND created_at < ?").run(Date.now() - olderThanMs); }

  /* intents */
  putIntent(i: Intent): void {
    this.db.prepare("INSERT INTO intents(uid, txn_id, expected_counter, payload, created_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(uid) DO UPDATE SET txn_id = excluded.txn_id, expected_counter = excluded.expected_counter, payload = excluded.payload, created_at = excluded.created_at")
      .run(i.uid, i.txnId, i.expectedCounter, JSON.stringify(i), i.createdAt);
  }
  getIntent(uid: string): Intent | undefined {
    const r = this.db.prepare("SELECT payload FROM intents WHERE uid = ?").get(uid) as { payload: string } | undefined;
    return r ? (JSON.parse(r.payload) as Intent) : undefined;
  }
  deleteIntent(uid: string): void { this.db.prepare("DELETE FROM intents WHERE uid = ?").run(uid); }
  openIntents(): number { return (this.db.prepare("SELECT COUNT(*) AS n FROM intents").get() as { n: number }).n; }

  /* hotlist, profiles, fare table */
  setHotlist(version: number, uids: string[]): void {
    this.db.exec("BEGIN");
    try { this.db.exec("DELETE FROM hotlist"); const st = this.db.prepare("INSERT INTO hotlist(uid) VALUES(?)"); for (const u of uids) st.run(u); this.setMeta("hotlistVersion", String(version)); this.db.exec("COMMIT"); }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  isHotlisted(uid: string): boolean { return !!this.db.prepare("SELECT 1 FROM hotlist WHERE uid = ?").get(uid); }

  setProfiles(version: number, cards: { uid: string; category: Category }[]): void {
    this.db.exec("BEGIN");
    try { this.db.exec("DELETE FROM profiles"); const st = this.db.prepare("INSERT INTO profiles(uid, category) VALUES(?, ?)"); for (const c of cards) st.run(c.uid, c.category); this.setMeta("profilesVersion", String(version)); this.db.exec("COMMIT"); }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  categoryOf(uid: string): Category { return ((this.db.prepare("SELECT category FROM profiles WHERE uid = ?").get(uid) as { category: Category } | undefined)?.category) ?? "adult"; }

  /* single-trip tickets: the public keys that check them, and the tickets this device has used up */
  get ticketKeysVersion(): number { return this.num("ticketKeysVersion", 0); }
  setTicketKeys(version: number, keys: { id: number; publicKey: string }[]): void { this.setMeta("ticketKeys", JSON.stringify(keys)); this.setMeta("ticketKeysVersion", String(version)); }
  ticketKeys(): Map<number, string> { const v = this.getMeta("ticketKeys"); return new Map(v ? (JSON.parse(v) as { id: number; publicKey: string }[]).map((k) => [k.id, k.publicKey]) : []); }
  /** completed = 0 means a use was started but the card was never confirmed marked (it may have been pulled away); 1 = used here. */
  ticketUse(id: number): { completed: boolean } | undefined { const r = this.db.prepare("SELECT completed FROM ticket_uses WHERE id = ?").get(id) as { completed: number } | undefined; return r ? { completed: r.completed === 1 } : undefined; }
  startTicketUse(id: number): void { this.db.prepare("INSERT INTO ticket_uses(id, completed, at) VALUES(?, 0, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at").run(id, Date.now()); }
  completeTicketUse(id: number): void { this.db.prepare("UPDATE ticket_uses SET completed = 1 WHERE id = ?").run(id); }

  setFareTable(t: FareTable): void { this.setMeta("fareTable", JSON.stringify(t)); this.setMeta("fareTableVersion", String(t.version)); }
  fareTable(): FareTable | undefined { const v = this.getMeta("fareTable"); return v ? (JSON.parse(v) as FareTable) : undefined; }
}
