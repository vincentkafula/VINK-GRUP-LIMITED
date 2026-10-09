import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail, type EmailMessage, type EmailSender } from "../auth/email.js";
import { createContactService, type ContactService } from "../services/contactService.js";
import { createMailService, parseAddress, type MailService } from "../services/mailService.js";
import { createMailRouter } from "./mailRouter.js";
import { DEPARTMENTS } from "../config/departments.js";
import { SECTIONS } from "./rbac.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ROOT = { userId: id(1), role: "superadmin" }, OWNER = { userId: id(2), role: "owner" };
const SALES = { userId: id(3), role: "customer" }, SUPPORT_AND_CAREERS = { userId: id(4), role: "customer" }, NOBODY = { userId: id(5), role: "customer" };
let db: Db, mail: ConsoleEmail, contact: ContactService, svc: MailService, clock = new Date("2026-10-09T10:00:00Z");
const addInbound = (o: { to: string[]; from?: string; subject?: string; text?: string | null; html?: string | null; dept?: string | null; at?: string }) =>
  db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, html_body, department, received_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [Math.random().toString(36), o.from ?? "Pam Mokoena <pam@example.com>", o.to, o.subject ?? "Hello", o.text ?? null, o.html ?? null, o.dept === undefined ? "sales" : o.dept, o.at ?? clock.toISOString()]);
const web = (department: string, email = "thandi@example.com", message = "Please tell me about your products and prices.") => contact.submit({ department, name: "Thandi Nkosi", email, subject: "Question", message });

beforeEach(async () => {
  db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date("2026-10-09T10:00:00Z");
  for (const [u, name] of [[ROOT, "root"], [OWNER, "owner"], [SALES, "sam"], [SUPPORT_AND_CAREERS, "sue"], [NOBODY, "nick"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u.userId, name, `${name}@vink.co.za`, u.role]);
  await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,'Sales'), ($2,'Customer Support'), ($2,'Careers'), ($3,'Bank Management')`, [SALES.userId, SUPPORT_AND_CAREERS.userId, NOBODY.userId]);
  contact = createContactService({ db, mail: new ConsoleEmail(), env: {} as never, now: () => clock });
  svc = createMailService({ db, mail, now: () => clock });
});

describe("who sees which department's mail", () => {
  it("gives owners and superadmins every department, and a manager only the departments they are approved for", async () => {
    for (const u of [ROOT, OWNER]) expect((await svc.departmentsFor(u)).map((d) => d.key)).toEqual([...DEPARTMENTS.map((d) => d.key), "unrouted"]);
    expect((await svc.departmentsFor(SALES)).map((d) => d.key)).toEqual(["sales"]);
    expect((await svc.departmentsFor(SUPPORT_AND_CAREERS)).map((d) => d.key)).toEqual(["support", "careers"]);
    expect(await svc.departmentsFor(NOBODY)).toEqual([]);                                                     // a section like Bank Management is not a mailbox
  });

  it("lets a manager apply for a department as a section, because the department names are sections", () => {
    for (const d of DEPARTMENTS) expect(SECTIONS).toContain(d.name);
    expect(SECTIONS).toContain("Bank Management");
  });

  it("shows each person only their own departments' messages, and refuses the rest", async () => {
    await web("sales"); await web("support", "b@example.com"); await web("compliance", "c@example.com");
    await addInbound({ to: ["sales@vink.co.za"] }); await addInbound({ to: ["media@vink.co.za"], dept: "media" }); await addInbound({ to: ["nobody@vink.co.za"], dept: null });
    const ids = async (u: typeof ROOT) => { const r = await svc.list(u); return r.ok ? r.value.map((m) => m.department).sort() : r; };
    expect(await ids(SALES)).toEqual(["sales", "sales"]);
    expect(await ids(SUPPORT_AND_CAREERS)).toEqual(["support"]);
    expect(await ids(NOBODY)).toEqual([]);
    expect(await ids(ROOT)).toEqual(["compliance", "media", "sales", "sales", "support", "unrouted"]);
    expect(await svc.list(SALES, { department: "support" })).toMatchObject({ ok: false, status: 403 });
    expect((await svc.unread(SALES)).map((d) => `${d.key}:${d.open}`)).toEqual(["sales:2"]);
    expect((await svc.unread(ROOT)).find((d) => d.key === "unrouted")?.open).toBe(1);
  });
});

describe("reading", () => {
  it("returns plain text only, even when the email has HTML, and 403/404 correctly", async () => {
    await addInbound({ to: ["sales@vink.co.za"], text: null, html: '<p>Buy <b>now</b></p><script>alert(1)</script><img src=x onerror=alert(2)>' });
    await addInbound({ to: ["support@vink.co.za"], dept: "support" });
    const list = (await svc.list(ROOT)) as { ok: true; value: { id: string; department: string }[] };
    const salesMsg = list.value.find((m) => m.department === "sales")!, supportMsg = list.value.find((m) => m.department === "support")!;
    const d = await svc.get(SALES, "email", salesMsg.id);
    expect(d).toMatchObject({ ok: true, value: { fromName: "Pam Mokoena", fromEmail: "pam@example.com", status: "open" } });
    const text = (d as { ok: true; value: { text: string } }).value.text;
    expect(text).toContain("Buy now"); expect(text).not.toMatch(/[<>]|alert/);
    expect(await svc.get(SALES, "email", supportMsg.id)).toMatchObject({ ok: false, status: 403 });
    expect(await svc.get(SALES, "email", id(99))).toMatchObject({ ok: false, status: 404 });
    expect(await svc.get(SALES, "fax", salesMsg.id)).toMatchObject({ ok: false, status: 404 });
    expect(parseAddress('"Pam M" <PAM@Example.com>')).toEqual({ name: "Pam M", email: "pam@example.com" });
    expect(parseAddress("solo@example.com")).toEqual({ name: "solo@example.com", email: "solo@example.com" });
  });
});

describe("replying and sending", () => {
  it("answers a website message from the department's address, marks it answered, and records who replied", async () => {
    await web("sales", "thandi@example.com");
    const m = ((await svc.list(SALES)) as { ok: true; value: { id: string; ref: string }[] }).value[0];
    expect(await svc.reply(SALES, "sam", "web", m.id, "x")).toMatchObject({ ok: false, status: 400 });
    const r = await svc.reply(SALES, "sam", "web", m.id, "Thank you. Our price list is attached to the next email.");
    expect(r.ok).toBe(true);
    const sent = mail.sent.at(-1) as EmailMessage;
    expect(sent).toMatchObject({ to: "thandi@example.com", from: "VINK Sales <sales@vink.co.za>", replyTo: "sales@vink.co.za" });
    expect(sent.subject).toBe(`Re: Question (${m.ref})`); expect(sent.text).toContain("Our price list"); expect(sent.text).toContain("> Please tell me about your products");
    const d = (await svc.get(SALES, "web", m.id)) as { ok: true; value: { status: string; replies: { by: string; to: string }[] } };
    expect(d.value.status).toBe("answered"); expect(d.value.replies).toMatchObject([{ by: "sam", to: "thandi@example.com" }]);
    const sentBox = (await svc.list(SALES, { box: "sent" })) as { ok: true; value: { fromEmail: string; status: string }[] };
    expect(sentBox.value).toMatchObject([{ fromEmail: "thandi@example.com", status: "sent" }]);
    expect((await svc.list(SALES, { status: "open" }) as { ok: true; value: unknown[] }).value).toHaveLength(0);
  });

  it("answers an incoming email, refuses mail that was addressed to no department, and refuses a manager of another department", async () => {
    await addInbound({ to: ["support@vink.co.za"], dept: "support", subject: "Re: my card" }); await addInbound({ to: ["x@vink.co.za"], dept: null });
    const all = ((await svc.list(ROOT)) as { ok: true; value: { id: string; department: string }[] }).value;
    const sup = all.find((m) => m.department === "support")!, lost = all.find((m) => m.department === "unrouted")!;
    expect(await svc.reply(SALES, "sam", "email", sup.id, "Hello there")).toMatchObject({ ok: false, status: 403 });
    expect((await svc.reply(SUPPORT_AND_CAREERS, "sue", "email", sup.id, "We are looking into your card.")).ok).toBe(true);
    expect(mail.sent.at(-1)).toMatchObject({ to: "pam@example.com", from: "VINK Customer Support <support@vink.co.za>", subject: "Re: my card" });
    expect(await svc.reply(ROOT, "root", "email", lost.id, "Hello there")).toMatchObject({ ok: false, status: 409 });
  });

  it("sends a new email only from a department the person manages, to one valid address, and records it", async () => {
    const ok = await svc.send(SALES, "sam", { department: "sales", to: "Buyer@Example.com", subject: "Your quote", body: "Here is the quote you asked for." });
    expect(ok.ok).toBe(true); expect(mail.sent.at(-1)).toMatchObject({ to: "buyer@example.com", from: "VINK Sales <sales@vink.co.za>" });
    expect(await svc.send(SALES, "sam", { department: "careers", to: "a@b.com", subject: "Hi", body: "Hello" })).toMatchObject({ ok: false, status: 403 });
    expect((await svc.send(ROOT, "root", { department: "careers", to: "a@b.com", subject: "Hi", body: "Hello" })).ok).toBe(true);        // a superadmin can use every department
    for (const to of ["nope", "a@b.com, c@d.com", "a@b.com\nBcc: x@y.com", "a b@c.com"]) expect(await svc.send(SALES, "sam", { department: "sales", to, subject: "Hi", body: "Hello" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.send(SALES, "sam", { department: "unrouted", to: "a@b.com", subject: "Hi", body: "Hello" })).toMatchObject({ ok: false, status: 400 });
    const inj = await svc.send(SALES, "sam", { department: "sales", to: "a@b.com", subject: "Hi\r\nBcc: evil@x.com", body: "Hello" });
    expect(inj.ok).toBe(true); expect(mail.sent.at(-1)!.subject).not.toMatch(/[\r\n]/);
  });

  it("limits each person to 40 emails an hour", async () => {
    for (let i = 0; i < 40; i++) expect((await svc.send(SALES, "sam", { department: "sales", to: "a@b.com", subject: `Note ${i}`, body: "Hello there" })).ok).toBe(true);
    expect(await svc.send(SALES, "sam", { department: "sales", to: "a@b.com", subject: "One more", body: "Hello there" })).toMatchObject({ ok: false, status: 429 });
    expect((await svc.send(ROOT, "root", { department: "sales", to: "a@b.com", subject: "Other person", body: "Hello there" })).ok).toBe(true);
    clock = new Date(clock.getTime() + 61 * 60_000);
    expect((await svc.send(SALES, "sam", { department: "sales", to: "a@b.com", subject: "Later", body: "Hello there" })).ok).toBe(true);
  });

  it("does not mark a message answered when the email fails, and keeps a record of the failed try", async () => {
    await web("sales");
    const down: EmailSender = { name: "down", send: async () => { throw new Error("503 from the email service"); } };
    const s2 = createMailService({ db, mail: down, now: () => clock });
    const m = ((await s2.list(SALES)) as { ok: true; value: { id: string }[] }).value[0];
    expect(await s2.reply(SALES, "sam", "web", m.id, "We will get back to you.")).toMatchObject({ ok: false, status: 502 });
    const d = (await s2.get(SALES, "web", m.id)) as { ok: true; value: { status: string; replies: { status: string }[] } };
    expect(d.value.status).toBe("open"); expect(d.value.replies).toMatchObject([{ status: "failed" }]);
  });

  it("lets a manager close a message, and only in their own department", async () => {
    await web("sales"); await web("support", "b@example.com");
    const all = ((await svc.list(ROOT)) as { ok: true; value: { id: string; department: string }[] }).value;
    const s = all.find((m) => m.department === "sales")!, p = all.find((m) => m.department === "support")!;
    expect(await svc.setStatus(SALES, "web", s.id, "closed")).toMatchObject({ ok: true });
    expect(await svc.setStatus(SALES, "web", p.id, "closed")).toMatchObject({ ok: false, status: 403 });
    expect(await svc.setStatus(SALES, "web", s.id, "deleted")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("the mail routes", () => {
  let server: Server, url = "", as = ROOT, name = "root";
  beforeEach(async () => {
    const app = express(); app.use((req, _r, next) => { req.user = { ...as, username: name } as never; next(); });
    app.use("/api/mail", createMailRouter({ db, svc }));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const call = async (path: string, method = "GET", body?: unknown) => { const r = await fetch(url + "/api/mail" + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: (await r.json()) as any }; };   // eslint-disable-line @typescript-eslint/no-explicit-any

  it("lists, reads, replies and sends over the API with the right limits for each person", async () => {
    await web("sales");
    as = SALES; name = "sam";
    expect((await call("/departments")).body.departments).toMatchObject([{ key: "sales", open: 1 }]);
    const list = (await call("/messages?department=sales")).body.messages; expect(list).toHaveLength(1);
    expect((await call("/messages?department=support")).status).toBe(403);
    expect((await call(`/messages/web/${list[0].id}`)).body.message).toMatchObject({ department: "sales", text: expect.stringContaining("products and prices") });
    expect((await call(`/messages/web/${list[0].id}/reply`, "POST", { body: "Thanks, we will send prices." })).status).toBe(201);
    expect((await call(`/messages/web/${list[0].id}/status`, "POST", { status: "closed" })).body.status).toBe("closed");
    expect((await call("/send", "POST", { department: "sales", to: "buyer@example.com", subject: "Quote", body: "Please find the quote." })).status).toBe(201);
    expect((await call("/send", "POST", { department: "media", to: "buyer@example.com", subject: "Quote", body: "Please find the quote." })).status).toBe(403);
    expect((await call("/messages/web/not-a-uuid")).status).toBe(400);
    as = NOBODY; name = "nick";
    expect((await call("/departments")).body.departments).toEqual([]);
    as = ROOT; name = "root";
    expect((await call("/departments")).body.departments).toHaveLength(DEPARTMENTS.length + 1);
  });
});
