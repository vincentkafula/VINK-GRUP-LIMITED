import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail, type EmailSender } from "../auth/email.js";
import { createMailService, type MailService } from "../services/mailService.js";
import { createMailFiles, type MailFiles } from "../services/mailFiles.js";
import { createMailRouter } from "./mailRouter.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ROOT = { userId: id(1), role: "superadmin" }, SALES = { userId: id(3), role: "customer" }, OLGA = { userId: id(6), role: "customer" }, SUPPORT = { userId: id(4), role: "customer" };
let db: Db, mail: ConsoleEmail, files: MailFiles, svc: MailService, clock: Date;
const T0 = "2026-10-09T10:00:00Z";

type Msg = { from?: string; subject?: string; text?: string; dept?: string; at?: string };
const email = async (m: Msg = {}) => String((await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, department, received_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
  [Math.random().toString(36), m.from ?? "Pam Mokoena <pam@example.com>", [`${m.dept ?? "sales"}@vink.co.za`], m.subject ?? "Taxi rank levy", m.text ?? "Please advise on the levy for our taxi association.", m.dept ?? "sales", m.at ?? clock.toISOString()])).rows[0].id);
const ids = async (u: typeof SALES, f: Parameters<MailService["list"]>[1]) => { const r = await svc.list(u, f); if (!r.ok) throw new Error(r.error); return r.value.map((m) => m.id); };
const ok = <T,>(r: { ok: boolean } & Record<string, unknown>): T => { if (!r.ok) throw new Error(String(r.error)); return (r as unknown as { value: T }).value; };
const flag = async (kind: string, mid: string) => (await db.query(`SELECT * FROM mail_flags WHERE kind = $1 AND message_id = $2`, [kind, mid])).rows[0];

beforeEach(async () => {
  db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date(T0);
  for (const [u, name, nm] of [[ROOT, "root", "Root Admin"], [SALES, "sam", "Sarah Mitchell"], [OLGA, "olga", "Olga Dube"], [SUPPORT, "sue", "Sue Smith"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [u.userId, name, nm, `${name}@vink.co.za`, u.role]);
  await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,'Sales'), ($2,'Sales'), ($3,'Customer Support')`, [SALES.userId, OLGA.userId, SUPPORT.userId]);
  files = createMailFiles({ db, now: () => clock });
  svc = createMailService({ db, mail, now: () => clock, files, publicApiUrl: "https://api.example.test", attachLimitBytes: 1000 });
});

describe("the signature", () => {
  it("is added to every email, in the VINK design, with the sender's name and the department's name and address", async () => {
    expect((await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices attached." })).ok).toBe(true);
    const m = mail.sent[0];
    for (const s of ["Sarah Mitchell", ">Sales<", "mailto:sales@vink.co.za", "#82161A", "#D1A55B", "https://www.vink.co.za/signature/vink-logo.png", "confidential and intended solely"]) expect(m.html, s).toContain(s);
    expect(m.html).toContain("Prices attached."); expect(m.text).toContain("Prices attached."); expect(m.text).toContain("--\nSarah Mitchell\nSales");
    expect(m.html).toContain(">SM<");                                                                                      // initials, because there is no photo yet
  });
  it("is the same design for every department, with that department's own name and address", async () => {
    await svc.send(SUPPORT, "sue", { department: "support", to: "pam@example.com", subject: "Your question", body: "Here is help." });
    expect(mail.sent[0].html).toContain("Customer Support"); expect(mail.sent[0].html).toContain("mailto:support@vink.co.za"); expect(mail.sent[0].html).toContain("Sue Smith"); expect(mail.sent[0].html).toContain("#82161A");
  });
  it("uses the person's own details once they have saved them, and keeps each person's separate", async () => {
    const r = await svc.saveSignature(SALES, "sam", "sales", { name: "Sarah M. Mitchell", title: "Sales Executive", phone: "+27 (0)21 007 0772", photoUrl: "https://www.vink.co.za/p/sarah.jpg" });
    expect(r).toMatchObject({ ok: true, value: { name: "Sarah M. Mitchell", title: "Sales Executive", custom: true, department: "Sales", email: "sales@vink.co.za" } });
    await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices." });
    expect(mail.sent[0].html).toContain("Sarah M. Mitchell"); expect(mail.sent[0].html).toContain("Sales Executive"); expect(mail.sent[0].html).toContain("tel:+27210070772"); expect(mail.sent[0].html).toContain('src="https://www.vink.co.za/p/sarah.jpg"');
    await svc.send(OLGA, "olga", { department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices." });
    expect(mail.sent[1].html).toContain("Olga Dube"); expect(mail.sent[1].html).not.toContain("Sarah M. Mitchell");
    const g = await svc.getSignature(SALES, "sam", "sales"); expect(g.ok && g.value.html).toContain("Sales Executive");
  });
  it("can be switched off, leaving the short footer", async () => {
    await svc.saveSignature(SALES, "sam", "sales", { name: "Sarah Mitchell", enabled: false });
    await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices." });
    expect(mail.sent[0].html).not.toContain("confidential and intended"); expect(mail.sent[0].html).toContain("Sales<br>VINK"); expect(mail.sent[0].text).toContain("Sales\nVINK");
  });
  it("checks what is typed: a name, a sensible phone, an https photo, and the right department", async () => {
    expect(await svc.saveSignature(SALES, "sam", "sales", { name: "" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.saveSignature(SALES, "sam", "sales", { name: "S", phone: "<script>" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.saveSignature(SALES, "sam", "sales", { name: "S", photoUrl: "http://insecure.example/a.jpg" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.saveSignature(SALES, "sam", "sales", { name: "S", photoUrl: "javascript:alert(1)" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.saveSignature(SALES, "sam", "support", { name: "S" })).toMatchObject({ ok: false, status: 403 });
    expect(await svc.getSignature(SALES, "sam", "nowhere")).toMatchObject({ ok: false, status: 400 });
    expect(await svc.saveSignature(SALES, "sam", "sales", { name: "<b>Bold</b> \"Sam\"", title: "<script>x</script>" })).toMatchObject({ ok: true });
    await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices." });
    expect(mail.sent[0].html).not.toContain("<script"); expect(mail.sent[0].html).not.toContain("<b>Bold");
  });
  it("shows a live preview of what is typed without saving it", async () => {
    const p = await svc.previewSignature(SALES, "sales", { name: "Preview Person", title: "Tester" });
    expect(p.ok && p.value.html).toContain("Preview Person");
    expect((await db.query("SELECT COUNT(*) AS n FROM mail_signatures")).rows[0].n).toBe(0 as never);
    expect(await svc.previewSignature(SALES, "sales", { name: "" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.previewSignature(SUPPORT, "sales", { name: "X" })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("rich text", () => {
  it("is cleaned, sent as HTML with a plain-text version, and kept with the sent email", async () => {
    const r = await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Prices", body: "", bodyHtml: `<p>Dear <b>Pam</b>,</p><ul><li>Taxi</li><li>Bus</li></ul><script>alert(1)</script><img src=x onerror=alert(1)><a href="https://vink.co.za/p" onclick="x()">our site</a>` });
    expect(r.ok).toBe(true);
    const m = mail.sent[0];
    expect(m.html).toContain("<b>Pam</b>"); expect(m.html).toContain("<li>Taxi</li>"); expect(m.html).not.toContain("<script"); expect(m.html).not.toContain("onerror"); expect(m.html).not.toContain("onclick");
    expect(m.text).toContain("Dear Pam,"); expect(m.text).toContain("- Taxi"); expect(m.text).toContain("our site (https://vink.co.za/p)");
    const row = (await db.query("SELECT body, body_html FROM mail_outbound")).rows[0];
    expect(row.body).toContain("- Bus"); expect(row.body_html).toContain("<b>Pam</b>"); expect(row.body_html).not.toContain("<script");
    expect(await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Prices", body: "", bodyHtml: "<script>x</script>" })).toMatchObject({ ok: false, status: 400 });      // nothing left once cleaned
  });
  it("keeps plain text working as before", async () => {
    await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Prices", body: "Line one\nLine two <b>" });
    expect(mail.sent[0].html).toContain("Line one\nLine two &lt;b&gt;"); expect(mail.sent[0].text).toContain("Line one\nLine two <b>");
  });
  it("is quoted under a reply, and shown with the reply afterwards", async () => {
    const m = await email({ text: "Original question <here>" });
    expect((await svc.reply(SALES, "sam", "email", m, "", undefined, "<p>Here is <i>the</i> answer</p>")).ok).toBe(true);
    expect(mail.sent[0].html).toContain("<i>the</i>"); expect(mail.sent[0].html).toContain("<blockquote>"); expect(mail.sent[0].html).toContain("Original question &lt;here&gt;"); expect(mail.sent[0].text).toContain("Original question <here>");
    const d = await svc.get(SALES, "email", m); expect(d.ok && d.value.replies[0].bodyHtml).toContain("<i>the</i>");
  });
  it("is kept in drafts", async () => {
    const r = await svc.saveDraft(SALES, { department: "sales", to: "pam@example.com", subject: "Hi", bodyHtml: "<p>Hello <b>Pam</b><script>x</script></p>" });
    const draft = await svc.getDraft(SALES, ok<{ id: string }>(r).id as string);
    expect(draft.ok && draft.value.bodyHtml).toBe("<p>Hello <b>Pam</b></p>"); expect(draft.ok && draft.value.body).toBe("Hello Pam");
  });
});

describe("templates", () => {
  it("are shared by a department, can be changed and deleted, and are kept apart between departments", async () => {
    const t = ok<{ id: string }>(await svc.saveTemplate(SALES, { department: "sales", name: "Price list", subject: "Our prices", bodyHtml: "<p>Dear customer, <b>prices</b> attached.</p><script>x</script>" }));
    const list = await svc.listTemplates(OLGA, "sales"); expect(list.ok && list.value).toMatchObject([{ id: t.id, name: "Price list", subject: "Our prices", bodyHtml: "<p>Dear customer, <b>prices</b> attached.</p>" }]);
    expect(await svc.saveTemplate(OLGA, { id: t.id, department: "sales", name: "Price list v2", bodyHtml: "<p>New text</p>" })).toMatchObject({ ok: true, value: { name: "Price list v2" } });
    expect((await svc.listTemplates(SALES, "sales") as { ok: true; value: unknown[] }).value).toHaveLength(1);
    expect(await svc.listTemplates(SUPPORT, "sales")).toMatchObject({ ok: false, status: 403 });
    expect(await svc.deleteTemplate(SUPPORT, t.id)).toMatchObject({ ok: false, status: 403 });
    expect(await svc.deleteTemplate(SALES, t.id)).toMatchObject({ ok: true }); expect(await svc.deleteTemplate(SALES, t.id)).toMatchObject({ ok: false, status: 404 });
  });
  it("need a name and some text, and the name must be new", async () => {
    expect(await svc.saveTemplate(SALES, { department: "sales", name: "", bodyHtml: "<p>x y</p>" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.saveTemplate(SALES, { department: "sales", name: "A", bodyHtml: "<script>x</script>" })).toMatchObject({ ok: false, status: 400 });
    await svc.saveTemplate(SALES, { department: "sales", name: "Thanks", body: "Thank you for contacting us." });
    expect(await svc.saveTemplate(SALES, { department: "sales", name: "Thanks", bodyHtml: "<p>again</p>" })).toMatchObject({ ok: false, status: 409 });
    const t = (await svc.listTemplates(SALES, "sales")) as { ok: true; value: { bodyHtml: string }[] }; expect(t.value[0].bodyHtml).toContain("Thank you for contacting us.");                // plain text becomes HTML
  });
});

describe("labels", () => {
  it("are made per department, put on messages, shown in the list, searched, and filtered by", async () => {
    const urgent = ok<{ id: string }>(await svc.createLabel(SALES, "sales", "Urgent", "#DC2626"));
    const billing = ok<{ id: string }>(await svc.createLabel(SALES, "sales", "Billing", "nonsense"));
    const a = await email({ subject: "A" }), b = await email({ subject: "B" });
    expect(await svc.setMessageLabel(OLGA, "email", a, urgent.id, true)).toMatchObject({ ok: true, value: { labels: [{ name: "Urgent", color: "#DC2626" }] } });
    await svc.setMessageLabel(SALES, "email", a, billing.id, true); await svc.setMessageLabel(SALES, "email", a, billing.id, true);              // twice is the same as once
    const list = await svc.list(SALES, { department: "sales" });
    expect(list.ok && list.value.find((m) => m.id === a)?.labels.map((l) => `${l.name}:${l.color}`)).toEqual(["Billing:#8B0000", "Urgent:#DC2626"]);
    expect(list.ok && list.value.find((m) => m.id === b)?.labels).toEqual([]);
    expect(await ids(SALES, { box: "all", q: "label:urgent" })).toEqual([a]); expect(await ids(SALES, { box: "all", q: "label:nothing" })).toEqual([]);
    expect(await ids(SALES, { box: "inbox", label: urgent.id })).toEqual([a]);
    const d = await svc.get(SALES, "email", a); expect(d.ok && d.value.labels).toHaveLength(2);
    await svc.setMessageLabel(SALES, "email", a, urgent.id, false); expect((await ids(SALES, { box: "inbox", label: urgent.id }))).toEqual([]);
  });
  it("refuse a duplicate, a missing name, the wrong department, and a label from another department", async () => {
    await svc.createLabel(SALES, "sales", "Urgent", "#DC2626");
    expect(await svc.createLabel(SALES, "sales", "Urgent", "#000000")).toMatchObject({ ok: false, status: 409 });
    expect(await svc.createLabel(SALES, "sales", " ", "#000000")).toMatchObject({ ok: false, status: 400 });
    expect(await svc.createLabel(SALES, "support", "X", "#000000")).toMatchObject({ ok: false, status: 403 });
    const other = ok<{ id: string }>(await svc.createLabel(SUPPORT, "support", "Refund", "#000000"));
    const a = await email();
    expect(await svc.setMessageLabel(SALES, "email", a, other.id, true)).toMatchObject({ ok: false, status: 404 });
    expect(await svc.setMessageLabel(SUPPORT, "email", a, other.id, true)).toMatchObject({ ok: false, status: 403 });
    expect(await svc.setMessageLabel(SALES, "email", a, "nope", true)).toMatchObject({ ok: false, status: 404 });
    expect(await svc.setMessageLabel(SALES, "email", id(404), other.id, true)).toMatchObject({ ok: false, status: 404 });
    expect(await svc.listLabels(SALES, "support")).toMatchObject({ ok: false, status: 403 });
  });
  it("take the label off every message and filter when deleted", async () => {
    const l = ok<{ id: string }>(await svc.createLabel(SALES, "sales", "Urgent", "#DC2626")), a = await email();
    await svc.setMessageLabel(SALES, "email", a, l.id, true);
    await svc.saveFilter(SALES, { department: "sales", name: "Urgent words", words: "urgent", labelId: l.id });
    expect(await svc.deleteLabel(SUPPORT, l.id)).toMatchObject({ ok: false, status: 403 });
    expect(await svc.deleteLabel(SALES, l.id)).toMatchObject({ ok: true });
    const d = await svc.get(SALES, "email", a); expect(d.ok && d.value.labels).toEqual([]);
    expect(await svc.listFilters(SALES, "sales")).toMatchObject({ ok: true, value: [{ name: "Urgent words", label: null, star: false }] });
    expect(await svc.deleteLabel(SALES, l.id)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("snooze", () => {
  it("hides a message until the time, shows it in Snoozed, and brings it back to the inbox as open", async () => {
    const a = await email({ subject: "Call me" }), b = await email({ subject: "Other" });
    await svc.setStatus(SALES, "email", a, "answered");
    expect(await svc.setSnooze(SALES, "email", a, "2026-10-10T08:00:00Z")).toMatchObject({ ok: true, value: { snoozedUntil: "2026-10-10T08:00:00.000Z" } });
    expect(await ids(SALES, { box: "inbox" })).toEqual([b]); expect(await ids(SALES, { box: "snoozed" })).toEqual([a]); expect(await ids(SALES, { box: "all" })).toEqual([b]);
    expect((await svc.unread(SALES))[0].open).toBe(1);
    const d = await svc.get(SALES, "email", a); expect(d.ok && d.value.snoozedUntil).toBe("2026-10-10T08:00:00.000Z");
    clock = new Date("2026-10-10T08:00:01Z");
    expect((await ids(SALES, { box: "inbox" })).sort()).toEqual([a, b].sort()); expect(await ids(SALES, { box: "snoozed" })).toEqual([]);
    const back = await svc.get(SALES, "email", a); expect(back.ok && back.value).toMatchObject({ status: "open", snoozedUntil: null });                // it comes back as new
    expect((await svc.unread(SALES))[0].open).toBe(2);
  });
  it("can be undone, refuses bad times, and is cancelled by moving the message to Spam or Trash", async () => {
    const a = await email();
    await svc.setSnooze(SALES, "email", a, "2026-10-12T08:00:00Z");
    expect(await svc.setSnooze(SALES, "email", a, null)).toMatchObject({ ok: true, value: { snoozedUntil: null } }); expect(await ids(SALES, { box: "inbox" })).toEqual([a]);
    for (const bad of ["yesterday", "2026-10-08T08:00:00Z", "2030-01-01T00:00:00Z", 42]) expect(await svc.setSnooze(SALES, "email", a, bad), String(bad)).toMatchObject({ ok: false, status: 400 });
    expect(await svc.setSnooze(SUPPORT, "email", a, "2026-10-12T08:00:00Z")).toMatchObject({ ok: false, status: 403 });
    expect(await svc.setSnooze(SALES, "email", id(404), "2026-10-12T08:00:00Z")).toMatchObject({ ok: false, status: 404 });
    await svc.setSnooze(SALES, "email", a, "2026-10-12T08:00:00Z"); await svc.setFolder(SALES, "email", a, "trash");
    expect((await flag("email", a)).snooze_until).toBeNull();
  });
});

describe("scheduled send", () => {
  const plan = (o: Record<string, unknown> = {}) => ({ department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices attached.", sendAt: "2026-10-09T12:00:00Z", ...o });
  it("holds an email until its time, then sends it once, as the person who wrote it", async () => {
    const r = ok<{ id: string; sendAt: string }>(await svc.schedule(SALES, "sam", plan()));
    expect(r.sendAt).toBe("2026-10-09T12:00:00.000Z"); expect(mail.sent).toHaveLength(0);
    const l = await svc.listScheduled(OLGA, "sales"); expect(l.ok && l.value).toMatchObject([{ id: r.id, to: "pam@example.com", subject: "Our quote", status: "pending", by: "sam" }]);
    expect((await svc.unread(SALES))[0].scheduled).toBe(1);
    expect(await svc.sendDue()).toBe(0); expect(mail.sent).toHaveLength(0);
    clock = new Date("2026-10-09T12:00:30Z");
    expect(await Promise.all([svc.sendDue(), svc.sendDue()]).then((x) => x.reduce((a, b) => a + b, 0))).toBe(1);               // two workers at once still send it once
    expect(mail.sent).toHaveLength(1); expect(mail.sent[0].html).toContain("Sarah Mitchell");
    expect((await db.query("SELECT sent_by_name, status FROM mail_outbound")).rows[0]).toMatchObject({ sent_by_name: "sam", status: "sent" });
    expect((await svc.listScheduled(SALES, "sales") as { ok: true; value: unknown[] }).value).toEqual([]); expect((await svc.unread(SALES))[0].scheduled).toBe(0);
    expect(await svc.sendDue()).toBe(0);
  });
  it("can be cancelled before it goes, but not after", async () => {
    const r = ok<{ id: string }>(await svc.schedule(SALES, "sam", plan()));
    expect(await svc.cancelScheduled(SUPPORT, r.id)).toMatchObject({ ok: false, status: 403 });
    expect(await svc.cancelScheduled(OLGA, r.id)).toMatchObject({ ok: true }); clock = new Date("2026-10-09T13:00:00Z"); expect(await svc.sendDue()).toBe(0); expect(mail.sent).toHaveLength(0);
    expect(await svc.cancelScheduled(SALES, r.id)).toMatchObject({ ok: false, status: 409 }); expect(await svc.cancelScheduled(SALES, id(404))).toMatchObject({ ok: false, status: 404 });
    const r2 = ok<{ id: string }>(await svc.schedule(SALES, "sam", plan({ sendAt: "2026-10-09T14:00:00Z" }))); clock = new Date("2026-10-09T14:01:00Z"); await svc.sendDue();
    expect(await svc.cancelScheduled(SALES, r2.id)).toMatchObject({ ok: false, status: 409 });
  });
  it("refuses a time that is not a time, is in the past, or is more than six days away, and checks the email like a normal send", async () => {
    for (const sendAt of [undefined, "soon", "2026-10-09T09:00:00Z", "2026-10-09T10:00:30Z", "2026-10-20T10:00:00Z"]) expect(await svc.schedule(SALES, "sam", plan({ sendAt })), String(sendAt)).toMatchObject({ ok: false, status: 400 });
    expect(await svc.schedule(SALES, "sam", plan({ to: "not-an-address" }))).toMatchObject({ ok: false, status: 400 });
    expect(await svc.schedule(SALES, "sam", plan({ subject: "" }))).toMatchObject({ ok: false, status: 400 });
    expect(await svc.schedule(SALES, "sam", plan({ body: "" }))).toMatchObject({ ok: false, status: 400 });
    expect(await svc.schedule(SALES, "sam", plan({ department: "support" }))).toMatchObject({ ok: false, status: 403 });
    expect((await db.query("SELECT COUNT(*) AS n FROM mail_scheduled")).rows[0].n).toBe(0 as never);
  });
  it("keeps the files attached, and a reply is marked answered when it goes", async () => {
    const f = await files.stage(SALES.userId, "quote.pdf", "application/pdf", Buffer.from("PDF")), m = await email();
    ok(await svc.schedule(SALES, "sam", { replyKind: "email", replyId: m, body: "", bodyHtml: "<p>Here is the <b>quote</b>.</p>", attachmentIds: [f.ok ? f.value.id : ""], sendAt: "2026-10-09T12:00:00Z" } as never));
    clock = new Date("2026-10-15T09:00:00Z");                                                                                 // days later: the upload would normally have expired
    await svc.sendDue();
    expect(mail.sent[0].attachments?.[0].filename).toBe("quote.pdf"); expect(mail.sent[0].subject).toBe("Re: Taxi rank levy"); expect(mail.sent[0].to).toBe("pam@example.com");
    const d = await svc.get(SALES, "email", m); expect(d.ok && d.value).toMatchObject({ status: "answered", replies: [{ by: "sam" }] });
  });
  it("is marked failed with the reason when it cannot be sent, and tried again later when the hourly limit is reached", async () => {
    const failing: EmailSender = { name: "x", send: async () => { throw new Error("down"); } };
    const s2 = createMailService({ db, mail: failing, now: () => clock, files });
    const r = ok<{ id: string }>(await s2.schedule(SALES, "sam", plan())); clock = new Date("2026-10-09T12:05:00Z"); expect(await s2.sendDue()).toBe(0);
    const l = await s2.listScheduled(SALES, "sales"); expect(l.ok && l.value[0]).toMatchObject({ id: r.id, status: "failed", error: expect.stringContaining("could not be sent") });
    expect(await s2.cancelScheduled(SALES, r.id)).toMatchObject({ ok: true });                                                  // a failed one can be cleared
    for (let i = 0; i < 40; i++) await db.query(`INSERT INTO mail_outbound (id, department, to_addr, subject, body, sent_by, sent_by_name, status, created_at) VALUES ($1,'sales','x@y.co','s','b',$2,'sam','sent',$3)`, [id(1000 + i), SALES.userId, clock]);
    clock = new Date("2026-10-09T12:10:00Z"); ok(await svc.schedule(SALES, "sam", plan({ sendAt: "2026-10-09T12:20:00Z" }))); clock = new Date("2026-10-09T12:21:00Z");
    expect(await svc.sendDue()).toBe(0); expect(mail.sent).toHaveLength(0);
    const again = await svc.listScheduled(SALES, "sales"); expect(again.ok && again.value[0]).toMatchObject({ status: "pending", sendAt: "2026-10-09T12:36:00.000Z" });
  });
  it("is picked up again if the server stopped while sending it", async () => {
    const r = ok<{ id: string }>(await svc.schedule(SALES, "sam", plan()));
    await db.query(`UPDATE mail_scheduled SET status = 'sending', claimed_at = $2 WHERE id = $1`, [r.id, new Date("2026-10-09T11:00:00Z")]);
    clock = new Date("2026-10-09T12:30:00Z"); expect(await svc.sendDue()).toBe(1); expect(mail.sent).toHaveLength(1);
  });
  it("is dropped (failed) if the person who wrote it no longer has an account", async () => {
    ok(await svc.schedule(OLGA, "olga", plan())); await db.query(`DELETE FROM users WHERE id = $1`, [OLGA.userId]); clock = new Date("2026-10-09T13:00:00Z");
    expect(await svc.sendDue()).toBe(0); const l = await svc.listScheduled(SALES, "sales"); expect(l.ok && l.value[0]).toMatchObject({ status: "failed", error: expect.stringContaining("no longer has an account") });
  });
  it("removes the draft it came from", async () => {
    const d = ok<{ id: string }>(await svc.saveDraft(SALES, { department: "sales", to: "pam@example.com", subject: "Our quote", body: "Prices." }));
    ok(await svc.schedule(SALES, "sam", plan({ draftId: d.id }))); expect(await svc.getDraft(SALES, d.id)).toMatchObject({ ok: false });
  });
});

describe("filters", () => {
  it("label, star, close or bin a new email when it matches, and leave the rest alone", async () => {
    const l = ok<{ id: string }>(await svc.createLabel(SALES, "sales", "Levy", "#0000FF"));
    await svc.saveFilter(SALES, { department: "sales", name: "Levy mail", subject: "levy", labelId: l.id, star: true });
    await svc.saveFilter(SALES, { department: "sales", name: "Newsletters", from: "news@example", folder: "trash", close: true });
    const a = await email({ subject: "Taxi rank LEVY" }), b = await email({ from: "News <news@example.com>", subject: "Weekly digest" }), c = await email({ subject: "Something else" });
    for (const x of [a, b, c]) await svc.fileNewEmail(x);
    expect((await flag("email", a)).starred).toBe(true); expect(await ids(SALES, { box: "inbox", label: l.id })).toEqual([a]);
    expect((await flag("email", b)).folder).toBe("trash"); expect((await flag("email", b)).reason).toBe("Filter: Newsletters");
    expect((await db.query("SELECT status FROM inbound_emails WHERE id = $1", [b])).rows[0].status).toBe("closed");
    expect(await flag("email", c)).toBeUndefined(); expect((await db.query("SELECT status FROM inbound_emails WHERE id = $1", [c])).rows[0].status).toBe("open");
  });
  it("match on the sender, the words in the message and an attachment, all together, and ignore the inactive", async () => {
    const l = ok<{ id: string }>(await svc.createLabel(SALES, "sales", "Invoices", "#000000"));
    await svc.saveFilter(SALES, { department: "sales", name: "Invoices", from: "lerato", words: "invoice", hasAttachment: true, labelId: l.id });
    const off = ok<{ id: string }>(await svc.saveFilter(SALES, { department: "sales", name: "Off", subject: "hello", star: true, active: false }));
    const a = await email({ from: "Lerato <lerato@corp.example>", subject: "Hi", text: "Please see the invoice" }); await db.query(`INSERT INTO mail_files (id, kind, email_id, filename, size, status) VALUES ($1,'inbound',$2,'inv.pdf',1,'stored')`, [id(700), a]);
    const noFile = await email({ from: "Lerato <lerato@corp.example>", subject: "Hi", text: "Please see the invoice" }), wrongWords = await email({ from: "Lerato <lerato@corp.example>", subject: "hello", text: "no" });
    for (const x of [a, noFile, wrongWords]) await svc.fileNewEmail(x);
    expect(await ids(SALES, { box: "inbox", label: l.id })).toEqual([a]); expect(await flag("email", wrongWords)).toBeUndefined();            // the inactive filter did nothing
    await svc.saveFilter(SALES, { id: off.id, department: "sales", name: "Off", subject: "hello", star: true, active: true });
    const again = await email({ subject: "hello again" }); await svc.fileNewEmail(again); expect((await flag("email", again)).starred).toBe(true);
  });
  it("are checked when made, belong to a department, and can be removed", async () => {
    expect(await svc.saveFilter(SALES, { department: "sales", name: "", subject: "x", star: true })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.saveFilter(SALES, { department: "sales", name: "N", star: true })).toMatchObject({ ok: false, status: 400 });                // nothing to look for
    expect(await svc.saveFilter(SALES, { department: "sales", name: "N", subject: "x" })).toMatchObject({ ok: false, status: 400 });             // nothing to do
    expect(await svc.saveFilter(SALES, { department: "support", name: "N", subject: "x", star: true })).toMatchObject({ ok: false, status: 403 });
    const other = ok<{ id: string }>(await svc.createLabel(SUPPORT, "support", "Refund", "#000000"));
    expect(await svc.saveFilter(SALES, { department: "sales", name: "N", subject: "x", labelId: other.id })).toMatchObject({ ok: false, status: 400 });
    const f = ok<{ id: string }>(await svc.saveFilter(SALES, { department: "sales", name: "N", subject: "x", folder: "spam" }));
    expect(await svc.deleteFilter(SUPPORT, f.id)).toMatchObject({ ok: false, status: 403 }); expect(await svc.deleteFilter(SALES, f.id)).toMatchObject({ ok: true }); expect(await svc.deleteFilter(SALES, f.id)).toMatchObject({ ok: false, status: 404 });
    const e = await email({ subject: "x marks" }); await svc.fileNewEmail(e); expect(await flag("email", e)).toBeUndefined();
  });
});

describe("out of office", () => {
  const set = (o: Record<string, unknown> = {}) => svc.saveAutoreply(SALES, { department: "sales", enabled: true, subject: "Out of office", body: "We are away until Monday.", ...o });
  it("answers a new email once, from the department's address, marked as automatic, and records it", async () => {
    await set();
    const a = await email(); await svc.fileNewEmail(a);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "pam@example.com", subject: "Out of office", from: "VINK Sales <sales@vink.co.za>", replyTo: "sales@vink.co.za", headers: { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" } });
    expect(mail.sent[0].text).toContain("We are away until Monday."); expect(mail.sent[0].html).toContain("We are away until Monday.");
    const row = (await db.query("SELECT * FROM mail_outbound")).rows[0]; expect(row).toMatchObject({ sent_by_name: "Out-of-office reply", status: "sent", department: "sales", reply_kind: "email" }); expect(row.sent_by).toBeNull();
    await svc.fileNewEmail(await email({ subject: "Another one" }));                                        // the same person again, soon after
    expect(mail.sent).toHaveLength(1);
    clock = new Date("2026-10-14T10:00:00Z"); await svc.fileNewEmail(await email({ subject: "Much later", at: clock.toISOString() }));
    expect(mail.sent).toHaveLength(2);                                                                       // five days on, they get it again
    await svc.fileNewEmail(await email({ from: "Someone Else <else@example.com>" })); expect(mail.sent).toHaveLength(3);
  });
  it("only works between its dates, and only when switched on", async () => {
    await set({ startOn: "2026-10-12", endOn: "2026-10-16" });
    await svc.fileNewEmail(await email()); expect(mail.sent).toHaveLength(0);                               // before the start
    clock = new Date("2026-10-13T10:00:00Z"); await svc.fileNewEmail(await email({ from: "a@example.com" })); expect(mail.sent).toHaveLength(1);
    clock = new Date("2026-10-16T21:30:00Z"); await svc.fileNewEmail(await email({ from: "b@example.com" })); expect(mail.sent).toHaveLength(2);     // 23:30 in South Africa: still the last day
    clock = new Date("2026-10-17T10:00:00Z"); await svc.fileNewEmail(await email({ from: "c@example.com" })); expect(mail.sent).toHaveLength(2);     // after the end
    await set({ enabled: false }); clock = new Date("2026-10-13T10:00:00Z"); await svc.fileNewEmail(await email({ from: "d@example.com" })); expect(mail.sent).toHaveLength(2);
  });
  it("never answers robots, mailing lists, VINK's own addresses or automatic messages, and never mail in Spam", async () => {
    await set();
    for (const from of ["no-reply@shop.example", "Mailer <MAILER-DAEMON@mail.example>", "noreply@bank.example", "newsletter@promo.example", "bounces@x.example", "colleague@vink.co.za", "x@mail.vink.co.za"]) await svc.fileNewEmail(await email({ from }));
    for (const subject of ["Automatic reply: away", "Out of office: Bob", "Undeliverable: your message", "Delivery Status Notification (Failure)"]) await svc.fileNewEmail(await email({ from: `x${subject.length}@example.com`, subject }));
    await svc.fileNewEmail(await email({ from: "Lottery <x84736251@mail.example>", subject: "YOU HAVE WON!!!", text: "Claim your prize now: https://bit.ly/abc123" }));
    expect(mail.sent).toHaveLength(0);
    await svc.fileNewEmail(await email({ from: "Pam <pam@example.com>" })); expect(mail.sent).toHaveLength(1);
  });
  it("is kept per department, checked when saved, and a failure to send is recorded but never breaks the email arriving", async () => {
    expect(await svc.saveAutoreply(SALES, { department: "support", enabled: true, body: "x y" })).toMatchObject({ ok: false, status: 403 });
    expect(await set({ body: "" })).toMatchObject({ ok: false, status: 400 }); expect(await set({ startOn: "soon" })).toMatchObject({ ok: false, status: 400 }); expect(await set({ startOn: "2026-10-16", endOn: "2026-10-12" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.saveAutoreply(SALES, { department: "sales", enabled: false, body: "" })).toMatchObject({ ok: true, value: { enabled: false } });
    expect(await svc.getAutoreply(SUPPORT, "sales")).toMatchObject({ ok: false, status: 403 }); expect(await svc.getAutoreply(SUPPORT, "support")).toMatchObject({ ok: true, value: { enabled: false, subject: "Out of office" } });
    const s2 = createMailService({ db, mail: { name: "x", send: async () => { throw new Error("down"); } }, now: () => clock, files });
    await set(); await s2.fileNewEmail(await email());
    expect((await db.query("SELECT status, error FROM mail_outbound")).rows[0]).toMatchObject({ status: "failed" });
    const got = await svc.getAutoreply(SALES, "sales"); expect(got.ok && got.value).toMatchObject({ enabled: true, body: "We are away until Monday.", startOn: null, endOn: null });
  });
});

describe("automatic spam detection", () => {
  it("puts obvious spam in Spam with the reasons, and leaves ordinary mail in the inbox", async () => {
    const spam = await email({ from: "Lottery Desk <x84736251@mail.example>", subject: "YOU HAVE WON!!!", text: "Claim your prize now: https://bit.ly/abc123" }), fine = await email();
    await svc.fileNewEmail(spam); await svc.fileNewEmail(fine);
    expect(await ids(SALES, { box: "inbox" })).toEqual([fine]); expect(await ids(SALES, { box: "spam" })).toEqual([spam]);
    const d = await svc.get(SALES, "email", spam); expect(d.ok && d.value.spamReason).toContain("prize, casino, medicine or investment scams"); expect(d.ok && d.value.folder).toBe("spam");
    const l = await svc.list(SALES, { box: "spam" }); expect(l.ok && l.value[0].spamReason).toContain("link shortener");
    expect((await svc.unread(SALES))[0].open).toBe(1);
  });
  it("catches someone pretending to be VINK, and 'Not spam' puts it back and clears the reason", async () => {
    const m = await email({ from: "VINK Security <alerts@gmail.com>", subject: "Notice", text: "Hello" }); await svc.fileNewEmail(m);
    expect(await ids(SALES, { box: "spam" })).toEqual([m]);
    await svc.setFolder(SALES, "email", m, "inbox");
    const d = await svc.get(SALES, "email", m); expect(d.ok && d.value).toMatchObject({ folder: "inbox", spamReason: null }); expect(await ids(SALES, { box: "inbox" })).toEqual([m]);
  });
  it("shows a person's own report as the reason when they move a message to Spam, and a blocked sender as blocked", async () => {
    const a = await email({ from: "Bob <bob@spam.example>", subject: "Hello" }); await svc.setFolder(SALES, "email", a, "spam", true);
    const d = await svc.get(SALES, "email", a); expect(d.ok && d.value.spamReason).toBe("Reported as spam");
    const later = await email({ from: "Bob <bob@spam.example>", subject: "More" }); await svc.fileNewEmail(later);
    const l = await svc.get(SALES, "email", later); expect(l.ok && l.value).toMatchObject({ folder: "spam", spamReason: "The sender is blocked" });
  });
  it("ignores mail with no department", async () => {
    const stray = String((await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body) VALUES ('x','a <a@x.example>',$1,'YOU HAVE WON!!!','prize', ) RETURNING id`.replace(", )", ")").replace("'prize'", "'prize'"), [["nobody@vink.co.za"]])).rows[0].id);
    await svc.fileNewEmail(stray); expect(await flag("email", stray)).toBeUndefined();
  });
});

describe("over HTTP", () => {
  let server: Server, url: string;
  beforeEach(async () => {
    const app = express(); app.use((req, _r, next) => { req.user = { ...SALES, username: "sam" } as never; next(); });
    app.use("/api/mail", createMailRouter({ db, svc }));
    await new Promise<void>((okk) => { server = app.listen(0, "127.0.0.1", okk); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mail`;
  });
  afterEach(() => new Promise<void>((okk) => server.close(() => okk())));
  const call = (method: string, path: string, body?: unknown) => fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  it("serves the signature, templates, labels, filters, out of office, snooze, schedule and rich text", async () => {
    expect((await (await call("PUT", "/signature", { department: "sales", name: "Sarah Mitchell", title: "Sales Executive" })).json() as { signature: { html: string } }).signature.html).toContain("Sales Executive");
    expect((await (await call("GET", "/signature?department=sales")).json() as { signature: { custom: boolean } }).signature.custom).toBe(true);
    expect((await call("PUT", "/signature", { department: "sales", name: "" })).status).toBe(400); expect((await call("GET", "/signature?department=support")).status).toBe(403);
    expect((await (await call("POST", "/signature/preview", { department: "sales", name: "Live Preview" })).json() as { html: string }).html).toContain("Live Preview");
    const t = await call("POST", "/templates", { department: "sales", name: "Thanks", bodyHtml: "<p>Thank you</p>" }); expect(t.status).toBe(201);
    const tid = (await t.json() as { template: { id: string } }).template.id;
    expect((await (await call("GET", "/templates?department=sales")).json() as { templates: unknown[] }).templates).toHaveLength(1);
    expect((await call("DELETE", `/templates/${tid}`)).status).toBe(200); expect((await call("DELETE", "/templates/nope")).status).toBe(400);
    const l = await call("POST", "/labels", { department: "sales", name: "Urgent", color: "#DC2626" }); expect(l.status).toBe(201);
    const lid = (await l.json() as { label: { id: string } }).label.id;
    const m = await email();
    expect((await (await call("POST", `/messages/email/${m}/labels`, { labelId: lid, on: true })).json() as { labels: unknown[] }).labels).toHaveLength(1);
    expect((await (await call("GET", `/messages?department=sales&box=inbox&label=${lid}`)).json() as { messages: { labels: unknown[] }[] }).messages[0].labels).toHaveLength(1);
    const f = await call("POST", "/filters", { department: "sales", name: "Urgent", subject: "urgent", labelId: lid, star: true }); expect(f.status).toBe(201);
    const fid = (await f.json() as { id: string }).id;
    expect((await (await call("GET", "/filters?department=sales")).json() as { filters: unknown[] }).filters).toHaveLength(1); expect((await call("DELETE", `/filters/${fid}`)).status).toBe(200);
    expect((await call("DELETE", `/labels/${lid}`)).status).toBe(200);
    expect((await call("PUT", "/autoreply", { department: "sales", enabled: true, body: "Away until Monday." })).status).toBe(200);
    expect((await (await call("GET", "/autoreply?department=sales")).json() as { autoreply: { enabled: boolean } }).autoreply.enabled).toBe(true);
    expect((await call("POST", `/messages/email/${m}/snooze`, { until: "2026-10-12T08:00:00Z" })).status).toBe(200); expect((await call("POST", `/messages/email/${m}/snooze`, { until: "2020-01-01T00:00:00Z" })).status).toBe(400);
    expect((await (await call("GET", "/messages?department=sales&box=snoozed")).json() as { messages: unknown[] }).messages).toHaveLength(1);
    const s = await call("POST", "/schedule", { department: "sales", to: "pam@example.com", subject: "Later", body: "Hello there", sendAt: "2026-10-09T12:00:00Z" }); expect(s.status).toBe(201);
    const sid = (await s.json() as { id: string }).id;
    expect((await (await call("GET", "/scheduled?department=sales")).json() as { scheduled: unknown[] }).scheduled).toHaveLength(1);
    expect((await call("POST", "/schedule", { department: "sales", to: "pam@example.com", subject: "Later", body: "Hello there", sendAt: "nope" })).status).toBe(400);
    expect((await call("DELETE", `/scheduled/${sid}`)).status).toBe(200); expect((await call("DELETE", "/scheduled/nope")).status).toBe(400);
    expect((await call("POST", "/send", { department: "sales", to: "pam@example.com", subject: "Rich", body: "", bodyHtml: "<p>Hello <b>you</b></p><script>x</script>" })).status).toBe(201);
    expect(mail.sent.at(-1)!.html).toContain("<b>you</b>"); expect(mail.sent.at(-1)!.html).not.toContain("<script");
    const mm = await email(); expect((await call("POST", `/messages/email/${mm}/reply`, { body: "", bodyHtml: "<p>Reply <i>text</i></p>" })).status).toBe(201); expect(mail.sent.at(-1)!.html).toContain("<i>text</i>");
  });
});
