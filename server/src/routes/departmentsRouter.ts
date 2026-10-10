import { Router, json } from "express";
import { h, fail, audit, type Db } from "../portal/common.js";
import { DEPARTMENTS, allDepartments, setCustomDepartments, checkNewDepartment, departmentByKey, MAIL_DOMAIN, type Department } from "../config/departments.js";

/**
 * Departments, for Super Administrators (owner and superadmin; the caller mounts it behind requireAuth + requireRole), at /api/admin/departments:
 *   GET   /          every department (the nine built in and the ones made here) with its mailbox address, how many messages it has had and how many managers it has
 *   POST  /          { name, mailbox, purpose?, respondWithin?, public? } make a department. Its mailbox is <mailbox>@vink.co.za; Resend receives mail for every address
 *                    on the domain, so it works at once. The name is the section managers are approved for, and cannot be changed later.
 *   PATCH /:key      { purpose?, respondWithin?, public?, active? } change a department made here (the built-in nine are changed in code)
 * A department is never deleted: it has mail and managers. Switching it off (active: false) hides it from the Contact page and from the choice of who to write
 * from; it stays readable.
 */
export async function loadCustomDepartments(db: Db): Promise<Department[]> {
  const rows = (await db.query(`SELECT * FROM custom_departments ORDER BY created_at, name`)).rows;
  const list = rows.map((r: Record<string, unknown>): Department => ({ key: String(r.key), name: String(r.name), address: String(r.address), purpose: String(r.purpose), respondWithin: String(r.respond_within), custom: true, public: r.is_public === true || r.is_public === "t", active: r.active === true || r.active === "t" }));
  setCustomDepartments(list);
  return list;
}

export function createDepartmentsRouter(d: { db: Db; /** The sections that are not departments (Bank Management and the like): a department cannot take their names. */ moduleSections: readonly string[] }): Router {
  const router = Router();
  router.use(json({ limit: "16kb" }));
  const num = (v: unknown) => Number(v ?? 0);

  async function describe(): Promise<unknown[]> {
    const mail = new Map<string, number>(), mgr = new Map<string, number>();
    for (const r of (await d.db.query(`SELECT department, COUNT(*) AS n FROM inbound_emails GROUP BY department`)).rows) if (r.department) mail.set(String(r.department), num(r.n));
    for (const r of (await d.db.query(`SELECT department, COUNT(*) AS n FROM contact_messages GROUP BY department`)).rows) if (r.department) mail.set(String(r.department), (mail.get(String(r.department)) ?? 0) + num(r.n));
    for (const r of (await d.db.query(`SELECT section, COUNT(*) AS n FROM section_permissions GROUP BY section`)).rows) mgr.set(String(r.section), num(r.n));
    return allDepartments().map((x) => ({ key: x.key, name: x.name, address: x.address, purpose: x.purpose, respondWithin: x.respondWithin, builtIn: !x.custom, public: x.public !== false, active: x.active !== false, messages: mail.get(x.key) ?? 0, managers: mgr.get(x.name) ?? 0 }));
  }

  router.get("/", h(async (_req, res) => { res.json({ success: true, departments: await describe(), domain: MAIL_DOMAIN }); }));

  router.post("/", h(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const c = checkNewDepartment({ name: b.name, mailbox: b.mailbox, purpose: b.purpose, respondWithin: b.respondWithin, public: b.public }, d.moduleSections);
    if (!c.ok) return fail(res, 400, c.error);
    const x = c.department;
    await d.db.query(`INSERT INTO custom_departments (key, name, address, purpose, respond_within, is_public, active, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8)`, [x.key, x.name, x.address, x.purpose, x.respondWithin, x.public === true, req.user!.userId, new Date()]);
    await loadCustomDepartments(d.db);
    await audit(d.db, req, "department.create", x.key, { name: x.name, address: x.address, public: x.public === true });
    res.status(201).json({ success: true, department: (await describe()).find((y) => (y as { key: string }).key === x.key) });
  }));

  router.patch("/:key", h(async (req, res) => {
    const dep = departmentByKey(req.params.key);
    if (!dep) return fail(res, 404, "No such department");
    if (!dep.custom || DEPARTMENTS.some((x) => x.key === dep.key)) return fail(res, 409, "That is a built-in department. Its details are set in the code, not here.");
    const b = (req.body ?? {}) as Record<string, unknown>;
    const purpose = typeof b.purpose === "string" ? b.purpose.replace(/\s+/g, " ").trim().slice(0, 140) : dep.purpose;
    const respondWithin = typeof b.respondWithin === "string" && b.respondWithin.trim() ? b.respondWithin.replace(/\s+/g, " ").trim().slice(0, 60) : dep.respondWithin;
    const isPublic = typeof b.public === "boolean" ? b.public : dep.public !== false, active = typeof b.active === "boolean" ? b.active : dep.active !== false;
    if (!purpose) return fail(res, 400, "Say what this department is for");
    await d.db.query(`UPDATE custom_departments SET purpose = $2, respond_within = $3, is_public = $4, active = $5 WHERE key = $1`, [dep.key, purpose, respondWithin, isPublic, active]);
    await loadCustomDepartments(d.db);
    await audit(d.db, req, "department.update", dep.key, { purpose, respondWithin, public: isPublic, active });
    res.json({ success: true, department: (await describe()).find((y) => (y as { key: string }).key === dep.key) });
  }));

  return router;
}
