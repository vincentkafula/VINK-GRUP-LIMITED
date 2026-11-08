/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createOwnerRouter } from "./ownerRoutes.js";
import { randomBytes } from "node:crypto";
import { createFileVault, type FileVault } from "../services/fileVault.js";
import type { FileScanner, ScanResult } from "../services/fileScan.js";
import { delegateGate } from "./delegateGate.js";
import { createDelegates } from "../services/delegates.js";

/**
 * The owner's stored documents through the real owner router, with a real vault and a stand-in scanner, as each role. Association A has active owner members O1 and O2 and driver members; association B is a stranger with owner O3. Fixed clock: Monday 2 Nov 2026.
 * An association's routes never take an association id: everything is scoped to who is signed in.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), O3: id(5), D1: id(6), D2: id(7), D3: id(8) }, V = { v1: id(20), v2: id(21), v3: id(22), v4: id(23) };
const NOW = new Date("2026-11-02T08:00:00Z"), TODAY = "2026-11-02", L = { a: id(30), b: id(31), c: id(32), d: id(33) };
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
let db: Db, server: Server, url = "";
const KEY = randomBytes(32).toString("base64"); let VAULT: FileVault = createFileVault({ DATA_ENCRYPTION_KEY: KEY } as any); let scanResult: ScanResult = { status: "unscanned", detail: "No antivirus is switched on", engine: "builtin" };
// the router is built once per test, so it asks for the current vault each time
const VAULT_NOW: FileVault = { get available() { return VAULT.available; }, seal: (b) => VAULT.seal(b), open: (b) => VAULT.open(b) };
const SCANNER: FileScanner = { engines: [], scan: async () => scanResult };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];

beforeEach(async () => {
  db = allPortalsDb();
  for (const [i, nm, r] of [[U.A, "Langa Taxi Association", "association"], [U.B, "Other Association", "association"], [U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"], [U.O3, "Otto Owner", "vehicle_owner"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.D3, "Dina Driver", "driver"]] as const)
    await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO memberships (association_id, member_id, member_role, status, requested_by) VALUES ($1,$2,'vehicle_owner','active','member'),($1,$3,'vehicle_owner','active','member'),($4,$5,'vehicle_owner','active','member')`, [U.A, U.O1, U.O2, U.B, U.O3]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner'),($1,$3,'active','owner'),($4,$5,'active','owner')`, [U.O1, U.D2, U.D3, U.O3, U.D1]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CB 444-444','Toyota',15)`, [V.v1, U.O1, V.v2, V.v4, U.O3]);
  await db.query(`INSERT INTO driver_profiles (user_id, licence_code, licence_expiry, pdp_number, pdp_expiry) VALUES ($1,'EC1',$3,'PDP-2',$3),($2,'EC1',$3,'PDP-3',$4)`, [U.D2, U.D3, plus(400), plus(-10)]);
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { const [u, role] = String(req.header("x-test-user")).split(":"); (req as any).user = { userId: u, username: role, role }; next(); });
  app.use("/association", delegateGate(db), createAssociationRouter(db, () => NOW)); app.use("/owner", createOwnerRouter(db, () => NOW, undefined, { vault: VAULT_NOW, scanner: SCANNER }));
  app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
async function call(method: string, path: string, who: string, role: string, body?: unknown) {
  const r = await fetch(url + path, { method, headers: { "x-test-user": `${who}:${role}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any };
}




const pdf = (text = "hello") => Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj\n<<>>\nendobj\n%%EOF\n`, "latin1");
const jpg = (n = 600) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(n)]);
const FILES = (who: string, path = "", init: RequestInit = {}) => fetch(`${url}/owner/files${path}`, { ...init, headers: { "x-test-user": `${who}:vehicle_owner`, ...(init.headers as any) } });
const send = async (who: string, bytes: Buffer, type: string, params: Record<string, string> = {}) => { const qs = new URLSearchParams({ filename: "Letter of recommendation.pdf", kind: "letter_of_recommendation", ...params }); const r = await FILES(who, `?${qs}`, { method: "POST", headers: { "content-type": type }, body: bytes }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };
const list = async (who: string) => (await (await FILES(who)).json()) as any;
beforeEach(() => { VAULT = createFileVault({ DATA_ENCRYPTION_KEY: KEY } as any); scanResult = { status: "unscanned", detail: "No antivirus is switched on", engine: "builtin" }; });

describe("storing and reading documents, through the owner routes", () => {
  it("stores a file sent as the request body, lists it without its contents, and downloads exactly what was sent as an attachment that cannot be sniffed, cached or run", async () => {
    const p = pdf("a private letter"), r = await send(U.O1, p, "application/pdf", { vehicleId: V.v1 }); expect(r.status).toBe(201); expect(r.body).toMatchObject({ success: true, duplicate: false, scanStatus: "unscanned", filename: "Letter of recommendation.pdf" });
    const l = await list(U.O1); expect(l.files).toEqual([expect.objectContaining({ id: r.body.id, kind: "letter_of_recommendation", mime: "application/pdf", sizeBytes: p.length, vehicleId: V.v1, scanStatus: "unscanned" })]); expect(JSON.stringify(l)).not.toContain("private letter"); expect(l.usage).toMatchObject({ files: 1, bytes: p.length, storageAvailable: true });
    const d = await FILES(U.O1, `/${r.body.id}`); expect(d.status).toBe(200); expect(Buffer.from(await d.arrayBuffer()).equals(p)).toBe(true);
    expect(d.headers.get("content-type")).toBe("application/pdf"); expect(d.headers.get("content-disposition")).toContain('attachment; filename="Letter of recommendation.pdf"'); expect(d.headers.get("x-content-type-options")).toBe("nosniff"); expect(d.headers.get("cache-control")).toBe("private, no-store"); expect(d.headers.get("content-security-policy")).toContain("sandbox");
    expect((await q(`SELECT data FROM owner_files`))[0].data).not.toContain(p.toString("base64").slice(0, 12));                  // what is in the database is not the file
  });
  it("answers a repeat of the same file with the first, and audits an upload, a download and a delete but not the repeat", async () => {
    const p = pdf("same"), a = await send(U.O1, p, "application/pdf"), b = await send(U.O1, p, "application/pdf", { filename: "Again.pdf" }); expect([a.status, b.status, b.body.duplicate, b.body.id]).toEqual([201, 200, true, a.body.id]); await FILES(U.O1, `/${a.body.id}`); expect((await FILES(U.O1, `/${a.body.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await q(`SELECT action FROM audit_log WHERE action LIKE 'owner.file.%' ORDER BY created_at`)).map((r) => r.action)).toEqual(["owner.file.upload", "owner.file.download", "owner.file.delete"]); expect(JSON.stringify(await q(`SELECT details FROM audit_log WHERE action LIKE 'owner.file.%'`))).not.toContain("%PDF");
  });
  it("keeps one owner's files from another: not listed, not downloaded, not deleted, and not attached to someone else's vehicle", async () => {
    const r = await send(U.O1, pdf("mine"), "application/pdf"); expect((await list(U.O3)).files).toEqual([]); expect((await FILES(U.O3, `/${r.body.id}`)).status).toBe(404); expect((await FILES(U.O3, `/${r.body.id}`, { method: "DELETE" })).status).toBe(404); expect((await send(U.O3, pdf("x"), "application/pdf", { vehicleId: V.v1 })).status).toBe(404); expect((await FILES(U.O1, `/${r.body.id}`)).status).toBe(200);
  });
  it("filters the list by vehicle and kind", async () => {
    await send(U.O1, pdf("a"), "application/pdf", { vehicleId: V.v1, kind: "roadworthy" }); await send(U.O1, jpg(), "image/jpeg", { filename: "photo.jpg", kind: "insurance" }); expect((await (await FILES(U.O1, `?vehicleId=${V.v1}`)).json() as any).files.map((f: any) => f.kind)).toEqual(["roadworthy"]); expect((await (await FILES(U.O1, "?kind=insurance")).json() as any).files.map((f: any) => f.mime)).toEqual(["image/jpeg"]);
  });
  it("deletes a file and erases its bytes, so it cannot be downloaded again", async () => {
    const r = await send(U.O1, pdf("erase"), "application/pdf"); expect((await FILES(U.O1, `/${r.body.id}`, { method: "DELETE" })).status).toBe(200); expect((await q(`SELECT data, deleted_at FROM owner_files`))[0]).toMatchObject({ data: null }); expect((await FILES(U.O1, `/${r.body.id}`)).status).toBe(404); expect((await FILES(U.O1, `/${r.body.id}`, { method: "DELETE" })).status).toBe(404); expect((await list(U.O1)).files).toEqual([]);
  });
});

describe("what is refused, through the owner routes", () => {
  it("refuses a body that is not a file, a type it will not take, a file that is not what it says, and a bad kind or reference", async () => {
    expect((await FILES(U.O1, "?kind=other", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: "x" }) })).status).toBe(415); expect((await FILES(U.O1, "?kind=other", { method: "POST" })).status).toBe(415); expect((await FILES(U.O1, "?kind=other", { method: "POST", headers: { "content-type": "text/html" }, body: "<script>" })).status).toBe(415);
    expect(await send(U.O1, Buffer.from("MZ not a document"), "application/pdf")).toMatchObject({ status: 415, body: { error: expect.stringContaining("Only PDF, JPEG or PNG") } }); expect(await send(U.O1, jpg(), "application/pdf")).toMatchObject({ status: 415, body: { error: "That file is not the type it says it is" } });
    expect((await send(U.O1, pdf("k"), "application/pdf", { kind: "photo" })).status).toBe(400); expect((await send(U.O1, pdf("d"), "application/pdf", { documentId: "nope" })).status).toBe(404); expect((await FILES(U.O1, "/nope")).status).toBe(400); expect((await FILES(U.O1, "/nope", { method: "DELETE" })).status).toBe(400); expect((await FILES(U.O1, `/${id(99)}`)).status).toBe(404);
  });
  it("refuses a file that is too large with a plain message, and stores nothing", async () => {
    const big = Buffer.concat([pdf(), Buffer.alloc(5 * 1024 * 1024 + 2048)]), r = await send(U.O1, big, "application/pdf"); expect(r).toMatchObject({ status: 413, body: { success: false, error: "That file is too large: at most 5 MB" } }); expect((await q(`SELECT COUNT(*) AS n FROM owner_files`))[0].n).toBe(0);
  });
  it("refuses and does not store a file the scanner calls infected", async () => {
    scanResult = { status: "infected", detail: "Eicar-Test-Signature found", engine: "clamav" }; expect(await send(U.O1, pdf("virus"), "application/pdf")).toMatchObject({ status: 422, body: { error: "That file was refused and not stored: Eicar-Test-Signature found" } }); expect((await q(`SELECT COUNT(*) AS n FROM owner_files`))[0].n).toBe(0);
    scanResult = { status: "clean", detail: "No threat found", engine: "clamav" }; expect((await send(U.O1, pdf("fine"), "application/pdf")).body.scanStatus).toBe("clean");
  });
  it("stores and reads nothing when the platform's key is not set up", async () => {
    const r = await send(U.O1, pdf("before"), "application/pdf"); VAULT = createFileVault({ NODE_ENV: "production" } as any); expect(await send(U.O1, pdf("after"), "application/pdf")).toMatchObject({ status: 503, body: { error: expect.stringContaining("encryption key") } });
  });
});
