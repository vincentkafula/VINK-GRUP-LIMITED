import { randomUUID } from "node:crypto";
import { signRequest, verifySignature, type SyncRequest, type SyncResponse } from "@afc/shared";
import type { Store } from "./store";

export interface SyncResult { ok: boolean; sent: number; accepted: number; duplicates: number; rejected: number; error?: string; updated: string[] }

/**
 * Sends queued taps to the server and takes back the hotlist, card profiles and fare table. Safe to call as often as you like and to
 * interrupt at any point:
 *  - each tap has its own id, so a batch sent twice (reply lost, power cut) is recognised and counted once by the server;
 *  - a tap leaves the queue only after the server has said it accepted it or already had it;
 *  - the request is signed and carries a one-time nonce, and the REPLY must carry a valid signature too, so a hotlist or fare table
 *    injected by someone on the network is thrown away.
 */
export class SyncClient {
  private running = false;
  constructor(private readonly o: { serverUrl: string; deviceId: string; secret: Buffer; store: Store; fetchImpl?: typeof fetch; batchSize?: number; timeoutMs?: number }) {}

  async syncOnce(): Promise<SyncResult> {
    if (this.running) return { ok: false, sent: 0, accepted: 0, duplicates: 0, rejected: 0, error: "a sync is already running", updated: [] };
    this.running = true;
    const { store } = this.o;
    const f = this.o.fetchImpl ?? fetch;
    try {
      const batch = store.pending(this.o.batchSize ?? 200);
      const body: SyncRequest = { deviceId: this.o.deviceId, batch, hotlistVersion: store.hotlistVersion, fareTableVersion: store.fareTableVersion, profilesVersion: store.profilesVersion };
      const raw = JSON.stringify(body);
      const ts = Math.floor(Date.now() / 1000), nonce = randomUUID();
      const res = await f(`${this.o.serverUrl}/api/device/sync`, {
        method: "POST", body: raw, signal: AbortSignal.timeout(this.o.timeoutMs ?? 15_000),
        headers: { "content-type": "application/json", "x-device-id": this.o.deviceId, "x-timestamp": String(ts), "x-nonce": nonce, "x-signature": signRequest(this.o.secret, ts, nonce, raw) },
      });
      const text = await res.text();
      if (!res.ok) {
        store.setOnline(res.status < 500 && res.status !== 401 ? store.online : false);
        return { ok: false, sent: batch.length, accepted: 0, duplicates: 0, rejected: 0, updated: [], error: res.status === 401 ? "The server did not accept this device (check the secret and the device clock)" : `Server answered ${res.status}` };
      }
      const st = Number(res.headers.get("x-server-timestamp")), sig = res.headers.get("x-response-signature") ?? "";
      if (!Number.isFinite(st) || !verifySignature(this.o.secret, st, nonce, text, sig)) {
        return { ok: false, sent: batch.length, accepted: 0, duplicates: 0, rejected: 0, updated: [], error: "The reply was not signed correctly and was ignored" };
      }
      const r = JSON.parse(text) as SyncResponse;
      store.markSent([...r.accepted, ...r.duplicates]);
      for (const x of r.rejected) store.markRejected(x.id, x.reason);
      const updated: string[] = [];
      if (r.hotlist) { store.setHotlist(r.hotlist.version, r.hotlist.uids); updated.push("hotlist"); }
      if (r.profiles) { store.setProfiles(r.profiles.version, r.profiles.cards); updated.push("profiles"); }
      if (r.fareTable) { store.setFareTable(r.fareTable); updated.push("fares"); }
      store.setOnline(true);
      store.setMeta("lastSyncAt", new Date().toISOString());
      store.trimSent();
      return { ok: true, sent: batch.length, accepted: r.accepted.length, duplicates: r.duplicates.length, rejected: r.rejected.length, updated };
    } catch (e) {
      store.setOnline(false);
      return { ok: false, sent: 0, accepted: 0, duplicates: 0, rejected: 0, updated: [], error: e instanceof Error ? e.message : String(e) };
    } finally {
      this.running = false;
    }
  }

  /** Keeps going until the queue is empty or a sync fails (a long offline spell is sent in several batches). */
  async drain(maxRounds = 50): Promise<SyncResult> {
    let last = await this.syncOnce();
    for (let i = 0; i < maxRounds && last.ok && this.o.store.pendingCount() > 0; i++) last = await this.syncOnce();
    return last;
  }
}
