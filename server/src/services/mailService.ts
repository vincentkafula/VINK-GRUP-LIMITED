import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";
import type { EmailSender } from "../auth/email.js";
import { DEPARTMENTS, SECTION_ALIASES, departmentByKey, type Department } from "../config/departments.js";
import { parseSearch, matchesSearch, isEmptySearch, normalizeSubject } from "./mailSearch.js";
import { createMailFiles, ATTACH_LIMIT_BYTES, LINK_DAYS, prettySize, type MailFiles, type FileInfo, type FileResult, type StoredFile } from "./mailFiles.js";
import { cleanOutgoingHtml, htmlToText, textToHtml } from "./mailHtml.js";
import { renderSignature, safePhone, safeUrl, signatureConfigFromEnv, type SignatureConfig } from "./mailSignature.js";
import { scoreSpam } from "./mailSpam.js";

/**
 * Department mail for staff: read what was sent to a department (website messages and incoming email), reply from the department's own address, write new
 * emails from it, and keep the mailbox tidy: folders (Inbox, Spam, Trash), stars, labels, snooze, drafts, scheduled send, filters, an out-of-office reply,
 * reusable templates and a signature.
 *
 * Who sees what:
 *  - an owner or superadmin sees EVERY department (and email that was addressed to none of them);
 *  - anyone else sees only the departments they have been approved to manage. That is the same approval as for the management panel's sections
 *    (section_permissions): a department manager is created when their application to manage the department, or their job application for it, is approved.
 *    The section name is the department's name, for example "Sales".
 *
 * Everything a person sends is stored (mail_outbound) with who sent it, is limited to 40 an hour per person, and goes out from the department's address with the
 * department's address as the reply address, so answers come back into the department's mailbox, followed by the sender's signature (the VINK design, see
 * mailSignature.ts). What staff write in the rich-text editor is cleaned on the server (mailHtml.ts) before it is stored or sent. Message text is returned as plain
 * text, and the HTML of an incoming email is returned separately as untrusted: the website cleans it (DOMPurify) and shows it in a sandboxed frame with remote
 * pictures blocked.
 */
export const UNROUTED = { key: "unrouted", name: "Other mail (not addressed to a department)", address: "", purpose: "", respondWithin: "" };
export type MailKind = "web" | "email";
export interface MailUser { userId: string; role: string }
const SEND_LIMIT_PER_HOUR = 40;
const MAX_SCHEDULE_DAYS = 6;                      // staged files are kept for 7 days; scheduling refreshes them
const AUTOREPLY_EVERY_DAYS = 4;

export interface LabelItem { id: string; name: string; color: string }
export interface MailListItem {
  kind: MailKind; id: string; department: string; fromName: string; fromEmail: string; subject: string; preview: string; status: string; at: string; ref?: string; starred: boolean;
  /** inbox | spam | trash */ folder: string; /** Hidden from the inbox until this time. */ snoozedUntil: string | null; labels: LabelItem[]; /** Why the system or a person put it in Spam. */ spamReason: string | null;
}
export type Folder = "inbox" | "spam" | "trash";
export interface DraftItem { id: string; department: string; to: string; subject: string; body: string; bodyHtml: string | null; replyKind: MailKind | null; replyId: string | null; attachments: FileInfo[]; updatedAt: string }
export interface MailDetail extends MailListItem {
  /** Earlier messages in the same conversation (same sender, same subject). */ thread: { kind: MailKind; id: string; subject: string; preview: string; at: string }[];
  /** This person's unsent reply to the message, if they started one. */ draft: DraftItem | null; text: string;
  /** The HTML of an incoming email, as received (untrusted: the website cleans it and shows it in a sandbox). */ html: string | null; attachments: FileInfo[];
  replies: { id: string; to: string; subject: string; body: string; bodyHtml: string | null; status: string; by: string; at: string; attachments: FileInfo[] }[];
}
export type MailResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const isSuper = (role: string) => role === "owner" || role === "superadmin";
const bad = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const stripHtml = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").trim();
const EMAIL = /^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]{2,}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const truthy = (v: unknown) => v === true || v === "t" || v === "true";
const iso = (v: unknown) => new Date(String(v)).toISOString();
const NO_AUTOREPLY = /(^|[._-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|newsletter|auto-?reply)([._-]|@)/i;

/** "Name <addr>" or "addr" -> { name, email } */
export function parseAddress(raw: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  const email = (m ? m[2] : raw).trim().toLowerCase();
  return { name: (m ? m[1].trim() : "") || email, email };
}

export interface SigRow { name: string; title: string; phone: string; photoUrl: string; enabled: boolean }
export interface TemplateItem { id: string; department: string; name: string; subject: string; bodyHtml: string }
export interface FilterItem { id: string; department: string; name: string; from: string; subject: string; words: string; hasAttachment: boolean; label: LabelItem | null; star: boolean; folder: "spam" | "trash" | null; close: boolean; active: boolean }
export interface AutoreplyItem { department: string; enabled: boolean; subject: string; body: string; startOn: string | null; endOn: string | null }
export interface ScheduledItem { id: string; department: string; to: string; subject: string; preview: string; sendAt: string; status: string; error: string | null; by: string; replyKind: MailKind | null; replyId: string | null; attachments: number }
export interface Flag { folder: string; starred: boolean; snoozeUntil: string | null; reason: string | null }

export interface OutgoingMail { department: string; to: string; subject: string; body: string; bodyHtml?: unknown; replyKind?: MailKind; replyId?: string; attachmentIds?: unknown; draftId?: unknown }

export function createMailService(deps: {
  db: Db; mail: EmailSender; now?: () => Date; files?: MailFiles;
  /** Up to this many bytes of files are attached; more goes as links (default 15 MB). */ attachLimitBytes?: number;
  /** Where the public download links point (the API's own address). */ publicApiUrl?: string; signatureConfig?: SignatureConfig;
}) {
  const { db, mail } = deps;
  const now = deps.now ?? (() => new Date());
  const files = deps.files ?? createMailFiles({ db, now });
  const attachLimit = deps.attachLimitBytes ?? ATTACH_LIMIT_BYTES;
  const apiUrl = (deps.publicApiUrl ?? process.env.PUBLIC_API_URL ?? "https://api.vink.co.za").replace(/\/+$/, "");
  const sigConfig = deps.signatureConfig ?? signatureConfigFromEnv();

  /** The departments this person may use. */
  async function departmentsFor(user: MailUser): Promise<(Department | typeof UNROUTED)[]> {
    if (isSuper(user.role)) return [...DEPARTMENTS, UNROUTED];
    const rows = (await db.query(`SELECT section FROM section_permissions WHERE user_id = $1`, [user.userId])).rows;
    const names = new Set(rows.map((r: Record<string, unknown>) => String(r.section)));
    const viaAlias = new Set([...names].map((n) => SECTION_ALIASES[n]).filter(Boolean));
    return DEPARTMENTS.filter((d) => names.has(d.name) || viaAlias.has(d.key));
  }
  const canUse = async (user: MailUser, key: string) => (await departmentsFor(user)).some((d) => d.key === key);
  /** A real department (not "unrouted") that this person may use, or the refusal to give. */
  async function realDept(user: MailUser, key: unknown): Promise<{ ok: true; dept: Department } | { ok: false; status: number; error: string }> {
    const dept = departmentByKey(String(key ?? ""));
    if (!dept) return bad(400, "Choose a department");
    if (!(await canUse(user, dept.key))) return bad(403, "You do not manage this department's mail");
    return { ok: true, dept };
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  const webItem = (r: Record<string, unknown>): MailListItem => ({ kind: "web", id: String(r.id), department: String(r.department), fromName: String(r.name), fromEmail: String(r.email), subject: String(r.subject), preview: String(r.message).slice(0, 160), status: String(r.status), at: iso(r.created_at), ref: String(r.ref), starred: false, folder: "inbox", snoozedUntil: null, labels: [], spamReason: null });
  const emailText = (r: Record<string, unknown>) => (r.text_body ? String(r.text_body) : r.html_body ? stripHtml(String(r.html_body)) : "");
  const emailItem = (r: Record<string, unknown>): MailListItem => { const a = parseAddress(String(r.from_addr)); return { kind: "email", id: String(r.id), department: r.department ? String(r.department) : "unrouted", fromName: a.name, fromEmail: a.email, subject: String(r.subject) || "(no subject)", preview: emailText(r).slice(0, 160), status: String(r.status ?? "open"), at: iso(r.received_at), starred: false, folder: "inbox", snoozedUntil: null, labels: [], spamReason: null }; };

  async function flagMap(items: { kind: string; id: string }[]): Promise<Map<string, Flag>> {
    const m = new Map<string, Flag>();
    if (!items.length) return m;
    for (const r of (await db.query(`SELECT kind, message_id, folder, starred, snooze_until, reason FROM mail_flags WHERE message_id = ANY($1)`, [items.map((i) => i.id)])).rows)
      m.set(`${r.kind}:${r.message_id}`, { folder: String(r.folder), starred: truthy(r.starred), snoozeUntil: r.snooze_until ? iso(r.snooze_until) : null, reason: r.reason ? String(r.reason) : null });
    return m;
  }
  async function labelMap(items: { kind: string; id: string }[]): Promise<Map<string, LabelItem[]>> {
    const m = new Map<string, LabelItem[]>();
    if (!items.length) return m;
    for (const r of (await db.query(`SELECT ml.kind, ml.message_id, l.id, l.name, l.color FROM mail_message_labels ml JOIN mail_labels l ON l.id = ml.label_id WHERE ml.message_id = ANY($1) ORDER BY l.name`, [items.map((i) => i.id)])).rows) {
      const k = `${r.kind}:${r.message_id}`; (m.get(k) ?? m.set(k, []).get(k)!).push({ id: String(r.id), name: String(r.name), color: String(r.color) });
    }
    return m;
  }
  const isSnoozed = (i: MailListItem) => !!i.snoozedUntil && new Date(i.snoozedUntil).getTime() > now().getTime();

  /** Snoozed messages whose time has come go back to the inbox as open. */
  async function wakeSnoozed(): Promise<void> {
    const due = (await db.query(`SELECT kind, message_id FROM mail_flags WHERE snooze_until IS NOT NULL AND snooze_until <= $1`, [now()])).rows;
    for (const r of due) {
      await db.query(`UPDATE mail_flags SET snooze_until = NULL WHERE kind = $1 AND message_id = $2`, [r.kind, r.message_id]);
      await db.query(r.kind === "web" ? `UPDATE contact_messages SET status = 'open' WHERE id = $1` : `UPDATE inbound_emails SET status = 'open' WHERE id = $1`, [r.message_id]);
    }
  }

  /** Every message of the given departments (website messages and incoming email) with its text, newest first, with its flags and labels. */
  async function loadRows(keys: string[], status: string | null, sqlLimit: number): Promise<{ item: MailListItem; text: string }[]> {
    const out: { item: MailListItem; text: string }[] = [];
    const real = keys.filter((k) => k !== "unrouted");
    const st = status ? " AND status = $3" : "";
    if (real.length) {
      for (const r of (await db.query(`SELECT * FROM contact_messages WHERE department = ANY($1)${st} ORDER BY created_at DESC LIMIT $2`, status ? [real, sqlLimit, status] : [real, sqlLimit])).rows) out.push({ item: webItem(r), text: String(r.message) });
      for (const r of (await db.query(`SELECT * FROM inbound_emails WHERE department = ANY($1)${st} ORDER BY received_at DESC LIMIT $2`, status ? [real, sqlLimit, status] : [real, sqlLimit])).rows) out.push({ item: emailItem(r), text: emailText(r) });
    }
    if (keys.includes("unrouted")) for (const r of (await db.query(`SELECT * FROM inbound_emails WHERE department IS NULL${status ? " AND status = $2" : ""} ORDER BY received_at DESC LIMIT $1`, status ? [sqlLimit, status] : [sqlLimit])).rows) out.push({ item: emailItem(r), text: emailText(r) });
    const refs = out.map((o) => o.item), flags = await flagMap(refs), labels = await labelMap(refs);
    for (const o of out) {
      const f = flags.get(`${o.item.kind}:${o.item.id}`);
      if (f) { o.item.folder = f.folder; o.item.starred = f.starred; o.item.snoozedUntil = f.snoozeUntil; o.item.spamReason = f.folder === "spam" ? f.reason : null; }
      o.item.labels = labels.get(`${o.item.kind}:${o.item.id}`) ?? [];
    }
    return out.sort((x, y) => y.item.at.localeCompare(x.item.at));
  }

  async function unread(user: MailUser) {
    await wakeSnoozed();
    const out: { key: string; name: string; address: string; open: number; drafts: number; scheduled: number }[] = [];
    for (const d of await departmentsFor(user)) {
      const rows = await loadRows([d.key], "open", 1000);
      const real = d.key !== "unrouted";
      const drafts = real ? Number((await db.query(`SELECT COUNT(*) AS n FROM mail_drafts WHERE user_id = $1 AND department = $2`, [user.userId, d.key])).rows[0].n) : 0;
      const scheduled = real ? Number((await db.query(`SELECT COUNT(*) AS n FROM mail_scheduled WHERE department = $1 AND status IN ('pending','sending','failed')`, [d.key])).rows[0].n) : 0;
      out.push({ key: d.key, name: d.name, address: d.address, open: rows.filter((r) => r.item.folder === "inbox" && !isSnoozed(r.item)).length, drafts, scheduled });
    }
    return out;
  }

  const BOXES = ["inbox", "starred", "snoozed", "spam", "trash", "sent", "all"];

  /** box: inbox | starred | snoozed | spam | trash | sent | all (everything but spam, trash and snoozed: what a search looks through). q: a search, see mailSearch.ts. label: only messages with this label. */
  async function list(user: MailUser, f: { department?: string; box?: string; status?: string; q?: string; label?: string; limit?: number } = {}): Promise<MailResult<MailListItem[]>> {
    await wakeSnoozed();
    const allowed = await departmentsFor(user);
    const keys = f.department ? [f.department] : allowed.map((d) => d.key);
    if (f.department && !(await canUse(user, f.department))) return bad(403, "You do not manage this department's mail");
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 300);
    const status = f.status && ["open", "answered", "closed"].includes(f.status) ? f.status : null;
    const box = BOXES.includes(f.box ?? "") ? f.box! : "inbox";
    const search = parseSearch(typeof f.q === "string" ? f.q : ""), searching = !isEmptySearch(search);
    if (box === "sent") {
      const rows = keys.length ? (await db.query(`SELECT * FROM mail_outbound WHERE department = ANY($1) ORDER BY created_at DESC LIMIT $2`, [keys, searching ? 1000 : limit])).rows : [];
      const items = rows.map((r: Record<string, unknown>) => ({ item: { kind: (r.reply_kind ?? "email") as MailKind, id: String(r.id), department: String(r.department), fromName: String(r.sent_by_name), fromEmail: String(r.to_addr), subject: String(r.subject), preview: String(r.body).slice(0, 160), status: String(r.status), at: iso(r.created_at), starred: false, folder: "inbox", snoozedUntil: null, labels: [], spamReason: null } as MailListItem, body: String(r.body) }));
      const kept = searching ? items.filter((x) => matchesSearch(search, { fromName: x.item.fromName, fromEmail: x.item.fromEmail, subject: x.item.subject, text: x.body, at: x.item.at, status: x.item.status, starred: false, kind: x.item.kind, hasAttachment: false, labels: [] }, x.item.fromEmail)) : items;
      return { ok: true, value: kept.map((x) => x.item).slice(0, limit) };
    }
    const rows = await loadRows(keys, box === "inbox" ? status : null, Math.min(limit * 4, 1200));
    const live = (i: MailListItem) => i.folder === "inbox" && !isSnoozed(i);
    const inBox = rows.filter(({ item }) => box === "inbox" ? live(item) : box === "starred" ? item.starred && live(item) : box === "snoozed" ? item.folder === "inbox" && isSnoozed(item) : box === "all" ? live(item) : item.folder === box)
      .filter(({ item }) => !f.label || item.labels.some((l) => l.id === f.label));
    let kept = inBox;
    if (searching) {
      const emailIds = inBox.filter((r) => r.item.kind === "email").map((r) => r.item.id);
      const withFiles = new Set<string>();
      if (search.hasAttachment && emailIds.length) for (const r of (await db.query(`SELECT DISTINCT email_id FROM mail_files WHERE kind = 'inbound' AND email_id = ANY($1)`, [emailIds])).rows) withFiles.add(String(r.email_id));
      kept = inBox.filter((r) => matchesSearch(search, { fromName: r.item.fromName, fromEmail: r.item.fromEmail, subject: r.item.subject, text: r.text.slice(0, 5000), at: r.item.at, status: r.item.status, starred: r.item.starred, kind: r.item.kind, hasAttachment: withFiles.has(r.item.id), labels: r.item.labels.map((l) => l.name) }));
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
    const replies = await Promise.all(replyRows.map(async (r: Record<string, unknown>) => ({ id: String(r.id), to: String(r.to_addr), subject: String(r.subject), body: String(r.body), bodyHtml: r.body_html ? String(r.body_html) : null, status: String(r.status), by: String(r.sent_by_name), at: iso(r.created_at), attachments: await files.forEmail("outbound", String(r.id)) })));
    const attachments = kind === "email" ? await files.forEmail("inbound", id) : [];
    const flag = (await flagMap([{ kind, id }])).get(`${kind}:${id}`);
    const labels = (await labelMap([{ kind, id }])).get(`${kind}:${id}`) ?? [];
    const norm = normalizeSubject(m.item.subject);
    const thread = kind === "email" ? (await db.query(m.item.department === "unrouted" ? `SELECT * FROM inbound_emails WHERE department IS NULL ORDER BY received_at DESC LIMIT 200` : `SELECT * FROM inbound_emails WHERE department = $1 ORDER BY received_at DESC LIMIT 200`, m.item.department === "unrouted" ? [] : [m.item.department])).rows
      .filter((r: Record<string, unknown>) => String(r.id) !== id && parseAddress(String(r.from_addr)).email === m.item.fromEmail && normalizeSubject(String(r.subject)) === norm)
      .slice(0, 10).map((r: Record<string, unknown>) => ({ kind: "email" as MailKind, id: String(r.id), subject: String(r.subject) || "(no subject)", preview: emailText(r).slice(0, 160), at: iso(r.received_at) })) : [];
    const draftRow = (await db.query(`SELECT * FROM mail_drafts WHERE user_id = $1 AND reply_kind = $2 AND reply_id = $3`, [user.userId, kind, id])).rows[0];
    const draft = draftRow ? await draftItem(user.userId, draftRow) : null;
    const htmlRow = kind === "email" ? (await db.query(`SELECT html_body FROM inbound_emails WHERE id = $1`, [id])).rows[0] : null;
    const html = htmlRow?.html_body ? String(htmlRow.html_body).slice(0, 300_000) : null;
    return { ok: true, value: { ...m.item, starred: flag?.starred ?? false, folder: flag?.folder ?? "inbox", snoozedUntil: flag?.snoozeUntil ?? null, spamReason: flag?.folder === "spam" ? flag.reason : null, labels, thread, draft, text: m.text.slice(0, 20000), html, attachments, replies } };
  }

  async function setStatus(user: MailUser, kind: string, id: string, status: unknown): Promise<MailResult<{ status: string }>> {
    if (status !== "open" && status !== "answered" && status !== "closed") return bad(400, "Choose open, answered or closed");
    const m = await load(kind, id);
    if (!m) return bad(404, "No such message");
    if (!(await canUse(user, m.item.department))) return bad(403, "You do not manage this department's mail");
    await db.query(kind === "web" ? `UPDATE contact_messages SET status = $2 WHERE id = $1` : `UPDATE inbound_emails SET status = $2 WHERE id = $1`, [id, status]);
    return { ok: true, value: { status } };
  }

  // ── Signatures ─────────────────────────────────────────────────────────────

  async function sigRow(userId: string, username: string, dept: Department): Promise<SigRow & { custom: boolean }> {
    const r = (await db.query(`SELECT * FROM mail_signatures WHERE user_id = $1 AND department = $2`, [userId, dept.key])).rows[0];
    if (r) return { name: String(r.full_name), title: String(r.title), phone: String(r.phone), photoUrl: String(r.photo_url), enabled: truthy(r.enabled), custom: true };
    const u = (await db.query(`SELECT name FROM users WHERE id = $1`, [userId])).rows[0];
    return { name: oneLine(u?.name, 80) || oneLine(username, 80) || "VINK", title: "", phone: "", photoUrl: "", enabled: true, custom: false };
  }
  const buildSignature = (s: SigRow, dept: Department) => renderSignature({ name: s.name, title: s.title, department: dept.name, phone: s.phone, email: dept.address, photoUrl: s.photoUrl, ...sigConfig });

  async function getSignature(user: MailUser, username: string, department: string): Promise<MailResult<SigRow & { custom: boolean; department: string; email: string; html: string }>> {
    const d = await realDept(user, department); if (!d.ok) return d;
    const s = await sigRow(user.userId, username, d.dept);
    return { ok: true, value: { ...s, department: d.dept.name, email: d.dept.address, html: buildSignature(s, d.dept).html } };
  }
  /** Checks what a person typed for their signature; returns the cleaned values or the reason it is refused. */
  function checkSignature(b: Record<string, unknown>): { ok: true; s: SigRow } | { ok: false; status: number; error: string } {
    const name = oneLine(b.name, 80), title = oneLine(b.title, 80), phoneRaw = oneLine(b.phone, 30), photoRaw = typeof b.photoUrl === "string" ? b.photoUrl.trim() : "";
    if (!name) return bad(400, "Write your name");
    const phone = safePhone(phoneRaw); if (phoneRaw && !phone) return bad(400, "That phone number does not look right");
    const photoUrl = photoRaw ? safeUrl(photoRaw) : ""; if (photoRaw && !photoUrl) return bad(400, "The photo must be a web address that starts with https://");
    return { ok: true, s: { name, title, phone, photoUrl, enabled: b.enabled !== false } };
  }
  async function saveSignature(user: MailUser, username: string, department: string, body: Record<string, unknown>) {
    const d = await realDept(user, department); if (!d.ok) return d;
    const c = checkSignature(body); if (!c.ok) return c;
    const exists = (await db.query(`SELECT 1 AS x FROM mail_signatures WHERE user_id = $1 AND department = $2`, [user.userId, d.dept.key])).rows.length > 0;
    if (exists) await db.query(`UPDATE mail_signatures SET full_name = $3, title = $4, phone = $5, photo_url = $6, enabled = $7, updated_at = $8 WHERE user_id = $1 AND department = $2`, [user.userId, d.dept.key, c.s.name, c.s.title, c.s.phone, c.s.photoUrl, c.s.enabled, now()]);
    else await db.query(`INSERT INTO mail_signatures (user_id, department, full_name, title, phone, photo_url, enabled, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [user.userId, d.dept.key, c.s.name, c.s.title, c.s.phone, c.s.photoUrl, c.s.enabled, now()]);
    return getSignature(user, username, department);
  }
  /** The signature as it would look with what is typed now, without saving it (the live preview). */
  async function previewSignature(user: MailUser, department: string, body: Record<string, unknown>): Promise<MailResult<{ html: string }>> {
    const d = await realDept(user, department); if (!d.ok) return d;
    const c = checkSignature(body); if (!c.ok) return c;
    return { ok: true, value: { html: buildSignature(c.s, d.dept).html } };
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  async function sentThisHour(userId: string): Promise<number> {
    return Number((await db.query(`SELECT COUNT(*) AS n FROM mail_outbound WHERE sent_by = $1 AND created_at >= $2`, [userId, new Date(now().getTime() - 3600_000)])).rows[0].n);
  }

  /** What a person wrote, checked: plain text is kept as it is; rich text is cleaned and given a plain-text version. */
  function checkBody(a: { body?: unknown; bodyHtml?: unknown }): { ok: true; body: string; html: string | null } | { ok: false; status: number; error: string } {
    const html = typeof a.bodyHtml === "string" && a.bodyHtml.trim() ? cleanOutgoingHtml(a.bodyHtml) : null;
    const body = html !== null ? htmlToText(html) : typeof a.body === "string" ? a.body.replace(/\u0000/g, "").trim() : "";
    if (body.length < 2) return bad(400, "Write the message");
    if (body.length > 20000) return bad(400, "The message is too long");
    return { ok: true, body, html };
  }
  function checkAddressing(a: { to: string; subject: string }): { ok: true; to: string; subject: string } | { ok: false; status: number; error: string } {
    const to = oneLine(a.to, 254).toLowerCase(), subject = oneLine(a.subject, 200);
    if (!EMAIL.test(to)) return bad(400, "Enter one valid email address to send to");
    if (subject.length < 2) return bad(400, "Write a subject");
    return { ok: true, to, subject };
  }

  /** Sends an email from a department and records it. */
  async function send(user: MailUser, username: string, a: OutgoingMail): Promise<MailResult<{ id: string }>> {
    const dept = departmentByKey(a.department);
    if (!dept) return bad(400, "Choose a department to send from");
    if (!(await canUse(user, dept.key))) return bad(403, "You do not manage this department's mail");
    const addr = checkAddressing(a); if (!addr.ok) return addr;
    const content = checkBody(a); if (!content.ok) return content;
    const { to, subject } = addr, { body } = content;
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
    const sigSetting = await sigRow(user.userId, username, dept);
    const sig = sigSetting.enabled ? buildSignature(sigSetting, dept) : null;
    const id = crypto.randomUUID();
    const html = `${content.html ?? textToHtml(body)}${linkHtml}${sig ? sig.html : `<p>${esc(dept.name)}<br>VINK</p>`}`;
    const text = `${body}${linkText}\n\n${sig ? sig.text : `${dept.name}\nVINK`}`;
    let error: string | null = null;
    try { await mail.send({ to, subject, text, html, from: `VINK ${dept.name} <${dept.address}>`, replyTo: dept.address, ...(list.length && !asLinks ? { attachments: list.map((f) => ({ filename: f.filename, content: f.data, contentType: f.contentType })) } : {}) }); }
    catch (e) { error = e instanceof Error ? e.message.slice(0, 200) : "send failed"; }
    await db.query(`INSERT INTO mail_outbound (id, department, to_addr, subject, body, body_html, reply_kind, reply_id, sent_by, sent_by_name, status, error, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, dept.key, to, subject, body, content.html, a.replyKind ?? null, a.replyId ?? null, user.userId, username || "staff", error ? "failed" : "sent", error, now()]);
    if (error) return bad(502, "The email could not be sent right now. Nothing was delivered; try again.");
    await files.bindSent(list, id, dept.key, links);
    if (typeof a.draftId === "string" && UUID.test(a.draftId)) await db.query(`DELETE FROM mail_drafts WHERE id = $1 AND user_id = $2`, [a.draftId, user.userId]);
    if (a.replyKind && a.replyId) await db.query(`DELETE FROM mail_drafts WHERE user_id = $1 AND reply_kind = $2 AND reply_id = $3`, [user.userId, a.replyKind, a.replyId]);
    return { ok: true, value: { id } };
  }

  /** What a reply to a message looks like: its subject, address and text (with the original quoted underneath). */
  async function composeReply(user: MailUser, kind: string, id: string, bodyIn: unknown, bodyHtmlIn: unknown): Promise<MailResult<OutgoingMail & { to: string }>> {
    const m = await load(kind, id);
    if (!m) return bad(404, "No such message");
    if (m.item.department === "unrouted") return bad(409, "This email was not sent to a department address. Write a new email from the department you choose.");
    if (!(await canUse(user, m.item.department))) return bad(403, "You do not manage this department's mail");
    const subject = /^re:/i.test(m.item.subject) ? m.item.subject : `Re: ${m.item.subject}`;
    const own = checkBody({ body: bodyIn, bodyHtml: bodyHtmlIn });
    if (!own.ok) return bad(400, "Write your reply");
    const lines = m.text.split("\n").slice(0, 25), quoted = lines.map((l) => `> ${l}`).join("\n").slice(0, 1500);
    const heading = `On ${m.item.at.slice(0, 10)}, ${m.item.fromName} wrote:`;
    return { ok: true, value: { department: m.item.department, to: m.item.fromEmail, subject: m.item.ref ? `${subject} (${m.item.ref})` : subject, body: `${own.body}\n\n---\n${heading}\n${quoted}`,
      bodyHtml: own.html !== null ? `${own.html}<hr><blockquote>${esc(heading)}<br>${esc(lines.join("\n").slice(0, 1500)).replace(/\n/g, "<br>")}</blockquote>` : undefined, replyKind: kind as MailKind, replyId: id } };
  }
  async function markAnswered(kind: string, id: string) {
    await db.query(kind === "web" ? `UPDATE contact_messages SET status = 'answered' WHERE id = $1 AND status = 'open'` : `UPDATE inbound_emails SET status = 'answered' WHERE id = $1 AND status = 'open'`, [id]);
  }

  /** Answers a message from its department's address. The message is marked answered once the email has gone. */
  async function reply(user: MailUser, username: string, kind: string, id: string, body: unknown, attachmentIds?: unknown, bodyHtml?: unknown): Promise<MailResult<{ id: string }>> {
    const c = await composeReply(user, kind, id, body, bodyHtml); if (!c.ok) return c;
    const r = await send(user, username, { ...c.value, attachmentIds });
    if (r.ok) await markAnswered(kind, id);
    return r;
  }

  // ── Scheduled send ─────────────────────────────────────────────────────────

  /** Writes an email now to be sent at sendAt (up to six days ahead). Replies (replyKind/replyId) are built the same way as an immediate reply. */
  async function schedule(user: MailUser, username: string, a: Partial<OutgoingMail> & { sendAt?: unknown; kind?: string; id?: string }): Promise<MailResult<{ id: string; sendAt: string }>> {
    const when = typeof a.sendAt === "string" ? new Date(a.sendAt) : null;
    if (!when || Number.isNaN(when.getTime())) return bad(400, "Choose when to send it");
    if (when.getTime() < now().getTime() + 60_000) return bad(400, "Choose a time at least a minute from now");
    if (when.getTime() > now().getTime() + MAX_SCHEDULE_DAYS * 86400_000) return bad(400, `An email can be scheduled up to ${MAX_SCHEDULE_DAYS} days ahead`);
    let out: OutgoingMail;
    if (a.replyKind && a.replyId) {
      const c = await composeReply(user, a.replyKind, a.replyId, a.body, a.bodyHtml); if (!c.ok) return c;
      out = c.value;
    } else {
      const d = await realDept(user, a.department); if (!d.ok) return d;
      out = { department: d.dept.key, to: String(a.to ?? ""), subject: String(a.subject ?? ""), body: String(a.body ?? ""), bodyHtml: a.bodyHtml };
    }
    const addr = checkAddressing(out); if (!addr.ok) return addr;
    const content = checkBody(out); if (!content.ok) return content;
    const claimed = await files.claim(user.userId, a.attachmentIds); if (!claimed.ok) return bad(claimed.status, claimed.error);
    const mine = Number((await db.query(`SELECT COUNT(*) AS n FROM mail_scheduled WHERE user_id = $1 AND status = 'pending'`, [user.userId])).rows[0].n);
    if (mine >= 50) return bad(429, "You have a lot of emails waiting to be sent. Cancel some first.");
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO mail_scheduled (id, user_id, sent_by_name, department, to_addr, subject, body, body_html, attachment_ids, reply_kind, reply_id, send_at, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13)`,
      [id, user.userId, username || "staff", out.department, addr.to, addr.subject, content.body, content.html, claimed.value.map((f) => f.id), out.replyKind ?? null, out.replyId ?? null, when, now()]);
    for (const f of claimed.value) await db.query(`UPDATE mail_files SET created_at = $2 WHERE id = $1`, [f.id, now()]);          // keep the files until it has gone
    if (typeof a.draftId === "string" && UUID.test(a.draftId)) await db.query(`DELETE FROM mail_drafts WHERE id = $1 AND user_id = $2`, [a.draftId, user.userId]);
    if (out.replyKind && out.replyId) await db.query(`DELETE FROM mail_drafts WHERE user_id = $1 AND reply_kind = $2 AND reply_id = $3`, [user.userId, out.replyKind, out.replyId]);
    return { ok: true, value: { id, sendAt: when.toISOString() } };
  }

  async function listScheduled(user: MailUser, department: string): Promise<MailResult<ScheduledItem[]>> {
    const d = await realDept(user, department); if (!d.ok) return d;
    const rows = (await db.query(`SELECT * FROM mail_scheduled WHERE department = $1 AND status IN ('pending','sending','failed') ORDER BY send_at LIMIT 100`, [d.dept.key])).rows;
    return { ok: true, value: rows.map((r: Record<string, unknown>) => ({ id: String(r.id), department: String(r.department), to: String(r.to_addr), subject: String(r.subject), preview: String(r.body).slice(0, 160), sendAt: iso(r.send_at), status: String(r.status), error: r.error ? String(r.error) : null, by: String(r.sent_by_name), replyKind: (r.reply_kind ?? null) as MailKind | null, replyId: r.reply_id ? String(r.reply_id) : null, attachments: Array.isArray(r.attachment_ids) ? r.attachment_ids.length : 0 })) };
  }
  async function cancelScheduled(user: MailUser, id: string): Promise<MailResult<{ cancelled: boolean }>> {
    const r = (await db.query(`SELECT department, status FROM mail_scheduled WHERE id = $1`, [id])).rows[0];
    if (!r) return bad(404, "No such scheduled email");
    if (!(await canUse(user, String(r.department)))) return bad(403, "You do not manage this department's mail");
    if (r.status !== "pending" && r.status !== "failed") return bad(409, "That email is already being sent or has been sent");
    await db.query(`UPDATE mail_scheduled SET status = 'cancelled' WHERE id = $1`, [id]);
    return { ok: true, value: { cancelled: true } };
  }

  /** Sends every scheduled email whose time has come. Called every half minute by the server; safe to call again at any time. Returns how many it sent. */
  async function sendDue(max = 20): Promise<number> {
    await db.query(`UPDATE mail_scheduled SET status = 'pending', claimed_at = NULL WHERE status = 'sending' AND claimed_at < $1`, [new Date(now().getTime() - 10 * 60_000)]);
    const due = (await db.query(`SELECT * FROM mail_scheduled WHERE status = 'pending' AND send_at <= $1 ORDER BY send_at LIMIT $2`, [now(), max])).rows;
    let sent = 0;
    for (const r of due) {
      const claim = await db.query(`UPDATE mail_scheduled SET status = 'sending', claimed_at = $2 WHERE id = $1 AND status = 'pending' RETURNING id`, [r.id, now()]);
      if (!claim.rows.length) continue;
      const u = (await db.query(`SELECT id, role FROM users WHERE id = $1`, [r.user_id])).rows[0];
      const finish = (status: string, error: string | null) => db.query(`UPDATE mail_scheduled SET status = $2, error = $3 WHERE id = $1`, [r.id, status, error]);
      if (!u) { await finish("failed", "The person who wrote it no longer has an account"); continue; }
      const res = await send({ userId: String(u.id), role: String(u.role) }, String(r.sent_by_name), { department: String(r.department), to: String(r.to_addr), subject: String(r.subject), body: String(r.body), bodyHtml: r.body_html ?? undefined, replyKind: (r.reply_kind ?? undefined) as MailKind | undefined, replyId: r.reply_id ? String(r.reply_id) : undefined, attachmentIds: r.attachment_ids });
      if (res.ok) { sent++; if (r.reply_kind && r.reply_id) await markAnswered(String(r.reply_kind), String(r.reply_id)); await finish("sent", null); }
      else if (res.status === 429) await db.query(`UPDATE mail_scheduled SET status = 'pending', claimed_at = NULL, send_at = $2 WHERE id = $1`, [r.id, new Date(now().getTime() + 15 * 60_000)]);   // over the hourly limit: try again later
      else await finish("failed", res.error);
    }
    return sent;
  }

  // ── Folders, stars, snooze, blocked senders ────────────────────────────────

  /** Writes a message's flags (folder, star, snooze, spam reason): only what is given changes. */
  async function upsertFlags(kind: string, id: string, change: { folder?: Folder; starred?: boolean; snoozeUntil?: Date | null; reason?: string | null }, by: string | null): Promise<Flag> {
    const row = (await db.query(`SELECT folder, starred, snooze_until, reason FROM mail_flags WHERE kind = $1 AND message_id = $2`, [kind, id])).rows[0];
    const folder = change.folder ?? (row ? String(row.folder) : "inbox");
    const starred = change.starred ?? (row ? truthy(row.starred) : false);
    const snooze = change.snoozeUntil !== undefined ? change.snoozeUntil : row?.snooze_until ? new Date(row.snooze_until as string) : null;
    const reason = change.reason !== undefined ? change.reason : change.folder === "inbox" ? null : row?.reason ? String(row.reason) : null;
    if (row) await db.query(`UPDATE mail_flags SET folder = $3, starred = $4, snooze_until = $5, reason = $6, updated_by = $7, updated_at = $8 WHERE kind = $1 AND message_id = $2`, [kind, id, folder, starred, snooze, reason, by, now()]);
    else await db.query(`INSERT INTO mail_flags (kind, message_id, folder, starred, snooze_until, reason, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [kind, id, folder, starred, snooze, reason, by, now()]);
    return { folder, starred, snoozeUntil: snooze ? snooze.toISOString() : null, reason };
  }

  async function setFlags(user: MailUser, kind: string, id: string, change: { folder?: Folder; starred?: boolean; snoozeUntil?: Date | null }, blockSender = false): Promise<MailResult<{ folder: string; starred: boolean; snoozedUntil: string | null }>> {
    if (change.folder !== undefined && !["inbox", "spam", "trash"].includes(change.folder)) return bad(400, "Choose inbox, spam or trash");
    const m = await load(kind, id);
    if (!m) return bad(404, "No such message");
    if (!(await canUse(user, m.item.department))) return bad(403, "You do not manage this department's mail");
    const cur = (await flagMap([{ kind, id }])).get(`${kind}:${id}`);
    const next = await upsertFlags(kind, id, { ...change, ...(change.folder === "spam" ? { reason: "Reported as spam" } : {}), ...(change.folder && change.folder !== "inbox" ? { snoozeUntil: null } : {}) }, user.userId);
    const sender = m.item.fromEmail.toLowerCase(), dept = m.item.department;
    if (change.folder === "spam" && blockSender && dept !== "unrouted" && EMAIL.test(sender)) {
      if (!(await db.query(`SELECT 1 AS x FROM mail_blocked_senders WHERE department = $1 AND email = $2`, [dept, sender])).rows.length) await db.query(`INSERT INTO mail_blocked_senders (department, email, blocked_by, created_at) VALUES ($1,$2,$3,$4)`, [dept, sender, user.userId, now()]);
      for (const r of (await loadRows([dept], null, 1000))) if (r.item.fromEmail.toLowerCase() === sender && r.item.folder === "inbox" && !(r.item.kind === kind && r.item.id === id)) await upsertFlags(r.item.kind, r.item.id, { folder: "spam", reason: "Sender was blocked" }, user.userId);
    }
    if (change.folder === "inbox" && cur?.folder === "spam" && dept !== "unrouted") await db.query(`DELETE FROM mail_blocked_senders WHERE department = $1 AND email = $2`, [dept, sender]);          // "not spam" also lifts the block
    return { ok: true, value: { folder: next.folder, starred: next.starred, snoozedUntil: next.snoozeUntil } };
  }
  const setFolder = (user: MailUser, kind: string, id: string, folder: unknown, blockSender = false) => setFlags(user, kind, id, { folder: folder as Folder }, blockSender);
  const setStar = (user: MailUser, kind: string, id: string, starred: unknown) => setFlags(user, kind, id, { starred: starred === true });
  /** until: an ISO time in the future (up to a year ahead), or null to bring it back now. */
  async function setSnooze(user: MailUser, kind: string, id: string, until: unknown) {
    if (until === null || until === undefined || until === "") return setFlags(user, kind, id, { snoozeUntil: null });
    const t = typeof until === "string" ? new Date(until) : null;
    if (!t || Number.isNaN(t.getTime())) return bad(400, "Choose when it should come back");
    if (t.getTime() <= now().getTime()) return bad(400, "Choose a time in the future");
    if (t.getTime() > now().getTime() + 366 * 86400_000) return bad(400, "Snooze for up to a year");
    return setFlags(user, kind, id, { snoozeUntil: t });
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  const tplItem = (r: Record<string, unknown>): TemplateItem => ({ id: String(r.id), department: String(r.department), name: String(r.name), subject: String(r.subject), bodyHtml: String(r.body_html) });
  async function listTemplates(user: MailUser, department: string): Promise<MailResult<TemplateItem[]>> {
    const d = await realDept(user, department); if (!d.ok) return d;
    return { ok: true, value: (await db.query(`SELECT * FROM mail_templates WHERE department = $1 ORDER BY name`, [d.dept.key])).rows.map(tplItem) };
  }
  async function saveTemplate(user: MailUser, a: { id?: unknown; department?: unknown; name?: unknown; subject?: unknown; bodyHtml?: unknown; body?: unknown }): Promise<MailResult<TemplateItem>> {
    const d = await realDept(user, a.department); if (!d.ok) return d;
    const name = oneLine(a.name, 60), subject = oneLine(a.subject, 200);
    const html = typeof a.bodyHtml === "string" && a.bodyHtml.trim() ? cleanOutgoingHtml(a.bodyHtml) : typeof a.body === "string" ? textToHtml(a.body.slice(0, 20000)) : "";
    if (!name) return bad(400, "Give the template a name");
    if (htmlToText(html).length < 2) return bad(400, "Write the template's text");
    const clash = (await db.query(`SELECT id FROM mail_templates WHERE department = $1 AND name = $2`, [d.dept.key, name])).rows[0];
    const own = typeof a.id === "string" && UUID.test(a.id) ? (await db.query(`SELECT id FROM mail_templates WHERE id = $1 AND department = $2`, [a.id, d.dept.key])).rows[0] : undefined;
    if (clash && (!own || String(clash.id) !== String(own.id))) return bad(409, "A template with that name already exists");
    if (own) { await db.query(`UPDATE mail_templates SET name = $2, subject = $3, body_html = $4 WHERE id = $1`, [own.id, name, subject, html]); return { ok: true, value: { id: String(own.id), department: d.dept.key, name, subject, bodyHtml: html } }; }
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM mail_templates WHERE department = $1`, [d.dept.key])).rows[0].n) >= 100) return bad(429, "This department has a lot of templates. Delete some first.");
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO mail_templates (id, department, name, subject, body_html, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, d.dept.key, name, subject, html, user.userId, now()]);
    return { ok: true, value: { id, department: d.dept.key, name, subject, bodyHtml: html } };
  }
  async function deleteTemplate(user: MailUser, id: string): Promise<MailResult<{ removed: boolean }>> {
    const r = (await db.query(`SELECT department FROM mail_templates WHERE id = $1`, [id])).rows[0];
    if (!r) return bad(404, "No such template");
    if (!(await canUse(user, String(r.department)))) return bad(403, "You do not manage this department's mail");
    await db.query(`DELETE FROM mail_templates WHERE id = $1`, [id]);
    return { ok: true, value: { removed: true } };
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async function listLabels(user: MailUser, department: string): Promise<MailResult<LabelItem[]>> {
    const d = await realDept(user, department); if (!d.ok) return d;
    return { ok: true, value: (await db.query(`SELECT * FROM mail_labels WHERE department = $1 ORDER BY name`, [d.dept.key])).rows.map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name), color: String(r.color) })) };
  }
  async function createLabel(user: MailUser, department: unknown, nameIn: unknown, colorIn: unknown): Promise<MailResult<LabelItem>> {
    const d = await realDept(user, department); if (!d.ok) return d;
    const name = oneLine(nameIn, 40), color = typeof colorIn === "string" && /^#[0-9a-f]{6}$/i.test(colorIn) ? colorIn : "#8B0000";
    if (!name) return bad(400, "Give the label a name");
    if ((await db.query(`SELECT 1 AS x FROM mail_labels WHERE department = $1 AND name = $2`, [d.dept.key, name])).rows.length) return bad(409, "That label already exists");
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM mail_labels WHERE department = $1`, [d.dept.key])).rows[0].n) >= 50) return bad(429, "This department has a lot of labels. Delete some first.");
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO mail_labels (id, department, name, color) VALUES ($1,$2,$3,$4)`, [id, d.dept.key, name, color]);
    return { ok: true, value: { id, name, color } };
  }
  async function deleteLabel(user: MailUser, id: string): Promise<MailResult<{ removed: boolean }>> {
    const r = (await db.query(`SELECT department FROM mail_labels WHERE id = $1`, [id])).rows[0];
    if (!r) return bad(404, "No such label");
    if (!(await canUse(user, String(r.department)))) return bad(403, "You do not manage this department's mail");
    await db.query(`DELETE FROM mail_message_labels WHERE label_id = $1`, [id]);
    await db.query(`UPDATE mail_filters SET act_label_id = NULL WHERE act_label_id = $1`, [id]);
    await db.query(`DELETE FROM mail_labels WHERE id = $1`, [id]);
    return { ok: true, value: { removed: true } };
  }
  async function setMessageLabel(user: MailUser, kind: string, id: string, labelId: unknown, on: unknown): Promise<MailResult<{ labels: LabelItem[] }>> {
    const m = await load(kind, id);
    if (!m) return bad(404, "No such message");
    if (!(await canUse(user, m.item.department))) return bad(403, "You do not manage this department's mail");
    const lab = typeof labelId === "string" && UUID.test(labelId) ? (await db.query(`SELECT id, department FROM mail_labels WHERE id = $1`, [labelId])).rows[0] : undefined;
    if (!lab || String(lab.department) !== m.item.department) return bad(404, "No such label");
    const has = (await db.query(`SELECT 1 AS x FROM mail_message_labels WHERE kind = $1 AND message_id = $2 AND label_id = $3`, [kind, id, labelId])).rows.length > 0;
    if (on === true && !has) await db.query(`INSERT INTO mail_message_labels (kind, message_id, label_id) VALUES ($1,$2,$3)`, [kind, id, labelId]);
    if (on !== true && has) await db.query(`DELETE FROM mail_message_labels WHERE kind = $1 AND message_id = $2 AND label_id = $3`, [kind, id, labelId]);
    return { ok: true, value: { labels: (await labelMap([{ kind, id }])).get(`${kind}:${id}`) ?? [] } };
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  async function listFilters(user: MailUser, department: string): Promise<MailResult<FilterItem[]>> {
    const d = await realDept(user, department); if (!d.ok) return d;
    const rows = (await db.query(`SELECT f.*, l.name AS label_name, l.color AS label_color FROM mail_filters f LEFT JOIN mail_labels l ON l.id = f.act_label_id WHERE f.department = $1 ORDER BY f.created_at`, [d.dept.key])).rows;
    return { ok: true, value: rows.map((r: Record<string, unknown>) => ({ id: String(r.id), department: String(r.department), name: String(r.name), from: String(r.cond_from), subject: String(r.cond_subject), words: String(r.cond_words), hasAttachment: truthy(r.cond_has_attachment), label: r.act_label_id ? { id: String(r.act_label_id), name: String(r.label_name), color: String(r.label_color) } : null, star: truthy(r.act_star), folder: (r.act_folder ?? null) as "spam" | "trash" | null, close: truthy(r.act_close), active: truthy(r.active) })) };
  }
  async function saveFilter(user: MailUser, a: Record<string, unknown>): Promise<MailResult<{ id: string }>> {
    const d = await realDept(user, a.department); if (!d.ok) return d;
    const name = oneLine(a.name, 60), from = oneLine(a.from, 120).toLowerCase(), subject = oneLine(a.subject, 120).toLowerCase(), words = oneLine(a.words, 120).toLowerCase();
    const hasAttachment = a.hasAttachment === true, star = a.star === true, close = a.close === true, active = a.active !== false;
    const folder = a.folder === "spam" || a.folder === "trash" ? a.folder : null;
    if (!name) return bad(400, "Give the filter a name");
    if (!from && !subject && !words && !hasAttachment) return bad(400, "Say what to look for: a sender, a word in the subject, words in the message, or an attachment");
    let labelId: string | null = null;
    if (a.labelId) { const l = typeof a.labelId === "string" && UUID.test(a.labelId) ? (await db.query(`SELECT department FROM mail_labels WHERE id = $1`, [a.labelId])).rows[0] : undefined; if (!l || String(l.department) !== d.dept.key) return bad(400, "That label does not belong to this department"); labelId = String(a.labelId); }
    if (!labelId && !star && !folder && !close) return bad(400, "Choose what the filter should do");
    const existing = typeof a.id === "string" && UUID.test(a.id) ? (await db.query(`SELECT id FROM mail_filters WHERE id = $1 AND department = $2`, [a.id, d.dept.key])).rows[0] : undefined;
    if (existing) { await db.query(`UPDATE mail_filters SET name=$2, cond_from=$3, cond_subject=$4, cond_words=$5, cond_has_attachment=$6, act_label_id=$7, act_star=$8, act_folder=$9, act_close=$10, active=$11 WHERE id=$1`, [existing.id, name, from, subject, words, hasAttachment, labelId, star, folder, close, active]); return { ok: true, value: { id: String(existing.id) } }; }
    if (Number((await db.query(`SELECT COUNT(*) AS n FROM mail_filters WHERE department = $1`, [d.dept.key])).rows[0].n) >= 50) return bad(429, "This department has a lot of filters. Delete some first.");
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO mail_filters (id, department, name, cond_from, cond_subject, cond_words, cond_has_attachment, act_label_id, act_star, act_folder, act_close, active, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [id, d.dept.key, name, from, subject, words, hasAttachment, labelId, star, folder, close, active, user.userId, now()]);
    return { ok: true, value: { id } };
  }
  async function deleteFilter(user: MailUser, id: string): Promise<MailResult<{ removed: boolean }>> {
    const r = (await db.query(`SELECT department FROM mail_filters WHERE id = $1`, [id])).rows[0];
    if (!r) return bad(404, "No such filter");
    if (!(await canUse(user, String(r.department)))) return bad(403, "You do not manage this department's mail");
    await db.query(`DELETE FROM mail_filters WHERE id = $1`, [id]);
    return { ok: true, value: { removed: true } };
  }

  // ── Out of office ──────────────────────────────────────────────────────────

  const dateOnly = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : null);
  async function getAutoreply(user: MailUser, department: string): Promise<MailResult<AutoreplyItem>> {
    const d = await realDept(user, department); if (!d.ok) return d;
    const r = (await db.query(`SELECT * FROM mail_autoreply WHERE department = $1`, [d.dept.key])).rows[0];
    return { ok: true, value: r ? { department: d.dept.key, enabled: truthy(r.enabled), subject: String(r.subject), body: String(r.body), startOn: dateOnly(r.start_on), endOn: dateOnly(r.end_on) } : { department: d.dept.key, enabled: false, subject: "Out of office", body: "", startOn: null, endOn: null } };
  }
  async function saveAutoreply(user: MailUser, a: Record<string, unknown>): Promise<MailResult<AutoreplyItem>> {
    const d = await realDept(user, a.department); if (!d.ok) return d;
    const subject = oneLine(a.subject, 120) || "Out of office", body = typeof a.body === "string" ? a.body.replace(/\u0000/g, "").trim().slice(0, 5000) : "";
    const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null);
    const startOn = day(a.startOn), endOn = day(a.endOn), enabled = a.enabled === true;
    if (a.startOn && !startOn) return bad(400, "The start date is not a date"); if (a.endOn && !endOn) return bad(400, "The end date is not a date");
    if (startOn && endOn && endOn < startOn) return bad(400, "The end date is before the start date");
    if (enabled && body.length < 2) return bad(400, "Write the message people will get");
    const exists = (await db.query(`SELECT 1 AS x FROM mail_autoreply WHERE department = $1`, [d.dept.key])).rows.length > 0;
    if (exists) await db.query(`UPDATE mail_autoreply SET enabled=$2, subject=$3, body=$4, start_on=$5, end_on=$6, updated_by=$7, updated_at=$8 WHERE department=$1`, [d.dept.key, enabled, subject, body, startOn, endOn, user.userId, now()]);
    else await db.query(`INSERT INTO mail_autoreply (department, enabled, subject, body, start_on, end_on, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [d.dept.key, enabled, subject, body, startOn, endOn, user.userId, now()]);
    return getAutoreply(user, d.dept.key);
  }
  /** Sends the department's out-of-office reply to the sender of a new email, once every few days, never to robots, lists or VINK's own addresses. */
  async function maybeAutoReply(dept: Department, item: MailListItem, emailId: string): Promise<void> {
    const r = (await db.query(`SELECT * FROM mail_autoreply WHERE department = $1`, [dept.key])).rows[0];
    if (!r || !truthy(r.enabled) || !String(r.body).trim()) return;
    const today = new Date(now().getTime() + 2 * 3600_000).toISOString().slice(0, 10);          // the date in South Africa
    if (r.start_on && today < dateOnly(r.start_on)!) return; if (r.end_on && today > dateOnly(r.end_on)!) return;
    const to = item.fromEmail.toLowerCase();
    if (!EMAIL.test(to) || NO_AUTOREPLY.test(to) || /@([a-z0-9-]+\.)*vink\.co\.za$/i.test(to) || /^(auto(matic)?( reply)?|out of office|undeliverable|delivery (status|failure)|mail delivery)\b/i.test(item.subject)) return;
    const last = (await db.query(`SELECT sent_at FROM mail_autoreply_log WHERE department = $1 AND email = $2`, [dept.key, to])).rows[0];
    if (last && now().getTime() - new Date(String(last.sent_at)).getTime() < AUTOREPLY_EVERY_DAYS * 86400_000) return;
    const body = String(r.body), subject = oneLine(r.subject, 120) || "Out of office";
    let error: string | null = null;
    try { await mail.send({ to, subject, text: `${body}\n\n${dept.name}\nVINK`, html: `${textToHtml(body)}<p>${esc(dept.name)}<br>VINK</p>`, from: `VINK ${dept.name} <${dept.address}>`, replyTo: dept.address, headers: { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" } }); }
    catch (e) { error = e instanceof Error ? e.message.slice(0, 200) : "send failed"; }
    if (last) await db.query(`UPDATE mail_autoreply_log SET sent_at = $3 WHERE department = $1 AND email = $2`, [dept.key, to, now()]);
    else await db.query(`INSERT INTO mail_autoreply_log (department, email, sent_at) VALUES ($1,$2,$3)`, [dept.key, to, now()]);
    await db.query(`INSERT INTO mail_outbound (id, department, to_addr, subject, body, reply_kind, reply_id, sent_by, sent_by_name, status, error, created_at) VALUES ($1,$2,$3,$4,$5,'email',$6,NULL,'Out-of-office reply',$7,$8,$9)`, [crypto.randomUUID(), dept.key, to, subject, body, emailId, error ? "failed" : "sent", error, now()]);
  }

  // ── What happens to a new email ────────────────────────────────────────────

  /** Called when an email has just been stored: blocked senders and filters first, then the spam check, then the out-of-office reply. Never throws into the webhook. */
  async function fileNewEmail(emailId: string): Promise<void> {
    const r = (await db.query(`SELECT * FROM inbound_emails WHERE id = $1`, [emailId])).rows[0];
    if (!r?.department) return;
    const dept = departmentByKey(String(r.department));
    if (!dept) return;
    const item = emailItem(r), text = emailText(r);
    if ((await db.query(`SELECT 1 AS x FROM mail_blocked_senders WHERE department = $1 AND email = $2`, [dept.key, item.fromEmail])).rows.length) { await upsertFlags("email", emailId, { folder: "spam", reason: "The sender is blocked" }, null); return; }

    let moved = false;
    const hasFile = Number((await db.query(`SELECT COUNT(*) AS n FROM mail_files WHERE kind = 'inbound' AND email_id = $1`, [emailId])).rows[0].n) > 0;
    for (const f of (await db.query(`SELECT * FROM mail_filters WHERE department = $1 AND active = true ORDER BY created_at`, [dept.key])).rows) {
      const who = `${item.fromName} ${item.fromEmail}`.toLowerCase(), hay = `${item.subject} ${text.slice(0, 5000)}`.toLowerCase();
      if (f.cond_from && !who.includes(String(f.cond_from))) continue;
      if (f.cond_subject && !item.subject.toLowerCase().includes(String(f.cond_subject))) continue;
      if (f.cond_words && !hay.includes(String(f.cond_words))) continue;
      if (truthy(f.cond_has_attachment) && !hasFile) continue;
      if (f.act_label_id && !(await db.query(`SELECT 1 AS x FROM mail_message_labels WHERE kind = 'email' AND message_id = $1 AND label_id = $2`, [emailId, f.act_label_id])).rows.length) await db.query(`INSERT INTO mail_message_labels (kind, message_id, label_id) VALUES ('email',$1,$2)`, [emailId, f.act_label_id]);
      if (truthy(f.act_star)) await upsertFlags("email", emailId, { starred: true }, null);
      if (truthy(f.act_close)) await db.query(`UPDATE inbound_emails SET status = 'closed' WHERE id = $1`, [emailId]);
      if (f.act_folder) { await upsertFlags("email", emailId, { folder: String(f.act_folder) as Folder, reason: `Filter: ${String(f.name)}` }, null); moved = true; }
    }
    if (moved) return;
    const verdict = scoreSpam({ fromName: item.fromName, fromEmail: item.fromEmail, subject: String(r.subject ?? ""), text });
    if (verdict.spam) { await upsertFlags("email", emailId, { folder: "spam", reason: verdict.reasons.join("; ") }, null); return; }
    await maybeAutoReply(dept, item, emailId);
  }

  // ── Drafts ─────────────────────────────────────────────────────────────────

  async function draftItem(userId: string, r: Record<string, unknown>): Promise<DraftItem> {
    return { id: String(r.id), department: String(r.department), to: String(r.to_addr), subject: String(r.subject), body: String(r.body), bodyHtml: r.body_html ? String(r.body_html) : null, replyKind: (r.reply_kind ?? null) as MailKind | null, replyId: r.reply_id ? String(r.reply_id) : null, attachments: await files.staged(userId, r.attachment_ids), updatedAt: iso(r.updated_at) };
  }

  /** Saves a draft (a new one, or the one named by id). Saving an empty draft throws it away. Called as the person types. */
  async function saveDraft(user: MailUser, a: { id?: unknown; department?: unknown; to?: unknown; subject?: unknown; body?: unknown; bodyHtml?: unknown; replyKind?: unknown; replyId?: unknown; attachmentIds?: unknown }): Promise<MailResult<{ id: string | null }>> {
    const dept = departmentByKey(String(a.department ?? ""));
    if (!dept) return bad(400, "Choose a department");
    if (!(await canUse(user, dept.key))) return bad(403, "You do not manage this department's mail");
    const to = oneLine(a.to, 254), subject = oneLine(a.subject, 200);
    const html = typeof a.bodyHtml === "string" && a.bodyHtml.trim() ? cleanOutgoingHtml(a.bodyHtml) : null;
    const body = html !== null ? htmlToText(html).slice(0, 20000) : typeof a.body === "string" ? a.body.replace(/\u0000/g, "").slice(0, 20000) : "";
    const ids = Array.isArray(a.attachmentIds) ? [...new Set((a.attachmentIds as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 5) : [];
    const replyKind = a.replyKind === "web" || a.replyKind === "email" ? a.replyKind : null, replyId = typeof a.replyId === "string" && UUID.test(a.replyId) ? a.replyId : null;
    if ((replyKind === null) !== (replyId === null)) return bad(400, "A reply draft needs the message it answers");
    if (replyKind && replyId) { const m = await load(replyKind, replyId); if (!m || m.item.department !== dept.key) return bad(404, "No such message"); }
    const existing = typeof a.id === "string" && UUID.test(a.id) ? (await db.query(`SELECT id FROM mail_drafts WHERE id = $1 AND user_id = $2`, [a.id, user.userId])).rows[0]
      : replyId ? (await db.query(`SELECT id FROM mail_drafts WHERE user_id = $1 AND reply_kind = $2 AND reply_id = $3`, [user.userId, replyKind, replyId])).rows[0] : undefined;
    const blank = !to && !subject && !body.trim() && !ids.length;
    if (blank) { if (existing) await db.query(`DELETE FROM mail_drafts WHERE id = $1`, [existing.id]); return { ok: true, value: { id: null } }; }
    if (existing) { await db.query(`UPDATE mail_drafts SET department = $2, to_addr = $3, subject = $4, body = $5, body_html = $6, attachment_ids = $7, updated_at = $8 WHERE id = $1`, [existing.id, dept.key, to, subject, body, html, ids, now()]); return { ok: true, value: { id: String(existing.id) } }; }
    const mine = Number((await db.query(`SELECT COUNT(*) AS n FROM mail_drafts WHERE user_id = $1`, [user.userId])).rows[0].n);
    if (mine >= 100) return bad(429, "You have a lot of drafts. Send or delete some first.");
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO mail_drafts (id, user_id, department, to_addr, subject, body, body_html, reply_kind, reply_id, attachment_ids, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, user.userId, dept.key, to, subject, body, html, replyKind, replyId, ids, now()]);
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
    if (!UUID.test(fileId)) return bad(400, "Invalid file");
    const m = await files.meta(fileId);
    if (!m || !m.department || m.row.kind === "upload") return bad(404, "No such file");
    if (!(await canUse(user, m.department))) return bad(403, "You do not manage this department's mail");
    return files.read(fileId);
  }

  return {
    departmentsFor, unread, list, get, setStatus, send, reply, openFile, files, setFolder, setStar, setSnooze, fileNewEmail, saveDraft, listDrafts, getDraft, deleteDraft,
    schedule, listScheduled, cancelScheduled, sendDue,
    getSignature, saveSignature, previewSignature,
    listTemplates, saveTemplate, deleteTemplate,
    listLabels, createLabel, deleteLabel, setMessageLabel,
    listFilters, saveFilter, deleteFilter,
    getAutoreply, saveAutoreply,
  };
}
export type MailService = ReturnType<typeof createMailService>;
