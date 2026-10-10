import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";
import type { EmailSender } from "../auth/email.js";
import { departmentByKey, notifyTargets, DEPARTMENTS, type Department } from "../config/departments.js";

/**
 * Messages sent to a VINK department from the website.
 *
 * A message is stored first, so it is never lost if email is down, and then emailed to the department (the sender's address is the Reply-To, so the department
 * answers with one click) and acknowledged to the sender with a reference. A message whose department email could not be sent stays "not delivered" and is tried
 * again by retryUnsent(); the operations monitor tells a person if one stays stuck.
 */
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const MAX_TRIES = 12;

export interface ContactInput { department?: unknown; name?: unknown; email?: unknown; phone?: unknown; subject?: unknown; message?: unknown; website?: unknown }
export type SubmitResult = { ok: true; ref: string; department: string; respondWithin: string; duplicate?: boolean } | { ok: false; status: number; error: string };
export interface ContactRow { id: string; ref: string; department: string; name: string; email: string; phone: string | null; subject: string; message: string; status: string; delivered: boolean; tries: number; lastError: string | null; createdAt: string }

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");
const oneLine = (v: unknown, max: number) => clean(v, max).replace(/[\r\n\t]+/g, " ");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const newRef = () => "VK-" + Array.from(crypto.randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");

export function createContactService(deps: { db: Db; mail: EmailSender; env?: NodeJS.ProcessEnv; now?: () => Date }) {
  const { db, mail } = deps;
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());

  const view = (r: Record<string, unknown>): ContactRow => ({ id: String(r.id), ref: String(r.ref), department: String(r.department), name: String(r.name), email: String(r.email), phone: r.phone ? String(r.phone) : null,
    subject: String(r.subject), message: String(r.message), status: String(r.status), delivered: !!r.notified_at, tries: Number(r.tries), lastError: r.last_error ? String(r.last_error) : null, createdAt: new Date(String(r.created_at)).toISOString() });

  /** The email to the department. Reply goes straight to the sender. */
  async function notifyDepartment(row: Record<string, unknown>, dept: Department): Promise<void> {
    const text = [`New message for ${dept.name}`, `Reference: ${row.ref}`, `From: ${row.name} <${row.email}>`, row.phone ? `Phone: ${row.phone}` : "", `Subject: ${row.subject}`, "", String(row.message), "", "Reply to this email to answer the sender."].filter((l, i) => l !== "" || i > 3).join("\n");
    const html = `<p><b>New message for ${esc(dept.name)}</b><br>Reference: ${esc(String(row.ref))}<br>From: ${esc(String(row.name))} &lt;${esc(String(row.email))}&gt;${row.phone ? `<br>Phone: ${esc(String(row.phone))}` : ""}<br>Subject: ${esc(String(row.subject))}</p><p style="white-space:pre-wrap">${esc(String(row.message))}</p><p>Reply to this email to answer the sender.</p>`;
    for (const to of notifyTargets(dept, env)) await mail.send({ to, subject: `[${row.ref}] ${row.subject} (${dept.name})`.slice(0, 200), text, html, from: `VINK ${dept.name} <${dept.address}>`, replyTo: `${String(row.name).replace(/[<>",]/g, "")} <${row.email}>` });
  }
  /** The receipt to the sender. */
  async function acknowledge(row: Record<string, unknown>, dept: Department): Promise<void> {
    const text = `Hello ${row.name},\n\nWe have received your message to ${dept.name}.\nYour reference is ${row.ref}.\nYou can expect a reply within ${dept.respondWithin}.\n\nFor your safety, never send us your card number, PIN, password or one-time codes by email.\n\nVINK`;
    const html = `<p>Hello ${esc(String(row.name))},</p><p>We have received your message to <b>${esc(dept.name)}</b>.<br>Your reference is <b>${esc(String(row.ref))}</b>.<br>You can expect a reply within ${esc(dept.respondWithin)}.</p><p>For your safety, never send us your card number, PIN, password or one-time codes by email.</p><p>VINK</p>`;
    await mail.send({ to: String(row.email), subject: `We received your message (${row.ref})`, text, html, from: `VINK ${dept.name} <${dept.address}>`, replyTo: dept.address });
  }

  async function deliver(id: string): Promise<boolean> {
    const row = (await db.query(`SELECT * FROM contact_messages WHERE id = $1`, [id])).rows[0] as Record<string, unknown> | undefined;
    if (!row) return false;
    const dept = departmentByKey(row.department);
    if (!dept) return false;
    let ok = !!row.notified_at, err: string | null = null;
    if (!row.notified_at) {
      try { await notifyDepartment(row, dept); ok = true; await db.query(`UPDATE contact_messages SET notified_at = $2, last_error = NULL WHERE id = $1`, [id, now()]); }
      catch (e) { err = e instanceof Error ? e.message.slice(0, 200) : "send failed"; await db.query(`UPDATE contact_messages SET tries = tries + 1, last_error = $2 WHERE id = $1`, [id, err]); }
    }
    if (!row.ack_sent_at) {
      try { await acknowledge(row, dept); await db.query(`UPDATE contact_messages SET ack_sent_at = $2 WHERE id = $1`, [id, now()]); }
      catch (e) { if (!err) await db.query(`UPDATE contact_messages SET last_error = $2 WHERE id = $1`, [id, e instanceof Error ? e.message.slice(0, 200) : "acknowledgement failed"]); }
    }
    return ok;
  }

  async function submit(input: ContactInput): Promise<SubmitResult> {
    if (typeof input.website === "string" && input.website.trim() !== "") {                          // the hidden trap field: a person never fills it. Pretend it worked, store nothing.
      const d = departmentByKey(input.department) ?? DEPARTMENTS[0];
      return { ok: true, ref: newRef(), department: d.key, respondWithin: d.respondWithin };
    }
    const dept = departmentByKey(input.department);
    if (!dept || dept.public === false || dept.active === false) return { ok: false, status: 400, error: "Choose who your message is for" };
    const name = oneLine(input.name, 100), email = oneLine(input.email, 254).toLowerCase(), phone = oneLine(input.phone, 30), subject = oneLine(input.subject, 150) || "General enquiry", message = clean(input.message, 5000);
    if (name.length < 2) return { ok: false, status: 400, error: "Enter your name" };
    if (!/^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]{2,}$/.test(email)) return { ok: false, status: 400, error: "Enter a valid email address" };
    if (phone && !/^[0-9+() -]{6,30}$/.test(phone)) return { ok: false, status: 400, error: "Enter a valid phone number, or leave it empty" };
    if (message.length < 10) return { ok: false, status: 400, error: "Write your message (at least 10 characters)" };
    // the same person sending the same words again within ten minutes (a double click) is one message
    const dup = (await db.query(`SELECT ref FROM contact_messages WHERE lower(email) = $1 AND department = $2 AND message = $3 AND created_at >= $4 LIMIT 1`, [email, dept.key, message, new Date(now().getTime() - 10 * 60_000)])).rows[0];
    if (dup) return { ok: true, ref: String(dup.ref), department: dept.key, respondWithin: dept.respondWithin, duplicate: true };
    let id = crypto.randomUUID(), ref = newRef();
    for (let i = 0; ; i++) {
      try { await db.query(`INSERT INTO contact_messages (id, ref, department, name, email, phone, subject, message, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, ref, dept.key, name, email, phone || null, subject, message, now()]); break; }
      catch (e) { if (i >= 3 || !/unique|duplicate/i.test(String((e as Error).message))) throw e; ref = newRef(); id = crypto.randomUUID(); }
    }
    await deliver(id).catch(() => false);                                                            // email trouble never loses the message: it is stored and retried
    return { ok: true, ref, department: dept.key, respondWithin: dept.respondWithin };
  }

  /** Tries again for messages whose department email did not go (or whose receipt did not). */
  async function retryUnsent(): Promise<number> {
    const rows = (await db.query(`SELECT id FROM contact_messages WHERE (notified_at IS NULL OR ack_sent_at IS NULL) AND tries < $1 AND created_at >= $2 ORDER BY created_at LIMIT 50`, [MAX_TRIES, new Date(now().getTime() - 3 * 24 * 3600_000)])).rows;
    let sent = 0;
    for (const r of rows) if (await deliver(String(r.id)).catch(() => false)) sent++;
    return sent;
  }

  async function list(f: { department?: string; status?: string; limit?: number } = {}): Promise<ContactRow[]> {
    const where: string[] = [], p: unknown[] = [];
    if (f.department && departmentByKey(f.department)) { p.push(f.department); where.push(`department = $${p.length}`); }
    if (f.status && ["open", "answered", "closed"].includes(f.status)) { p.push(f.status); where.push(`status = $${p.length}`); }
    p.push(Math.min(Math.max(f.limit ?? 100, 1), 500));
    return (await db.query(`SELECT * FROM contact_messages ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT $${p.length}`, p)).rows.map(view);
  }
  async function setStatus(id: string, status: unknown): Promise<boolean> {
    if (status !== "open" && status !== "answered" && status !== "closed") return false;
    return (await db.query(`UPDATE contact_messages SET status = $2 WHERE id = $1 RETURNING id`, [id, status])).rows.length > 0;
  }
  /** How many messages have not reached their department after more than 15 minutes (for the operations monitor). */
  async function undeliveredCount(): Promise<number> {
    return Number((await db.query(`SELECT COUNT(*) AS n FROM contact_messages WHERE notified_at IS NULL AND created_at < $1`, [new Date(now().getTime() - 15 * 60_000)])).rows[0]?.n ?? 0);
  }
  return { submit, retryUnsent, list, setStatus, undeliveredCount };
}
export type ContactService = ReturnType<typeof createContactService>;
