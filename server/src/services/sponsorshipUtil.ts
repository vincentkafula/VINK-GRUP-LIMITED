import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";
import type { FileScanner } from "./fileScan.js";
import { FILE_RULES, type Errors } from "../config/sponsorship.js";

/**
 * Small things every part of the sponsorship system needs: cleaning what people type, writing money, turning an amount into rand, and the one place an uploaded
 * file is checked and stored (an application, a reply to a question, a final report: all go through checkUploads and storeDocuments).
 */
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");
export const oneLine = (v: unknown, max: number) => clean(v, max).replace(/[\r\n\t]+/g, " ");
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const newRef = () => "SP-" + Array.from(crypto.randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number, cur: string) => `${cur} ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const labelOf = <T extends { id: string; label: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id)?.label ?? id;
export const iso = (v: unknown) => new Date(v as string).toISOString();
export const asJson = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

/** An amount in rand, from VINK's stored rate (how many of the currency one rand buys). null when there is no rate for that currency. */
export async function toRand(db: Db, amount: number, currency: string): Promise<{ zar: number; rate: number | null } | null> {
  if (currency === "ZAR") return { zar: amount, rate: null };
  const r = (await db.query(`SELECT rate FROM fx_rates WHERE pair = $1`, [`ZAR-${currency}`])).rows[0];
  const rate = r ? Number(r.rate) : 0;
  return rate > 0 ? { zar: round2(amount / rate), rate } : null;
}

// ── uploads ─────────────────────────────────────────────────────────────────
export interface UploadedFile { kind: string; filename: string; data: Buffer }
export type CheckedFile = UploadedFile & { name: string; mime: string; scan: { status: string; detail: string } };

const MIME: Record<string, string> = { ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
/** What a file's first bytes say it is, so a program renamed "budget.pdf" is not taken for a PDF. */
export function matchesType(ext: string, b: Buffer): boolean {
  if (ext === ".pdf") return b.length > 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";
  if (ext === ".docx" || ext === ".xlsx") return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
  if (ext === ".jpg" || ext === ".jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === ".png") return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}
export const safeName = (n: string) => {
  const base = n.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "").replace(/\s+/g, " ").trim().slice(-120);
  return cleaned || "document";
};
export const extOf = (n: string) => { const m = /\.[A-Za-z0-9]{1,5}$/.exec(n); return m ? m[0].toLowerCase() : ""; };

/**
 * Checks files before anything is stored: how many and how big, whether each is a kind that is asked for, its type by name and by first bytes, and a scan.
 * Infected or disguised files are refused outright. "required" are the documents that must have a file (an application asks for some; a reply or a report may not).
 */
export async function checkUploads(files: UploadedFile[], o: { allowed: ReadonlySet<string>; required?: { id: string; label: string }[]; scanner: FileScanner; notAsked?: string }): Promise<{ errors: Errors; ok: CheckedFile[] }> {
  const errors: Errors = {}; const ok: CheckedFile[] = [];
  if (files.length > FILE_RULES.maxFiles) errors.documents = `Attach at most ${FILE_RULES.maxFiles} files`;
  else if (files.reduce((s, f) => s + f.data.length, 0) > FILE_RULES.maxTotalBytes) errors.documents = `The files together are larger than ${FILE_RULES.maxTotalBytes / 1024 / 1024} MB`;
  for (const f of files) {
    if (errors.documents) break;
    const name = safeName(f.filename), ext = extOf(name);
    if (!o.allowed.has(f.kind)) { errors.documents = `"${name}" ${o.notAsked ?? "was attached to a document that this application does not ask for"}`; break; }
    if (!(FILE_RULES.extensions as readonly string[]).includes(ext)) { errors.documents = `"${name}" is not an accepted file type. Use PDF, DOCX, XLSX, JPG or PNG`; break; }
    if (f.data.length === 0) { errors.documents = `"${name}" is empty`; break; }
    if (f.data.length > FILE_RULES.maxBytes) { errors.documents = `"${name}" is larger than ${FILE_RULES.maxBytes / 1024 / 1024} MB`; break; }
    if (!matchesType(ext, f.data)) { errors.documents = `"${name}" is not really a ${ext.slice(1).toUpperCase()} file`; break; }
    const scan = await o.scanner.scan(f.data, name);
    if (scan.status === "infected" || scan.status === "suspicious") { errors.documents = `"${name}" was refused: ${scan.detail}`; break; }
    ok.push({ ...f, name, mime: MIME[ext], scan: { status: scan.status === "clean" ? "clean" : "unscanned", detail: scan.detail } });
  }
  if (!errors.documents && o.required) {
    const missing = o.required.filter((s) => !ok.some((f) => f.kind === s.id)).map((s) => s.label);
    if (missing.length) errors.documents = `Attach the required documents: ${missing.join("; ")}`;
  }
  return { errors, ok };
}

/** Keeps checked files with an application. source_id says which reply or report a file came with (null: the application itself). */
export async function storeDocuments(db: Db, applicationId: string, files: CheckedFile[], sourceId: string | null = null): Promise<void> {
  for (const f of files) await db.query(
    `INSERT INTO sponsorship_documents (id, application_id, kind, filename, mime, size_bytes, sha256, scan_status, scan_detail, data_b64, source_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [crypto.randomUUID(), applicationId, f.kind, f.name, f.mime, f.data.length, crypto.createHash("sha256").update(f.data).digest("hex"), f.scan.status, f.scan.detail, f.data.toString("base64"), sourceId]);
}
