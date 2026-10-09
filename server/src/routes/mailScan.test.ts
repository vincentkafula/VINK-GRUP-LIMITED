import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail } from "../auth/email.js";
import { createMailService } from "../services/mailService.js";
import { createMailFiles } from "../services/mailFiles.js";
import { EICAR, type FileScanner, type ScanResult } from "../services/fileScan.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const SALES = { userId: id(3), role: "customer" }, ROOT = { userId: id(1), role: "superadmin" };
let db: Db, mail: ConsoleEmail, clock: Date, failDownloads: boolean;

const resendFetch = (async (url: string) => {
  if (/\/attachments$/.test(url)) return new Response(JSON.stringify({ data: [
    { id: "att_1", filename: "Quote 2026.pdf", content_type: "application/pdf", size: 11, download_url: "https://files.test/att_1", content_id: "<logo@mail>" },
    { id: "att_2", filename: "photo.png", content_type: "image/png", size: 4, download_url: "https://files.test/att_2" },
  ] }), { status: 200 });
  if (failDownloads) return new Response("nope", { status: 500 });
  return new Response(url.endsWith("att_1") ? "hello world" : "PNG!", { status: 200 });
}) as unknown as typeof fetch;

const addInbound = async () => String((await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, department) VALUES ('em_1','Pam <pam@example.com>',$1,'Quote','see attached','sales') RETURNING id`, [["sales@vink.co.za"]])).rows[0].id);
const say = (r: ScanResult & { engineFailed?: boolean }): FileScanner => ({ engines: ["Test"], scan: async () => r });
const make = (scanner?: FileScanner) => { const files = createMailFiles({ db, apiKey: "re_test", fetchImpl: resendFetch, now: () => clock, scanner }); return { files, svc: createMailService({ db, mail, now: () => clock, files, attachLimitBytes: 1000 }) }; };

beforeEach(async () => {
  db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date("2026-10-09T10:00:00Z"); failDownloads = false;
  for (const [u, name] of [[ROOT, "root"], [SALES, "sam"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u.userId, name, `${name}@vink.co.za`, u.role]);
  await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,'Sales')`, [SALES.userId]);
});

describe("virus checking", () => {
  it("refuses to take a file the built-in checks call a virus, and a program dressed up as a document", async () => {
    const { files } = make();
    expect(await files.stage(SALES.userId, "test.txt", "text/plain", Buffer.from(EICAR))).toMatchObject({ ok: false, status: 422, error: expect.stringContaining("EICAR") });
    expect(await files.stage(SALES.userId, "Invoice.pdf", "application/pdf", Buffer.from([0x4d, 0x5a, 0x90, 0]))).toMatchObject({ ok: false, status: 422, error: expect.stringContaining("is a Windows program") });
    expect(Number((await db.query("SELECT COUNT(*) AS n FROM mail_files")).rows[0].n)).toBe(0);
  });

  it("records what the antivirus said about an upload, and refuses a virus by name", async () => {
    expect(await make(say({ status: "clean", detail: "No virus found", engine: "ClamAV" })).files.stage(SALES.userId, "ok.pdf", "application/pdf", Buffer.from("fine"))).toMatchObject({ ok: true, value: { scan: "clean", scanDetail: "No virus found" } });
    expect(await make(say({ status: "infected", detail: "Bad.Thing", engine: "ClamAV" })).files.stage(SALES.userId, "bad.pdf", "application/pdf", Buffer.from("x"))).toMatchObject({ ok: false, status: 422, error: expect.stringContaining("Bad.Thing") });
  });

  it("lets through a file that an outside engine only finds suspicious, but flags it", async () => {
    expect(await make(say({ status: "suspicious", detail: "2 engines think it is suspicious", engine: "VirusTotal" })).files.stage(SALES.userId, "odd.docx", "x/y", Buffer.from("x"))).toMatchObject({ ok: true, value: { scan: "suspicious" } });
  });

  it("will not take files while a switched-on antivirus cannot be reached", async () => {
    expect(await make(say({ status: "unscanned", detail: "The antivirus could not be reached", engine: "ClamAV", engineFailed: true })).files.stage(SALES.userId, "a.pdf", "application/pdf", Buffer.from("x"))).toMatchObject({ ok: false, status: 503 });
  });

  it("scans the attachments of incoming email, blocks an infected one for everyone, and keeps the clean ones", async () => {
    const scan: FileScanner = { engines: ["Test"], scan: async (_d, name) => (/photo/.test(name) ? { status: "infected", detail: "Trojan.Test", engine: "Test" } : { status: "clean", detail: "No virus found", engine: "Test" }) };
    const { files, svc } = make(scan);
    const emailId = await addInbound(); await files.recordInbound(emailId, "em_1", "sales"); await files.idle();
    const m = (await svc.get(SALES, "email", emailId)) as { ok: true; value: { attachments: { id: string; filename: string; scan: string }[] } };
    expect(m.value.attachments.map((a) => `${a.filename}:${a.scan}`)).toEqual(["Quote 2026.pdf:clean", "photo.png:infected"]);
    expect(await svc.openFile(SALES, m.value.attachments[0].id)).toMatchObject({ ok: true });
    expect(await svc.openFile(SALES, m.value.attachments[1].id)).toMatchObject({ ok: false, status: 422, error: expect.stringContaining("Trojan.Test") });
    expect(await svc.openFile(ROOT, m.value.attachments[1].id)).toMatchObject({ ok: false, status: 422 });                               // not even a superadmin
  });

  it("scans a file that could not be fetched at first when it is fetched on opening, and blocks it if it is infected", async () => {
    failDownloads = true;
    const { files, svc } = make({ engines: ["Test"], scan: async () => ({ status: "infected", detail: "Late.Find", engine: "Test" }) });
    const emailId = await addInbound(); await files.recordInbound(emailId, "em_1", "sales"); await files.idle();
    const m = (await svc.get(SALES, "email", emailId)) as { ok: true; value: { attachments: { id: string; scan: string }[] } };
    expect(m.value.attachments[0].scan).toBe("unscanned");                                                                              // not fetched yet, so not scanned yet
    failDownloads = false;
    expect(await svc.openFile(SALES, m.value.attachments[0].id)).toMatchObject({ ok: false, status: 422, error: expect.stringContaining("Late.Find") });
  });

  it("remembers the Content-ID an email uses to show a file inside its text", async () => {
    const { files } = make();
    const emailId = await addInbound(); await files.recordInbound(emailId, "em_1", "sales"); await files.idle();
    expect((await files.forEmail("inbound", emailId)).map((f) => f.contentId)).toEqual(["logo@mail", null]);                             // the angle brackets are dropped
  });
});

describe("the HTML of an incoming email", () => {
  it("is passed on as untrusted HTML next to the plain text, capped in size, and only for email", async () => {
    const { svc } = make();
    const r = await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, html_body, department) VALUES ('em_h','a <a@example.com>',$1,'Hi','plain',$2,'sales') RETURNING id`, [["sales@vink.co.za"], `<p>Hello</p><img src="cid:logo">` + "x".repeat(400_000)]);
    const m = await svc.get(SALES, "email", String(r.rows[0].id));
    expect(m.ok && m.value.text).toBe("plain"); expect(m.ok && m.value.html?.startsWith("<p>Hello</p>")).toBe(true); expect(m.ok && m.value.html?.length).toBe(300_000);
    const none = await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, department) VALUES ('em_t','a <a@example.com>',$1,'Hi','plain','sales') RETURNING id`, [["sales@vink.co.za"]]);
    const n = await svc.get(SALES, "email", String(none.rows[0].id));
    expect(n.ok && n.value.html).toBeNull();
  });
});
