import express, { Router, type Request, type Response, type NextFunction } from "express";
import { h, uid, fail, isUuid, audit, type Db } from "./common.js";
import { JWT_SECRET } from "../middleware/auth.js";
import { createFileVault, type FileVault } from "../services/fileVault.js";
import { createScanner, type FileScanner } from "../services/fileScan.js";
import { createOwnerFiles, MAX_FILE_BYTES } from "../services/ownerFiles.js";

/**
 * The owner's documents (docs/OWNER_DASHBOARD.md, slice C2), mounted on the owner router, so everything is scoped to the signed-in owner by construction.
 *   GET    /files                 what is stored (never the contents), and how much storage is used
 *   POST   /files?filename=&kind=&vehicleId=&documentId=   the file itself as the request body (PDF, JPEG or PNG), not wrapped in JSON: smaller on a phone, and not subject to the JSON size limit
 *   GET    /files/:id             the file, as a download only
 *   DELETE /files/:id             deletes it and erases its bytes
 * Everything is audited, including each download.
 */
const TYPES = ["application/pdf", "image/jpeg", "image/png"];
export interface FileDeps { vault?: FileVault; scanner?: FileScanner }

export function mountOwnerFiles(router: Router, db: Db, now: () => Date = () => new Date(), deps: FileDeps = {}): void {
  const svc = createOwnerFiles({ db, vault: deps.vault ?? createFileVault(process.env, JWT_SECRET), scanner: deps.scanner ?? createScanner(process.env), now }), id = (req: Request) => String(req.params.id);
  const parser = express.raw({ type: TYPES, limit: MAX_FILE_BYTES + 1024 });
  const body = (req: Request, res: Response, next: NextFunction) => parser(req, res, (err?: unknown) => { if (err) { res.status(413).json({ success: false, error: `That file is too large: at most ${MAX_FILE_BYTES / 1024 / 1024} MB` }); return; } next(); });
  const q = (req: Request, k: string) => (typeof req.query[k] === "string" ? String(req.query[k]) : undefined);
  const reply = (res: Response, r: { ok: boolean; status?: number; error?: string }, extra: Record<string, unknown>, okStatus = 200) => { if (!r.ok) { res.status(r.status ?? 400).json({ success: false, error: r.error }); return; } res.status(okStatus).json({ success: true, ...extra }); };

  router.get("/files", h(async (req, res) => { const v = q(req, "vehicleId"), k = q(req, "kind"), d = q(req, "documentId"); res.json({ success: true, files: await svc.list(uid(req), { ...(v && isUuid(v) ? { vehicleId: v } : {}), ...(k ? { kind: k } : {}), ...(d && isUuid(d) ? { documentId: d } : {}) }), usage: await svc.usage(uid(req)) }); }));
  router.post("/files", body, h(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) { fail(res, 415, "Send the file itself as the request body, with its type: PDF, JPEG or PNG"); return; }
    const r = await svc.upload(uid(req), { filename: q(req, "filename"), bytes: req.body, declaredType: req.headers["content-type"] ?? null, kind: q(req, "kind"), vehicleId: q(req, "vehicleId"), documentId: q(req, "documentId") });
    if (r.ok && !r.value.duplicate) await audit(db, req, "owner.file.upload", r.value.id, { kind: q(req, "kind"), bytes: req.body.length, scan: r.value.scanStatus });
    reply(res, r, r.ok ? { ...r.value } : {}, r.ok && !r.value.duplicate ? 201 : 200);
  }));
  router.get("/files/:id", h(async (req, res) => {
    if (!isUuid(id(req))) { fail(res, 400, "Invalid id"); return; } const r = await svc.download(uid(req), id(req)); if (!r.ok) { fail(res, r.status, r.error); return; }
    await audit(db, req, "owner.file.download", id(req)); res.setHeader("Content-Type", r.value.mime); res.setHeader("Content-Disposition", `attachment; filename="${r.value.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(r.value.filename)}`);
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox"); res.send(r.value.bytes);
  }));
  router.delete("/files/:id", h(async (req, res) => { if (!isUuid(id(req))) { fail(res, 400, "Invalid id"); return; } const r = await svc.remove(uid(req), id(req)); if (r.ok) await audit(db, req, "owner.file.delete", id(req)); reply(res, r, r.ok ? { id: r.value.id } : {}); }));
}
