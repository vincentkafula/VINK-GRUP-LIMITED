import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";
import type { EmailSender } from "../auth/email.js";
import { DEPARTMENTS, SECTION_ALIASES, departmentByKey, type Department } from "../config/departments.js";
import { parseSearch, matchesSearch, isEmptySearch, normalizeSubject } from "./mailSearch.js";
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
 * department's address as the reply address, so answers come back into the department's mailbox. Message text is returned as plain text, and the HTML of an
 * incoming email is returned separately as untrusted: the website cleans it (DOMPurify) and shows it in a sandboxed frame with remote pictures blocked.
 */
export const UNROUTED = { key: "unrouted", name: "Other mail (not addressed to a department)", address: "", purpose: "", respondWithin: "" };
export type MailKind = "web" | "email";
export interface MailUser { userId: string; role: string }
const SEND_LIMIT_PER_HOUR = 40;

export interface MailListItem { kind: MailKind; id: string; department: string; fromName: string; fromEmail: string; subject: string; preview: string; status: string; at: string; ref?: string; starred: boolean; /** inbox | spam | trash */ folder: string }
export type Folder = "inbox" | "spam" | "trash";
export interface DraftItem { id: string; department: string; to: string; subject: string; body: string; replyKind: MailKind | null; replyId: string | null; attachments: FileInfo[]; updatedAt: string }
export interface MailDetail extends MailListItem { /** Earlier messages in the same conversation (same sender, same subject). */ thread: { kind: MailKind; id: string; subject: string; preview: string; at: string }[]; /** This person's unsent reply to the message, if they started one. */ draft: DraftItem | null; text: string; /** The HTML of an incoming email, as received (untrusted: the website cleans it and shows it in a sandbox). */ html: string | null; attachments: FileInfo[]; replies: { id: string; to: string; subject: string; body: string; status: string; by: string; at: string; attachments: FileInfo[] }[] }
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

  const webItem = (r: Record<string, unknown>): MailListItem => ({ kind: "web", id: String(r.id), department: String(r.department), fromName: String(r.name), fromEmail: String(r.email), subject: String(r.subject), preview: String(r.message).slice(0, 160), status: String(r.status), at: new Date(String(r.created_at)).toISOString(), ref: String(r.ref), starred: false, folder: "inbox" });
  const emailText = (r: Record<string, unknown>) => (r.text_body ? String(r.text_body) : r.html_body ? stripHtml(String(r.html_body)) : "");
  const emailItem = (r: Record<string, unknown>): MailListItem => { const a = parseAddress(String(r.from_addr)); return { kind: "email", id: String(r.id), department: r.department ? String(r.department) : "unrouted", fromName: a.name, fromEmail: a.email, subject: String(r.subject) || "(no subject)", preview: emailText(r).slice(0, 160), status: String(r.status ?? "open"), at: new Date(String(r.received_at)).toISOString(), starred: false, folder: "inbox" }; };

  /** Every message of the given departments (website messages and incoming email) with its text, newest first. */
  async function loadRows(keys: string[], status: string | null, sqlLimit: number): Promise<{ item: MailListItem; text: string }[]> {
    const out: { item: MailListItem; text: string }[] = [];
    const real = keys.filter((k) => k !== "unrouted");
    const st = status ? " AND status = $3" : "";
    if (real.length) {
      for (const r of (await db.query(`SELECT * FROM contact_messages WHERE department = ANY($1)${st} ORDER BY created_at DESC LIMIT $2`, status ? [real, sqlLimit, status] : [real, sqlLimit])).rows) out.push({ item: webItem(r), text: String(r.message) });
      for (const r of (await db.query(`SELECT * FROM inbound_emails WHERE department = ANY($1)${st} ORDER BY received_at DESC LIMIT $2`, status ? [real, sqlLimit, status] : [real, sqlLimit])).rows) out.push({ item: emailItem(r), text: emailText(r) });
    }
    if (keys.includes("unrouted")) for (const r of (await db.query(`SELECT * FROM inbound_emails WHERE department IS NULL${status ? " AND status = $2" : ""} ORDER BY received_at DESC LIMIT $1`, status ? [sqlLimit, status] : [sqlLimit])).rows) out.push({ item: emailItem(r), text: emailText(r) });
    const flags = await flagMap(out.map((o) => o.item));
    for (const o of out) { const f = flags.get(`${o.item.kind}:${o.item.id}`); if (f) { o.item.folder = f.folder; o.item.starred = f.starred; } }
    return out.sort((x, y) => y.item.at.localeCompare(x.item.at));
  }

  async function flagMap(items: { kind: string; id: string }[]): Promise<Map<string, { folder: string; starred: boolean }>> {
    const m = new Map<string, { folder: string; starred: boolean }>();
    if (!items.length) return m;
    const rows = (await db.query(`SELECT kind, message_id, folder, starred FROM mail_flags WHERE message_id = ANY($1)`, [items.map((i) => i.id)])).rows;
    for (const r of rows) m.set(`${r.kind}:${r.message_id}`, { folder: String(r.folder), starred: r.starred === true || r.starred === "t" });
    return m;
  }

  async function unread(user: MailUser) {
    const out: { key: string; name: string; address: string; open: number; drafts: number }[] = [];
    for (const d of await departmentsFor(user)) {
      const rows = await loadRows([d.key], "open", 1000);
      const drafts = d.key === "unrouted" ? 0 : Number((await db.query(`SELECT COUNT(*) AS n FROM mail_drafts WHERE user_id = $1 AND department = $2`, [user.userId, d.key])).rows[0].n);
      out.push({ key: d.key, name: d.name, address: d.address, open: rows.filter((r) => r.item.folder === "inbox").length, drafts });
    }
    return out;
  }

  const BOXES = ["inbox", "starred", "spam", "trash", "sent", "all"];

  /** box: inbox | starred | spam | trash | sent | all (everything but spam and trash: what a search looks through). q: a search, see mailSearch.ts. */
  async function list(user: MailUser, f: { department?: string; box?: string; status?: string; q?: string; limit?: number } = {}): Promise<MailResult<MailListItem[]>> {
    const allowed = await departmentsFor(user);
    const keys = f.department ? [f.department] : allowed.map((d) => d.key);
    if (f.department && !(await canUse(user, f.department))) return bad(403, "You do not manage this department's mail");
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 300);
    const status = f.status && ["open", "answered", "closed"].includes(f.status) ? f.status : null;
    const box = BOXES.includes(f.box ?? "") ? f.box! : "inbox";
    const search = parseSearch(typeof f.q === "string" ? f.q : ""), searching = !isEmptySearch(search);
    if (box === "sent") {
      const rows = keys.length ? (await db.query(`SELECT * FROM mail_outbound WHERE department = ANY($1) ORDER BY created_at DESC LIMIT $2`, [keys, searching ? 1000 : limit])).rows : [];
      const items = rows.map((r: Record<string, unknown>) => ({ item: { kind: (r.reply_kind ?? "email") as MailKind, id: String(r.id), department: String(r.department), fromName: String(r.sent_by_name), fromEmail: String(r.to_addr), subject: String(r.subject), preview: String(r.body).slice(0, 160), status: String(r.status), at: new Date(String(r.created_at)).toISOString(), starred: false, folder: "inbox" } as MailListItem, body: String(r.body) }));
      const kept = searching ? items.filter((x) => matchesSearch(search, { fromName: x.item.fromName, fromEmail: x.item.fromEmail, subject: x.item.subject, text: x.body, at: x.item.at, status: x.item.status, starred: false, kind: x.item.kind, hasAttachment: false }, x.item.fromEmail)) : items;
      return { ok: true, value: kept.map((x) => x.item).slice(0, limit) };
    }
    const rows = await loadRows(keys, box === "inbox" ? status : null, Math.min(limit * 4, 1200));
    const inBox = rows.filter(({ item }) => box === "inbox" ? item.folder === "inbox" : box === "starred" ? item.starred && item.folder === "inbox" : box === "all" ? item.folder === "inbox" : item.folder === box);
    let kept = inBox;
    if (searching) {
      const emailIds = inBox.filter((r) => r.item.kind === "email").map((r) => r.item.id);
      const withFiles = new Set<string>();
      if (search.hasAttachment && emailIds.length) for (const r of (await db.query(`SELECT DISTINCT email_id FROM mail_files WHERE kind = 'inbound' AND email_id = ANY($1)`, [emailIds])).rows) withFiles.add(String(r.email_id));
      kept = inBox.filter((r) => matchesSearch(search, { fromName: r.item.fromName, fromEmail: r.item.fromEmail, subject: r.item.subject, text: r.text.slice(0, 5000), at: r.item.at, status: r.item.status, starred: r.item.starred, kind: r.item.kind, hasAttachment: withFiles.has(r.item.id) }));
    }
    return { ok: true, value: kept.map((r) => r.item).slice(0, limit) };
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
    const flag = (await flagMap([{ kind, id }])).get(`${kind}:${id}`);
    const norm = normalizeSubject(m.item.subject);
    const thread = kind === "email" ? (await db.query(m.item.department === "unrouted" ? `SELECT * FROM inbound_emails WHERE department IS NULL ORDER BY received_at DESC LIMIT 200` : `SELECT * FROM inbound_emails WHERE department = $1 ORDER BY received_at DESC LIMIT 200`, m.item.department === "unrouted" ? [] : [m.item.department])).rows
      .filter((r: Record<string, unknown>) => String(r.id) !== id && parseAddress(String(r.from_addr)).email === m.item.fromEmail && normalizeSubject(String(r.subject)) === norm)
      .slice(0, 10).map((r: Record<string, unknown>) => ({ kind: "email" as MailKind, id: String(r.id), subject: String(r.subject) || "(no subject)", preview: emailText(r).slice(0, 160), at: new Date(String(r.received_at)).toISOString() })) : [];
    const draftRow = (await db.query(`SELECT * FROM mail_drafts WHERE user_id = $1 AND reply_kind = $2 AND reply_id = $3`, [user.userId, kind, id])).rows[0];
    const draft = draftRow ? await draftItem(user.userId, draftRow) : null;
    const htmlRow = kind === "email" ? (await db.query(`SELECT html_body FROM inbound_emails WHERE id = $1`, [id])).rows[0] : null;
    const html = htmlRow?.html_body ? String(htmlRow.html_body).slice(0, 300_000) : null;
    return { ok: true, value: { ...m.item, starred: flag?.starred ?? false, folder: flag?.folder ?? "inbox", thread, draft, text: m.text.slice(0, 20000), html, attachments, replies } };
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
  async function send(user: MailUser, username: string, a: { department: string; to: string; subject: string; body: string; replyKind?: MailKind; replyId?: string; attachmentIds?: unknown; draftId?: unknown }): Promise<MailResult<{ id: string }>> {
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
    if (typeof a.draftId === "string" && /^[0-9a-f-]{36}$/i.test(a.draftId)) await db.query(`DELETE FROM mail_drafts WHERE id = $1 AND user_id = $2`, [a.draftId, user.userId]);
    if (a.replyKind && a.replyId) await db.query(`DELETE FROM mail_drafts WHERE user_id = $1 AND reply_kind = $2 AND reply_id = $3`, [user.userId, a.replyKind, a.replyId]);
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

  // ── Folders, stars, blocked senders ────────────────────────────────────────

  async function setFlags(user: MailUser, kind: string, id: string, change: { folder?: Folder; starred?: boolean }, blockSender = false): Promise<MailResult<{ folder: string; starred: boolean }>> {
    if (change.folder !== undefined && !["inbox", "spam", "trash"].includes(change.folder)) return bad(400, "Choose inbox, spam or trash");
    const m = await load(kind, id);
    if (!m) return bad(404, "No such message");
    if (!(await canUse(user, m.item.department))) return bad(403, "You do not manage this department's mail");
    const cur = (await flagMap([{ kind, id }])).get(`${kind}:${id}`) ?? { folder: "inbox", starred: false };
    const next = { folder: change.folder ?? cur.folder, starred: change.starred ?? cur.starred };
    const exists = (await db.query(`SELECT 1 AS x FROM mail_flags WHERE kind = $1 AND message_id = $2`, [kind, id])).rows.length > 0;
    if (exists) await db.query(`UPDATE mail_flags SET folder = $3, starred = $4, updated_by = $5, updated_at = $6 WHERE kind = $1 AND message_id = $2`, [kind, id, next.folder, next.starred, user.userId, now()]);
    else await db.query(`INSERT INTO mail_flags (kind, message_id, folder, starred, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`, [kind, id, next.folder, next.starred, user.userId, now()]);
    const sender = m.item.fromEmail.toLowerCase(), dept = m.item.department;
    if (change.folder === "spam" && blockSender && dept !== "unrouted" && EMAIL.test(sender)) {
      if (!(await db.query(`SELECT 1 AS x FROM mail_blocked_senders WHERE department = $1 AND email = $2`, [dept, sender])).rows.length) await db.query(`INSERT INTO mail_blocked_senders (department, email, blocked_by, created_at) VALUES ($1,$2,$3,$4)`, [dept, sender, user.userId, now()]);
      for (const r of (await loadRows([dept], null, 1000))) if (r.item.fromEmail.toLowerCase() === sender && r.item.folder === "inbox" && !(r.item.kind === kind && r.item.id === id)) await setFlagsQuiet(r.item.kind, r.item.id, "spam", user.userId);
    }
    if (change.folder === "inbox" && cur.folder === "spam" && dept !== "unrouted") await db.query(`DELETE FROM mail_blocked_senders WHERE department = $1 AND email = $2`, [dept, sender]);          // "not spam" also lifts the block
    return { ok: true, value: next };
  }
  async function setFlagsQuiet(kind: string, id: string, folder: Folder, by: string | null) {
    const exists = (await db.query(`SELECT 1 AS x FROM mail_flags WHERE kind = $1 AND message_id = $2`, [kind, id])).rows.length > 0;
    if (exists) await db.query(`UPDATE mail_flags SET folder = $3, updated_by = $4, updated_at = $5 WHERE kind = $1 AND message_id = $2`, [kind, id, folder, by, now()]);
    else await db.query(`INSERT INTO mail_flags (kind, message_id, folder, starred, updated_by, updated_at) VALUES ($1,$2,$3,false,$4,$5)`, [kind, id, folder, by, now()]);
  }
  const setFolder = (user: MailUser, kind: string, id: string, folder: unknown, blockSender = false) => setFlags(user, kind, id, { folder: folder as Folder }, blockSender);
  const setStar = (user: MailUser, kind: string, id: string, starred: unknown) => setFlags(user, kind, id, { starred: starred === true });

  /** Called when an email has just been stored: mail from a blocked sender goes straight to Spam. */
  async function fileNewEmail(emailId: string): Promise<void> {
    const r = (await db.query(`SELECT from_addr, department FROM inbound_emails WHERE id = $1`, [emailId])).rows[0];
    if (!r?.department) return;
    const blocked = (await db.query(`SELECT 1 AS x FROM mail_blocked_senders WHERE department = $1 AND email = $2`, [String(r.department), parseAddress(String(r.from_addr)).email])).rows.length > 0;
    if (blocked) await setFlagsQuiet("email", emailId, "spam", null);
  }

  // ── Drafts ─────────────────────────────────────────────────────────────────

  async function draftItem(userId: string, r: Record<string, unknown>): Promise<DraftItem> {
    return { id: String(r.id), department: String(r.department), to: String(r.to_addr), subject: String(r.subject), body: String(r.body), replyKind: (r.reply_kind ?? null) as MailKind | null, replyId: r.reply_id ? String(r.reply_id) : null, attachments: await files.staged(userId, r.attachment_ids), updatedAt: new Date(String(r.updated_at)).toISOString() };
  }

  /** Saves a draft (a new one, or the one named by id). Saving an empty draft throws it away. Called as the person types. */
  async function saveDraft(user: MailUser, a: { id?: unknown; department?: unknown; to?: unknown; subject?: unknown; body?: unknown; replyKind?: unknown; replyId?: unknown; attachmentIds?: unknown }): Promise<MailResult<{ id: string | null }>> {
    const dept = departmentByKey(String(a.department ?? ""));
    if (!dept) return bad(400, "Choose a department");
    if (!(await canUse(user, dept.key))) return bad(403, "You do not manage this department's mail");
    const to = oneLine(a.to, 254), subject = oneLine(a.subject, 200), body = typeof a.body === "string" ? a.body.replace(/\u0000/g, "").slice(0, 20000) : "";
    const ids = Array.isArray(a.attachmentIds) ? [...new Set((a.attachmentIds as unknown[]).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 5) : [];
    const replyKind = a.replyKind === "web" || a.replyKind === "email" ? a.replyKind : null, replyId = typeof a.replyId === "string" && /^[0-9a-f-]{36}$/i.test(a.replyId) ? a.replyId : null;
    if ((replyKind === null) !== (replyId === null)) return bad(400, "A reply draft needs the message it answers");
    if (replyKind && replyId) { const m = await load(replyKind, replyId); if (!m || m.item.department !== dept.key) return bad(404, "No such message"); }
    const existing = typeof a.id === "string" && /^[0-9a-f-]{36}$/i.test(a.id) ? (await db.query(`SELECT id FROM mail_drafts WHERE id = $1 AND user_id = $2`, [a.id, user.userId])).rows[0]
      : replyId ? (await db.query(`SELECT id FROM mail_drafts WHERE user_id = $1 AND reply_kind = $2 AND reply_id = $3`, [user.userId, replyKind, replyId])).rows[0] : undefined;
    const blank = !to && !subject && !body.trim() && !ids.length;
    if (blank) { if (existing) await db.query(`DELETE FROM mail_drafts WHERE id = $1`, [existing.id]); return { ok: true, value: { id: null } }; }
    if (existing) { await db.query(`UPDATE mail_drafts SET department = $2, to_addr = $3, subject = $4, body = $5, attachment_ids = $6, updated_at = $7 WHERE id = $1`, [existing.id, dept.key, to, subject, body, ids, now()]); return { ok: true, value: { id: String(existing.id) } }; }
    const mine = Number((await db.query(`SELECT COUNT(*) AS n FROM mail_drafts WHERE user_id = $1`, [user.userId])).rows[0].n);
    if (mine >= 100) return bad(429, "You have a lot of drafts. Send or delete some first.");
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO mail_drafts (id, user_id, department, to_addr, subject, body, reply_kind, reply_id, attachment_ids, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, user.userId, dept.key, to, subject, body, replyKind, replyId, ids, now()]);
    return { ok: true, value: { id } };
  }

  async function listDrafts(user: MailUser, department: string): Promise<MailResult<DraftItem[]>> {
    if (!(await canUse(user, department))) return bad(403, "You do not manage this department's mail");
    const rows = (await db.query(`SELECT * FROM mail_drafts WHERE user_id = $1 AND department = $2 ORDER BY updated_at DESC LIMIT 100`, [user.userId, department])).rows;
    return { ok: true, value: await Promise.all(rows.map((r: Record<string, unknown>) => draftItem(user.userId, r))) };
  }

  async function getDraft(user: MailUser, id: string): Promise<MailResult<DraftItem>> {
    const r = (await db.query(`SELECT * FROM mail_drafts WHERE id = $1 AND user_id = $2`, [id, user.userId])).rows[0];
    return r ? { ok: true, value: await draftItem(user.userId, r) } : bad(404, "No such draft");
  }

  async function deleteDraft(user: MailUser, id: string): Promise<boolean> {
    const r = await db.query(`DELETE FROM mail_drafts WHERE id = $1 AND user_id = $2 RETURNING id`, [id, user.userId]);
    return r.rows.length > 0;
  }

  /** A file a person is allowed to download: one on a message of a department they manage. */
  async function openFile(user: MailUser, fileId: string): Promise<FileResult<StoredFile>> {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return bad(400, "Invalid file");
    const m = await files.meta(fileId);
    if (!m || !m.department || m.row.kind === "upload") return bad(404, "No such file");
    if (!(await canUse(user, m.department))) return bad(403, "You do not manage this department's mail");
    return files.read(fileId);
  }

  return { departmentsFor, unread, list, get, setStatus, send, reply, openFile, files, setFolder, setStar, fileNewEmail, saveDraft, listDrafts, getDraft, deleteDraft };
}
export type MailService = ReturnType<typeof createMailService>;
