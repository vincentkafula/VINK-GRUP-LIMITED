import { createHash } from "node:crypto";
import type { Db } from "../portal/common.js";
import { saDay } from "../portal/common.js";
import type { FileVault } from "./fileVault.js";
import type { FileScanner } from "./fileScan.js";

/**
 * THE OWNER'S DOCUMENTS (docs/OWNER_DASHBOARD.md, slice C2): the letter of recommendation, membership papers, roadworthy and insurance certificates, licence copies, driver agreements.
 *   stored      only PDF, JPEG and PNG, decided by the file's actual first bytes (never its name or what the sender says it is), at most 5 MB each
 *   encrypted   before it reaches the database (the vault), and stored as base64 text; with no key nothing is stored. The database never holds a readable copy
 *   scanned     a file the scanner calls infected or suspicious is REFUSED and never stored. "clean" means a real antivirus said so; with none switched on the honest status is "unscanned", and it is shown as that
 *   private     an owner reads only their own files; a file is sent as a download, never opened in the page
 *   erasable    deleting a file erases its bytes (the record of what it was stays, marked deleted), so a person can have their data removed
 *   limited     100 files and 100 MB per owner, 30 uploads an hour
 * The same file is stored once per owner: sending it again returns the first.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
const bad = (status: number, error: string): Fail => ({ ok: false, status, error });
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f-]{36}$/i;
export const FILE_KINDS = ["letter_of_recommendation", "membership_certificate", "membership_card", "roadworthy", "insurance", "operating_licence", "licence_disc", "driver_agreement", "other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const MAX_FILE_BYTES = 5 * 1024 * 1024, MAX_FILES = 100, MAX_TOTAL_BYTES = 100 * 1024 * 1024, MAX_UPLOADS_PER_HOUR = 30;
export const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const dayOf = (v: unknown): string | null => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

/** What a file is, from its first bytes: a PDF, a JPEG or a PNG, else null. */
export function sniff(b: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf"; if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"; return null;
}
/** A safe name to show and to download: no folders, no control characters, at most 120 characters, and the extension that matches what the file really is. */
export function safeName(raw: unknown, mime: string): string {
  let n = typeof raw === "string" ? raw : ""; n = n.split(/[\\/]/).pop() ?? ""; n = n.replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  const base = n.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim() || "document"; return `${base.slice(0, 110)}.${EXT[mime]}`;
}

export function createOwnerFiles(d: { db: Db; vault: FileVault; scanner: FileScanner; now?: () => Date }) {
  const { db, vault, scanner } = d, now = d.now ?? (() => new Date()), today = () => saDay(now());
  const meta = (r: Row) => ({ id: String(r.id), kind: String(r.kind), filename: String(r.filename), mime: String(r.mime), sizeBytes: Number(r.size_bytes), vehicleId: (r.vehicle_id as string | null) ?? null, documentId: (r.document_id as string | null) ?? null, scanStatus: String(r.scan_status), scanDetail: (r.scan_detail as string | null) ?? null, uploadedOn: dayOf(r.created_at)! });
  const live = async (owner: string) => (await db.query(`SELECT * FROM owner_files WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [owner])).rows;
  async function usage(owner: string) { const f = await live(owner); return { files: f.length, bytes: f.reduce((a, r) => a + Number(r.size_bytes), 0), maxFiles: MAX_FILES, maxBytes: MAX_TOTAL_BYTES, maxFileBytes: MAX_FILE_BYTES, storageAvailable: vault.available }; }
  async function list(owner: string, o: { vehicleId?: string; kind?: string; documentId?: string } = {}) { return (await live(owner)).filter((r) => (!o.vehicleId || String(r.vehicle_id) === o.vehicleId) && (!o.kind || r.kind === o.kind) && (!o.documentId || String(r.document_id) === o.documentId)).map(meta); }

  /** Stores a file: checks it, scans it, encrypts it, saves it. A repeat of a file the owner already has returns the first. */
  async function upload(owner: string, o: { filename: unknown; bytes: Buffer; declaredType?: string | null; kind: unknown; vehicleId?: unknown; documentId?: unknown }): Promise<Res<{ id: string; duplicate: boolean; scanStatus: string; filename: string }>> {
    if (!vault.available) return bad(503, "Document storage is not available until the platform's encryption key has been set up");
    if (!Buffer.isBuffer(o.bytes) || o.bytes.length === 0) return bad(400, "That file is empty"); if (o.bytes.length > MAX_FILE_BYTES) return bad(413, `That file is too large: at most ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    const mime = sniff(o.bytes); if (!mime) return bad(415, "Only PDF, JPEG or PNG files can be stored"); if (o.declaredType && o.declaredType.split(";")[0].trim().toLowerCase() !== mime) return bad(415, "That file is not the type it says it is");
    if (!FILE_KINDS.includes(o.kind as never)) return bad(400, "Say what the document is");
    let vehicle: string | null = null; if (o.vehicleId !== undefined && o.vehicleId !== null && o.vehicleId !== "") { const v = typeof o.vehicleId === "string" && UUID.test(o.vehicleId) ? (await db.query(`SELECT id FROM vehicles WHERE id = $1 AND owner_id = $2`, [o.vehicleId, owner])).rows[0] : null; if (!v) return bad(404, "That vehicle is not yours"); vehicle = String(v.id); }
    let doc: string | null = null; if (o.documentId !== undefined && o.documentId !== null && o.documentId !== "") { const x = typeof o.documentId === "string" && UUID.test(o.documentId) ? (await db.query(`SELECT id FROM compliance_documents WHERE id = $1 AND owner_id = $2`, [o.documentId, owner])).rows[0] : null; if (!x) return bad(404, "That document record is not yours"); doc = String(x.id); }
    const sha = createHash("sha256").update(o.bytes).digest("hex"), mine = await live(owner), same = mine.find((r) => r.sha256 === sha); if (same) return { ok: true, value: { id: String(same.id), duplicate: true, scanStatus: String(same.scan_status), filename: String(same.filename) } };
    if (mine.length >= MAX_FILES) return bad(409, `You have stored ${MAX_FILES} files, which is the most allowed: delete one you no longer need`); if (mine.reduce((a, r) => a + Number(r.size_bytes), 0) + o.bytes.length > MAX_TOTAL_BYTES) return bad(409, "That would use more than your storage allows: delete a file you no longer need");
    const since = now().getTime() - 3_600_000; if ((await db.query(`SELECT created_at FROM owner_files WHERE owner_id = $1`, [owner])).rows.filter((r) => new Date(r.created_at as string).getTime() >= since).length >= MAX_UPLOADS_PER_HOUR) return bad(429, "You have sent a lot of files in the last hour: please wait a little");
    const name = safeName(o.filename, mime), scan = await scanner.scan(o.bytes, name); if (scan.status === "infected" || scan.status === "suspicious") return bad(422, `That file was refused and not stored: ${scan.detail}`);
    const r = (await db.query(`INSERT INTO owner_files (owner_id, vehicle_id, document_id, kind, filename, mime, size_bytes, sha256, scan_status, scan_detail, scan_engine, data, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [owner, vehicle, doc, o.kind, name, mime, o.bytes.length, sha, scan.status, scan.detail.slice(0, 200), scan.engine, vault.seal(o.bytes).toString("base64"), now().toISOString()])).rows[0];
    return { ok: true, value: { id: String(r.id), duplicate: false, scanStatus: scan.status, filename: name } };
  }
  /** The file itself, decrypted, for its owner only. */
  async function download(owner: string, id: string): Promise<Res<{ filename: string; mime: string; bytes: Buffer }>> {
    const r = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT * FROM owner_files WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`, [id, owner])).rows[0] : null; if (!r || !r.data) return bad(404, "That file was not found");
    if (!vault.available) return bad(503, "Document storage is not available until the platform's encryption key has been set up");
    try { return { ok: true, value: { filename: String(r.filename), mime: String(r.mime), bytes: vault.open(Buffer.from(String(r.data), "base64")) } }; } catch { return bad(500, "That file could not be opened: it may have been damaged"); }
  }
  /** Deletes a file and ERASES its bytes. The record that it existed stays, marked deleted. */
  async function remove(owner: string, id: string): Promise<Res<{ id: string }>> {
    const r = typeof id === "string" && UUID.test(id) ? (await db.query(`SELECT id FROM owner_files WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`, [id, owner])).rows[0] : null; if (!r) return bad(404, "That file was not found");
    await db.query(`UPDATE owner_files SET data = NULL, deleted_at = $2 WHERE id = $1`, [id, now().toISOString()]); return { ok: true, value: { id } };
  }
  return { upload, download, remove, list, usage, today };
}
export type OwnerFiles = ReturnType<typeof createOwnerFiles>;
