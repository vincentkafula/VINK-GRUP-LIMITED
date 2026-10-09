import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail } from "../auth/email.js";
import { createMailService, type MailService } from "../services/mailService.js";
import { createMailFiles, safeFilename, isRiskyFile, MAX_FILE_BYTES, type MailFiles } from "../services/mailFiles.js";
import { createMailRouter, createShareRouter } from "./mailRouter.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const SALES = { userId: id(3), role: "customer" }, OTHER_SALES = { userId: id(6), role: "customer" }, SUPPORT = { userId: id(4), role: "customer" }, ROOT = { userId: id(1), role: "superadmin" };
let db: Db, mail: ConsoleEmail, files: MailFiles, svc: MailService, clock: Date, fetchLog: string[], failDownloads: boolean;
const NOW0 = "2026-10-09T10:00:00Z";

/** What Resend would answer: the list of an email's attachments, and the files themselves. */
const resendFetch = (async (url: string) => {
  fetchLog.push(String(url));
  if (/\/attachments$/.test(url)) return new Response(JSON.stringify({ object: "list", data: [
    { id: "att_1", filename: "../../Quote 2026.pdf", content_type: "application/pdf", size: 11, download_url: "https://files.test/att_1" },
    { id: "att_2", filename: "photo.png", content_type: "image/png", size: 4, download_url: "https://files.test/att_2" },
  ] }), { status: 200 });
  if (failDownloads) return new Response("nope", { status: 500 });
  return new Response(url.endsWith("att_1") ? "hello world" : "PNG!", { status: 200 });
}) as unknown as typeof fetch;

const addInbound = async (dept: string | null = "sales") => {
  const r = await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, department, received_at) VALUES ('em_1','Pam <pam@example.com>',$1,'Quote','see attached',$2,$3) RETURNING id`, [[`${dept ?? "x"}@vink.co.za`], dept, clock.toISOString()]);
  return String(r.rows[0].id);
};

beforeEach(async () => {
  db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date(NOW0); fetchLog = []; failDownloads = false;
  for (const [u, name] of [[ROOT, "root"], [SALES, "sam"], [OTHER_SALES, "olga"], [SUPPORT, "sue"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u.userId, name, `${name}@vink.co.za`, u.role]);
  await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,'Sales'), ($2,'Sales'), ($3,'Customer Support')`, [SALES.userId, OTHER_SALES.userId, SUPPORT.userId]);
  files = createMailFiles({ db, apiKey: "re_test", fetchImpl: resendFetch, now: () => clock });
  svc = createMailService({ db, mail, now: () => clock, files, publicApiUrl: "https://api.example.test", attachLimitBytes: 1000 });
});

describe("attachments on incoming email", () => {
  it("records each attachment with a safe name, fetches the files, and shows them on the message", async () => {
    const emailId = await addInbound();
    expect(await files.recordInbound(emailId, "em_1", "sales")).toBe(2);
    await files.idle();
    const m = await svc.get(SALES, "email", emailId);
    expect(m.ok && m.value.attachments.map((a) => `${a.filename}|${a.contentType}|${a.size}|${a.status}`)).toEqual(["Quote 2026.pdf|application/pdf|11|stored", "photo.png|image/png|4|stored"]);
    const pdf = m.ok ? m.value.attachments[0] : null;
    const opened = await svc.openFile(SALES, pdf!.id);
    expect(opened.ok && opened.value.data.toString()).toBe("hello world");
    expect(opened.ok && opened.value.filename).toBe("Quote 2026.pdf");                                    // the "../../" was dropped
  });

  it("only lets someone who manages that department open the file", async () => {
    const emailId = await addInbound(); await files.recordInbound(emailId, "em_1", "sales"); await files.idle();
    const f = (await svc.get(SALES, "email", emailId)) as { ok: true; value: { attachments: { id: string }[] } };
    expect(await svc.openFile(OTHER_SALES, f.value.attachments[0].id)).toMatchObject({ ok: true });
    expect(await svc.openFile(SUPPORT, f.value.attachments[0].id)).toMatchObject({ ok: false, status: 403 });
    expect(await svc.openFile(ROOT, f.value.attachments[0].id)).toMatchObject({ ok: true });
    expect(await svc.openFile(SALES, "not-an-id")).toMatchObject({ ok: false, status: 400 });
    expect(await svc.openFile(SALES, id(99))).toMatchObject({ ok: false, status: 404 });
    // mail that was addressed to no department is for owners and superadmins only
    const stray = await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, department) VALUES ('em_2','x <x@example.com>',$1,'?','', NULL) RETURNING id`, [["nobody@vink.co.za"]]);
    await files.recordInbound(String(stray.rows[0].id), "em_2", null); await files.idle();
    const sf = (await svc.get(ROOT, "email", String(stray.rows[0].id))) as { ok: true; value: { attachments: { id: string }[] } };
    expect(await svc.openFile(SALES, sf.value.attachments[0].id)).toMatchObject({ ok: false, status: 403 });
    expect(await svc.openFile(ROOT, sf.value.attachments[0].id)).toMatchObject({ ok: true });
  });

  it("fetches a file again, with a fresh link, when the first attempt failed", async () => {
    failDownloads = true;
    const emailId = await addInbound(); await files.recordInbound(emailId, "em_1", "sales"); await files.idle();
    const before = (await svc.get(SALES, "email", emailId)) as { ok: true; value: { attachments: { id: string; status: string }[] } };
    expect(before.value.attachments.map((a) => a.status)).toEqual(["pending", "pending"]);
    expect(await svc.openFile(SALES, before.value.attachments[0].id)).toMatchObject({ ok: false, status: 502 });
    failDownloads = false;
    const again = await svc.openFile(SALES, before.value.attachments[0].id);
    expect(again.ok && again.value.data.toString()).toBe("hello world");
    const after = (await svc.get(SALES, "email", emailId)) as { ok: true; value: { attachments: { status: string }[] } };
    expect(after.value.attachments.map((a) => a.status)).toEqual(["stored", "pending"]);
  });

  it("records a file that is too large without fetching it, and says so when it is opened", async () => {
    const big = (async (url: string) => /\/attachments$/.test(url) ? new Response(JSON.stringify({ data: [{ id: "a", filename: "film.mp4", content_type: "video/mp4", size: 80 * 1024 * 1024, download_url: "https://files.test/a" }] })) : new Response("x")) as unknown as typeof fetch;
    const f2 = createMailFiles({ db, apiKey: "re_test", fetchImpl: big, now: () => clock });
    const emailId = await addInbound(); await f2.recordInbound(emailId, "em_1", "sales"); await f2.idle();
    const row = (await f2.forEmail("inbound", emailId))[0];
    expect(row).toMatchObject({ filename: "film.mp4", status: "toolarge" });
    expect(await f2.read(row.id)).toMatchObject({ ok: false, status: 413 });
  });

  it("copes with no attachments, no API key, and a list it cannot read", async () => {
    const emailId = await addInbound();
    expect(await createMailFiles({ db, fetchImpl: resendFetch }).recordInbound(emailId, "em_1", "sales")).toBe(0);                              // no API key
    const broken = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await createMailFiles({ db, apiKey: "k", fetchImpl: broken }).recordInbound(emailId, "em_1", "sales")).toBe(0);
    const empty = (async () => new Response(JSON.stringify({ data: [] }))) as unknown as typeof fetch;
    expect(await createMailFiles({ db, apiKey: "k", fetchImpl: empty }).recordInbound(emailId, "em_1", "sales")).toBe(0);
  });
});

describe("sending files from the panel", () => {
  const stage = async (u: typeof SALES, name: string, bytes: number | Buffer = 5, type = "application/pdf") => { const r = await files.stage(u.userId, name, type, typeof bytes === "number" ? Buffer.alloc(bytes, 1) : bytes); if (!r.ok) throw new Error(r.error); return r.value; };

  it("attaches files to the email, records them against it, and lets them be downloaded from the Sent box", async () => {
    const a = await stage(SALES, "Price list.pdf", Buffer.from("PDFDATA")), b = await stage(SALES, "terms.docx", 3, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const r = await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Our prices", body: "Please find attached.", attachmentIds: [a.id, b.id] });
    expect(r.ok).toBe(true);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].attachments?.map((x) => `${x.filename}|${x.contentType}|${x.content.length}`)).toEqual(["Price list.pdf|application/pdf|7", "terms.docx|application/vnd.openxmlformats-officedocument.wordprocessingml.document|3"]);
    expect(mail.sent[0].text).not.toContain("api/shared-files");
    const sentId = (r as { ok: true; value: { id: string } }).value.id;
    expect((await files.forEmail("outbound", sentId)).map((f) => f.filename)).toEqual(["Price list.pdf", "terms.docx"]);
    const down = await svc.openFile(OTHER_SALES, a.id);                                                       // a colleague in the same department can open it
    expect(down.ok && down.value.data.toString()).toBe("PDFDATA");
    expect(await svc.openFile(SUPPORT, a.id)).toMatchObject({ ok: false, status: 403 });
    expect(await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Again", body: "Again.", attachmentIds: [a.id] })).toMatchObject({ ok: false, status: 400 });   // already sent: add it again
  });

  it("attaches files to a reply, and the reply shows them", async () => {
    const emailId = await addInbound();
    const a = await stage(SALES, "answer.pdf");
    expect((await svc.reply(SALES, "sam", "email", emailId, "Here you go.", [a.id])).ok).toBe(true);
    expect(mail.sent[0].attachments?.[0].filename).toBe("answer.pdf");
    const m = await svc.get(SALES, "email", emailId);
    expect(m.ok && m.value.replies[0].attachments.map((x) => x.filename)).toEqual(["answer.pdf"]);
  });

  it("will not use someone else's upload, a made-up id, too many files, or files that are too big together", async () => {
    const mine = await stage(SALES, "mine.pdf"), theirs = await stage(OTHER_SALES, "theirs.pdf");
    const send = (ids: unknown, u = SALES) => svc.send(u, "x", { department: "sales", to: "pam@example.com", subject: "Hi there", body: "Hello.", attachmentIds: ids });
    expect(await send([theirs.id])).toMatchObject({ ok: false, status: 400 });
    expect(await send([id(77)])).toMatchObject({ ok: false, status: 400 });
    expect(await send("nope")).toMatchObject({ ok: false, status: 400 });
    expect(await send([{}])).toMatchObject({ ok: false, status: 400 });
    expect(await send(["x"])).toMatchObject({ ok: false, status: 400 });
    const six: string[] = []; for (let i = 0; i < 6; i++) six.push((await stage(SALES, `f${i}.txt`, 2)).id);
    expect(await send(six)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("at most 5") });
    expect(mail.sent).toHaveLength(0);
    expect((await send([mine.id])).ok).toBe(true);                                                              // and the plain case still works
  });

  it("sends files that are too big to attach as expiring links, and the links work for a week", async () => {
    const big = await stage(SALES, "Annual report.pdf", 1500);
    const r = await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Report", body: "The report.", attachmentIds: [big.id] });
    expect(r.ok).toBe(true);
    expect(mail.sent[0].attachments).toBeUndefined();
    const url = /https:\/\/api\.example\.test\/api\/shared-files\/([\w-]+)/.exec(mail.sent[0].text)!;
    expect(mail.sent[0].text).toContain("Annual report.pdf"); expect(mail.sent[0].text).toContain("2026-10-16");
    expect(mail.sent[0].html).toContain(`href="${url[0]}"`);
    const ok = await files.byShareToken(url[1]);
    expect(ok.ok && ok.value.data.length).toBe(1500);
    clock = new Date("2026-10-17T10:00:00Z");
    expect(await files.byShareToken(url[1])).toMatchObject({ ok: false, status: 410 });
    expect(await files.byShareToken("short")).toMatchObject({ ok: false, status: 404 });
    expect(await files.byShareToken("A".repeat(32))).toMatchObject({ ok: false, status: 404 });
  });

  it("keeps the files for another try when the email could not be sent", async () => {
    const a = await stage(SALES, "keep.pdf");
    const failing = createMailService({ db, mail: { name: "x", send: async () => { throw new Error("down"); } }, now: () => clock, files });
    expect(await failing.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Hello there", body: "Hi.", attachmentIds: [a.id] })).toMatchObject({ ok: false, status: 502 });
    expect((await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Hello there", body: "Hi.", attachmentIds: [a.id] })).ok).toBe(true);
  });

  it("refuses empty and oversized files, throws unsent ones away after a day, and lets a person remove their own", async () => {
    expect(await files.stage(SALES.userId, "a.txt", "text/plain", Buffer.alloc(0))).toMatchObject({ ok: false, status: 400 });
    expect(await files.stage(SALES.userId, "a.bin", "x", Buffer.alloc(MAX_FILE_BYTES + 1))).toMatchObject({ ok: false, status: 413 });
    const a = await stage(SALES, "old.pdf");
    expect(await files.discard(OTHER_SALES.userId, a.id)).toBe(false);
    expect(await files.discard(SALES.userId, a.id)).toBe(true);
    const b = await stage(SALES, "older.pdf");
    clock = new Date("2026-10-11T10:00:00Z");
    await stage(SALES, "new.pdf");
    expect(Number((await db.query(`SELECT COUNT(*) AS n FROM mail_files WHERE id = $1`, [b.id])).rows[0].n)).toBe(0);
  });
});

describe("file names and risky types", () => {
  it("keeps a file name safe to put in a header and an email", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Users\\me\\Report.pdf")).toBe("Report.pdf");
    expect(safeFilename('a"b<c>d|e.txt')).toBe("abcde.txt");
    expect(safeFilename("bad\r\nname.txt")).toBe("badname.txt");
    expect(safeFilename("...hidden")).toBe("hidden");
    expect(safeFilename("")).toBe("file"); expect(safeFilename(undefined)).toBe("file");
    expect(safeFilename("x".repeat(500)).length).toBe(150);
  });
  it("flags the file types that run on a computer", () => {
    for (const n of ["setup.exe", "run.BAT", "a.js", "x.vbs", "tool.ps1", "pkg.msi", "app.jar", "disk.iso", "doc.pdf.exe"]) expect(isRiskyFile(n), n).toBe(true);
    for (const n of ["report.pdf", "photo.png", "sheet.xlsx", "notes.txt", "deck.pptx", "exe"]) expect(isRiskyFile(n), n).toBe(false);
  });
});

describe("downloading over HTTP", () => {
  let server: Server, url: string;
  beforeEach(async () => {
    const app = express(); app.use((req, _r, next) => { req.user = { ...SALES, username: "sam" } as never; next(); });
    app.use("/api/mail", createMailRouter({ db, svc })); app.use("/api/shared-files", createShareRouter(files));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

  it("uploads a file as raw bytes (even one that looks like JSON), then sends it", async () => {
    const up = await fetch(`${url}/api/mail/uploads?name=${encodeURIComponent("data.json")}&type=application%2Fjson`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: Buffer.from('{"a":1}') });
    expect(up.status).toBe(201);
    const { file } = await up.json() as { file: { id: string; filename: string; size: number; risky: boolean } };
    expect(file).toMatchObject({ filename: "data.json", size: 7, risky: false });
    const sent = await fetch(`${url}/api/mail/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department: "sales", to: "pam@example.com", subject: "The data", body: "Attached.", attachmentIds: [file.id] }) });
    expect(sent.status).toBe(201);
    expect(mail.sent[0].attachments?.[0]).toMatchObject({ filename: "data.json", contentType: "application/json" });
  });

  it("serves a file only as a download, never as a page", async () => {
    const stray = await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, department) VALUES ('em_9','a <a@example.com>',$1,'x','', 'sales') RETURNING id`, [["sales@vink.co.za"]]);
    const f = createMailFiles({ db });
    const fid = id(500);
    await db.query(`INSERT INTO mail_files (id, kind, email_id, filename, content_type, size, data, status) VALUES ($1,'inbound',$2,$3,'text/html',14,$4,'stored')`, [fid, stray.rows[0].id, 'evil"\r\n.html', Buffer.from("<script>1</script>")]);
    void f;
    const res = await fetch(`${url}/api/mail/files/${fid}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="evil_*\.html"; filename\*=UTF-8''/);
    expect(res.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).toBe("<script>1</script>");
    expect((await fetch(`${url}/api/mail/files/${id(501)}`)).status).toBe(404);
    expect((await fetch(`${url}/api/mail/files/nope`)).status).toBe(400);
  });

  it("serves a shared link without signing in, and refuses a wrong or expired one", async () => {
    const a = await files.stage(SALES.userId, "Big.pdf", "application/pdf", Buffer.alloc(1200, 7));
    await svc.send(SALES, "sam", { department: "sales", to: "pam@example.com", subject: "Big file", body: "Here.", attachmentIds: [a.ok ? a.value.id : ""] });
    const token = /shared-files\/([\w-]+)/.exec(mail.sent[0].text)![1];
    const ok = await fetch(`${url}/api/shared-files/${token}`);
    expect(ok.status).toBe(200); expect(ok.headers.get("content-disposition")).toContain('attachment; filename="Big.pdf"');
    expect((await fetch(`${url}/api/shared-files/${"B".repeat(32)}`)).status).toBe(404);
    clock = new Date("2026-10-30T00:00:00Z");
    expect((await fetch(`${url}/api/shared-files/${token}`)).status).toBe(410);
  });
});
