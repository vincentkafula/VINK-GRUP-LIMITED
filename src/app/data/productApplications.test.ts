import { describe, it, expect } from "vitest";
import { SPECS, validateField, validateFields, visibleFields, buildSubmission, toNumber, ageOn, type FieldSpec, type Form, type ProductKind } from "./productApplications";
import { CATALOG } from "./productCatalog";

const NOW = new Date("2026-11-01T10:00:00Z");
const field = (over: Partial<FieldSpec> & Pick<FieldSpec, "kind">): FieldSpec => ({ key: "k", label: "L", ...over });
const KINDS = Object.keys(SPECS) as ProductKind[];
const allFields = (k: ProductKind) => [...SPECS[k].aboutYou, ...SPECS[k].products.flatMap((p) => SPECS[k].details(p.name))];
const complete = (k: ProductKind, product: string): Form => {
  const f: Form = { firstName: "Thandi", lastName: "Nkosi", email: "thandi@example.com", phone: "+27 82 000 0000", dateOfBirth: "1990-05-17" };
  for (const d of SPECS[k].details(product)) f[d.key] = d.options ? d.options[0].value : d.kind === "text" ? "Sample" : d.kind === "number" ? "2020" : String(Math.max(d.min ?? 0, 20_000));
  if (k === "personalLoan") f.employment = "employed";
  return f;
};

describe("what each application offers", () => {
  it("offers exactly the insurance products and the personal loans that are on the product list", () => {
    const personal = CATALOG.Personal;
    expect(SPECS.insurance.products.map((p) => p.name)).toEqual(personal.find((g) => g.group === "Insurance")!.products);
    expect(SPECS.personalLoan.products.map((p) => p.name)).toEqual(personal.find((g) => g.group === "Loans")!.products);
  });
  it("sends a type the server knows, and gives every product a distinct id and a name", () => {
    expect(SPECS.insurance.type).toBe("insurance"); expect(SPECS.personalLoan.type).toBe("personalLoan");
    for (const k of KINDS) { const ids = SPECS[k].products.map((p) => p.id); expect(new Set(ids).size).toBe(ids.length); for (const p of SPECS[k].products) expect(p.name.trim()).not.toBe(""); }
  });
  it("has unique question keys within each product, and unique values in every choice", () => {
    for (const k of KINDS) for (const p of SPECS[k].products) {
      const fields = [...SPECS[k].aboutYou, ...SPECS[k].details(p.name)]; const keys = fields.map((f) => f.key); expect(new Set(keys).size, `${k}/${p.name}`).toBe(keys.length);
      for (const f of fields) if (f.options) { const v = f.options.map((o) => o.value); expect(new Set(v).size, f.key).toBe(v.length); expect(f.kind, f.key).toBe("select"); }
    }
  });
  it("asks different questions for life insurance, funeral cover and vehicle insurance", () => {
    const keys = (p: string) => SPECS.insurance.details(p).map((f) => f.key);
    expect(keys("Life Insurance")).toContain("coverAmount"); expect(keys("Funeral Cover")).toContain("children"); expect(keys("Vehicle Insurance")).toEqual(expect.arrayContaining(["registration", "make", "model", "year", "value"]));
    expect(keys("Life Insurance")).not.toContain("registration");
  });
});

describe("what they never ask for", () => {
  it("collect no ID number, health, bank, password or card details: the identity check and the insurer handle those", () => {
    const sensitive = /id.?number|passport|medical|health|smok|disab|illness|condition|bank|account.?number|iban|password|\bpin\b|card.?number|cvv|salary.?slip/i;
    for (const k of KINDS) for (const f of allFields(k)) { expect(`${f.key} ${f.label}`, `${k}: ${f.key}`).not.toMatch(sensitive); }
  });
});

describe("what the applicant is told", () => {
  it("never claims that anything was approved, issued, activated, credited or opened", () => {
    const claim = /approved|issued|\bactive\b|activated|credited|opened|welcome bonus|congratulations|delivered|your (card|policy|loan|cover) (is|has)/i;
    for (const k of KINDS) { const s = SPECS[k]; for (const text of [s.confirmationTitle, s.confirmationBody("a@b.co"), s.notice, s.subtitle]) expect(text, `${k}: ${text}`).not.toMatch(claim); }
  });
  it("says plainly, before and after applying, that this is an application and not cover or an offer, and that it is confirmed in writing", () => {
    expect(SPECS.insurance.notice).toMatch(/does not give you cover/); expect(SPECS.insurance.confirmationBody("a@b.co")).toMatch(/not cover yet.*in writing/);
    expect(SPECS.personalLoan.notice).toMatch(/not an offer/); expect(SPECS.personalLoan.confirmationBody("a@b.co")).toMatch(/No credit is granted until it is confirmed to you in writing/);
  });
  it("makes the applicant confirm the truth, that it is not cover or credit, and the use of their information, with a credit-check consent for loans only", () => {
    for (const k of KINDS) { const keys = SPECS[k].declarations.map((d) => d.key); expect(keys).toEqual(expect.arrayContaining(["truthful", "contact", "personalInfo"])); }
    expect(SPECS.insurance.declarations.map((d) => d.key)).toContain("notCover"); expect(SPECS.insurance.declarations.map((d) => d.key)).not.toContain("creditCheck");
    expect(SPECS.personalLoan.declarations.map((d) => d.key)).toEqual(expect.arrayContaining(["notOffer", "creditCheck"]));
  });
  it("does not invent a price, a rate, a cover limit or a time to decide", () => {
    const invented = /\bR\s?\d|per month|\d+\s?%|within \d|business days|interest rate|premium of|guaranteed|instant/i;
    for (const k of KINDS) { const s = SPECS[k]; for (const t of [s.title, s.subtitle, s.notice, s.confirmationBody(""), ...s.products.map((p) => p.tagline ?? "")]) expect(t, `${k}: ${t}`).not.toMatch(invented); }
  });
});

describe("checking an answer", () => {
  it("requires what is required, and ignores an optional blank", () => {
    expect(validateField(field({ kind: "text", required: true }), { k: "  " })).toBe("Please fill this in."); expect(validateField(field({ kind: "text" }), {})).toBeNull(); expect(validateField(field({ kind: "text", required: true }), { k: "x" })).toBeNull();
  });
  it("checks an email address, a mobile number and a length", () => {
    const e = field({ kind: "email", required: true }); for (const bad of ["a", "a@b", "a b@c.co", "@x.co"]) expect(validateField(e, { k: bad }), bad).toBe("Enter a valid email address."); expect(validateField(e, { k: "a@b.co" })).toBeNull();
    const t = field({ kind: "tel", required: true }); for (const bad of ["abc", "12345", "+27 82 abc 0000", "1".repeat(16)]) expect(validateField(t, { k: bad }), bad).toBe("Enter a valid mobile number."); for (const ok of ["+27 82 000 0000", "082 000 0000", "(082) 000-0000"]) expect(validateField(t, { k: ok }), ok).toBeNull();
    expect(validateField(field({ kind: "text", maxLength: 5 }), { k: "abcdef" })).toMatch(/at most|keep this to 5/);
  });
  it("accepts only an adult's real date of birth", () => {
    const d = field({ kind: "date", required: true }); const at = (v: string) => validateField(d, { k: v }, NOW);
    expect(at("2008-11-01")).toBeNull(); expect(at("2008-11-02")).toBe("You must be 18 or older to apply."); expect(at("2020-01-01")).toBe("You must be 18 or older to apply.");
    expect(at("1900-01-01")).toBe("Please check this date."); expect(at("2025-02-30")).toBe("Enter a valid date."); expect(at("not a date")).toBe("Enter a valid date."); expect(at("1990-05-17")).toBeNull();
    expect(ageOn("2008-11-01", NOW)).toBe(18); expect(ageOn("2008-11-02", NOW)).toBe(17);
  });
  it("reads amounts the way people write them, and holds them to their limits", () => {
    for (const [text, n] of [["R 10 000", 10000], ["10,000", 10000], ["10000", 10000], ["R1 250.50", 1250.5]] as const) expect(toNumber(text), text).toBe(n);
    const m = field({ kind: "money", required: true, min: 1000, max: 5000 });
    expect(validateField(m, { k: "R 2 500" })).toBeNull(); expect(validateField(m, { k: "999" })).toBe("This must be at least R1\u00a0000."); expect(validateField(m, { k: "5001" })).toMatch(/at most R5\u00a0000/); expect(validateField(m, { k: "lots" })).toBe("Enter a number.");
    const y = field({ kind: "number", required: true, min: 1980, max: 2027 }); expect(validateField(y, { k: "2020" })).toBeNull(); expect(validateField(y, { k: "1979" })).toMatch(/at least 1/); expect(validateField(y, { k: "20.5" })).toBe("Enter a number.");
  });
  it("accepts only one of the offered choices", () => {
    const s = field({ kind: "select", required: true, options: [{ value: "a", label: "A" }] }); expect(validateField(s, { k: "a" })).toBeNull(); expect(validateField(s, { k: "b" })).toBe("Please choose one.");
  });
});

describe("questions that depend on an earlier answer", () => {
  it("asks for the employer only of someone who is employed or self-employed, and neither validates nor sends it for anyone else", () => {
    const spec = SPECS.personalLoan; const fields = spec.details("LifeAdvance"); const base = complete("personalLoan", "LifeAdvance");
    expect(visibleFields(fields, { ...base, employment: "employed" }).map((f) => f.key)).toContain("employer"); expect(visibleFields(fields, { ...base, employment: "student" }).map((f) => f.key)).not.toContain("employer");
    expect(validateFields(fields, { ...base, employment: "employed", employer: "" }, NOW)).toHaveProperty("employer"); expect(validateFields(fields, { ...base, employment: "retired", employer: "" }, NOW)).not.toHaveProperty("employer");
    expect(buildSubmission(spec, "LifeAdvance", { ...base, employment: "retired", employer: "Old Employer" }, [], NOW).formData).not.toHaveProperty("employer");
  });
});

describe("what is sent to the server", () => {
  it("is a complete, valid application for every product, with nothing left to fix", () => {
    for (const k of KINDS) for (const p of SPECS[k].products) { const form = complete(k, p.name); expect(validateFields([...SPECS[k].aboutYou, ...SPECS[k].details(p.name)], form, NOW), `${k}/${p.name}`).toEqual({}); }
  });
  it("names the applicant and the product, sends amounts as numbers, and records what they agreed to and when", () => {
    const form = { ...complete("insurance", "Life Insurance"), coverAmount: "R 1 500 000" }; const sub = buildSubmission(SPECS.insurance, "Life Insurance", form, ["truthful", "contact"], NOW);
    expect(sub).toMatchObject({ type: "insurance", subType: "Life Insurance", applicantName: "Thandi Nkosi", applicantEmail: "thandi@example.com", applicantPhone: "+27 82 000 0000" });
    expect(sub.formData).toMatchObject({ product: "Life Insurance", coverAmount: 1_500_000, dateOfBirth: "1990-05-17", declarationsAccepted: ["truthful", "contact"], declaredAt: NOW.toISOString() });
    expect(sub.formData).not.toHaveProperty("firstName"); expect(sub.formData).not.toHaveProperty("email");               // those travel as the applicant's name, email and phone
  });
  it("leaves out an answer that was not given, and answers that belong to a different product", () => {
    const form = { ...complete("insurance", "Vehicle Insurance"), registration: "  CA 123-456  ", coverAmount: "5000000" }; const data = buildSubmission(SPECS.insurance, "Vehicle Insurance", form, [], NOW).formData as Record<string, unknown>;
    expect(data.registration).toBe("CA 123-456"); expect(data).not.toHaveProperty("coverAmount"); for (const v of Object.values(data)) expect(v).not.toBe("");
  });
});
