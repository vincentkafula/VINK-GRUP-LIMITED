import { describe, it, expect } from "vitest";
import { ACCOUNT_RULES, BANK_ROLES, checkHolder, maskNumber, maskRegistration, type BankRole } from "./bankRules.js";
import { createFieldCrypto, CryptoUnavailable } from "./fieldCrypto.js";

const BIZ = { holderType: "business", businessName: "Test Association NPC", registrationNumber: "2019/123456/08" };

describe("account type rules (the table)", () => {
  const cases: [BankRole, "personal" | "business", boolean][] = [
    ["driver", "personal", true], ["driver", "business", false],
    ["marshal", "personal", true], ["marshal", "business", false],
    ["association", "business", true], ["association", "personal", false],
    ["investor", "personal", true], ["investor", "business", true],
    ["vehicle_owner", "personal", true], ["vehicle_owner", "business", true],
  ];
  it.each(cases)("%s with a %s account -> allowed: %s", (role, type, allowed) => {
    const r = checkHolder(role, type === "business" ? { ...BIZ, holderType: type } : { holderType: type });
    expect(r.ok).toBe(allowed);
  });

  it("rejects an invalid combination with the clear message, status 422 and a stable code", () => {
    expect(checkHolder("association", { holderType: "personal" })).toEqual({ ok: false, status: 422, code: "account_type_not_allowed", message: "Associations must use a Business account." });
    expect(checkHolder("driver", BIZ)).toMatchObject({ ok: false, status: 422, message: "Drivers must use a Personal account." });
    expect(checkHolder("marshal", BIZ)).toMatchObject({ ok: false, message: "Marshals must use a Personal account." });
  });

  it("covers exactly the five roles in the brief", () => { expect([...BANK_ROLES].sort()).toEqual(["association", "driver", "investor", "marshal", "vehicle_owner"]); expect(Object.keys(ACCOUNT_RULES)).toHaveLength(5); });

  it("an unknown or missing type is a plain 400", () => {
    for (const t of [undefined, "", "savings", "BUSINESS ACCOUNT", 5, null]) expect(checkHolder("owner" as BankRole, { holderType: t })).toMatchObject({ ok: false });
    expect(checkHolder("vehicle_owner", { holderType: "joint" })).toMatchObject({ ok: false, status: 400, code: "invalid_holder_type" });
  });

  it("is case-insensitive about the type and ignores surrounding spaces", () => {
    expect(checkHolder("driver", { holderType: " Personal " })).toMatchObject({ ok: true, value: { holderType: "personal" } });
  });
});

describe("business holder details", () => {
  it("accepts a valid business and tidies the name's spacing", () => {
    expect(checkHolder("association", { ...BIZ, businessName: "  Test   Association  NPC " })).toEqual({ ok: true, value: { holderType: "business", businessName: "Test Association NPC", registrationNumber: "2019/123456/08" } });
  });
  it("requires a sensible name and a registration number in the YYYY/NNNNNN/NN format", () => {
    for (const businessName of ["", "A", "x".repeat(121), "<script>", undefined]) expect(checkHolder("association", { ...BIZ, businessName })).toMatchObject({ ok: false, code: "invalid_business_name" });
    for (const registrationNumber of ["", "2019/12345/08", "2019-123456-08", "K2019123456", "2019/123456/8", " ", undefined, "2019/123456/08/1"])
      expect(checkHolder("association", { ...BIZ, registrationNumber })).toMatchObject({ ok: false, code: "invalid_registration_number" });
  });
  it("a Personal account never carries business details, even if some were sent", () => {
    expect(checkHolder("investor", { ...BIZ, holderType: "personal" })).toMatchObject({ ok: true, value: { businessName: null, registrationNumber: null } });
  });
});

describe("masking", () => {
  it("shows only the last four digits of an account number, and the year and check digits of a registration number", () => {
    expect(maskNumber("1234567890")).toBe("••••••7890"); expect(maskNumber("123")).toBe("123");
    expect(maskRegistration("2019/123456/08")).toBe("2019/••••••/08"); expect(maskRegistration(null)).toBeNull();
  });
});

describe("field encryption", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
  it("round-trips, never stores plaintext, and uses a fresh nonce each time", () => {
    const c = createFieldCrypto(env({ DATA_ENCRYPTION_KEY: key }));
    const a = c.encrypt("2019/123456/08"), b = c.encrypt("2019/123456/08");
    expect(a).not.toContain("2019"); expect(a).not.toBe(b);
    expect(c.decrypt(a)).toBe("2019/123456/08"); expect(c.decrypt(c.encrypt("Ünïcode (Pty) Ltd ✓"))).toBe("Ünïcode (Pty) Ltd ✓");
  });
  it("detects tampering and the wrong key", () => {
    const c = createFieldCrypto(env({ DATA_ENCRYPTION_KEY: key })), v = c.encrypt("secret");
    const parts = v.split("."); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(() => c.decrypt(parts.join("."))).toThrow();
    expect(() => createFieldCrypto(env({ DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") })).decrypt(v)).toThrow();
    expect(() => c.decrypt("garbage")).toThrow();
  });
  it("in production a missing key means nothing sensitive can be stored; elsewhere a derived dev key is used; a wrong-length key is refused", () => {
    expect(() => createFieldCrypto(env({ NODE_ENV: "production" }), "jwt").encrypt("x")).toThrow(CryptoUnavailable);
    expect(createFieldCrypto(env({}), "jwt").decrypt(createFieldCrypto(env({}), "jwt").encrypt("x"))).toBe("x");
    expect(() => createFieldCrypto(env({ DATA_ENCRYPTION_KEY: "c2hvcnQ=" }))).toThrow(/32 bytes/);
  });
});
