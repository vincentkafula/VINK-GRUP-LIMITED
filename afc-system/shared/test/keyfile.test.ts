import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DevKeyProvider, keyFingerprint, keyProviderFromEnv, SealedKeyProvider, sealKeys, unsealKeys, type SealedFile } from "../src";

const masters = () => ({ PICC: randomBytes(16), ADMIN: randomBytes(16), DEBIT: randomBytes(16), CREDIT: randomBytes(16), TICKET: randomBytes(16) });
const PASS = "correct horse battery staple";
const uid = Buffer.from("04a1b2c3d4e5f6", "hex");

describe("sealed key files", () => {
  it("round-trips, and the provider derives exactly the keys the plain provider does", async () => {
    const m = masters();
    const file = sealKeys(m, PASS);
    const open = unsealKeys(file, PASS);
    for (const r of ["PICC", "ADMIN", "DEBIT", "CREDIT", "TICKET"] as const) expect(open[r]!.equals(m[r])).toBe(true);
    const sealed = SealedKeyProvider.fromMasters(open), plain = new DevKeyProvider(m);
    for (const r of ["DEBIT", "CREDIT", "TICKET", "PICC", "ADMIN"] as const) expect((await sealed.cardKey(uid, r)).equals(await plain.cardKey(uid, r))).toBe(true);
  });
  it("holds no key bytes in readable form", () => {
    const m = masters();
    const text = JSON.stringify(sealKeys(m, PASS));
    for (const k of Object.values(m)) { expect(text).not.toContain(k.toString("hex")); expect(text).not.toContain(k.toString("base64")); }
  });
  it("a wrong passphrase, or any change to the file, is refused", () => {
    const f = sealKeys(masters(), PASS);
    expect(() => unsealKeys(f, "a different passphrase!")).toThrow(/could not be opened/);
    expect(() => unsealKeys({ ...f, ciphertext: (f.ciphertext.startsWith("0") ? "1" : "0") + f.ciphertext.slice(1) }, PASS)).toThrow(/could not be opened/);
    expect(() => unsealKeys({ ...f, roles: ["DEBIT"] }, PASS)).toThrow(/could not be opened/);       // the role list is authenticated too
    expect(() => unsealKeys({ ...f, kdf: { ...f.kdf, N: 1 << 25 } }, PASS)).toThrow(/unreasonable/);
  });
  it("a station file holds only its roles, and asking for another role fails clearly", async () => {
    const m = masters();
    const f = sealKeys({ DEBIT: m.DEBIT, TICKET: m.TICKET }, PASS);
    expect(f.roles).toEqual(["DEBIT", "TICKET"]);
    const p = SealedKeyProvider.fromMasters(unsealKeys(f, PASS));
    expect(p.roles).toEqual(["DEBIT", "TICKET"]);
    await expect(p.cardKey(uid, "CREDIT")).rejects.toThrow(/does not hold the CREDIT/);
  });
  it("rejects a short passphrase and a wrong-size key", () => {
    expect(() => sealKeys(masters(), "short")).toThrow(/12 characters/);
    expect(() => sealKeys({ DEBIT: Buffer.alloc(8) }, PASS)).toThrow(/16 bytes/);
  });
  it("keyProviderFromEnv uses the file when AFC_KEY_FILE is set, reading the passphrase from a file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "afck-")), m = masters();
    writeFileSync(join(dir, "v.sealed"), JSON.stringify(sealKeys({ DEBIT: m.DEBIT }, PASS)));
    writeFileSync(join(dir, "pass"), PASS + "\n");
    const p = await keyProviderFromEnv({ AFC_KEY_FILE: join(dir, "v.sealed"), AFC_KEY_PASSPHRASE_FILE: join(dir, "pass") } as NodeJS.ProcessEnv);
    expect((await p.cardKey(uid, "DEBIT")).equals(await new DevKeyProvider(m).cardKey(uid, "DEBIT"))).toBe(true);
    await expect(keyProviderFromEnv({ AFC_KEY_FILE: join(dir, "v.sealed") } as NodeJS.ProcessEnv)).rejects.toThrow(/no passphrase/);
    expect(JSON.parse(readFileSync(join(dir, "v.sealed"), "utf8")) as SealedFile).toMatchObject({ format: "afc-sealed-keys" });
  });
  it("fingerprints identify a key without revealing it", () => {
    const k = randomBytes(16);
    expect(keyFingerprint(k)).toHaveLength(8); expect(keyFingerprint(k)).toBe(keyFingerprint(Buffer.from(k)));
    expect(k.toString("hex")).not.toContain(keyFingerprint(k));
  });
});
