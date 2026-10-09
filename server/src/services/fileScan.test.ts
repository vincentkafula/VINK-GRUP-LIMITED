import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { builtInScan, clamdScan, virusTotalScan, createScanner, EICAR } from "./fileScan.js";

const buf = (s: string | number[]) => Buffer.from(s as never);
let servers: net.Server[] = [];
afterEach(() => { for (const s of servers) s.close(); servers = []; });

/** A pretend clamd: reads the INSTREAM request, answers with `reply`. */
function fakeClamd(reply: string | ((received: Buffer) => string)): Promise<number> {
  return new Promise((ok) => {
    const srv = net.createServer((sock) => {
      const chunks: Buffer[] = [];
      sock.on("data", (c) => { chunks.push(c); const all = Buffer.concat(chunks); if (all.length >= 4 && all.subarray(all.length - 4).equals(Buffer.alloc(4))) { sock.end(typeof reply === "function" ? reply(all) : reply); } });
    });
    servers.push(srv); srv.listen(0, "127.0.0.1", () => ok((srv.address() as AddressInfo).port));
  });
}

describe("built-in checks", () => {
  it("recognises the EICAR test virus anywhere in a file", () => {
    expect(builtInScan(buf(`hello ${EICAR} world`), "note.txt")).toMatchObject({ status: "infected", detail: "EICAR test virus" });
  });
  it("flags a program that is named like a document or picture", () => {
    expect(builtInScan(buf([0x4d, 0x5a, 0x90, 0x00]), "Invoice.pdf")).toMatchObject({ status: "suspicious" });
    expect(builtInScan(buf([0x7f, 0x45, 0x4c, 0x46]), "photo.jpg")?.detail).toContain("Linux program");
    expect(builtInScan(buf("#!/bin/sh\nrm -rf /"), "readme.txt")?.detail).toContain("script");
    expect(builtInScan(buf([0xcf, 0xfa, 0xed, 0xfe]), "a.png")?.detail).toContain("Mac program");
  });
  it("flags a double extension that ends in a program", () => {
    expect(builtInScan(buf("MZ"), "invoice.pdf.exe")?.status).toBe("suspicious");
    expect(builtInScan(buf("plain"), "statement.docx.js")?.detail).toContain("Two file extensions");
  });
  it("lets ordinary files through, and a real program named as a program", () => {
    expect(builtInScan(buf("%PDF-1.7 ..."), "report.pdf")).toBeNull();
    expect(builtInScan(buf([0x4d, 0x5a, 0x90, 0x00]), "setup.exe")).toBeNull();                 // honest about what it is; the panel still warns about the type
    expect(builtInScan(buf(""), "empty.txt")).toBeNull();
  });
});

describe("ClamAV", () => {
  it("streams the file in the INSTREAM format and reports a clean file", async () => {
    let got: Buffer = Buffer.alloc(0);
    const port = await fakeClamd((b) => { got = b; return "stream: OK\0"; });
    const r = await clamdScan({ host: "127.0.0.1", port }, buf("some file contents"));
    expect(r).toMatchObject({ status: "clean", engine: "ClamAV" });
    expect(got.subarray(0, 10).toString()).toBe("zINSTREAM\0");
    expect(got.readUInt32BE(10)).toBe(18); expect(got.subarray(14, 32).toString()).toBe("some file contents"); expect(got.subarray(32).equals(Buffer.alloc(4))).toBe(true);
  });
  it("splits a big file into chunks", async () => {
    let size = 0; const port = await fakeClamd((b) => { size = b.length; return "stream: OK\0"; });
    await clamdScan({ host: "127.0.0.1", port }, Buffer.alloc(200_000, 1));
    expect(size).toBe(10 + 200_000 + 4 * 4 + 4);                                                // 3 full chunks + 1 short one + the closing zero length
  });
  it("reports a virus by name", async () => {
    const port = await fakeClamd("stream: Win.Test.EICAR_HDB-1 FOUND\0");
    expect(await clamdScan({ host: "127.0.0.1", port }, buf("x"))).toMatchObject({ status: "infected", detail: "Win.Test.EICAR_HDB-1", engine: "ClamAV" });
  });
  it("returns null when clamd errors, answers nonsense, or cannot be reached", async () => {
    expect(await clamdScan({ host: "127.0.0.1", port: await fakeClamd("INSTREAM size limit exceeded. ERROR\0") }, buf("x"))).toBeNull();
    expect(await clamdScan({ host: "127.0.0.1", port: await fakeClamd("hello") }, buf("x"))).toBeNull();
    const closed = await new Promise<number>((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as AddressInfo).port; s.close(() => ok(p)); }); });
    expect(await clamdScan({ host: "127.0.0.1", port: closed, timeoutMs: 500 }, buf("x"))).toBeNull();
  });
});

describe("VirusTotal (by hash only)", () => {
  const stats = (s: Record<string, number>) => (async () => new Response(JSON.stringify({ data: { attributes: { last_analysis_stats: s } } }))) as unknown as typeof fetch;
  it("looks up only the SHA-256, never the file", async () => {
    let seen = ""; let headers: unknown; let body: unknown;
    const f = (async (u: string, i: RequestInit) => { seen = u; headers = i.headers; body = i.body; return new Response("{}", { status: 404 }); }) as unknown as typeof fetch;
    const data = buf("secret contents");
    expect(await virusTotalScan("key", data, f)).toMatchObject({ status: "unscanned", detail: "Not known to VirusTotal" });
    expect(seen).toBe(`https://www.virustotal.com/api/v3/files/${crypto.createHash("sha256").update(data).digest("hex")}`);
    expect(headers).toEqual({ "x-apikey": "key" }); expect(body).toBeUndefined();
  });
  it("turns the engines' verdicts into clean, suspicious or infected", async () => {
    expect(await virusTotalScan("k", buf("a"), stats({ malicious: 0, suspicious: 0, harmless: 10, undetected: 50 }))).toMatchObject({ status: "clean" });
    expect(await virusTotalScan("k", buf("a"), stats({ malicious: 3, harmless: 10 }))).toMatchObject({ status: "infected", detail: "3 antivirus engines flagged it" });
    expect(await virusTotalScan("k", buf("a"), stats({ malicious: 1 }))).toMatchObject({ detail: "1 antivirus engine flagged it" });
    expect(await virusTotalScan("k", buf("a"), stats({ suspicious: 2, harmless: 1 }))).toMatchObject({ status: "suspicious" });
    expect(await virusTotalScan("k", buf("a"), stats({}))).toBeNull();                          // nothing to go on is not "clean"
  });
  it("returns null on a refused key, a used-up quota, bad JSON or a network failure", async () => {
    for (const status of [401, 403, 429, 500]) expect(await virusTotalScan("k", buf("a"), (async () => new Response("", { status })) as unknown as typeof fetch)).toBeNull();
    expect(await virusTotalScan("k", buf("a"), (async () => new Response("<html>")) as unknown as typeof fetch)).toBeNull();
    expect(await virusTotalScan("k", buf("a"), (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe("the scanner as a whole", () => {
  it("with no engine switched on, a harmless file is 'unscanned' and says so honestly", async () => {
    const s = createScanner({} as NodeJS.ProcessEnv);
    expect(s.engines).toEqual([]);
    expect(await s.scan(buf("hello"), "a.pdf")).toMatchObject({ status: "unscanned", detail: "Not scanned by an antivirus", engine: "built-in" });
    expect(await s.scan(buf(EICAR), "a.txt")).toMatchObject({ status: "infected" });             // the built-in checks still run
  });
  it("is clean only when a real engine says so, and an engine's virus wins", async () => {
    const clean = createScanner({ CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(await fakeClamd("stream: OK\0")) } as never);
    expect(clean.engines).toEqual(["ClamAV"]); expect(await clean.scan(buf("hi"), "a.pdf")).toMatchObject({ status: "clean", engine: "ClamAV" });
    const virus = createScanner({ CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(await fakeClamd("stream: Bad.Thing FOUND\0")) } as never);
    expect(await virus.scan(buf("hi"), "a.pdf")).toMatchObject({ status: "infected", detail: "Bad.Thing" });
  });
  it("reports 'engineFailed' when a switched-on engine cannot be used, and 'not known' for a hash VirusTotal has not seen", async () => {
    const down = createScanner({ CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: "1" } as never);
    expect(await down.scan(buf("hi"), "a.pdf")).toMatchObject({ status: "unscanned", engineFailed: true });
    const unknown = createScanner({ VIRUSTOTAL_API_KEY: "k" } as never, (async () => new Response("", { status: 404 })) as unknown as typeof fetch);
    expect(unknown.engines).toEqual(["VirusTotal"]); expect(await unknown.scan(buf("hi"), "a.pdf")).toMatchObject({ status: "unscanned", detail: "Not known to the antivirus" });
  });
  it("lets a shape-based warning stand when the engines find nothing wrong", async () => {
    const s = createScanner({ CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String(await fakeClamd("stream: OK\0")) } as never);
    expect(await s.scan(buf([0x4d, 0x5a, 0, 0]), "x.pdf")).toMatchObject({ status: "suspicious", engine: "built-in" });
  });
});
