import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createHmac } from "node:crypto";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { verifySvix } from "./svix.js";
import { createInboundRouter } from "./router.js";
import { MemoryInboundStore } from "./store.js";

const KEY = Buffer.from("super-secret-signing-key-for-tests");
const SECRET = "whsec_" + KEY.toString("base64");
const NOW = new Date("2026-10-03T12:00:00Z");
const ts = (d = NOW) => String(Math.floor(d.getTime() / 1000));
const sign = (id: string, t: string, body: string) => "v1," + createHmac("sha256", KEY).update(`${id}.${t}.${body}`).digest("base64");
const hdrs = (body: string, id = "msg_1", t = ts()) => ({ "svix-id": id, "svix-timestamp": t, "svix-signature": sign(id, t, body) });

describe("verifySvix", () => {
  const body = '{"type":"email.received"}';
  it("accepts a correctly signed, recent request", () => {
    expect(() => verifySvix(Buffer.from(body), hdrs(body), SECRET, NOW)).not.toThrow();
  });
  it("accepts when one of several signatures matches (secret rotation)", () => {
    const h = hdrs(body); h["svix-signature"] = `v1,AAAA ${h["svix-signature"]}`;
    expect(() => verifySvix(Buffer.from(body), h, SECRET, NOW)).not.toThrow();
  });
  it("rejects a changed body, wrong secret, missing headers and replays older than 5 minutes", () => {
    expect(() => verifySvix(Buffer.from(body + " "), hdrs(body), SECRET, NOW)).toThrow();
    expect(() => verifySvix(Buffer.from(body), hdrs(body), "whsec_" + Buffer.from("other").toString("base64"), NOW)).toThrow();
    expect(() => verifySvix(Buffer.from(body), {}, SECRET, NOW)).toThrow();
    expect(() => verifySvix(Buffer.from(body), hdrs(body, "msg_1", ts(new Date(NOW.getTime() - 6 * 60_000))), SECRET, NOW)).toThrow();
    expect(() => verifySvix(Buffer.from(body), hdrs(body, "msg_1", "not-a-number"), SECRET, NOW)).toThrow();
  });
});

describe("inbound router", () => {
  let server: Server, url: string, store: MemoryInboundStore, calls: string[], fetchStatus: number;
  const asStaff: express.RequestHandler = (req, res, next) => { if (req.headers.authorization === "Bearer staff") next(); else res.status(401).json({ success: false }); };

  beforeEach(async () => {
    store = new MemoryInboundStore(); calls = []; fetchStatus = 200;
    const fakeFetch = (async (u: string) => {
      calls.push(String(u));
      return new Response(JSON.stringify({ from: "Ann <ann@example.test>", to: ["support@vink.co.za"], subject: "Help", text: "hello there", html: "<b>hello</b>" }), { status: fetchStatus });
    }) as unknown as typeof fetch;
    const app = express();
    app.use("/api/inbound", createInboundRouter({ store, webhookSecret: SECRET, apiKey: "re_test", fetchImpl: fakeFetch, now: () => NOW, guard: [asStaff] }));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/inbound`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

  const post = (body: string, headers: Record<string, string>) => fetch(`${url}/webhook`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  const evt = JSON.stringify({ type: "email.received", data: { email_id: "em_123" } });

  it("stores a validly signed email, fetching its body from Resend", async () => {
    const r = await post(evt, hdrs(evt));
    expect(r.status).toBe(200);
    expect(calls).toEqual(["https://api.resend.com/emails/receiving/em_123"]);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ resendId: "em_123", subject: "Help", text: "hello there" });
  });

  it("hands the stored email to the attachment handler once, with its id and department, and still stores the email if that fails", async () => {
    const seen: unknown[][] = []; let fail = false;
    const files = { recordInbound: async (...a: unknown[]) => { seen.push(a); if (fail) throw new Error("boom"); return 1; } } as never;
    const app2 = express();
    app2.use("/api/inbound", createInboundRouter({ store, webhookSecret: SECRET, apiKey: "re_test", fetchImpl: (async () => new Response(JSON.stringify({ from: "A <a@example.test>", to: ["sales@vink.co.za"], subject: "S", text: "t" }))) as unknown as typeof fetch, now: () => NOW, guard: [asStaff], files }));
    const s2 = await new Promise<Server>((ok) => { const x = app2.listen(0, "127.0.0.1", () => ok(x)); });
    const u2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}/api/inbound/webhook`;
    const send = (e: string, id: string) => fetch(u2, { method: "POST", headers: { "Content-Type": "application/json", ...hdrs(e, id) }, body: e });
    expect((await send(evt, "m1")).status).toBe(200);
    expect(seen).toEqual([[store.rows[0].id, "em_123", "sales"]]);
    await send(evt, "m2");                                                        // the same delivery again: stored already, so nothing more to record
    expect(seen).toHaveLength(1);
    fail = true;
    const evt2 = JSON.stringify({ type: "email.received", data: { email_id: "em_456" } });
    expect((await send(evt2, "m3")).status).toBe(200);                            // recording the attachments failed, but the email is kept and Resend is told it worked
    expect(store.rows).toHaveLength(2);
    await new Promise<void>((ok) => s2.close(() => ok()));
  });

  it("the same delivery twice stores one message", async () => {
    await post(evt, hdrs(evt)); await post(evt, hdrs(evt, "msg_2"));
    expect(store.rows).toHaveLength(1);
  });

  it("a bad signature is rejected and nothing is fetched or stored", async () => {
    const r = await post(evt, { ...hdrs(evt), "svix-signature": "v1,AAAA" });
    expect(r.status).toBe(401);
    expect(calls).toHaveLength(0); expect(store.rows).toHaveLength(0);
  });

  it("other event types are acknowledged and ignored", async () => {
    const other = JSON.stringify({ type: "email.delivered", data: { email_id: "x" } });
    expect((await post(other, hdrs(other))).status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("when Resend cannot be reached the webhook fails (so Resend retries) and nothing is stored", async () => {
    fetchStatus = 500;
    expect((await post(evt, hdrs(evt))).status).toBe(502);
    expect(store.rows).toHaveLength(0);
  });

  it("only staff can list or read messages; the list shows a preview, not the HTML", async () => {
    await post(evt, hdrs(evt));
    expect((await fetch(url)).status).toBe(401);
    const list = await (await fetch(url, { headers: { Authorization: "Bearer staff" } })).json() as { messages: Record<string, unknown>[] };
    expect(list.messages[0]).toMatchObject({ subject: "Help", preview: "hello there" });
    expect(list.messages[0]).not.toHaveProperty("html");
    const one = await (await fetch(`${url}/${store.rows[0].id}`, { headers: { Authorization: "Bearer staff" } })).json() as { message: { html: string } };
    expect(one.message.html).toBe("<b>hello</b>");
    expect((await fetch(`${url}/nope`, { headers: { Authorization: "Bearer staff" } })).status).toBe(404);
  });

  it("answers 501 when the signing secret is not configured", async () => {
    const app = express(); app.use("/i", createInboundRouter({ store, guard: [asStaff] }));
    const s = await new Promise<Server>((ok) => { const x = app.listen(0, "127.0.0.1", () => ok(x)); });
    const r = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/i/webhook`, { method: "POST", body: evt });
    expect(r.status).toBe(501);
    s.close();
  });
});
