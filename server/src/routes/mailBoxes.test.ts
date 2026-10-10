import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail } from "../auth/email.js";
import { createMailService, type MailService } from "../services/mailService.js";
import { createMailFiles, type MailFiles } from "../services/mailFiles.js";
import { parseSearch, matchesSearch, normalizeSubject, isEmptySearch } from "../services/mailSearch.js";
import { createMailRouter } from "./mailRouter.js";
import { createContactService } from "../services/contactService.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ROOT = { userId: id(1), role: "superadmin" }, SALES = { userId: id(3), role: "customer" }, OLGA = { userId: id(6), role: "customer" }, SUPPORT = { userId: id(4), role: "customer" };
let db: Db, mail: ConsoleEmail, files: MailFiles, svc: MailService, clock: Date;

type Msg = { from?: string; subject?: string; text?: string; dept?: string | null; at?: string };
const email = async (m: Msg = {}) => String((await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, department, received_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
  [Math.random().toString(36), m.from ?? "Pam Mokoena <pam@example.com>", [`${m.dept ?? "sales"}@vink.co.za`], m.subject ?? "Price list", m.text ?? "Please send your prices.", m.dept === undefined ? "sales" : m.dept, m.at ?? clock.toISOString()])).rows[0].id);
const ids = async (u: typeof SALES, f: Parameters<MailService["list"]>[1]) => { const r = await svc.list(u, f); if (!r.ok) throw new Error(r.error); return r.value.map((m) => m.id); };

beforeEach(async () => {
  db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date("2026-10-09T10:00:00Z");
  for (const [u, name] of [[ROOT, "root"], [SALES, "sam"], [OLGA, "olga"], [SUPPORT, "sue"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u.userId, name, `${name}@vink.co.za`, u.role]);
  await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,'Sales'), ($2,'Sales'), ($3,'Customer Support')`, [SALES.userId, OLGA.userId, SUPPORT.userId]);
  files = createMailFiles({ db, now: () => clock });
  svc = createMailService({ db, mail, now: () => clock, files });
});

describe("search operators", () => {
  const m = (o: Partial<Parameters<typeof matchesSearch>[1]> = {}) => ({ fromName: "Pam Mokoena", fromEmail: "pam@example.com", subject: "Price list 2026", text: "Please send the quote for 20 taxis", at: "2026-10-05T10:00:00Z", status: "open", starred: false, kind: "email", hasAttachment: false, ...o });
  it("understands from:, subject:, has:attachment, is:, dates, phrases and exclusions", () => {
    const s = parseSearch(`from:pam subject:price has:attachment is:starred is:open after:2026-10-01 before:2026-10-31 "the quote" -spam taxis`);
    expect(s).toMatchObject({ from: ["pam"], subject: ["price"], hasAttachment: true, is: ["starred", "open"], terms: ["the quote", "taxis"], exclude: ["spam"] });
    expect(matchesSearch(s, m({ hasAttachment: true, starred: true }))).toBe(true);
    for (const bad of [m({ hasAttachment: false, starred: true }), m({ hasAttachment: true, starred: false }), m({ hasAttachment: true, starred: true, status: "closed" }), m({ hasAttachment: true, starred: true, fromEmail: "x@example.com", fromName: "X" }),
      m({ hasAttachment: true, starred: true, at: "2026-09-30T10:00:00Z" }), m({ hasAttachment: true, starred: true, at: "2026-11-01T00:00:00Z" }), m({ hasAttachment: true, starred: true, text: "the quote for taxis, and spam" })]) expect(matchesSearch(s, bad)).toBe(false);
  });
  it("matches words anywhere, ignores case, treats an unknown operator as text, and ignores bad dates and junk", () => {
    expect(matchesSearch(parseSearch("PRICE taxis"), m())).toBe(true);
    expect(matchesSearch(parseSearch("colour:red"), m())).toBe(false); expect(matchesSearch(parseSearch("colour:red"), m({ text: "colour:red" }))).toBe(true);
    expect(parseSearch("after:yesterday").after).toBeNull();
    expect(isEmptySearch(parseSearch(""))).toBe(true); expect(isEmptySearch(parseSearch("   "))).toBe(true); expect(isEmptySearch(parseSearch("is:nonsense"))).toBe(true); expect(isEmptySearch(parseSearch("a"))).toBe(false);
  });
  it("treats Re: and Fwd: as the same conversation", () => {
    expect(normalizeSubject("RE: Re: FWD: Price  list")).toBe("price list"); expect(normalizeSubject("Fw: price list")).toBe("price list"); expect(normalizeSubject("Regards, Price")).toBe("regards, price");
  });
});

describe("folders and stars", () => {
  it("moves a message to Spam or Trash and back, and keeps it out of the inbox and the waiting count", async () => {
    const a = await email({ subject: "A" }), b = await email({ subject: "B" }), c = await email({ subject: "C" });
    expect(await ids(SALES, { box: "inbox" })).toEqual(expect.arrayContaining([a, b, c]));
    expect((await svc.unread(SALES))[0].open).toBe(3);
    expect(await svc.setFolder(SALES, "email", a, "spam")).toMatchObject({ ok: true, value: { folder: "spam" } });
    expect(await svc.setFolder(OLGA, "email", b, "trash")).toMatchObject({ ok: true });                // a colleague in the department can too
    expect(await ids(SALES, { box: "inbox" })).toEqual([c]);
    expect(await ids(SALES, { box: "spam" })).toEqual([a]); expect(await ids(SALES, { box: "trash" })).toEqual([b]);
    expect((await svc.unread(SALES))[0].open).toBe(1);
    expect(await svc.setFolder(SALES, "email", a, "inbox")).toMatchObject({ ok: true, value: { folder: "inbox" } });
    expect((await ids(SALES, { box: "inbox" })).sort()).toEqual([a, c].sort());
    expect(await ids(SALES, { box: "spam" })).toEqual([]);
  });

  it("stars and unstars, shows starred messages in their own box, and keeps the star when the message is moved", async () => {
    const a = await email({ subject: "A" }), b = await email({ subject: "B" });
    expect(await svc.setStar(SALES, "email", a, true)).toMatchObject({ ok: true, value: { starred: true, folder: "inbox" } });
    expect(await ids(SALES, { box: "starred" })).toEqual([a]);
    await svc.setFolder(SALES, "email", a, "trash");
    expect(await ids(SALES, { box: "starred" })).toEqual([]);                                             // not while it is in the trash
    await svc.setFolder(SALES, "email", a, "inbox");
    expect(await ids(SALES, { box: "starred" })).toEqual([a]);
    expect(await svc.setStar(SALES, "email", a, false)).toMatchObject({ ok: true, value: { starred: false } });
    expect(await ids(SALES, { box: "starred" })).toEqual([]); void b;
    const d = await svc.get(SALES, "email", a);
    expect(d.ok && d.value).toMatchObject({ starred: false, folder: "inbox" });
  });

  it("works for website messages too", async () => {
    const contact = createContactService({ db, mail: new ConsoleEmail(), env: {} as never, now: () => clock });
    await contact.submit({ department: "sales", name: "Thandi Nkosi", email: "thandi@example.com", subject: "Question", message: "Please tell me about your products and prices." });
    const webId = String((await db.query("SELECT id FROM contact_messages")).rows[0].id);
    expect(await ids(SALES, { box: "inbox" })).toEqual([webId]);
    expect(await svc.setStar(SALES, "web", webId, true)).toMatchObject({ ok: true });
    expect(await svc.setFolder(SALES, "web", webId, "spam", true)).toMatchObject({ ok: true });
    expect(await ids(SALES, { box: "spam" })).toEqual([webId]); expect(await ids(SALES, { box: "inbox" })).toEqual([]);
    expect((await svc.unread(SALES))[0].open).toBe(0);
    expect(await ids(SALES, { box: "spam", q: "products" })).toEqual([webId]);
    expect((await db.query("SELECT email FROM mail_blocked_senders")).rows.map((r) => r.email)).toEqual(["thandi@example.com"]);
  });

  it("refuses the wrong person, a bad folder, a missing message and a bad kind", async () => {
    const a = await email();
    expect(await svc.setFolder(SUPPORT, "email", a, "spam")).toMatchObject({ ok: false, status: 403 });
    expect(await svc.setStar(SUPPORT, "email", a, true)).toMatchObject({ ok: false, status: 403 });
    expect(await svc.setFolder(SALES, "email", a, "archive")).toMatchObject({ ok: false, status: 400 });
    expect(await svc.setFolder(SALES, "email", id(404), "spam")).toMatchObject({ ok: false, status: 404 });
    expect(await svc.setFolder(SALES, "carrier-pigeon", a, "spam")).toMatchObject({ ok: false, status: 404 });
    expect((await svc.setFolder(ROOT, "email", a, "spam")).ok).toBe(true);                               // a superadmin can
  });

  it("blocks a sender: their other mail in that department goes to Spam, new mail from them too, and 'not spam' lifts the block", async () => {
    const a = await email({ from: "Bob <bob@spam.example>", subject: "Win" }), b = await email({ from: "Bob <BOB@spam.example>", subject: "Win again" }), c = await email({ from: "Pam <pam@example.com>" });
    const other = await email({ from: "bob@spam.example", dept: "support", subject: "Hello support" });
    await svc.setFolder(SALES, "email", a, "spam", true);
    expect(await ids(SALES, { box: "spam" })).toEqual(expect.arrayContaining([a, b])); expect(await ids(SALES, { box: "inbox" })).toEqual([c]);
    expect(await ids(SUPPORT, { box: "inbox" })).toEqual([other]);                                        // another department is not affected
    const later = await email({ from: "Bob <bob@spam.example>", subject: "More" });
    expect(await ids(SALES, { box: "inbox" })).toContain(later);
    await svc.fileNewEmail(later);
    expect(await ids(SALES, { box: "inbox" })).not.toContain(later); expect(await ids(SALES, { box: "spam" })).toContain(later);
    await svc.setFolder(SALES, "email", a, "inbox");                                                      // not spam: the block is lifted
    const after = await email({ from: "Bob <bob@spam.example>", subject: "Hello" });
    await svc.fileNewEmail(after);
    expect(await ids(SALES, { box: "inbox" })).toContain(after);
    await svc.fileNewEmail(id(404));                                                                      // an unknown email is ignored, not an error
  });

  it("only blocks when asked, and never mail with no department", async () => {
    const a = await email({ from: "x@y.example" }), b = await email({ from: "x@y.example", subject: "second" });
    await svc.setFolder(SALES, "email", a, "spam");
    expect(await ids(SALES, { box: "inbox" })).toEqual([b]);
    const stray = await email({ from: "z@y.example", dept: null });
    await svc.setFolder(ROOT, "email", stray, "spam", true);
    expect((await db.query("SELECT COUNT(*) AS n FROM mail_blocked_senders")).rows[0].n).toBe(0 as never);
  });
});

describe("searching", () => {
  it("finds mail with operators, across the inbox but not spam or trash, and in the sent box", async () => {
    const a = await email({ from: "Pam <pam@example.com>", subject: "Price list", text: "Quote for taxis", at: "2026-10-05T10:00:00Z" });
    const b = await email({ from: "Lerato <lerato@corp.example>", subject: "Invoice 77", text: "Please pay", at: "2026-10-07T10:00:00Z" });
    const spam = await email({ from: "Bob <bob@spam.example>", subject: "Price drop", text: "cheap" }); await svc.setFolder(SALES, "email", spam, "spam");
    await files.recordInbound(a, "x", "sales");                                                           // no API key: no files; attach one by hand
    await db.query(`INSERT INTO mail_files (id, kind, email_id, filename, size, status) VALUES ($1,'inbound',$2,'quote.pdf',10,'stored')`, [id(700), a]);
    expect(await ids(SALES, { box: "all", q: "price" })).toEqual([a]);                                    // the spam "Price drop" is not found
    expect(await ids(SALES, { box: "all", q: "from:lerato" })).toEqual([b]);
    expect(await ids(SALES, { box: "all", q: "has:attachment" })).toEqual([a]);
    expect(await ids(SALES, { box: "all", q: "after:2026-10-06" })).toEqual([b]);
    expect(await ids(SALES, { box: "all", q: `"quote for" -invoice` })).toEqual([a]);
    expect(await ids(SALES, { box: "all", q: "nothing like this" })).toEqual([]);
    expect(await ids(SALES, { box: "spam", q: "price" })).toEqual([spam]);                                // searching inside a folder
    await svc.setStar(SALES, "email", b, true);
    expect(await ids(SALES, { box: "all", q: "is:starred" })).toEqual([b]);
    const sent = await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices attached for you." });
    expect(sent.ok).toBe(true);
    expect(await ids(SALES, { box: "sent", q: "to:pam" })).toHaveLength(1); expect(await ids(SALES, { box: "sent", q: "to:nobody" })).toEqual([]); expect(await ids(SALES, { box: "sent", q: "prices attached" })).toHaveLength(1);
  });
  it("only searches what the person may see", async () => {
    await email({ subject: "Secret", dept: "support" });
    expect(await ids(SALES, { box: "all", q: "secret" })).toEqual([]);
    expect(await svc.list(SALES, { department: "support", q: "secret" })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("conversations", () => {
  it("shows earlier messages from the same sender with the same subject, ignoring Re: and Fwd:", async () => {
    const first = await email({ subject: "Taxi rank levy", at: "2026-10-01T10:00:00Z" }), second = await email({ subject: "Re: Taxi rank levy", at: "2026-10-03T10:00:00Z" });
    await email({ subject: "Something else", at: "2026-10-02T10:00:00Z" }); await email({ from: "Other <o@example.com>", subject: "Taxi rank levy" });
    const third = await email({ subject: "RE: FWD: taxi rank levy", at: "2026-10-05T10:00:00Z" });
    const d = await svc.get(SALES, "email", third);
    expect(d.ok && d.value.thread.map((t) => t.id)).toEqual([second, first]);
    const alone = await svc.get(SALES, "email", await email({ subject: "Unique", from: "u@example.com" }));
    expect(alone.ok && alone.value.thread).toEqual([]);
  });
});

describe("drafts", () => {
  const save = (u: typeof SALES, a: Record<string, unknown>) => svc.saveDraft(u, { department: "sales", ...a });
  it("saves as the person types, one draft updated in place, listed for that person only", async () => {
    const r1 = await save(SALES, { to: "pam@exa", subject: "Our qu", body: "Hello" });
    expect(r1.ok && r1.value.id).toBeTruthy();
    const draftId = (r1 as { ok: true; value: { id: string } }).value.id;
    clock = new Date("2026-10-09T10:05:00Z");
    expect(await save(SALES, { id: draftId, to: "pam@example.com", subject: "Our quote", body: "Hello Pam" })).toMatchObject({ ok: true, value: { id: draftId } });
    const l = await svc.listDrafts(SALES, "sales");
    expect(l.ok && l.value).toHaveLength(1); expect(l.ok && l.value[0]).toMatchObject({ id: draftId, to: "pam@example.com", subject: "Our quote", body: "Hello Pam", replyId: null });
    expect((await svc.listDrafts(OLGA, "sales") as { ok: true; value: unknown[] }).value).toEqual([]);              // a colleague does not see it
    expect(await svc.getDraft(OLGA, draftId)).toMatchObject({ ok: false, status: 404 });
    expect(await svc.getDraft(SALES, draftId)).toMatchObject({ ok: true });
    expect((await svc.unread(SALES))[0].drafts).toBe(1); expect((await svc.unread(OLGA))[0].drafts).toBe(0);
    expect(await svc.deleteDraft(OLGA, draftId)).toBe(false); expect(await svc.deleteDraft(SALES, draftId)).toBe(true);
    expect((await svc.listDrafts(SALES, "sales") as { ok: true; value: unknown[] }).value).toEqual([]);
  });

  it("throws an empty draft away instead of keeping it", async () => {
    const r = await save(SALES, { subject: "x" }); const draftId = (r as { ok: true; value: { id: string } }).value.id;
    expect(await save(SALES, { id: draftId, to: "", subject: "", body: "  " })).toMatchObject({ ok: true, value: { id: null } });
    expect((await svc.listDrafts(SALES, "sales") as { ok: true; value: unknown[] }).value).toEqual([]);
    expect(await save(SALES, { body: "" })).toMatchObject({ ok: true, value: { id: null } });
  });

  it("keeps one reply draft per person per message, and hands it back with the message", async () => {
    const m = await email();
    await save(SALES, { replyKind: "email", replyId: m, body: "Dear Pam, " });
    await save(SALES, { replyKind: "email", replyId: m, body: "Dear Pam, here are the prices." });                    // the same draft, updated
    await save(OLGA, { replyKind: "email", replyId: m, body: "Olga's version" });
    expect((await svc.listDrafts(SALES, "sales") as { ok: true; value: unknown[] }).value).toHaveLength(1);
    const mine = await svc.get(SALES, "email", m), hers = await svc.get(OLGA, "email", m);
    expect(mine.ok && mine.value.draft?.body).toBe("Dear Pam, here are the prices."); expect(hers.ok && hers.value.draft?.body).toBe("Olga's version");
    expect(await svc.get(ROOT, "email", m)).toMatchObject({ ok: true, value: { draft: null } });
  });

  it("is removed when the email is sent, by draft id or as a reply", async () => {
    const d1 = (await save(SALES, { to: "pam@example.com", subject: "Our quote", body: "Prices." }) as { ok: true; value: { id: string } }).value.id;
    expect((await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices.", draftId: d1 })).ok).toBe(true);
    expect(await svc.getDraft(SALES, d1)).toMatchObject({ ok: false });
    const m = await email(); await save(SALES, { replyKind: "email", replyId: m, body: "Reply text here" });
    expect((await svc.reply(SALES, "sam", "email", m, "Reply text here")).ok).toBe(true);
    expect((await svc.get(SALES, "email", m) as { ok: true; value: { draft: unknown } }).value.draft).toBeNull();
  });

  it("is kept when sending fails", async () => {
    const d1 = (await save(SALES, { to: "pam@example.com", subject: "Our quote", body: "Prices." }) as { ok: true; value: { id: string } }).value.id;
    const failing = createMailService({ db, mail: { name: "x", send: async () => { throw new Error("down"); } }, now: () => clock, files });
    expect(await failing.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices.", draftId: d1 })).toMatchObject({ ok: false, status: 502 });
    expect(await svc.getDraft(SALES, d1)).toMatchObject({ ok: true });
  });

  it("remembers the files attached to it, for as long as they are kept", async () => {
    const f = await files.stage(SALES.userId, "quote.pdf", "application/pdf", Buffer.from("pdf"));
    const fid = f.ok ? f.value.id : "";
    const d = (await save(SALES, { to: "pam@example.com", subject: "Quote", body: "See file", attachmentIds: [fid, fid, "nonsense", id(555)] }) as { ok: true; value: { id: string } }).value.id;
    const got = await svc.getDraft(SALES, d);
    expect(got.ok && got.value.attachments.map((a) => a.filename)).toEqual(["quote.pdf"]);
    expect((await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Quote", body: "See file", attachmentIds: [fid], draftId: d })).ok).toBe(true);
    expect(mail.sent[0].attachments?.[0].filename).toBe("quote.pdf");
    const g2 = await files.stage(SALES.userId, "old.pdf", "application/pdf", Buffer.from("pdf"));
    const d2 = (await save(SALES, { body: "later", attachmentIds: [g2.ok ? g2.value.id : ""] }) as { ok: true; value: { id: string } }).value.id;
    clock = new Date("2026-10-30T10:00:00Z"); await files.stage(SALES.userId, "new.pdf", "application/pdf", Buffer.from("pdf"));     // old uploads are cleared a week on
    expect((await svc.getDraft(SALES, d2) as { ok: true; value: { attachments: unknown[] } }).value.attachments).toEqual([]);
  });

  it("checks who may write a draft, and the reply it points at", async () => {
    const m = await email();
    expect(await save(SUPPORT, { body: "hi" })).toMatchObject({ ok: false, status: 403 });
    expect(await svc.saveDraft(SALES, { department: "nowhere", body: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(await save(SALES, { replyKind: "email", body: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(await save(SALES, { replyKind: "email", replyId: id(404), body: "x" })).toMatchObject({ ok: false, status: 404 });
    const other = await email({ dept: "support" });
    expect(await save(SALES, { replyKind: "email", replyId: other, body: "x" })).toMatchObject({ ok: false, status: 404 });   // a message of another department
    expect(await svc.listDrafts(SUPPORT, "sales")).toMatchObject({ ok: false, status: 403 }); void m;
    expect(await save(SALES, { body: "x".repeat(30000), subject: "s\r\nBcc: x@y.z", to: "a@b.co" })).toMatchObject({ ok: true });
    const l = (await svc.listDrafts(SALES, "sales")) as { ok: true; value: { body: string; subject: string }[] };
    expect(l.value[0].body.length).toBe(20000); expect(l.value[0].subject).not.toMatch(/[\r\n]/);
  });
});

describe("over HTTP", () => {
  let server: Server, url: string;
  beforeEach(async () => {
    const app = express(); app.use((req, _r, next) => { req.user = { ...SALES, username: "sam" } as never; next(); });
    app.use("/api/mail", createMailRouter({ db, svc }));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mail`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const post = (path: string, body: unknown) => fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("moves, stars, searches and drafts through the API", async () => {
    const a = await email({ subject: "Price list" });
    expect((await post(`/messages/email/${a}/star`, { starred: true })).status).toBe(200);
    expect((await post(`/messages/email/${a}/folder`, { folder: "spam", blockSender: true })).status).toBe(200);
    const spam = await (await fetch(`${url}/messages?department=sales&box=spam`)).json() as { messages: { id: string; starred: boolean; folder: string }[] };
    expect(spam.messages).toMatchObject([{ id: a, starred: true, folder: "spam" }]);
    expect((await post(`/messages/email/${a}/folder`, { folder: "archive" })).status).toBe(400);
    expect((await post(`/messages/email/nope/folder`, { folder: "spam" })).status).toBe(400);
    const found = await (await fetch(`${url}/messages?department=sales&box=spam&q=${encodeURIComponent("subject:price is:starred")}`)).json() as { messages: unknown[] };
    expect(found.messages).toHaveLength(1);
    const d = await (await post("/drafts", { department: "sales", to: "pam@example.com", subject: "Hi", body: "Draft body" })).json() as { success: boolean; id: string };
    expect(d.success).toBe(true);
    const list = await (await fetch(`${url}/drafts?department=sales`)).json() as { drafts: { id: string; body: string }[] };
    expect(list.drafts).toMatchObject([{ id: d.id, body: "Draft body" }]);
    expect((await fetch(`${url}/drafts?department=support`)).status).toBe(403);
    expect((await fetch(`${url}/drafts/${d.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await fetch(`${url}/drafts/nope`, { method: "DELETE" })).status).toBe(400);
    expect(((await (await fetch(`${url}/drafts?department=sales`)).json()) as { drafts: unknown[] }).drafts).toEqual([]);
  });
});
