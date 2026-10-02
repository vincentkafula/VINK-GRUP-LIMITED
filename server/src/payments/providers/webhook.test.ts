import { describe, it, expect } from "vitest";
import { signWebhook, verifySignedWebhook, ReplayGuard } from "./webhook.js";

const body = (o: object) => Buffer.from(JSON.stringify(o));
const evt = { id: "evt_1", type: "card.authorisation", data: { amount: 100 } };

describe("signed webhooks", () => {
  const secret = "s3cret";
  const send = (b: Buffer, ts = Math.floor(Date.now() / 1000), sig?: string) =>
    ({ secret, rawBody: b, signature: sig ?? signWebhook(secret, b, ts).signature, timestamp: String(ts) });

  it("accepts a correctly signed, fresh event", () => {
    expect(verifySignedWebhook(send(body(evt))).id).toBe("evt_1");
  });
  it("rejects a tampered body, a wrong secret and a missing signature", () => {
    const ok = send(body(evt));
    expect(() => verifySignedWebhook({ ...ok, rawBody: body({ ...evt, data: { amount: 999999 } }) })).toThrow(/bad signature/);
    expect(() => verifySignedWebhook({ ...ok, secret: "other" })).toThrow(/bad signature/);
    expect(() => verifySignedWebhook({ ...ok, signature: undefined })).toThrow(/missing/);
  });
  it("rejects old and future timestamps (replay of a captured request)", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(() => verifySignedWebhook(send(body(evt), old))).toThrow(/tolerance/);
    expect(() => verifySignedWebhook(send(body(evt), Math.floor(Date.now() / 1000) + 3600))).toThrow(/tolerance/);
  });
  it("accepts an event id only once", () => {
    const guard = new ReplayGuard();
    const r = send(body(evt));
    expect(verifySignedWebhook({ ...r, guard }).id).toBe("evt_1");
    expect(() => verifySignedWebhook({ ...r, guard })).toThrow(/replayed/);
  });
  it("rejects malformed events", () => {
    expect(() => verifySignedWebhook(send(body({ nope: 1 })))).toThrow(/malformed/);
  });
  it("forgets ids after the window", () => {
    const g = new ReplayGuard(1000);
    expect(g.remember("a", 0)).toBe(true);
    expect(g.remember("a", 500)).toBe(false);
    expect(g.remember("a", 2000)).toBe(true);
  });
});
