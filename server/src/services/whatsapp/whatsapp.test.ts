import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import { createHmac } from "crypto";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../../portal/testDb.js";
import type { Db } from "../../portal/driverRoutes.js";
import { createWaClient, waConfigFromEnv, verifyWaSignature, waReady } from "./cloud.js";
import { createWhatsAppService, inOfficeHours } from "./whatsappService.js";
import { createWhatsAppWebhookRouter, createWhatsAppInfoRouter, createWhatsAppRouter } from "../../routes/whatsappRouter.js";
import { allDepartments, publicDepartments, setCustomDepartments } from "../../config/departments.js";

const ENV = { WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_TOKEN: "WATOKEN", META_APP_SECRET: "appsecret", WHATSAPP_VERIFY_TOKEN: "verify-me", WHATSAPP_NUMBER: "+27 82 123 4567" } as NodeJS.ProcessEnv;
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const WEEKDAY = new Date("2026-10-12T08:00:00Z");           // Monday 10:00 in South Africa
const NIGHT = new Date("2026-10-12T20:00:00Z");             // Monday 22:00
const SUNDAY = new Date("2026-10-11T09:00:00Z");

/** A pretend WhatsApp Cloud API: records what is sent, and can refuse. */
function fakeWa(opts: { fail?: boolean } = {}) {
  const sent: Record<string, any>[] = []; let n = 0; // eslint-disable-line @typescript-eslint/no-explicit-any
  const fetchImpl = (async (_u: string, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body)); sent.push({ ...body, _auth: (init!.headers as Record<string, string>).Authorization });
    if (body.status === "read") return new Response(JSON.stringify({ success: true }));
    return opts.fail ? new Response(JSON.stringify({ error: { message: "Token WATOKEN expired", code: 190 } }), { status: 401 }) : new Response(JSON.stringify({ messages: [{ id: `wamid.out${++n}` }] }));
  }) as unknown as typeof fetch;
  return { sent, texts: () => sent.filter((s) => s.type === "text").map((s) => s.text.body as string), fetchImpl };
}

describe("the WhatsApp client", () => {
  it("reads its settings, and is ready only with the number, the token and the app secret", () => {
    const c = waConfigFromEnv(ENV); expect(c).toMatchObject({ phoneNumberId: "123", number: "27821234567", reopenLanguage: "en" }); expect(waReady(c)).toBe(true);
    expect(waReady(waConfigFromEnv({ WHATSAPP_TOKEN: "x" } as NodeJS.ProcessEnv))).toBe(false);
  });
  it("checks the signature Meta puts on what it sends", () => {
    const raw = Buffer.from('{"a":1}'), good = "sha256=" + createHmac("sha256", "appsecret").update(raw).digest("hex");
    expect(verifyWaSignature(raw, good, "appsecret")).toBe(true);
    for (const bad of [undefined, "", "sha256=", "sha256=zz", "sha256=" + "0".repeat(64), good.replace("sha256=", "sha1=")]) expect(verifyWaSignature(raw, bad, "appsecret")).toBe(false);
    expect(verifyWaSignature(Buffer.from('{"a":2}'), good, "appsecret")).toBe(false); expect(verifyWaSignature(raw, good, "")).toBe(false);
  });
  it("sends text and template messages with the bearer token, and never reports the token", async () => {
    const f = fakeWa(), c = createWaClient({ config: waConfigFromEnv(ENV), fetchImpl: f.fetchImpl });
    expect(await c.sendText("27821234567", "Hi")).toEqual({ ok: true, id: "wamid.out1" });
    expect(f.sent[0]).toMatchObject({ messaging_product: "whatsapp", to: "27821234567", type: "text", text: { body: "Hi" }, _auth: "Bearer WATOKEN" });
    await c.sendTemplate("27821234567", "payment_receipt", "en", ["R 50.00", "Taxi fare"]);
    expect(f.sent[1].template).toEqual({ name: "payment_receipt", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: "R 50.00" }, { type: "text", text: "Taxi fare" }] }] });
    const refused = await createWaClient({ config: waConfigFromEnv(ENV), fetchImpl: fakeWa({ fail: true }).fetchImpl }).sendText("1", "x");
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("expired") }); expect(JSON.stringify(refused)).not.toContain("WATOKEN");
    const off = await createWaClient({ config: waConfigFromEnv({} as NodeJS.ProcessEnv) }).sendText("1", "x"); expect(off).toMatchObject({ ok: false, error: expect.stringContaining("not set up") });
  });
});

describe("office hours", () => {
  it("is Monday to Friday, 08:00 to 17:00 South African time", () => {
    expect(inOfficeHours(WEEKDAY)).toBe(true); expect(inOfficeHours(NIGHT)).toBe(false); expect(inOfficeHours(SUNDAY)).toBe(false);
    expect(inOfficeHours(new Date("2026-10-12T05:59:00Z"))).toBe(false); expect(inOfficeHours(new Date("2026-10-12T06:00:00Z"))).toBe(true); expect(inOfficeHours(new Date("2026-10-12T14:59:00Z"))).toBe(true); expect(inOfficeHours(new Date("2026-10-12T15:00:00Z"))).toBe(false);
  });
});

describe("the WhatsApp service", () => {
  let db: Db, clock: Date, f: ReturnType<typeof fakeWa>, who: { userId: string; role: string; username: string }, managed: string[];
  const SUPPORT = "support", SALES = "sales";
  const build = (failing = false) => {
    f = fakeWa({ fail: failing }); const config = waConfigFromEnv({ ...ENV, WHATSAPP_REOPEN_TEMPLATE: "reopen_chat" });
    return createWhatsAppService({ db, wa: createWaClient({ config, fetchImpl: f.fetchImpl }), config, now: () => clock,
      departmentsFor: async (u) => (["owner", "superadmin"].includes(u.role) ? [...allDepartments(), { key: "unrouted", name: "Other" }] : allDepartments().filter((d) => managed.includes(d.key))) });
  };
  const msg = (waId: string, body: string, o: { id?: string; type?: string; at?: Date } = {}) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: waId, profile: { name: "Thandi" } }], messages: [{ from: waId, id: o.id ?? `wamid.${Math.random()}`, timestamp: String(Math.floor((o.at ?? clock).getTime() / 1000)), type: o.type ?? "text", text: { body } }] } }] }] });
  const conv = async (waId = "27821112222") => (await db.query(`SELECT * FROM wa_conversations WHERE wa_id = $1`, [waId])).rows[0];
  beforeEach(() => { db = allPortalsDb(); clock = WEEKDAY; who = { userId: id(1), role: "superadmin", username: "root" }; managed = [SUPPORT]; setCustomDepartments([]); });
  afterEach(() => setCustomDepartments([]));

  it("answers a first message with a menu of the public departments, and keeps the chat without a department until one is chosen", async () => {
    const svc = build(); await svc.handleWebhook(msg("27821112222", "Hi"));
    const menu = f.texts()[0]; expect(menu).toContain("Welcome to VINK"); publicDepartments().forEach((d, i) => expect(menu).toContain(`${i + 1}. ${d.name}`)); expect(menu).toContain("START"); expect(menu).toContain("not yet in full operation");
    expect(await conv()).toMatchObject({ name: "Thandi", department: null, status: "open" });
    expect((await db.query(`SELECT direction, by_name FROM wa_messages ORDER BY created_at`)).rows.map((r) => `${r.direction}:${r.by_name}`)).toEqual(["in:", "out:VINK (automatic)"]);
    await svc.handleWebhook(msg("27821112222", "what?")); expect(f.texts()).toHaveLength(2);          // anything but a number shows the menu again
  });
  it("routes the chat to the department whose number was sent, and says who they are talking to", async () => {
    const svc = build(); await svc.handleWebhook(msg("27821112222", "hello")); await svc.handleWebhook(msg("27821112222", "2"));
    const dept = publicDepartments()[1]; expect(await conv()).toMatchObject({ department: dept.key, state: "active" });
    expect(f.texts()[1]).toContain(`You are now chatting with ${dept.name}`); expect(f.texts()[1]).not.toContain("We are away");
    await svc.handleWebhook(msg("27821112222", "My card is not working")); expect(f.texts()).toHaveLength(2);          // a normal message in office hours gets no automatic reply
    await svc.handleWebhook(msg("27821112222", "99")); expect(f.texts()).toHaveLength(2);
  });
  it("lets the customer start again with MENU, and ignores a number that is not on the menu while choosing", async () => {
    const svc = build(); await svc.handleWebhook(msg("27821112222", "hi")); await svc.handleWebhook(msg("27821112222", "42")); expect(f.texts()[1]).toContain("Welcome to VINK");
    await svc.handleWebhook(msg("27821112222", "1")); expect((await conv()).department).toBe(publicDepartments()[0].key);
    await svc.handleWebhook(msg("27821112222", "menu")); expect((await conv()).department).toBeNull(); expect(f.texts().at(-1)).toContain("Welcome to VINK");
  });
  it("tells a customer who writes after hours that the team is away, once a day, and says so when they pick a department", async () => {
    clock = NIGHT; const svc = build(); await svc.handleWebhook(msg("27821112222", "hi")); await svc.handleWebhook(msg("27821112222", "1"));
    expect(f.texts()[1]).toContain("We are away right now"); const n = f.texts().length;
    await svc.handleWebhook(msg("27821112222", "Please help")); expect(f.texts()).toHaveLength(n + 1); expect(f.texts().at(-1)).toContain("away right now");
    await svc.handleWebhook(msg("27821112222", "Anyone?")); expect(f.texts()).toHaveLength(n + 1);          // only one notice a day
    clock = new Date("2026-10-13T20:00:00Z"); await svc.handleWebhook(msg("27821112222", "Hello again")); expect(f.texts()).toHaveLength(n + 2);
  });
  it("records alert opt-in and opt-out", async () => {
    const svc = build(); await svc.handleWebhook(msg("27821112222", "START")); expect((await conv()).opted_in).toBe(true); expect(f.texts().at(-1)).toContain("now get payment and card alerts");
    await svc.handleWebhook(msg("27821112222", "stop")); expect((await conv()).opted_in).toBe(false); expect(f.texts().at(-1)).toContain("no longer get alerts");
  });
  it("stores a message once even if Meta sends it twice, shows other kinds of message as a note, and keeps delivery updates", async () => {
    const svc = build(); const m = msg("27821112222", "Hi", { id: "wamid.same" });
    expect(await svc.handleWebhook(m)).toEqual({ messages: 1, statuses: 0 }); expect(await svc.handleWebhook(m)).toEqual({ messages: 0, statuses: 0 }); expect(f.texts()).toHaveLength(1);
    await svc.handleWebhook({ entry: [{ changes: [{ value: { contacts: [{ wa_id: "27821112222" }], messages: [{ from: "27821112222", id: "wamid.img", timestamp: "1", type: "image" }] } }] }] });
    expect((await db.query(`SELECT body FROM wa_messages WHERE wa_message_id = 'wamid.img'`)).rows[0].body).toContain("[image received");
    const outId = (await db.query(`SELECT id FROM wa_messages WHERE direction = 'out'`)).rows[0].id; await db.query(`UPDATE wa_messages SET wa_message_id = 'wamid.out1' WHERE id = $1`, [outId]);
    expect(await svc.handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.out1", status: "delivered" }] } }] }] })).toEqual({ messages: 0, statuses: 1 });
    expect((await db.query(`SELECT status FROM wa_messages WHERE wa_message_id = 'wamid.out1'`)).rows[0].status).toBe("delivered");
    expect(await svc.handleWebhook(null)).toEqual({ messages: 0, statuses: 0 }); expect(await svc.handleWebhook({ entry: "x" })).toEqual({ messages: 0, statuses: 0 });
  });

  describe("for the people who answer", () => {
    const chat = async (svc: ReturnType<typeof build>, waId: string, dept: string, body = "Help me") => { await svc.handleWebhook(msg(waId, "hi")); await db.query(`UPDATE wa_conversations SET department = $2, state = 'active' WHERE wa_id = $1`, [waId, dept]); await svc.handleWebhook(msg(waId, body)); return (await conv(waId)).id as string; };
    const manager = () => { who = { userId: id(3), role: "customer", username: "mandy" }; };
    it("shows each person only the chats of the departments they manage; a Super Administrator also sees chats with no department", async () => {
      const svc = build(); await chat(svc, "27820000001", SUPPORT); await chat(svc, "27820000002", SALES); await svc.handleWebhook(msg("27820000003", "hi"));
      manager(); let l = await svc.list(who); expect(l.ok && l.value.map((c) => c.waId)).toEqual(["27820000001"]);
      expect(await svc.list(who, { department: SALES })).toMatchObject({ ok: false, status: 403 });
      who = { userId: id(1), role: "superadmin", username: "root" }; l = await svc.list(who); expect(l.ok && l.value.map((c) => c.waId).sort()).toEqual(["27820000001", "27820000002", "27820000003"]);
      expect((await svc.summary(who)).find((d) => d.key === "unrouted")!.waiting).toBe(1); manager(); expect(await svc.summary(who)).toEqual([{ key: SUPPORT, name: "Customer Support", waiting: 1 }]);
    });
    it("opens a chat with its messages, and refuses a chat of a department the person does not manage", async () => {
      const svc = build(); const a = await chat(svc, "27820000001", SUPPORT, "Where is my card?"), b = await chat(svc, "27820000002", SALES); manager();
      const r = await svc.get(who, a); expect(r.ok && r.value.messages.map((m) => m.body)).toContain("Where is my card?"); expect(r.ok && r.value.conversation.windowOpen).toBe(true);
      expect(await svc.get(who, b)).toMatchObject({ ok: false, status: 403 }); expect(await svc.get(who, id(99))).toMatchObject({ ok: false, status: 404 });
    });
    it("sends a reply on WhatsApp, records who wrote it, and marks the chat answered", async () => {
      const svc = build(); const a = await chat(svc, "27820000001", SUPPORT); manager(); f.sent.length = 0;
      expect(await svc.reply(who, a, "  Your card is on its way.  ")).toEqual({ ok: true, value: { status: "answered" } });
      expect(f.sent[0]).toMatchObject({ to: "27820000001", type: "text", text: { body: "Your card is on its way." } });
      expect((await conv("27820000001")).status).toBe("answered"); expect((await db.query(`SELECT by_name, status FROM wa_messages WHERE by_name = 'mandy'`)).rows[0]).toMatchObject({ by_name: "mandy", status: "sent" });
      await svc.handleWebhook(msg("27820000001", "Thanks, one more thing")); expect((await conv("27820000001")).status).toBe("open");          // a new message reopens it
      expect(await svc.reply(who, a, "   ")).toMatchObject({ ok: false, status: 400 });
    });
    it("does not pretend a reply was sent when WhatsApp refuses", async () => {
      const svc = build(); const a = await chat(svc, "27820000001", SUPPORT); manager(); const bad = build(true);
      void svc; const r = await bad.reply(who, a, "Hello"); expect(r).toMatchObject({ ok: false, status: 502 }); expect((await conv("27820000001")).status).toBe("open");
      expect((await db.query(`SELECT status, error FROM wa_messages WHERE by_name = 'mandy'`)).rows[0]).toMatchObject({ status: "failed" });
    });
    it("uses an approved template once 24 hours have passed, and explains when there is none", async () => {
      const svc = build(); const a = await chat(svc, "27820000001", SUPPORT); manager(); clock = new Date(clock.getTime() + 25 * 3_600_000); f.sent.length = 0;
      expect((await svc.get(who, a) as { ok: true; value: { conversation: { windowOpen: boolean } } }).value.conversation.windowOpen).toBe(false);
      expect(await svc.reply(who, a, "We have your card ready")).toMatchObject({ ok: true }); expect(f.sent[0]).toMatchObject({ type: "template", template: { name: "reopen_chat" } });
      const noTemplate = createWhatsAppService({ db, wa: createWaClient({ config: waConfigFromEnv(ENV), fetchImpl: f.fetchImpl }), config: waConfigFromEnv(ENV), now: () => clock, departmentsFor: async () => [{ key: SUPPORT, name: "Customer Support" }] });
      expect(await noTemplate.reply(who, a, "Hello")).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("24 hours") });
    });
    it("changes the status, and moves a chat only to a department the person manages (a Super Administrator can move it anywhere)", async () => {
      const svc = build(); const a = await chat(svc, "27820000001", SUPPORT); manager();
      expect(await svc.setStatus(who, a, "closed")).toEqual({ ok: true, value: { status: "closed" } }); expect(await svc.setStatus(who, a, "weird")).toMatchObject({ ok: false, status: 400 });
      expect(await svc.transfer(who, a, SALES)).toMatchObject({ ok: false, status: 403 }); managed = [SUPPORT, SALES]; expect(await svc.transfer(who, a, SALES)).toEqual({ ok: true, value: { department: SALES } });
      expect(await conv("27820000001")).toMatchObject({ department: SALES, status: "open" }); expect(await svc.transfer({ userId: id(1), role: "superadmin" }, a, "compliance")).toMatchObject({ ok: true }); expect(await svc.transfer({ userId: id(1), role: "superadmin" }, a, "nope")).toMatchObject({ ok: false, status: 400 });
    });
    it("sends an alert from a template only to a customer who opted in", async () => {
      const svc = build(); await svc.handleWebhook(msg("27820000001", "hi")); f.sent.length = 0;
      expect(await svc.notify({ to: "+27 82 000 0001", template: "payment_receipt", params: ["R 50.00"] })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("opted in") }); expect(f.sent).toHaveLength(0);
      await svc.handleWebhook(msg("27820000001", "START")); f.sent.length = 0;
      expect(await svc.notify({ to: "+27 82 000 0001", template: "payment_receipt", params: ["R 50.00"] })).toMatchObject({ ok: true }); expect(f.sent[0]).toMatchObject({ to: "27820000001", type: "template", template: { name: "payment_receipt" } });
      expect(await svc.notify({ to: "27820000001", template: "Bad Name!" })).toMatchObject({ ok: false, status: 400 }); expect(await svc.notify({ to: "27829999999", template: "x" })).toMatchObject({ ok: false, status: 409 });
    });
  });
});

describe("the WhatsApp routes", () => {
  let db: Db, server: Server, url: string, as: { userId: string; role: string; username: string }, f: ReturnType<typeof fakeWa>;
  const config = waConfigFromEnv(ENV);
  const sign = (raw: string) => "sha256=" + createHmac("sha256", "appsecret").update(raw).digest("hex");
  beforeEach(async () => {
    db = allPortalsDb(); as = { userId: id(1), role: "superadmin", username: "root" }; f = fakeWa();
    const svc = createWhatsAppService({ db, wa: createWaClient({ config, fetchImpl: f.fetchImpl }), config, now: () => WEEKDAY, departmentsFor: async (u) => (["owner", "superadmin"].includes(u.role) ? [...allDepartments(), { key: "unrouted", name: "Other" }] : []) });
    const app = express(); app.use((req, _r, next) => { req.user = as as never; next(); });
    app.use("/api/webhooks/whatsapp", createWhatsAppWebhookRouter({ svc, config })); app.use("/api/whatsapp", createWhatsAppInfoRouter({ config })); app.use("/api/admin/whatsapp", createWhatsAppRouter({ db, svc }));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>((ok) => server.close(() => ok())); });
  const hook = (body: string, sig?: string) => fetch(`${url}/api/webhooks/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", ...(sig === undefined ? { "X-Hub-Signature-256": sign(body) } : sig ? { "X-Hub-Signature-256": sig } : {}) }, body });
  const payload = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ wa_id: "27821112222", profile: { name: "Thandi" } }], messages: [{ from: "27821112222", id: "wamid.1", timestamp: String(Math.floor(WEEKDAY.getTime() / 1000)), type: "text", text: { body: "Hi" } }] } }] }] });

  it("answers Meta's set-up handshake only with the right verify token", async () => {
    const ok = await fetch(`${url}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345`); expect(ok.status).toBe(200); expect(await ok.text()).toBe("12345");
    expect((await fetch(`${url}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`)).status).toBe(403); expect((await fetch(`${url}/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=1`)).status).toBe(403);
  });
  it("takes a signed message, and refuses an unsigned, wrongly signed or tampered one", async () => {
    expect((await hook(payload)).status).toBe(200); expect(f.texts()[0]).toContain("Welcome to VINK"); expect((await db.query(`SELECT COUNT(*) AS n FROM wa_conversations`)).rows[0].n).toBe(1);
    const before = f.sent.length;
    expect((await hook(payload, "")).status).toBe(401); expect((await hook(payload, "sha256=" + "a".repeat(64))).status).toBe(401); expect((await hook(payload.replace("Hi", "Hacked"), sign(payload))).status).toBe(401);
    expect((await hook("not json")).status).toBe(400); expect(f.sent).toHaveLength(before);
  });
  it("tells the website whether chat is on, and gives the link for the button and QR code", async () => {
    expect(await (await fetch(`${url}/api/whatsapp/info`)).json()).toEqual({ success: true, enabled: true, number: "27821234567", link: "https://wa.me/27821234567?text=Hi%20VINK" });
  });
  it("lets staff list, read and answer chats, and only a Super Administrator send alerts", async () => {
    await hook(payload); const post = (p: string, b: unknown) => fetch(`${url}/api/admin/whatsapp${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    const list = (await (await fetch(`${url}/api/admin/whatsapp/conversations`)).json()) as { conversations: { id: string; waId: string }[] }; expect(list.conversations[0].waId).toBe("27821112222");
    const one = (await (await fetch(`${url}/api/admin/whatsapp/conversations/${list.conversations[0].id}`)).json()) as { messages: unknown[] }; expect(one.messages.length).toBeGreaterThan(0);
    expect((await fetch(`${url}/api/admin/whatsapp/conversations/not-an-id`)).status).toBe(404); expect((await post(`/conversations/${list.conversations[0].id}/reply`, { body: "Hello Thandi" })).status).toBe(200);
    expect((await post("/notify", { to: "27821112222", template: "x_y" })).status).toBe(409);          // has not opted in
    as = { userId: id(3), role: "customer", username: "sid" }; expect((await post("/notify", { to: "27821112222", template: "x_y" })).status).toBe(403);
    const mine = (await (await fetch(`${url}/api/admin/whatsapp/conversations`)).json()) as { conversations: unknown[] }; expect(mine.conversations).toEqual([]); expect((await fetch(`${url}/api/admin/whatsapp/conversations?department=support`)).status).toBe(403);
  });
});
