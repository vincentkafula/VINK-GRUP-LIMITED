import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail, ResendEmail, type EmailMessage, type EmailSender } from "../auth/email.js";
import { createContactService, type ContactService } from "../services/contactService.js";
import { createContactRouter, createContactAdminRouter } from "./contactRouter.js";
import { DEPARTMENTS, SECTION_ALIASES, departmentOfAddresses, notifyTargets } from "../config/departments.js";
import { MemoryInboundStore } from "../inbound/store.js";
import { createOpsMonitor } from "../services/opsMonitor.js";
import { manshyaLedgerPort } from "../services/moneyEngine.js";

let db: Db, mail: ConsoleEmail, svc: ContactService, clock = new Date("2026-10-09T10:00:00Z");
const good = { department: "support", name: "Thandi Nkosi", email: "Thandi@Example.com", phone: "082 000 0000", subject: "Card question", message: "My physical card has not arrived yet." };

beforeEach(() => { db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date("2026-10-09T10:00:00Z"); svc = createContactService({ db, mail, env: {} as NodeJS.ProcessEnv, now: () => clock }); });

describe("messages to a department", () => {
  it("stores the message, emails the department with the sender as the reply address, and sends the sender a receipt with the reference", async () => {
    const r = await svc.submit(good);
    expect(r).toMatchObject({ ok: true, department: "support", respondWithin: "1–2 business days" });
    const ref = (r as { ref: string }).ref; expect(ref).toMatch(/^VK-[A-Z2-9]{6}$/);
    expect(mail.sent).toHaveLength(2);
    const [toDept, receipt] = mail.sent;
    expect(toDept).toMatchObject({ to: "support@vink.co.za", from: "VINK Customer Support <support@vink.co.za>", replyTo: "Thandi Nkosi <thandi@example.com>" });
    expect(toDept.subject).toContain(ref); expect(toDept.text).toContain("My physical card has not arrived yet."); expect(toDept.text).toContain("082 000 0000");
    expect(receipt).toMatchObject({ to: "thandi@example.com", from: "VINK Customer Support <support@vink.co.za>", replyTo: "support@vink.co.za" });
    expect(receipt.text).toContain(ref); expect(receipt.text).toContain("1–2 business days"); expect(receipt.text).toMatch(/never send us your card number/);
    expect((await svc.list())[0]).toMatchObject({ ref, department: "support", delivered: true, status: "open", email: "thandi@example.com" });
  });

  it("sends each department's messages to its own address, or to the people it is forwarded to", async () => {
    for (const d of DEPARTMENTS) await svc.submit({ ...good, department: d.key, message: `Hello ${d.key}, this is a long enough message.` });
    expect(mail.sent.filter((m) => m.replyTo?.includes("thandi")).map((m) => m.to).sort()).toEqual(DEPARTMENTS.map((d) => d.address).sort());
    const dept = DEPARTMENTS.find((d) => d.key === "media")!;
    expect(notifyTargets(dept, { DEPT_FORWARD_MEDIA: "a@vink.co.za, b@vink.co.za, nope" } as never)).toEqual(["a@vink.co.za", "b@vink.co.za"]);
    expect(notifyTargets(dept, {} as never)).toEqual(["media@vink.co.za"]);
    const fwd = new ConsoleEmail(); const s2 = createContactService({ db, mail: fwd, env: { DEPT_FORWARD_MEDIA: "press1@vink.co.za,press2@vink.co.za" } as never, now: () => clock });
    await s2.submit({ ...good, department: "media", email: "other@example.com", message: "A press question that is long enough." });
    expect(fwd.sent.filter((m) => m.replyTo?.includes("other@")).map((m) => m.to).sort()).toEqual(["press1@vink.co.za", "press2@vink.co.za"]);
  });

  it("checks the input, strips header-injection tricks, and ignores the hidden trap field", async () => {
    expect(await svc.submit({ ...good, department: "ceo" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.submit({ ...good, name: "A" })).toMatchObject({ ok: false });
    for (const email of ["nope", "a@b", "a b@c.com", "a@b.com,c@d.com", "a@b.com\nBcc: x@y.com"]) expect(await svc.submit({ ...good, email })).toMatchObject({ ok: false, error: expect.stringContaining("email") });
    expect(await svc.submit({ ...good, message: "short" })).toMatchObject({ ok: false });
    expect(await svc.submit({ ...good, phone: "call me!" })).toMatchObject({ ok: false });
    const r = await svc.submit({ ...good, subject: "Hi\r\nBcc: evil@x.com", name: "Eve\r\nCc: x@y.com" });
    expect(r.ok).toBe(true); expect(mail.sent[0].subject).not.toMatch(/[\r\n]/); expect(mail.sent[0].replyTo).not.toMatch(/[\r\n]/);
    mail.sent.length = 0;
    expect(await svc.submit({ ...good, website: "http://spam.example" })).toMatchObject({ ok: true });              // looks like success to a bot
    expect(mail.sent).toHaveLength(0); expect(await svc.list()).toHaveLength(1);
  });

  it("treats the same words sent again within ten minutes as one message", async () => {
    const a = await svc.submit({ ...good, email: "same@example.com" }), b = await svc.submit({ ...good, email: "SAME@example.com" });
    expect(b).toMatchObject({ ok: true, duplicate: true, ref: (a as { ref: string }).ref });
    expect(mail.sent).toHaveLength(2);
    clock = new Date(clock.getTime() + 11 * 60_000);
    expect(await svc.submit({ ...good, email: "same@example.com" })).not.toHaveProperty("duplicate");
  });

  it("never loses a message when email is down: it is saved, shown as not delivered, retried, and the monitor tells a person", async () => {
    let down = true; const sent: EmailMessage[] = [];
    const flaky: EmailSender = { name: "flaky", send: async (m) => { if (down) throw new Error("503 from the email service"); sent.push(m); } };
    const s = createContactService({ db, mail: flaky, env: {} as never, now: () => clock });
    const r = await s.submit(good);
    expect(r).toMatchObject({ ok: true });
    expect((await s.list())[0]).toMatchObject({ delivered: false, tries: 1, lastError: expect.stringContaining("503") });
    expect(await s.undeliveredCount()).toBe(0);                                                                   // not yet 15 minutes
    clock = new Date(clock.getTime() + 20 * 60_000);
    expect(await s.undeliveredCount()).toBe(1);
    const mod = (await import("../manshya/mount.js")).createManshyaModule();
    const issues = (await createOpsMonitor({ db, ledger: manshyaLedgerPort(mod as never), sinks: [], now: () => clock }).check()).issues;
    expect(issues.map((i) => i.code)).toContain("contact_messages_undelivered");
    down = false;
    expect(await s.retryUnsent()).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(["support@vink.co.za", "thandi@example.com"]);
    expect((await s.list())[0]).toMatchObject({ delivered: true });
    expect(await s.retryUnsent()).toBe(0); expect(await s.undeliveredCount()).toBe(0);
  });

  it("lists by department and status, and staff can mark a message answered", async () => {
    await svc.submit(good); await svc.submit({ ...good, department: "careers", email: "j@example.com", message: "I would like to apply for a job." });
    expect((await svc.list({ department: "careers" })).map((m) => m.department)).toEqual(["careers"]);
    const [m] = await svc.list({ department: "support" });
    expect(await svc.setStatus(m.id, "answered")).toBe(true); expect(await svc.setStatus(m.id, "weird")).toBe(false);
    expect((await svc.list({ status: "answered" })).map((x) => x.id)).toEqual([m.id]);
  });
});

describe("incoming email goes to the right department", () => {
  it("matches the recipient address, with or without a display name", async () => {
    expect(departmentOfAddresses(["Compliance <COMPLIANCE@vink.co.za>"])?.key).toBe("compliance");
    expect(departmentOfAddresses(["x@elsewhere.com", "media@vink.co.za"])?.key).toBe("media");
    expect(departmentOfAddresses(["nobody@vink.co.za"])).toBeNull();
    const store = new MemoryInboundStore();
    await store.save({ resendId: "r1", from: "a@b.com", to: ["careers@vink.co.za"], subject: "CV", text: "x", html: null });
    await store.save({ resendId: "r2", from: "a@b.com", to: ["privacy@vink.co.za"], subject: "Delete me", text: "x", html: null });
    expect((await store.list(10, 0, "privacy")).map((m) => m.subject)).toEqual(["Delete me"]);
    expect((await store.list(10, 0)).map((m) => m.department)).toEqual(["privacy", "careers"]);
  });
});

describe("the sender address", () => {
  it("uses a department's address as the sender only on the verified domain", async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = (async (_u: string, i: RequestInit) => { bodies.push(JSON.parse(String(i.body))); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    const r = new ResendEmail("key", "VINK <no-reply@vink.co.za>", f);
    const base = { to: "x@example.com", subject: "s", text: "t", html: "h" };
    await r.send({ ...base, from: "VINK Support <support@vink.co.za>", replyTo: "A <a@example.com>" });
    await r.send({ ...base, from: "Evil <ceo@bank.example>" });
    await r.send({ ...base, from: "VINK <x@vink.co.za>\r\nBcc: y@z.com", replyTo: "a@b.com\r\nBcc: q@z.com" });
    await r.send(base);
    expect(bodies[0]).toMatchObject({ from: "VINK Support <support@vink.co.za>", reply_to: "A <a@example.com>" });
    expect(bodies[1].from).toBe("VINK <no-reply@vink.co.za>");
    expect(bodies[2].from).toBe("VINK <no-reply@vink.co.za>"); expect(bodies[2]).not.toHaveProperty("reply_to");
    expect(bodies[3].from).toBe("VINK <no-reply@vink.co.za>");
  });
});

describe("the routes", () => {
  let server: Server, url = "";
  beforeEach(async () => {
    const app = express();
    app.use("/api/contact", createContactRouter(svc));
    app.use((req, _r, next) => { req.user = { userId: "00000000-0000-0000-0000-000000000090", username: "admin", role: "superadmin" }; next(); });
    app.use("/admin", createContactAdminRouter({ db, svc }));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const post = async (p: string, body: unknown) => { const r = await fetch(url + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any }; };   // eslint-disable-line @typescript-eslint/no-explicit-any

  it("takes a message, lists the departments, and lets staff work the list", async () => {
    const deps = await (await fetch(url + "/api/contact/departments")).json() as { departments: { key: string; address: string }[] };
    expect(deps.departments.map((d) => d.address)).toEqual(DEPARTMENTS.map((d) => d.address));
    const bad = await post("/api/contact", { ...good, message: "x" }); expect(bad.status).toBe(400);
    const ok = await post("/api/contact", good);
    expect(ok).toMatchObject({ status: 201, body: { success: true, data: { department: "support" } } }); expect(ok.body.data.message).toContain(ok.body.data.ref);
    const list = await (await fetch(url + "/admin?department=support")).json() as { messages: { id: string }[] };
    expect(list.messages).toHaveLength(1);
    expect((await post(`/admin/${list.messages[0].id}/status`, { status: "closed" })).status).toBe(200);
    expect((await post(`/admin/${list.messages[0].id}/status`, { status: "nope" })).status).toBe(400);
    expect((await post("/admin/retry", {})).body).toMatchObject({ success: true, sent: 0 });
  });

  it("limits how many messages one address can send in an hour", async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await post("/api/contact", { ...good, message: `Message number ${i} is long enough to be accepted.` })).status;
    expect(last).toBe(429);
  });
});

describe("the department list is the same on the server and on the website", () => {
  it("has identical departments and addresses in both places", async () => {
    const file = fs.readFileSync(path.resolve(__dirname, "../../../src/app/data/departments.ts"), "utf8");
    const aliasBlock = /SECTION_ALIASES[^{]*\{([^}]*)\}/.exec(file)?.[1] ?? "";
    expect([...aliasBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]])).toEqual(Object.entries(SECTION_ALIASES));
    const web = [...file.matchAll(/\{ key: "([a-z]+)", name: "([^"]+)", address: "([^"]+)", purpose: "([^"]+)", respondWithin: "([^"]+)" \}/g)].map((m) => ({ key: m[1], name: m[2], address: m[3], purpose: m[4], respondWithin: m[5] }));
    expect(web).toEqual(DEPARTMENTS);
  });
});
