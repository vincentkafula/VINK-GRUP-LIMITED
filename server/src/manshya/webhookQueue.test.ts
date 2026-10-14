import { describe, it, expect } from "vitest";
import crypto from "crypto";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createManshya } = require("./core");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildEmitter, MAX_ATTEMPTS, backoffMs } = require("./core/webhooks");

/** A merchant with a webhook, an emitter with a fake clock and a receiver that fails on demand. */
function setup() {
  const mn = createManshya();
  const m = mn.services.createMerchant("Hook Co");
  mn.db.prepare("UPDATE merchants SET webhook_url=?,webhook_secret=? WHERE id=?").run("https://hooks.example.test/in", "whsec_test", m.id);
  let clock = Date.parse("2026-10-14T10:00:00Z");
  const calls: { url: string; init: RequestInit }[] = [];
  const recv = { fail: true };
  const emit = buildEmitter(mn.db, {
    clock: () => clock,
    fetchImpl: async (url: string, init: RequestInit) => { calls.push({ url, init }); return { ok: !recv.fail, status: recv.fail ? 503 : 200 }; },
  });
  const row = (id: string) => mn.db.prepare("SELECT * FROM events WHERE id=?").get(id);
  const tick = async (ms: number) => { clock += ms; return emit.retryDue(new Date(clock)); };
  return { mn, m, emit, calls, recv, row, tick, now: () => clock };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("webhook delivery queue", () => {
  it("signs what it sends, and the receiver can verify it", async () => {
    const s = setup(); s.recv.fail = false;
    const id = s.emit(s.m.id, "payment.paid", { amount: 100 }); await settle();
    const { init } = s.calls[0]; const sig = String((init.headers as Record<string, string>)["x-vink-signature"]);
    const [t, v1] = sig.split(",").map((p) => p.split("=")[1]);
    expect(v1).toBe(crypto.createHmac("sha256", "whsec_test").update(`${t}.${init.body}`).digest("hex"));
    expect((init.headers as Record<string, string>)["x-vink-event-id"]).toBe(id);
    expect(s.row(id).delivered).toBe(1);
  });

  it("a failure is scheduled in the database with back-off, and the next minute does not retry early", async () => {
    const s = setup();
    const id = s.emit(s.m.id, "payment.paid", {}); await settle();
    const e = s.row(id);
    expect(e.delivered).toBe(0); expect(e.attempts).toBe(1); expect(e.last_error).toBe("HTTP 503");
    expect(Date.parse(e.next_attempt_at) - s.now()).toBe(backoffMs(1));
    expect(await s.tick(10_000)).toEqual({ delivered: 0, retry: 0, dead: 0, skipped: 0 });   // not due yet
    expect(s.calls).toHaveLength(1);
  });

  it("retries when due, and stops once the receiver answers", async () => {
    const s = setup();
    const id = s.emit(s.m.id, "payment.paid", {}); await settle();
    s.recv.fail = false;
    expect(await s.tick(backoffMs(1) + 1000)).toMatchObject({ delivered: 1 });
    const e = s.row(id); expect(e.delivered).toBe(1); expect(e.attempts).toBe(2); expect(e.next_attempt_at).toBeNull(); expect(e.delivered_at).toBeTruthy();
    expect(await s.tick(3_600_000)).toMatchObject({ delivered: 0, retry: 0 });               // nothing left to do
  });

  it("gives up after the maximum attempts: a dead letter that keeps its error", async () => {
    const s = setup();
    const id = s.emit(s.m.id, "payout.paid", {}); await settle();
    let last = { dead: 0 };
    for (let i = 1; i < MAX_ATTEMPTS; i++) last = await s.tick(3_700_000);
    expect(last.dead).toBe(1);
    const e = s.row(id); expect(e.dead).toBe(1); expect(e.attempts).toBe(MAX_ATTEMPTS); expect(e.next_attempt_at).toBeNull(); expect(e.last_error).toBe("HTTP 503");
    const before = s.calls.length; await s.tick(7_200_000); expect(s.calls.length).toBe(before);   // dead letters are not retried
    expect(s.emit.list(s.m.id, "dead").map((x: { id: string }) => x.id)).toEqual([id]);
    expect(s.emit.list(s.m.id, "pending")).toEqual([]);
  });

  it("a dead letter can be replayed by hand", async () => {
    const s = setup();
    const id = s.emit(s.m.id, "payout.paid", {}); await settle();
    for (let i = 1; i < MAX_ATTEMPTS; i++) await s.tick(3_700_000);
    s.recv.fail = false;
    expect(await s.emit.replay(s.m.id, id)).toBe("delivered");
    const e = s.row(id); expect(e.dead).toBe(0); expect(e.delivered).toBe(1);
    expect(await s.emit.replay("someone-else", id)).toBeNull();                                // only the owner may replay
  });

  it("two workers never send the same retry twice", async () => {
    const s = setup();
    s.emit(s.m.id, "payment.paid", {}); await settle();
    s.recv.fail = false;
    const at = new Date(s.now() + backoffMs(1) + 1000);
    const [a, b] = await Promise.all([s.emit.retryDue(at), s.emit.retryDue(at)]);
    expect(a.delivered + b.delivered).toBe(1);
    expect(s.calls).toHaveLength(2);                                                            // the first try plus exactly one retry
  });

  it("a merchant with no webhook address is skipped, not retried", async () => {
    const s = setup();
    s.mn.db.prepare("UPDATE merchants SET webhook_url=NULL WHERE id=?").run(s.m.id);
    const id = s.emit(s.m.id, "payment.paid", {}); await settle();
    expect(s.calls).toHaveLength(0); expect(s.row(id).next_attempt_at).toBeNull();
  });

  it("the scheduler's runDue includes the webhook retries", async () => {
    const mn = createManshya();
    expect(await mn.runDue(new Date())).toHaveProperty("webhooks");
  });
});
