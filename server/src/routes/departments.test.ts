import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail } from "../auth/email.js";
import { createMailService } from "../services/mailService.js";
import { createContactService } from "../services/contactService.js";
import { createContactRouter } from "./contactRouter.js";
import { createDepartmentsRouter, loadCustomDepartments } from "./departmentsRouter.js";
import { SECTIONS, MODULE_SECTIONS } from "./rbac.js";
import { DEPARTMENTS, allDepartments, publicDepartments, departmentByKey, departmentOfAddresses, setCustomDepartments, checkNewDepartment, notifyTargets, MAIL_DOMAIN } from "../config/departments.js";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ROOT = { userId: id(1), role: "superadmin" }, MANAGER = { userId: id(3), role: "customer" }, STRANGER = { userId: id(5), role: "customer" };
let db: Db, server: Server, url: string, as: { userId: string; role: string; username: string };

beforeEach(async () => {
  setCustomDepartments([]);
  db = allPortalsDb(); as = { ...ROOT, username: "root" };
  for (const [u, name] of [[ROOT, "root"], [MANAGER, "mandy"], [STRANGER, "sid"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$2,$3,$4)`, [u.userId, name, `${name}@vink.co.za`, u.role]);
  const app = express();
  app.use((req, _r, next) => { req.user = as as never; next(); });
  app.use("/api/admin/departments", (req, res, next) => (["owner", "superadmin"].includes((req.user as { role: string }).role) ? next() : void res.status(403).json({ success: false, error: "Forbidden" })), createDepartmentsRouter({ db, moduleSections: MODULE_SECTIONS }));
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/departments`;
});
afterEach(async () => { setCustomDepartments([]); await new Promise<void>((ok) => server.close(() => ok())); });
const call = (method: string, path: string, body?: unknown) => fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const make = async (o: Record<string, unknown> = {}) => { const r = await call("POST", "", { name: "Legal Affairs", mailbox: "legal", purpose: "Contracts and legal questions", ...o }); return { status: r.status, body: await r.json() as Record<string, any> }; };

describe("checking a new department", () => {
  const ok = (o: Record<string, unknown> = {}) => checkNewDepartment({ name: "Legal Affairs", mailbox: "legal", ...o }, MODULE_SECTIONS);
  const refused = (o: Record<string, unknown>) => { const r = ok(o); if (r.ok) throw new Error("accepted"); return r.error; };
  it("makes a key, an address on the company domain, and sensible defaults; the department is internal until marked public", () => {
    const r = ok(); expect(r).toMatchObject({ ok: true, department: { key: "legal-affairs", name: "Legal Affairs", address: `legal@${MAIL_DOMAIN}`, purpose: "Enquiries for Legal Affairs", respondWithin: "1–2 business days", custom: true, public: false, active: true } });
    expect(ok({ public: true, purpose: "  Contracts   and law ", respondWithin: " 3 days " })).toMatchObject({ ok: true, department: { public: true, purpose: "Contracts and law", respondWithin: "3 days" } });
    expect(ok({ name: "R&D / Café Ünit", mailbox: "r.and.d" })).toMatchObject({ ok: true, department: { key: "r-and-d-cafe-unit" } });
    expect(ok({ mailbox: "  LEGAL " })).toMatchObject({ ok: true, department: { address: `legal@${MAIL_DOMAIN}` } });
  });
  it("refuses a bad name or mailbox name, with the reason", () => {
    expect(refused({ name: "ab" })).toContain("between 3 and 60"); expect(refused({ name: "x".repeat(61) })).toContain("between 3 and 60"); expect(refused({ name: 42 })).toContain("between 3 and 60");
    expect(refused({ name: "<b>Legal</b>" })).toContain("can use letters"); expect(refused({ name: "-Legal" })).toContain("can use letters");
    for (const m of ["ab", "x".repeat(40), "-legal", "legal-", "le gal", "le@gal", "le..gal", "legal.", "LÉGAL", "", 7]) expect(refused({ mailbox: m }), String(m)).toContain("mailbox name needs");
  });
  it("keeps the system's mailbox names, and refuses a name or address that is taken, including a management section", () => {
    for (const m of ["admin", "billing", "noc1", "owner", "treasury", "no-reply", "postmaster", "abuse", "security"]) expect(refused({ mailbox: m }), m).toContain("kept for the system");
    expect(refused({ mailbox: "support" })).toContain("already used"); expect(refused({ mailbox: "intern" })).toContain("already used");
    expect(refused({ name: "sales" })).toContain("already exists"); expect(refused({ name: "Customer  Support" })).toContain("already exists"); expect(refused({ name: "bank management" })).toContain("already exists");
    expect(refused({ name: "Unrouted" })).toContain("different enough");
  });
});

describe("the registry", () => {
  it("adds custom departments to the built-in nine, and routes email for them", () => {
    expect(allDepartments()).toHaveLength(DEPARTMENTS.length);
    setCustomDepartments([{ key: "legal", name: "Legal Affairs", address: "legal@vink.co.za", purpose: "x", respondWithin: "1 day", public: true, active: true }]);
    expect(allDepartments().map((d) => d.key)).toEqual([...DEPARTMENTS.map((d) => d.key), "legal"]); expect(departmentByKey("legal")).toMatchObject({ name: "Legal Affairs", custom: true });
    expect(departmentOfAddresses(["Someone <LEGAL@vink.co.za>"])?.key).toBe("legal"); expect(departmentOfAddresses(["nobody@vink.co.za"])).toBeNull();
    expect(SECTIONS).toContain("Legal Affairs"); expect(SECTIONS.slice(0, MODULE_SECTIONS.length)).toEqual([...MODULE_SECTIONS]);
    setCustomDepartments([]); expect(SECTIONS).not.toContain("Legal Affairs"); expect(departmentByKey("legal")).toBeUndefined();
  });
  it("lists only the public, active departments for the Contact page, and tells a custom department's forwarders by its key", () => {
    setCustomDepartments([{ key: "legal", name: "Legal Affairs", address: "legal@vink.co.za", purpose: "x", respondWithin: "1 day", public: false, active: true }, { key: "hr-team", name: "HR Team", address: "people@vink.co.za", purpose: "x", respondWithin: "1 day", public: true, active: true }, { key: "old", name: "Old", address: "old@vink.co.za", purpose: "x", respondWithin: "1 day", public: true, active: false }]);
    expect(publicDepartments().map((d) => d.key)).toEqual([...DEPARTMENTS.map((d) => d.key), "hr-team"]);
    expect(notifyTargets(departmentByKey("hr-team")!, { DEPT_FORWARD_HR_TEAM: "a@vink.co.za, b@vink.co.za" } as never)).toEqual(["a@vink.co.za", "b@vink.co.za"]); expect(notifyTargets(departmentByKey("legal")!, {} as never)).toEqual(["legal@vink.co.za"]);
  });
});

describe("the Super Administrator's API", () => {
  it("lists the built-in departments with their counts, and says which are built in", async () => {
    await db.query(`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, department) VALUES ('a','x <x@y.co>',$1,'s','t','sales')`, [["sales@vink.co.za"]]);
    await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,'Sales')`, [MANAGER.userId]);
    const r = await (await call("GET", "")).json() as { departments: { key: string; builtIn: boolean; messages: number; managers: number; public: boolean; active: boolean }[]; domain: string };
    expect(r.domain).toBe(MAIL_DOMAIN); expect(r.departments).toHaveLength(9); expect(r.departments.every((d) => d.builtIn && d.public && d.active)).toBe(true);
    expect(r.departments.find((d) => d.key === "sales")).toMatchObject({ messages: 1, managers: 1 }); expect(r.departments.find((d) => d.key === "media")).toMatchObject({ messages: 0, managers: 0 });
  });

  it("creates a department: stored, listed, a section, in the mailbox for superadmins, routing its email, and audited", async () => {
    const r = await make({ public: false });
    expect(r.status).toBe(201); expect(r.body.department).toMatchObject({ key: "legal-affairs", name: "Legal Affairs", address: `legal@${MAIL_DOMAIN}`, builtIn: false, public: false, active: true, messages: 0, managers: 0 });
    expect((await db.query("SELECT key, name, address, is_public, active FROM custom_departments")).rows).toEqual([{ key: "legal-affairs", name: "Legal Affairs", address: `legal@${MAIL_DOMAIN}`, is_public: false, active: true }]);
    expect(allDepartments().map((d) => d.key)).toContain("legal-affairs"); expect(SECTIONS).toContain("Legal Affairs");
    const list = await (await call("GET", "")).json() as { departments: { key: string }[] }; expect(list.departments).toHaveLength(10);
    const svc = createMailService({ db, mail: new ConsoleEmail() });
    expect((await svc.departmentsFor(ROOT)).map((d) => d.key)).toContain("legal-affairs");
    expect((await svc.departmentsFor(MANAGER)).map((d) => d.key)).not.toContain("legal-affairs");                       // a manager needs to be approved for the section first
    await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,'Legal Affairs')`, [MANAGER.userId]);
    expect((await svc.departmentsFor(MANAGER)).map((d) => d.key)).toEqual(["legal-affairs"]);
    expect(departmentOfAddresses([`legal@${MAIL_DOMAIN}`])?.key).toBe("legal-affairs");
    const audit = (await db.query("SELECT action, target FROM audit_log")).rows; expect(audit).toEqual([{ action: "department.create", target: "legal-affairs" }]);
  });

  it("gets email for the new department into its mailbox, and lets its manager read and reply", async () => {
    await make();
    await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,'Legal Affairs')`, [MANAGER.userId]);
    const { PgInboundStore } = await import("../inbound/store.js");
    const store = new PgInboundStore(db as never);
    await store.save({ resendId: "em1", from: "Pam <pam@example.com>", to: [`legal@${MAIL_DOMAIN}`], subject: "Contract", text: "Please review", html: null });
    const mail = new ConsoleEmail(), svc = createMailService({ db, mail });
    const list = await svc.list(MANAGER, { department: "legal-affairs" }); expect(list).toMatchObject({ ok: true, value: [{ subject: "Contract", department: "legal-affairs" }] });
    expect((await svc.list(STRANGER, { department: "legal-affairs" }))).toMatchObject({ ok: false, status: 403 });
    const msgId = (list as { ok: true; value: { id: string }[] }).value[0].id;
    expect((await svc.reply(MANAGER, "mandy", "email", msgId, "We will review it.")).ok).toBe(true);
    expect(mail.sent[0]).toMatchObject({ to: "pam@example.com", from: `VINK Legal Affairs <legal@${MAIL_DOMAIN}>`, replyTo: `legal@${MAIL_DOMAIN}` });
  });

  it("puts a public department on the Contact page and accepts messages for it; an internal one is not offered and refuses them", async () => {
    await make({ name: "HR Team", mailbox: "people", public: true }); await make({ name: "Legal Affairs", mailbox: "legal", public: false });
    const contact = createContactService({ db, mail: new ConsoleEmail(), env: {} as never });
    const app = express(); app.use("/api/contact", createContactRouter(contact));
    const s2 = await new Promise<Server>((ok) => { const x = app.listen(0, "127.0.0.1", () => ok(x)); }); const base = `http://127.0.0.1:${(s2.address() as AddressInfo).port}/api/contact`;
    try {
      const pub = await (await fetch(`${base}/departments`)).json() as { departments: { key: string }[] };
      expect(pub.departments.map((d) => d.key)).toContain("hr-team"); expect(pub.departments.map((d) => d.key)).not.toContain("legal-affairs");
      const send = (department: string) => fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department, name: "Thandi Nkosi", email: "t@example.com", subject: "Question", message: "Please tell me about the contract." }) });
      expect((await send("hr-team")).status).toBe(201); expect((await send("legal-affairs")).status).toBe(400);
    } finally { await new Promise<void>((ok) => s2.close(() => ok())); }
  });

  it("refuses a bad request, a repeated one, and anyone who is not a Super Administrator", async () => {
    expect((await make({ name: "x" })).status).toBe(400); expect((await make({ mailbox: "admin" })).body.error).toContain("kept for the system");
    expect((await make()).status).toBe(201); const again = await make(); expect(again.status).toBe(400); expect(again.body.error).toMatch(/already/);
    expect((await make({ name: "Bank Management", mailbox: "bank" })).body.error).toContain("already exists");
    as = { ...MANAGER, username: "mandy" }; expect((await call("GET", "")).status).toBe(403); expect((await make({ name: "Other", mailbox: "other" })).status).toBe(403);
    expect((await call("PATCH", "/legal-affairs", { active: false })).status).toBe(403);
    expect((await db.query("SELECT COUNT(*) AS n FROM custom_departments")).rows[0].n).toBe(1 as never);
  });

  it("changes a department made here (what it is for, the reply time, public, active) but not a built-in one", async () => {
    await make();
    const r = await call("PATCH", "/legal-affairs", { purpose: "Contracts, leases and disputes", respondWithin: "2 days", public: true });
    expect(r.status).toBe(200); expect((await r.json() as { department: Record<string, unknown> }).department).toMatchObject({ purpose: "Contracts, leases and disputes", respondWithin: "2 days", public: true, active: true });
    expect(departmentByKey("legal-affairs")).toMatchObject({ purpose: "Contracts, leases and disputes", public: true });
    expect((await call("PATCH", "/legal-affairs", { name: "Renamed", address: "x@vink.co.za" })).status).toBe(200); expect(departmentByKey("legal-affairs")).toMatchObject({ name: "Legal Affairs", address: `legal@${MAIL_DOMAIN}` });     // the name and address cannot change
    expect((await call("PATCH", "/sales", { purpose: "x" })).status).toBe(409); expect((await call("PATCH", "/nope", { purpose: "x" })).status).toBe(404); expect((await call("PATCH", "/legal-affairs", { purpose: " " })).status).toBe(400);
    expect((await db.query("SELECT action FROM audit_log ORDER BY created_at")).rows.map((x) => x.action)).toEqual(["department.create", "department.update", "department.update"]);
  });

  it("switching a department off hides it from the Contact page and stops new email being sent from it, but keeps it readable", async () => {
    await make({ public: true }); await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,'Legal Affairs')`, [MANAGER.userId]);
    const mail = new ConsoleEmail(), svc = createMailService({ db, mail });
    expect((await svc.send(MANAGER, "mandy", { department: "legal-affairs", to: "pam@example.com", subject: "Hello there", body: "Hi Pam." })).ok).toBe(true);
    await call("PATCH", "/legal-affairs", { active: false });
    expect(publicDepartments().map((d) => d.key)).not.toContain("legal-affairs");
    expect(await svc.send(MANAGER, "mandy", { department: "legal-affairs", to: "pam@example.com", subject: "Hello again", body: "Hi again." })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("switched off") });
    expect((await svc.departmentsFor(MANAGER)).map((d) => d.key)).toEqual(["legal-affairs"]); expect((await svc.list(MANAGER, { department: "legal-affairs", box: "sent" })).ok).toBe(true);
    await call("PATCH", "/legal-affairs", { active: true }); expect((await svc.send(MANAGER, "mandy", { department: "legal-affairs", to: "pam@example.com", subject: "Hello once more", body: "Back on." })).ok).toBe(true);
  });

  it("is remembered: the departments are loaded again from the database at start-up", async () => {
    await make({ name: "HR Team", mailbox: "people", public: true }); await make({ name: "Legal Affairs", mailbox: "legal" });
    setCustomDepartments([]); expect(allDepartments()).toHaveLength(9);
    const loaded = await loadCustomDepartments(db); expect(loaded.map((d) => d.key)).toEqual(["hr-team", "legal-affairs"]);
    expect(departmentByKey("hr-team")).toMatchObject({ public: true, active: true, custom: true, address: `people@${MAIL_DOMAIN}` }); expect(departmentByKey("legal-affairs")).toMatchObject({ public: false });
    expect(SECTIONS).toEqual(expect.arrayContaining(["HR Team", "Legal Affairs"]));
  });
});
