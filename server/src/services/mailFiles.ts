import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";
import { createScanner, type FileScanner } from "./fileScan.js";

/**
 * Files in department mail.
 *
 *  - Incoming email: the webhook records each attachment (name, type, size) and the files are then fetched from Resend and kept here, so they stay available.
 *    A file that has not been fetched yet (or whose fetch failed) is fetched again, with a fresh link, the first time someone opens it.
 *  - Sending: staff upload a file first (it is "staged", private to them), then name it when they send. Up to ATTACH_LIMIT in total goes as ordinary attachments;
 *    more than that is sent as expiring download links instead, because most mailboxes refuse big attachments.
 *  - Downloads always go out as a download (never shown in the browser), so a file from outside cannot run as a page on our site.
 *
 * Files are kept in the database (bytea) so they survive a redeploy together with the rest of the data.
 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;          // one file
export const MAX_FILES_PER_EMAIL = 5;
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;         // all files of one email
export const ATTACH_LIMIT_BYTES = 15 * 1024 * 1024;      // up to this much is attached; more than this goes as links
export const LINK_DAYS = 7;
const STAGED_HOURS = 24;
const MAX_INBOUND_FETCH = 50 * 1024 * 1024;

/** File types that run on a computer. They can still be downloaded, but the panel warns before they are opened. */
export const RISKY_EXTENSION = /\.(exe|bat|cmd|com|scr|msi|dll|jar|apk|js|jse|vbs|vbe|wsf|wsh|ps1|psm1|hta|lnk|reg|iso|dmg|pif|cpl)$/i;
export const isRiskyFile = (name: string) => RISKY_EXTENSION.test(name);

/** A name that is safe to put in a header, an email and a file system: no path, no control characters, no quotes. */
export function safeFilename(raw: unknown): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f"<>:|?*]+/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (clean || "file").slice(-150);
}
const safeType = (raw: unknown) => (typeof raw === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(raw.trim()) ? raw.trim().toLowerCase().slice(0, 100) : "application/octet-stream");
export const prettySize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);

export interface FileInfo { id: string; filename: string; contentType: string; size: number; status: string; risky: boolean; /** clean | infected | suspicious | unscanned: see fileScan.ts */ scan: string; scanDetail: string | null; /** The Content-ID an email uses to show this file inside its text (cid:...), if it does. */ contentId: string | null }
export interface StoredFile { id: string; filename: string; contentType: string; size: number; data: Buffer }
export type FileResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const bad = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

interface ResendAttachment { id?: string; filename?: string; content_type?: string; size?: number; download_url?: string; content_disposition?: string; content_id?: string }

export function createMailFiles(deps: { db: Db; apiKey?: string; fetchImpl?: typeof fetch; now?: () => Date; /** Virus checking (default: only the built-in checks). */ scanner?: FileScanner }) {
  const { db } = deps;
  const doFetch = deps.fetchImpl ?? fetch;
  const scanner = deps.scanner ?? createScanner({} as NodeJS.ProcessEnv);
  const now = deps.now ?? (() => new Date());
  const background = new Set<Promise<unknown>>();

  const info = (r: Record<string, unknown>): FileInfo => ({ id: String(r.id), filename: String(r.filename), contentType: String(r.content_type), size: Number(r.size), status: String(r.status), risky: isRiskyFile(String(r.filename)), scan: String(r.scan_status ?? "unscanned"), scanDetail: r.scan_detail ? String(r.scan_detail) : null, contentId: r.content_id ? String(r.content_id) : null });
  const track = (p: Promise<unknown>) => { const t = p.catch(() => undefined).finally(() => background.delete(t)); background.add(t); };

  /** The attachments Resend lists for a received email (empty if none, or if the list cannot be read). */
  async function listResend(resendEmailId: string): Promise<ResendAttachment[]> {
    if (!deps.apiKey) return [];
    try {
      const r = await doFetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(resendEmailId)}/attachments`, { headers: { Authorization: `Bearer ${deps.apiKey}` }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return [];
      const body = await r.json().catch(() => null) as { data?: unknown } | unknown[] | null;
      const rows = Array.isArray(body) ? body : body && Array.isArray((body as { data?: unknown }).data) ? (body as { data: unknown[] }).data : [];
      return rows.filter((x): x is ResendAttachment => !!x && typeof x === "object");
    } catch { return []; }
  }

  /** Records the attachments of an incoming email and starts fetching them in the background. */
  async function recordInbound(emailId: string, resendEmailId: string, department: string | null): Promise<number> {
    const list = (await listResend(resendEmailId)).filter((a) => a.id).slice(0, 25);
    let n = 0;
    for (const a of list) {
      if (!a.id) continue;
      const size = Math.max(0, Math.floor(Number(a.size) || 0));
      await db.query(`INSERT INTO mail_files (id, kind, email_id, department, filename, content_type, size, status, resend_email_id, resend_att_id, created_at, content_id) VALUES ($1,'inbound',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [crypto.randomUUID(), emailId, department, safeFilename(a.filename), safeType(a.content_type), size, size > MAX_INBOUND_FETCH ? "toolarge" : "pending", resendEmailId, String(a.id), now(), a.content_id ? String(a.content_id).replace(/[<>\s]/g, "").slice(0, 200) : null]);
      n++;
    }
    if (n) track(fetchPending(emailId));
    return n;
  }

  async function downloadFrom(url: string): Promise<Buffer | null> {
    try {
      const r = await doFetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length > MAX_INBOUND_FETCH ? null : buf;
    } catch { return null; }
  }

  /** Fetches every still-pending file of one incoming email. A failure leaves the file pending, to be fetched again when someone opens it. */
  async function fetchPending(emailId: string): Promise<void> {
    const rows = (await db.query(`SELECT id FROM mail_files WHERE kind = 'inbound' AND email_id = $1 AND status = 'pending'`, [emailId])).rows;
    for (const r of rows) await fetchOne(String(r.id));
  }

  async function fetchOne(fileId: string): Promise<Buffer | null> {
    const row = (await db.query(`SELECT * FROM mail_files WHERE id = $1`, [fileId])).rows[0];
    if (!row || row.status !== "pending" || !row.resend_email_id || !row.resend_att_id) return null;
    const fresh = (await listResend(String(row.resend_email_id))).find((a) => a.id === row.resend_att_id);
    if (!fresh?.download_url) return null;
    const buf = await downloadFrom(fresh.download_url);
    if (!buf) return null;
    const v = await scanner.scan(buf, String(row.filename));
    await db.query(`UPDATE mail_files SET data = $2, size = $3, status = 'stored', scan_status = $4, scan_detail = $5, scanned_at = $6 WHERE id = $1`, [fileId, buf, buf.length, v.status, v.detail.slice(0, 300), now()]);
    return buf;
  }

  async function forEmail(kind: "inbound" | "outbound", emailId: string): Promise<FileInfo[]> {
    return (await db.query(`SELECT id, filename, content_type, size, status, scan_status, scan_detail, content_id FROM mail_files WHERE kind = $1 AND email_id = $2 ORDER BY created_at, filename`, [kind, emailId])).rows.map(info);
  }

  /** The file and the department whose mail it belongs to (null while it is only a private upload). */
  async function meta(fileId: string): Promise<{ row: Record<string, unknown>; department: string | null } | null> {
    const row = (await db.query(`SELECT id, kind, email_id, department, filename, content_type, size, status, uploaded_by FROM mail_files WHERE id = $1`, [fileId])).rows[0];
    if (!row) return null;
    if (row.kind === "inbound") {
      const e = (await db.query(`SELECT department FROM inbound_emails WHERE id = $1`, [row.email_id])).rows[0];
      return { row, department: e ? (e.department ? String(e.department) : "unrouted") : null };
    }
    return { row, department: row.department ? String(row.department) : null };
  }

  /** The bytes of a file, fetching them from Resend first if they are not here yet. */
  async function read(fileId: string): Promise<FileResult<StoredFile>> {
    const row = (await db.query(`SELECT * FROM mail_files WHERE id = $1`, [fileId])).rows[0];
    if (!row) return bad(404, "No such file");
    if (row.scan_status === "infected") return bad(422, `This file was blocked: ${String(row.scan_detail ?? "a virus was found")}. It cannot be downloaded.`);
    let data: Buffer | null = row.data ? Buffer.from(row.data as Uint8Array) : null;
    if (!data && row.status === "toolarge") return bad(413, "This file was too large to keep. Ask the sender to share it another way.");
    if (!data) data = await fetchOne(fileId);
    if (data && !row.data) { const fresh = (await db.query(`SELECT scan_status, scan_detail FROM mail_files WHERE id = $1`, [fileId])).rows[0]; if (fresh?.scan_status === "infected") return bad(422, `This file was blocked: ${String(fresh.scan_detail ?? "a virus was found")}. It cannot be downloaded.`); }
    if (!data) return bad(502, "The file could not be fetched right now. Please try again in a minute.");
    return { ok: true, value: { id: String(row.id), filename: String(row.filename), contentType: String(row.content_type), size: data.length, data } };
  }

  // ── Sending ──────────────────────────────────────────────────────────────────

  async function stage(userId: string, name: unknown, type: unknown, data: Buffer): Promise<FileResult<FileInfo>> {
    if (!data.length) return bad(400, "That file is empty");
    if (data.length > MAX_FILE_BYTES) return bad(413, `Files can be up to ${prettySize(MAX_FILE_BYTES)}`);
    await db.query(`DELETE FROM mail_files WHERE kind = 'upload' AND created_at < $1`, [new Date(now().getTime() - STAGED_HOURS * 3600_000)]);
    const mine = Number((await db.query(`SELECT COUNT(*) AS n FROM mail_files WHERE kind = 'upload' AND uploaded_by = $1`, [userId])).rows[0].n);
    if (mine >= 20) return bad(429, "You have a lot of unsent files waiting. Send or remove some first.");
    const fname = safeFilename(name), v = await scanner.scan(data, fname);
    if (v.status === "infected") return bad(422, `"${fname}" was not uploaded: ${v.detail}. Do not send it.`);
    if (v.status === "suspicious" && v.engine === "built-in") return bad(422, `"${fname}" was not uploaded: ${v.detail}.`);          // a program dressed up as a document
    if ((v as { engineFailed?: boolean }).engineFailed) return bad(503, "Files cannot be checked for viruses right now, so nothing can be attached. Please try again in a few minutes.");
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO mail_files (id, kind, filename, content_type, size, data, status, uploaded_by, created_at, scan_status, scan_detail, scanned_at) VALUES ($1,'upload',$2,$3,$4,$5,'stored',$6,$7,$8,$9,$7)`, [id, fname, safeType(type), data.length, data, userId, now(), v.status, v.detail.slice(0, 300)]);
    return { ok: true, value: { id, filename: fname, contentType: safeType(type), size: data.length, status: "stored", risky: isRiskyFile(fname), scan: v.status, scanDetail: v.detail, contentId: null } };
  }

  async function discard(userId: string, fileId: string): Promise<boolean> {
    const r = await db.query(`DELETE FROM mail_files WHERE id = $1 AND kind = 'upload' AND uploaded_by = $2 RETURNING id`, [fileId, userId]);
    return r.rows.length > 0;
  }

  /** The staged files a person named, checked: theirs, not already sent, within the count and size limits. */
  async function claim(userId: string, ids: unknown): Promise<FileResult<StoredFile[]>> {
    if (ids === undefined || ids === null) return { ok: true, value: [] };
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) return bad(400, "Those files are not valid");
    const unique = [...new Set(ids as string[])];
    if (!unique.length) return { ok: true, value: [] };
    if (unique.length > MAX_FILES_PER_EMAIL) return bad(400, `Attach at most ${MAX_FILES_PER_EMAIL} files to one email`);
    const out: StoredFile[] = [];
    for (const id of unique) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return bad(400, "Those files are not valid");
      const row = (await db.query(`SELECT * FROM mail_files WHERE id = $1 AND kind = 'upload' AND uploaded_by = $2`, [id, userId])).rows[0];
      if (!row) return bad(400, "One of the files is no longer available. Add it again.");
      out.push({ id, filename: String(row.filename), contentType: String(row.content_type), size: Number(row.size), data: Buffer.from(row.data as Uint8Array) });
    }
    if (out.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) return bad(413, `The files together can be up to ${prettySize(MAX_TOTAL_BYTES)}`);
    return { ok: true, value: out };
  }

  /** Tokens for the download links, made before the email is sent so the links can go in it. */
  function planLinks(files: StoredFile[]): Map<string, { token: string; expires: Date }> {
    return new Map(files.map((f) => [f.id, { token: crypto.randomBytes(24).toString("base64url"), expires: new Date(now().getTime() + LINK_DAYS * 86400_000) }]));
  }

  /** Once an email has gone, its files stop being private uploads and belong to the email and its department (with their link, if they were sent as links). */
  async function bindSent(files: StoredFile[], emailId: string, department: string, links?: Map<string, { token: string; expires: Date }>): Promise<void> {
    for (const f of files) {
      const l = links?.get(f.id);
      await db.query(`UPDATE mail_files SET kind = 'outbound', email_id = $2, department = $3, share_token = $4, share_expires = $5 WHERE id = $1`, [f.id, emailId, department, l?.token ?? null, l?.expires ?? null]);
    }
  }

  /** A shared file by its link token; refused once the link has expired. */
  async function byShareToken(token: string): Promise<FileResult<StoredFile>> {
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return bad(404, "This link is not valid");
    const row = (await db.query(`SELECT * FROM mail_files WHERE share_token = $1`, [token])).rows[0];
    if (!row) return bad(404, "This link is not valid");
    if (!row.share_expires || new Date(row.share_expires as string).getTime() < now().getTime()) return bad(410, "This link has expired. Ask the sender to send the file again.");
    return { ok: true, value: { id: String(row.id), filename: String(row.filename), contentType: String(row.content_type), size: Number(row.size), data: Buffer.from(row.data as Uint8Array) } };
  }

  /** Resolves when the background fetches that are running have finished (used by tests and by shutdown). */
  const idle = async () => { while (background.size) await Promise.all([...background]); };

  return { recordInbound, forEmail, meta, read, stage, discard, claim, planLinks, bindSent, byShareToken, idle };
}
export type MailFiles = ReturnType<typeof createMailFiles>;
