import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";
import type { EmailSender } from "../auth/email.js";
import { DEPARTMENTS, SECTION_ALIASES, departmentByKey, type Department } from "../config/departments.js";
import { createMailFiles, ATTACH_LIMIT_BYTES, LINK_DAYS, prettySize, type MailFiles, type FileInfo, type FileResult, type StoredFile } from "./mailFiles.js";

/**
 * Department mail for staff: read what was sent to a department (website messages and incoming email), reply from the department's own address, and write new
 * emails from it.
 *
 * Who sees what:
 *  - an owner or superadmin sees EVERY department (and email that was addressed to none of them);
 *  - anyone else sees only the departments they have been approved to manage. That is the same approval as for the management panel's sections
 *    (section_permissions): a department manager is created when their application to manage the department, or their job application for it, is approved.
 *    The section name is the department's name, for example "Sales".
 *
 * Everything a person sends is stored (mail_outbound) with who sent it, is limited to 40 an hour per person, and goes out from the department's address with the
 * department's address as the reply address, so answers come back into the department's mailbox. Message text is returned as plain text only: incoming HTML is
 * never passed on, because it comes from the open internet.
 */
export const UNROUTED = { key: "unrouted", name: "Other mail (not addressed to a department)", address: "", purpose: "", respondWithin: "" };
export type MailKind = "web" | "email";
export interface MailUser { userId: string; role: string }
const SEND_LIMIT_PER_HOUR = 40;

export interface MailListItem { kind: MailKind; id: string; department: string; fromName: string; fromEmail: string; subject: string; preview: string; status: string; at: string; ref?: string }
export interface MailDetail extends MailListItem { text: string; attachments: FileInfo[]; replies: { id: string; to: string; subject: string; body: string; status: string; by: string; at: string; attachments: FileInfo[] }[] }
export type MailResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const isSuper = (role: string) => role === "owner" || role === "superadmin";
const bad = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const stripHtml = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").trim();
const EMAIL = /^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]{2,}$/;

/** "Name <addr>" or "addr" -> { name, email } */
export function parseAddress(raw: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  const email = (m ? m[2] : raw).trim().toLowerCase();
  return { name: (m ? m[1].trim() : "") || email, email };
}

export function createMailService(deps: { db: Db; mail: EmailSender; now?: () => Date; files?: MailFiles; /** Up to this many bytes of files are attached; more goes as links (default 15 MB). */ attachLimitBytes?: number; /** Where the public download links point (the API's own address). */ publicApiUrl?: string }) {
  const { db, mail } = deps;
  const now = deps.now ?? (() => new Date());
  const files = deps.files ?? createMailFiles({ db, now });
  const attachLimit = deps.attachLimitBytes ?? ATTACH_LIMIT_BYTES;
  const apiUrl = (deps.publicApiUrl ?? process.env.PUBLIC_API_URL ?? "https://api.vink.co.za").replace(/\/+$/, "");

  /** The departments this person may use. */
  async function departmentsFor(user: MailUser): Promise<(Department | typeof UNROUTED)[]> {
    if (isSuper(user.role)) return [...DEPARTMENTS, UNROUTED];
    const rows = (await db.query(`SELECT section FROM section_permissions WHERE user_id = $1`, [user.userId])).rows;
    const names = new Set(rows.map((r: Record<string, unknown>) => String(r.section)));
    const viaAlias = new Set([...names].map((n) => SECTION_ALIASES[n]).filter(Boolean));
    return DEPARTMENTS.filter((d) => names.has(d.name) || viaAlias.has(d.key));
  }
  const canUse = async (user: MailUser, key: string) => (await departmentsFor(user)).some((d) => d.key === key);

  async function unread(user: MailUser) {
    const out: { key: string; name: string; address: string; open: number }[] = [];
    for (const d of await departmentsFor(user)) {
      const web = d.key === "unrouted" ? 0 : Number((await db.query(`SELECT COUNT(*) AS n FROM contact_messages WHERE department = $1 AND status = 'open'`, [d.key])).rows[0].n);
      const em = Number((await db.query(d.key === "unrouted" ? `SELECT COUNT(*) AS n FROM inbound_emails WHERE department IS NULL AND status = 'open'` : `SELECT COUNT(*) AS n FROM inbound_emails WHERE department = $1 AND status = 'open'`, d.key === "unrouted" ? [] : [d.key])).rows[0].n);
      out.push({ key: d.key, name: d.name, address: d.address, open: web + em });
    }
    return out;
  }

  const webItem = (r: Record<string, unknown>): MailListItem => ({ kind: "web", id: String(r.id), department: String(r.department), fromName: String(r.name), fromEmail: String(r.email), subject: String(r.subject), preview: String(r.message).slice(0, 160), status: String(r.status), at: new Date(String(r.created_at)).toISOString(), ref: String(r.ref) });
  const emailText = (r: Record<string, unknown>) => (r.text_body ? String(r.text_body) : r.html_body ? stripHtml(String(r.html_body)) : "");
  const emailItem = (r: Record<string, unknown>): MailListItem => { const a = parseAddress(String(r.from_addr)); return { kind: "email", id: String(r.id), department: r.department ? String(r.department) : "unrouted", fromName: a.name, fromEmail: a.email, subject: String(r.subject) || "(no subject)", preview: emailText(r).slice(0, 160), status: String(r.status ?? "open"), at: new Date(String(r.received_at)).toISOString() }; };

  async function list(user: MailUser, f: { department?: string; box?: string; status?: string; limit?: number } = {}): Promise<MailResult<MailListItem[]>> {
    const allowed = await departmentsFor(user);
    const keys = f.department ? [f.department] : allowed.map((d) => d.key);
    if (f.department && !(await canUse(user, f.department))) return bad(403, "You do not manage this department's mail");
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 300);
    const status = f.status && ["open", "answered", "closed"].includes(f.status) ? f.status : null;
    if (f.box === "sent") {
      const rows = keys.length ? (await db.query(`SELECT * FROM mail_outbound WHERE department = ANY($1) ORDER BY created_at DESC LIMIT $2`, [keys, limit])).rows : [];
      return { ok: true, value: rows.map((r: Record<string, unknown>) => ({ kind: (r.reply_kind ?? "email") as MailKind, id: String(r.id), department: String(r.department), fromName: String(r.sent_by_name), fromEmail: String(r.to_addr), subject: String(r.subject), preview: String(r.body).slice(0, 160), status: String(r.status), at: new Date(String(r.created_at)).toISOString() })) };
    }
    const items: MailListItem[] = [];
    const webKeys = keys.filter((k) => k !== "unrouted");
    if (webKeys.length) items.push(...(await db.query(`SELECT * FROM contact_messages WHERE department = ANY($1) ${status ? "AND status = $3" : ""} ORDER BY created_at DESC LIMIT $2`, status ? [webKeys, limit, status] : [webKeys, limit])).rows.map(webItem));
    const emailKeys = keys.filter((k) => k !== "unrouted");
    if (emailKeys.length) items.push(...(await db.query(`SELECT * FROM inbound_emails WHERE department = ANY($1) ${status ? "AND status = $3" : ""} ORDER BY received_at DESC LIMIT $2`, status ? [emailKeys, limit, status] : [emailKeys, limit])).rows.map(emailItem));
    if (keys.includes("unrouted")) items.push(...(await db.query(`SELECT * FROM inbound_emails WHERE department IS NULL ${status ? "AND status = $2" : ""} ORDER BY received_at DESC LIMIT $1`, status ? [limit, status] : [limit])).rows.map(emailItem));
    items.sort((a, b) => b.at.localeCompare(a.at));
    return { ok: true, value: items.slice(0, limit) };
  }

  async function load(kind: string, id: string): Promise<{ item: MailListItem; text: string } | null> {
    if (kind === "web") { const r = (await db.query(`SELECT * FROM contact_messages WHERE id = $1`, [id])).rows[0]; return r ? { item: webItem(r), text: String(r.message) } : null; }
    if (kind === "email") { const r = (await db.query(`SELECT * FROM inbound_emails WHERE id = $1`, [id])).rows[0]; return r ? { item: emailItem(r), text: emailText(r) } : null; }
    return null;
  }

  async function get(user: MailUser, kind: string, id: string): Promise<MailResult<MailDetail>> {
    const m = await load(kind, id);
    if (!m) return bad(404, "No such message");
    if (!(await canUse(user, m.item.department))) return bad(403, "You do not manage this department's mail");
    const replyRows = (await db.query(`SELECT * FROM mail_outbound WHERE reply_kind = $1 AND reply_id = $2 ORDER BY created_at`, [kind, id])).rows;
    const replies = await Promise.all(replyRows.map(async (r: Record<string, unknown>) => ({ id: String(r.id), to: String(r.to_addr), subject: String(r.subject), body: String(r.body), status: String(r.status), by: String(r.sent_by_name), at: new Date(String(r.created_at)).toISOString(), attachments: await files.forEmail("outbound", String(r.id)) })));
    const attachments = kind === "email" ? await files.forEmail("inbound", id) : [];
    return { ok: true, value: { ...m.item, text: m.text.slice(0, 20000), attachments, replies } };
  }

  async function setStatus(user: MailUser, kind: string, id: string, status: unknown): Promise<MailResult<{ status: string }>> {
    if (status !== "open" && status !== "answered" && status !== "closed") return bad(400, "Choose open, answered or closed");
    const m = await load(kind, id);
    if (!m) return bad(404, "No such message");
    if (!(await canUse(user, m.item.department))) return bad(403, "You do not manage this department's mail");
    await db.query(kind === "web" ? `UPDATE contact_messages SET status = $2 WHERE id = $1` : `UPDATE inbound_emails SET status = $2 WHERE id = $1`, [id, status]);
    return { ok: true, value: { status } };
  }

  async function sentThisHour(userId: string): Promise<number> {
    return Number((await db.query(`SELECT COUNT(*) AS n FROM mail_outbound WHERE sent_by = $1 AND created_at >= $2`, [userId, new Date(now().getTime() - 3600_000)])).rows[0].n);
  }

  /** Sends an email from a department and records it. */
  async function send(user: MailUser, username: string, a: { department: string; to: string; subject: string; body: string; replyKind?: MailKind; replyId?: string; attachmentIds?: unknown }): Promise<MailResult<{ id: string }>> {
    const dept = departmentByKey(a.department);
    if (!dept) return bad(400, "Choose a department to send from");
    if (!(await canUse(user, dept.key))) return bad(403, "You do not manage this department's mail");
    const to = oneLine(a.to, 254).toLowerCase(), subject = oneLine(a.subject, 200), body = typeof a.body === "string" ? a.body.replace(/\u0000/g, "").trim() : "";
    if (!EMAIL.test(to)) return bad(400, "Enter one valid email address to send to");
    if (subject.length < 2) return bad(400, "Write a subject");
    if (body.length < 2) return bad(400, "Write the message");
    if (body.length > 20000) return bad(400, "The message is too long");
    if ((await sentThisHour(user.userId)) >= SEND_LIMIT_PER_HOUR) return bad(429, "You have sent a lot of email this hour. Please wait a while.");
    const claimed = await files.claim(user.userId, a.attachmentIds);
    if (!claimed.ok) return bad(claimed.status, claimed.error);
    const list = claimed.value;
    const asLinks = list.reduce((n, f) => n + f.size, 0) > attachLimit;          // too big to attach: send expiring download links instead
    const links = asLinks ? files.planLinks(list) : undefined;
    const linkLines = asLinks ? list.map((f) => ({ name: f.filename, size: prettySize(f.size), url: `${apiUrl}/api/shared-files/${links!.get(f.id)!.token}` })) : [];
    const expiry = asLinks ? [...links!.values()][0].expires.toISOString().slice(0, 10) : "";
    const linkText = asLinks ? `\n\nFiles shared with you (the links work until ${expiry}):\n${linkLines.map((l) => `- ${l.name} (${l.size}): ${l.url}`).join("\n")}` : "";
    const linkHtml = asLinks ? `<p>Files shared with you (the links work until ${esc(expiry)}):</p><ul>${linkLines.map((l) => `<li><a href="${esc(l.url)}">${esc(l.name)}</a> (${esc(l.size)})</li>`).join("")}</ul>` : "";
    const id = crypto.randomUUID();
    const html = `<p style="white-space:pre-wrap">${esc(body)}</p>${linkHtml}<p>${esc(dept.name)}<br>VINK</p>`;
    let error: string | null = null;
    try { await mail.send({ to, subject, text: `${body}${linkText}\n\n${dept.name}\nVINK`, html, from: `VINK ${dept.name} <${dept.address}>`, replyTo: dept.address, ...(list.length && !asLinks ? { attachments: list.map((f) => ({ filename: f.filename, content: f.data, contentType: f.contentType })) } : {}) }); }
    catch (e) { error = e instanceof Error ? e.message.slice(0, 200) : "send failed"; }
    await db.query(`INSERT INTO mail_outbound (id, department, to_addr, subject, body, reply_kind, reply_id, sent_by, sent_by_name, status, error, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, dept.key, to, subject, body, a.replyKind ?? null, a.replyId ?? null, user.userId, username || "staff", error ? "failed" : "sent", error, now()]);
    if (error) return bad(502, "The email could not be sent right now. Nothing was delivered; try again.");
    await files.bindSent(list, id, dept.key, links);
    return { ok: true, value: { id } };
  }

  /** Answers a message from its department's address. The message is marked answered once the email has gone. */
  async function reply(user: MailUser, username: string, kind: string, id: string, body: unknown, attachmentIds?: unknown): Promise<MailResult<{ id: string }>> {
    const m = await load(kind, id);
    if (!m) return bad(404, "No such message");
    if (m.item.department === "unrouted") return bad(409, "This email was not sent to a department address. Write a new email from the department you choose.");
    if (!(await canUse(user, m.item.department))) return bad(403, "You do not manage this department's mail");
    const subject = /^re:/i.test(m.item.subject) ? m.item.subject : `Re: ${m.item.subject}`;
    const quoted = m.text.split("\n").slice(0, 25).map((l) => `> ${l}`).join("\n").slice(0, 1500);
    const text = typeof body === "string" ? body.trim() : "";
    if (text.length < 2) return bad(400, "Write your reply");
    const r = await send(user, username, { department: m.item.department, to: m.item.fromEmail, subject: m.item.ref ? `${subject} (${m.item.ref})` : subject, body: text ? `${text}\n\n---\nOn ${m.item.at.slice(0, 10)}, ${m.item.fromName} wrote:\n${quoted}` : "", replyKind: kind as MailKind, replyId: id, attachmentIds });
    if (r.ok) await db.query(kind === "web" ? `UPDATE contact_messages SET status = 'answered' WHERE id = $1 AND status = 'open'` : `UPDATE inbound_emails SET status = 'answered' WHERE id = $1 AND status = 'open'`, [id]);
    return r;
  }

  /** A file a person is allowed to download: one on a message of a department they manage. */
  async function openFile(user: MailUser, fileId: string): Promise<FileResult<StoredFile>> {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return bad(400, "Invalid file");
    const m = await files.meta(fileId);
    if (!m || !m.department || m.row.kind === "upload") return bad(404, "No such file");
    if (!(await canUse(user, m.department))) return bad(403, "You do not manage this department's mail");
    return files.read(fileId);
  }

  return { departmentsFor, unread, list, get, setStatus, send, reply, openFile, files };
}
export type MailService = ReturnType<typeof createMailService>;
