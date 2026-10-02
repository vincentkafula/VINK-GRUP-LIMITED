import { describe, it, expect, beforeAll, afterAll } from "vitest";
import https from "https";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import type { AddressInfo } from "net";
import { VisaDpsServicing } from "./visaDps.js";
import { VisaPavValidation } from "./visaPav.js";
import { twoWayAuthenticator } from "./visaHttp.js";
import { buildVisaAuth, loadPem } from "./visaAuth.js";
import { resolvePaymentsConfig } from "../config.js";
import { getCardServicingProvider } from "./registry.js";

/**
 * Real mutual-TLS round trip against a local HTTPS server that REQUIRES a client certificate, using throwaway certificates
 * made with openssl. Proves the client certificate is actually presented, that the API key and Basic header are sent, and that
 * a client without a certificate is refused. Skipped if openssl is not installed.
 */
let hasOpenssl = true;
try { execFileSync("openssl", ["version"], { stdio: "ignore" }); } catch { hasOpenssl = false; }

describe.skipIf(!hasOpenssl)("Visa two-way SSL (local mutual-TLS server)", () => {
  let dir = "", server: https.Server, base = "";
  const seen: { authorized: boolean; url: string; auth?: string; body: string }[] = [];
  const file = (n: string) => path.join(dir, n);
  const read = (n: string) => fs.readFileSync(file(n), "utf8");

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtls-"));
    const sh = (...a: string[]) => execFileSync("openssl", a, { cwd: dir, stdio: "ignore" });
    sh("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-subj", "/CN=Test CA", "-days", "2");
    for (const [name, cn, san] of [["server", "localhost", "subjectAltName=DNS:localhost,IP:127.0.0.1"], ["client", "manshya-client", "subjectAltName=DNS:client"]] as const) {
      sh("req", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${cn}`);
      fs.writeFileSync(file(`${name}.ext`), san);
      sh("x509", "-req", "-in", `${name}.csr`, "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", `${name}.pem`, "-days", "2", "-extfile", `${name}.ext`);
    }
    server = https.createServer({ key: read("server.key"), cert: read("server.pem"), ca: read("ca.pem"), requestCert: true, rejectUnauthorized: false }, (req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const authorized = (req.socket as unknown as { authorized: boolean }).authorized;
        seen.push({ authorized, url: req.url ?? "", auth: req.headers.authorization, body });
        if (!authorized) { res.statusCode = 403; res.end("no client certificate"); return; }
        res.setHeader("content-type", "application/json");
        if (req.url?.startsWith("/pav/")) res.end(JSON.stringify({ actionCode: "00", transactionIdentifier: "123456789012345" }));
        else res.end(JSON.stringify({ resource: { cardId: "card-123" } }));
      });
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    base = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server?.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  const tls = () => ({ cert: read("client.pem"), key: read("client.key"), ca: read("ca.pem") });

  it("presents the client certificate, sends the API key and Basic credentials (DPS)", async () => {
    seen.length = 0;
    const dps = new VisaDpsServicing({ baseUrl: base, programType: "debit", authenticate: twoWayAuthenticator("TWOWAYKEY", { userId: "u", password: "p" }), tls: tls() });
    expect(await dps.registerCard({ primaryAccountNumber: "4111111111111111" })).toEqual({ cardId: "card-123" });
    expect(seen[0]).toMatchObject({ authorized: true });
    expect(seen[0].url).toBe("/dcas/cardservices/v2/cards?apiKey=TWOWAYKEY");
    expect(seen[0].auth).toBe("Basic " + Buffer.from("u:p").toString("base64"));
    expect(JSON.parse(seen[0].body)).toEqual({ primaryAccountNumber: "4111111111111111" });
  });

  it("works for Payment Account Validation too", async () => {
    const pav = new VisaPavValidation({ baseUrl: base, authenticate: twoWayAuthenticator("K"), tls: tls(), acquiringBin: "408999", acquirerCountryCode: "840", cardAcceptor: { name: "M", idCode: "1", terminalId: "1" } });
    expect(await pav.validate({ primaryAccountNumber: "4111111111111111", expiry: "2040-10" })).toMatchObject({ valid: true, actionCode: "00" });
  });

  it("a client WITHOUT a certificate is refused by the server", async () => {
    const dps = new VisaDpsServicing({ baseUrl: base, programType: "debit", authenticate: twoWayAuthenticator("K"), tls: { cert: "", key: "", ca: read("ca.pem") } as never });
    await expect(dps.registerCard({ primaryAccountNumber: "4111111111111111" })).rejects.toThrow();
  });

  it("verifies the server certificate (an untrusted server is rejected)", async () => {
    const dps = new VisaDpsServicing({ baseUrl: base, programType: "debit", authenticate: twoWayAuthenticator("K"), tls: { cert: read("client.pem"), key: read("client.key") } });   // no CA given
    await expect(dps.registerCard({ primaryAccountNumber: "4111111111111111" })).rejects.toThrow(/connection failed/);
  });

  it("builds from configuration using PEM text, base64 or a file path, and the registry wires it up", async () => {
    const b64 = (n: string) => Buffer.from(read(n)).toString("base64");
    const env = {
      CARD_SERVICING_PROVIDER: "visa_dps", SANDBOX_VISA_AUTH: "two_way_ssl", SANDBOX_VISA_API_KEY: "CFGKEY", SANDBOX_VISA_BASE_URL: base,
      SANDBOX_VISA_CLIENT_CERT: read("client.pem").replace(/\n/g, "\\n"), SANDBOX_VISA_CLIENT_KEY: b64("client.key"), SANDBOX_VISA_CA: file("ca.pem"),
    } as unknown as NodeJS.ProcessEnv;
    seen.length = 0;
    const p = getCardServicingProvider(resolvePaymentsConfig(env));
    expect(await p.registerCard({ primaryAccountNumber: "4111111111111111" })).toEqual({ cardId: "card-123" });
    expect(seen[0].url).toContain("apiKey=CFGKEY");
    expect(seen[0].authorized).toBe(true);
  });
});

describe("two-way SSL configuration", () => {
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  const two = { CARD_SERVICING_PROVIDER: "visa_dps", SANDBOX_VISA_AUTH: "two_way_ssl", SANDBOX_VISA_API_KEY: "k", SANDBOX_VISA_CLIENT_CERT: "-----BEGIN CERTIFICATE-----x", SANDBOX_VISA_CLIENT_KEY: "-----BEGIN PRIVATE KEY-----x" };
  it("needs the key, certificate and private key", () => {
    expect(resolvePaymentsConfig(env(two)).visaDps?.auth.kind).toBe("two_way_ssl");
    const { SANDBOX_VISA_CLIENT_KEY: _k, ...noKey } = two;
    expect(() => resolvePaymentsConfig(env(noKey))).toThrow(/two_way_ssl needs/);
  });
  it("needs user id and password together, and knows only two schemes", () => {
    expect(() => resolvePaymentsConfig(env({ ...two, SANDBOX_VISA_USER_ID: "u" }))).toThrow(/together/);
    expect(() => resolvePaymentsConfig(env({ ...two, SANDBOX_VISA_AUTH: "oauth" }))).toThrow(/x_pay or two_way_ssl/);
  });
  it("refuses an encrypted private key and non-PEM input", () => {
    expect(() => buildVisaAuth({ kind: "two_way_ssl", apiKey: "k", cert: "-----BEGIN CERTIFICATE-----x", key: "-----BEGIN ENCRYPTED PRIVATE KEY-----x" })).toThrow(/passphrase/);
    expect(() => loadPem("not a pem", "X")).toThrow(/not PEM/);
  });
});
