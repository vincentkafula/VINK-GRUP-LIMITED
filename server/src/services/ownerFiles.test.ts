/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createFileVault, VaultUnavailable } from "./fileVault.js";
import { createOwnerFiles, sniff, safeName, FILE_KINDS, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, MAX_UPLOADS_PER_HOUR, type OwnerFiles } from "./ownerFiles.js";
import type { FileScanner, ScanResult } from "./fileScan.js";

/**
 * The owner's documents, stored encrypted. Owner O1 has vehicle v1 and a document record; owner O2 has vehicle v2.
 * The clock is Monday 2 Nov 2026 at 08:00.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(3), O2: id(4) }, V = { v1: id(20), v2: id(21) }, DOC = { d1: id(30), d2: id(31) };
let NOW = new Date("2026-11-02T08:00:00Z");
const KEY = randomBytes(32).toString("base64");
const pdf = (text = "hello") => Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj\n<<>>\nendobj\n%%EOF\n`, "latin1");
const jpg = (n = 600) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(n)]);
const png = (n = 600) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(n)]);
let db: Db, files: OwnerFiles, scanResult: ScanResult, scanCalls: { name: string; size: number }[];
const scanner: FileScanner = { engines: [], scan: async (data, name) => { scanCalls.push({ name, size: data.length }); return scanResult; } };
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const put = (o: any = {}, owner = U.O1) => files.upload(owner, { filename: "Letter.pdf", bytes: pdf(), kind: "letter_of_recommendation", ...o });

beforeEach(async () => {
  NOW = new Date("2026-11-02T08:00:00Z"); scanResult = { status: "unscanned", detail: "No antivirus is switched on", engine: "builtin" }; scanCalls = [];
  db = allPortalsDb(); files = createOwnerFiles({ db, vault: createFileVault({ DATA_ENCRYPTION_KEY: KEY } as any), scanner, now: () => NOW });
  for (const [i, nm, r] of [[U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "Ona Owner", "vehicle_owner"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, nm.replace(/ /g, "").toLowerCase(), nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$4,'CA 222-222','Toyota',15)`, [V.v1, U.O1, V.v2, U.O2]);
  await db.query(`INSERT INTO compliance_documents (id, owner_id, kind, reference) VALUES ($1,$2,'letter_of_recommendation','LOR-1'),($3,$4,'letter_of_recommendation','LOR-2')`, [DOC.d1, U.O1, DOC.d2, U.O2]);
});

describe("the vault", () => {
  const vault = () => createFileVault({ DATA_ENCRYPTION_KEY: KEY } as any);
  it("seals a file so it can be opened again exactly, and the sealed form is not the file", () => {
    const p = pdf("a very private letter"), s = vault().seal(p); expect(vault().open(s).equals(p)).toBe(true); expect(s.includes(Buffer.from("a very private letter"))).toBe(false); expect(s.includes(Buffer.from("%PDF-"))).toBe(false); expect(s.length).toBe(p.length + 1 + 12 + 16); expect(s[0]).toBe(1);
  });
  it("seals the same file differently each time, so two stored copies cannot be matched", () => { const p = pdf(), a = vault().seal(p), b = vault().seal(p); expect(a.equals(b)).toBe(false); expect(vault().open(a).equals(vault().open(b))).toBe(true); });
  it("notices any change to a sealed file, whether in the data, the tag, the nonce or its length, and refuses a different key", () => {
    const s = vault().seal(pdf()); for (const at of [s.length - 1, 14, 3, 20]) { const t = Buffer.from(s); t[at] ^= 1; expect(() => vault().open(t), `byte ${at}`).toThrow(); } expect(() => vault().open(s.subarray(0, s.length - 1))).toThrow(); expect(() => vault().open(Buffer.from([2, ...s.subarray(1)]))).toThrow(/Unrecognised/); expect(() => vault().open(Buffer.alloc(5))).toThrow(/Unrecognised/);
    expect(() => createFileVault({ DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64") } as any).open(s)).toThrow();
  });
  it("is unavailable in production without a key, and never stores a readable copy; in development it can fall back to a derived key", () => {
    const prod = createFileVault({ NODE_ENV: "production" } as any, "some-secret"); expect(prod.available).toBe(false); expect(() => prod.seal(pdf())).toThrow(VaultUnavailable); expect(() => prod.open(Buffer.concat([Buffer.from([1]), Buffer.alloc(39)]))).toThrow(VaultUnavailable);
    const dev = createFileVault({ NODE_ENV: "development" } as any, "some-secret"); expect(dev.available).toBe(true); expect(dev.open(dev.seal(pdf())).equals(pdf())).toBe(true); expect(createFileVault({ NODE_ENV: "development" } as any).available).toBe(false);
    expect(createFileVault({ DATA_ENCRYPTION_KEY: KEY, NODE_ENV: "production" } as any).available).toBe(true);
  });
  it("refuses a key that is not 32 bytes", () => { expect(() => createFileVault({ DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") } as any)).toThrow(/32 bytes/); });
});

describe("what a file is, and what it is called", () => {
  it("is a PDF, a JPEG or a PNG by its first bytes, and nothing else, whatever it is named", () => {
    expect(sniff(pdf())).toBe("application/pdf"); expect(sniff(jpg())).toBe("image/jpeg"); expect(sniff(png())).toBe("image/png");
    for (const b of [Buffer.from("MZ\x90\x00 a program"), Buffer.from("hello"), Buffer.alloc(0), Buffer.from("%PDF"), Buffer.from(" %PDF-1.4"), Buffer.from([0xff, 0xd8]), Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from("GIF89a"), Buffer.from("PK\x03\x04 a zip"), Buffer.from("<html><script>alert(1)</script>")]) expect(sniff(b), b.subarray(0, 8).toString("latin1")).toBeNull();
  });
  it("makes a safe name: no folders, no control or reserved characters, at most 120 characters, and the extension the file really has", () => {
    expect(safeName("../../etc/passwd", "application/pdf")).toBe("passwd.pdf"); expect(safeName("C:\\Users\\Olu\\Letter of rec.PDF", "application/pdf")).toBe("Letter of rec.pdf"); expect(safeName("scan\u0000\u0007.jpg", "image/jpeg")).toBe("scan.jpg"); expect(safeName('a<b>c:"d"|e?f*.png', "image/png")).toBe("abcdef.png");
    expect(safeName("photo.pdf", "image/jpeg")).toBe("photo.jpg"); expect(safeName("", "image/png")).toBe("document.png"); expect(safeName(undefined, "application/pdf")).toBe("document.pdf"); expect(safeName("...hidden", "application/pdf")).toBe("hidden.pdf"); expect(safeName("  many   spaces  .pdf", "application/pdf")).toBe("many spaces.pdf"); expect(safeName("Lêtter ünïcode.pdf", "application/pdf")).toBe("Lêtter ünïcode.pdf");
    const long = safeName("x".repeat(300) + ".pdf", "application/pdf"); expect(long.length).toBe(114); expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("storing a file", () => {
  it("stores it encrypted, recording its real type, size, hash and what the scanner said, and the stored bytes are not the file", async () => {
    const p = pdf("secret contents"), r = ok<any>(await put({ bytes: p, vehicleId: V.v1, documentId: DOC.d1 })); expect(r).toMatchObject({ duplicate: false, scanStatus: "unscanned", filename: "Letter.pdf" });
    const row = (await q(`SELECT * FROM owner_files`))[0]; expect(row).toMatchObject({ owner_id: U.O1, vehicle_id: V.v1, document_id: DOC.d1, kind: "letter_of_recommendation", filename: "Letter.pdf", mime: "application/pdf", size_bytes: p.length, scan_status: "unscanned", scan_engine: "builtin" }); expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    const stored = Buffer.from(row.data, "base64"); expect(stored.equals(p)).toBe(false); expect(stored.includes(Buffer.from("secret contents"))).toBe(false); expect(String(row.data)).not.toContain("secret"); expect(stored.length).toBe(p.length + 29); expect(createFileVault({ DATA_ENCRYPTION_KEY: KEY } as any).open(stored).equals(p)).toBe(true); expect(scanCalls).toEqual([{ name: "Letter.pdf", size: p.length }]);
  });
  it("decides the type from the bytes, whatever the name or the declared type claims, and refuses a mismatch", async () => {
    expect((await q(`SELECT 1 AS x`)).length).toBe(1); ok(await put({ bytes: jpg(), filename: "photo.pdf" })); expect((await q(`SELECT mime, filename FROM owner_files`))[0]).toEqual({ mime: "image/jpeg", filename: "photo.jpg" });
    expect(await put({ bytes: pdf("x"), declaredType: "image/png" })).toMatchObject({ ok: false, status: 415, error: "That file is not the type it says it is" }); ok(await put({ bytes: pdf("y"), declaredType: "application/pdf; charset=binary" })); ok(await put({ bytes: pdf("z"), declaredType: null }));
  });
  it("refuses what is not a PDF, JPEG or PNG, an empty file, and one over 5 MB, but takes exactly 5 MB", async () => {
    for (const [bytes, st, why] of [[Buffer.from("MZ\x90 a program.pdf"), 415, /Only PDF, JPEG or PNG/], [Buffer.from("just text"), 415, /Only PDF/], [Buffer.alloc(0), 400, /empty/], [Buffer.concat([pdf(), Buffer.alloc(MAX_FILE_BYTES)]), 413, /at most 5 MB/]] as const) expect(await put({ bytes }), String(st)).toMatchObject({ ok: false, status: st, error: expect.stringMatching(why) });
    const exact = Buffer.concat([pdf("exact"), Buffer.alloc(MAX_FILE_BYTES - pdf("exact").length)]); expect(exact.length).toBe(MAX_FILE_BYTES); scanResult = { status: "infected", detail: "stop here", engine: "t" }; expect(await put({ bytes: exact })).toMatchObject({ ok: false, status: 422 });                  // past the size check: only the scanner stopped it
    scanResult = { status: "unscanned", detail: "none", engine: "t" }; ok(await put({ bytes: exact })); expect((await q(`SELECT size_bytes FROM owner_files`))[0].size_bytes).toBe(MAX_FILE_BYTES); expect(await put({ bytes: "not a buffer" as any })).toMatchObject({ ok: false, status: 400 });
  });
  it("needs the kind to be one of the known documents, and a vehicle and a document record that are the owner's own", async () => {
    for (const k of [undefined, "", "photo", "OTHER"]) expect(await put({ bytes: pdf(String(k)), kind: k }), String(k)).toMatchObject({ ok: false, status: 400 }); for (const k of FILE_KINDS) ok(await put({ bytes: pdf(k), kind: k }));
    expect(await put({ bytes: pdf("v"), vehicleId: V.v2 })).toMatchObject({ ok: false, status: 404 }); expect(await put({ bytes: pdf("v"), vehicleId: "nope" })).toMatchObject({ ok: false, status: 404 }); expect(await put({ bytes: pdf("d"), documentId: DOC.d2 })).toMatchObject({ ok: false, status: 404 }); expect(await put({ bytes: pdf("d"), documentId: "nope" })).toMatchObject({ ok: false, status: 404 });
    expect(await put({ bytes: pdf("v"), vehicleId: V.v1 }, U.O2)).toMatchObject({ ok: false, status: 404 });
  });
  it("refuses a file the scanner calls infected or suspicious and stores nothing, but stores clean and unscanned ones with their honest status", async () => {
    scanResult = { status: "infected", detail: "Eicar-Test-Signature found", engine: "clamav" }; expect(await put({ bytes: pdf("bad") })).toMatchObject({ ok: false, status: 422, error: "That file was refused and not stored: Eicar-Test-Signature found" }); scanResult = { status: "suspicious", detail: "A program is disguised as a document", engine: "builtin" }; expect(await put({ bytes: pdf("bad2") })).toMatchObject({ ok: false, status: 422 }); expect((await q(`SELECT COUNT(*) AS n FROM owner_files`))[0].n).toBe(0);
    scanResult = { status: "clean", detail: "No threat found", engine: "clamav" }; expect(ok<any>(await put({ bytes: pdf("good") })).scanStatus).toBe("clean"); expect((await files.list(U.O1))[0]).toMatchObject({ scanStatus: "clean", scanDetail: "No threat found" });
  });
  it("stores nothing when the platform's key is not set up, rather than a readable copy", async () => {
    const f = createOwnerFiles({ db, vault: createFileVault({ NODE_ENV: "production" } as any, "x"), scanner, now: () => NOW }); expect(await f.upload(U.O1, { filename: "a.pdf", bytes: pdf(), kind: "other" })).toMatchObject({ ok: false, status: 503, error: expect.stringContaining("encryption key") }); expect((await q(`SELECT COUNT(*) AS n FROM owner_files`))[0].n).toBe(0); expect(scanCalls).toEqual([]); expect((await f.usage(U.O1)).storageAvailable).toBe(false);
  });
  it("stores the same file once per owner: a repeat returns the first, another owner may store it, and after deleting it can be stored again", async () => {
    const p = pdf("same"), a = ok<any>(await put({ bytes: p })), b = ok<any>(await put({ bytes: p, filename: "Other name.pdf", kind: "other" })); expect([a.duplicate, b.duplicate, b.id, b.filename]).toEqual([false, true, a.id, "Letter.pdf"]); expect((await q(`SELECT COUNT(*) AS n FROM owner_files`))[0].n).toBe(1); expect(scanCalls).toHaveLength(1);
    expect(ok<any>(await put({ bytes: p }, U.O2)).duplicate).toBe(false); ok(await files.remove(U.O1, a.id)); expect(ok<any>(await put({ bytes: p })).duplicate).toBe(false);
  });
  it("limits how many files, how much storage and how many uploads an hour, counting only what is still stored for the first two", async () => {
    const fill = async (n: number, size = 1000, at = NOW) => { for (let g = 0; g < n; g++) await db.query(`INSERT INTO owner_files (owner_id, kind, filename, mime, size_bytes, sha256, scan_status, data, created_at) VALUES ($1,'other','f.pdf','application/pdf',$2,$3,'unscanned',NULL,$4)`, [U.O1, size, `h${g}-${size}-${at.getTime()}`, at.toISOString()]); };
    await fill(MAX_FILES, 1000, new Date(NOW.getTime() - 2 * 3_600_000)); expect(await put({ bytes: pdf("over") })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("100 files") }); await db.query(`UPDATE owner_files SET deleted_at = $1 WHERE sha256 = (SELECT sha256 FROM owner_files LIMIT 1)`, [NOW.toISOString()]); ok(await put({ bytes: pdf("now fits") }));
    await db.query(`DELETE FROM owner_files`); await fill(1, MAX_TOTAL_BYTES - 10, new Date(NOW.getTime() - 2 * 3_600_000)); expect(await put({ bytes: pdf("too much") })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("storage allows") });
    await db.query(`DELETE FROM owner_files`); await fill(MAX_UPLOADS_PER_HOUR, 10); expect(await put({ bytes: pdf("a lot") })).toMatchObject({ ok: false, status: 429 }); NOW = new Date(NOW.getTime() + 3_600_000 + 1000); ok(await put({ bytes: pdf("later") }));
  });
});

describe("reading a file back", () => {
  it("returns exactly what was stored, with its name and type, to its owner only", async () => {
    const p = png(), r = ok<any>(await put({ bytes: p, filename: "Roadworthy.png", kind: "roadworthy" })), f = ok<any>(await files.download(U.O1, r.id)); expect(f).toMatchObject({ filename: "Roadworthy.png", mime: "image/png" }); expect(f.bytes.equals(p)).toBe(true);
    expect(await files.download(U.O2, r.id)).toMatchObject({ ok: false, status: 404 }); for (const bad of ["nope", id(99), ""]) expect(await files.download(U.O1, bad), bad).toMatchObject({ ok: false, status: 404 });
  });
  it("says so when a stored file has been damaged, and when the key is not available", async () => {
    const r = ok<any>(await put()); const row = (await q(`SELECT data FROM owner_files`))[0], bad = Buffer.from(row.data, "base64"); bad[bad.length - 1] ^= 1; await db.query(`UPDATE owner_files SET data = $1`, [bad.toString("base64")]); expect(await files.download(U.O1, r.id)).toMatchObject({ ok: false, status: 500, error: expect.stringContaining("damaged") });
    const f = createOwnerFiles({ db, vault: createFileVault({ NODE_ENV: "production" } as any), scanner, now: () => NOW }); expect(await f.download(U.O1, r.id)).toMatchObject({ ok: false, status: 503 });
  });
});

describe("deleting a file", () => {
  it("erases the bytes and keeps the record that it existed, once, and only the owner's own", async () => {
    const r = ok<any>(await put({ bytes: pdf("erase me") })); expect(await files.remove(U.O2, r.id)).toMatchObject({ ok: false, status: 404 }); expect(await files.remove(U.O1, "nope")).toMatchObject({ ok: false, status: 404 }); ok(await files.remove(U.O1, r.id));
    const row = (await q(`SELECT data, deleted_at, filename, size_bytes FROM owner_files`))[0]; expect(row.data).toBeNull(); expect(row.deleted_at).not.toBeNull(); expect(row).toMatchObject({ filename: "Letter.pdf" }); expect(await files.remove(U.O1, r.id)).toMatchObject({ ok: false, status: 404 }); expect(await files.download(U.O1, r.id)).toMatchObject({ ok: false, status: 404 });
    expect(await files.list(U.O1)).toEqual([]); expect(await files.usage(U.O1)).toMatchObject({ files: 0, bytes: 0 });
  });
});

describe("listing and storage used", () => {
  it("lists only the owner's files, newest first, filtered by vehicle, kind and document, never with the file's contents", async () => {
    ok(await put({ bytes: pdf("one"), vehicleId: V.v1, kind: "roadworthy" })); NOW = new Date(NOW.getTime() + 60_000); ok(await put({ bytes: pdf("two"), kind: "letter_of_recommendation", documentId: DOC.d1 })); ok(await put({ bytes: pdf("theirs") }, U.O2));
    const all = await files.list(U.O1); expect(all.map((f) => [f.kind, f.vehicleId, f.documentId])).toEqual([["letter_of_recommendation", null, DOC.d1], ["roadworthy", V.v1, null]]); expect((await files.list(U.O1, { vehicleId: V.v1 })).map((f) => f.kind)).toEqual(["roadworthy"]); expect((await files.list(U.O1, { kind: "letter_of_recommendation" })).length).toBe(1); expect((await files.list(U.O1, { documentId: DOC.d1 })).length).toBe(1); expect((await files.list(U.O2)).length).toBe(1);
    expect(JSON.stringify(all)).not.toContain("data"); expect(JSON.stringify(all)).not.toContain("sha256"); expect(all[0]).toMatchObject({ mime: "application/pdf", scanStatus: "unscanned", uploadedOn: "2026-11-02" });
  });
  it("reports how much is used, and the limits", async () => { const a = pdf("a"), b = jpg(1000); ok(await put({ bytes: a })); ok(await put({ bytes: b })); expect(await files.usage(U.O1)).toEqual({ files: 2, bytes: a.length + b.length, maxFiles: 100, maxBytes: 100 * 1024 * 1024, maxFileBytes: 5 * 1024 * 1024, storageAvailable: true }); expect((await files.usage(U.O2)).files).toBe(0); });
});
