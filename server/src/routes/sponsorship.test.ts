import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail, type EmailMessage, type EmailSender } from "../auth/email.js";
import { EICAR } from "../services/fileScan.js";
import { createSponsorshipService, TRANSITIONS, type SponsorshipService, type UploadedFile } from "../services/sponsorshipService.js";
import { createSponsorshipRouter, createSponsorshipAdminRouter } from "./sponsorshipRouter.js";
import { documentSlots, checkAnswers, FILE_RULES, STATUSES, CATEGORIES, ORG_TYPES } from "../config/sponsorship.js";

let db: Db, mail: ConsoleEmail, svc: SponsorshipService, clock = new Date("2026-10-09T10:00:00Z");

const pdf = (tag = "") => Buffer.from(`%PDF-1.4\n% a test document ${tag}\n%%EOF`);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png body")]);
const zip = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("zip body \u00ff\u0000\u0010")]);
const file = (kind: string, name: string, data: Buffer): UploadedFile => ({ kind, filename: name, data });
const ngoDocs = (): UploadedFile[] => [file("proposal", "proposal.pdf", pdf("p")), file("registration", "npo certificate.pdf", pdf("r")), file("budget", "budget.xlsx", zip())];

const good = {
  orgType: "ngo", applicantName: "Thandi Nkosi", organisation: "Khayelitsha Youth Hub", registrationNumber: "NPO 123-456", contactPerson: "Thandi Nkosi", email: "Thandi@Example.com", phone: "082 000 0000",
  physicalAddress: "12 Lingelethu Road, Khayelitsha", postalAddress: "", country: "South Africa", province: "Western Cape", city: "Cape Town", website: "https://youthhub.example", socialLinks: "",
  taxStatus: "exempt", taxNumber: "930012345",
  category: "youth",
  projectTitle: "Township Entrepreneurs Bootcamp", executiveSummary: "A twelve week business skills programme for sixty young people in Khayelitsha, ending with a pitch day judged by local business owners.",
  background: "Youth unemployment in our area is above sixty percent. Our objective is to give young people practical skills to start small businesses.",
  problem: "Young people leave school without any practical business training and have no access to mentors or start-up capital.",
  targetAudience: "Unemployed young people aged 18 to 25", geographicArea: "Khayelitsha, Cape Town", beneficiaries: 60, startDate: "2026-11-01", endDate: "2026-12-15",
  implementationPlan: "Weeks one to four cover basics. Weeks five to eight are mentored practice. Weeks nine to twelve are pitch preparation and the pitch day.",
  outcomes: "Sixty participants complete the programme and at least twenty start a business within six months, tracked by follow-up surveys.",
  whyVink: "VINK serves the taxi industry that our participants and their families depend on every day.",
  alignment: "The programme supports township economic development, one of VINK's published focus areas.",
  currency: "ZAR", totalBudget: 80000, amountRequested: 50000, ownContribution: 20000, otherSponsorsAmount: 10000, otherSponsorsNotes: "Local ward committee",
  expenditure: [{ description: "Facilitators", amount: 45000 }, { description: "Venue and materials", amount: 25000 }, { description: "Pitch day", amount: 10000 }],
  requestedItems: "", financialControls: "Two signatories on every payment, monthly reports to the board, and an independent examiner.",
  benefits: ["logo", "social"], benefitsValue: "Logo on all materials and about four thousand people reached through our social channels.",
  consent: { accuracy: true, authorised: true, terms: true, processing: true },
};

beforeEach(() => { db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date("2026-10-09T10:00:00Z"); svc = createSponsorshipService({ db, mail, env: {} as NodeJS.ProcessEnv, now: () => clock }); });

describe("which documents an application needs", () => {
  const required = (org: string, cat: string) => documentSlots(org, cat).filter((s) => s.required).map((s) => s.id);
  it("depends on who is applying and what for", () => {
    expect(required("ngo", "youth")).toEqual(["proposal", "registration", "budget"]);
    expect(required("company", "sports")).toEqual(["proposal", "registration", "budget"]);
    expect(required("individual", "community")).toEqual(["proposal", "budget", "proof_of_address"]);
    expect(required("ngo", "events")).toContain("programme");
    expect(required("ngo", "equipment")).toContain("quotations");
    expect(required("ngo", "technology")).toContain("quotations");
    expect(required("ngo", "media")).toContain("media_kit");
    expect(required("ngo", "youth")).not.toContain("programme");
  });
  it("names the registration document for the kind of organisation", () => {
    const label = (org: string) => documentSlots(org, "youth").find((s) => s.id === "registration")?.label;
    expect(label("company")).toBe("Company registration documents");
    expect(label("ngo")).toBe("NGO or charity registration certificate");
    expect(label("school")).toBe("Proof of NPO or community organisation registration");
    expect(label("individual")).toBeUndefined();
  });
  it("has twelve categories, six organisation types, and a status for each stage", () => {
    expect(CATEGORIES).toHaveLength(12); expect(ORG_TYPES).toHaveLength(6);
    expect(STATUSES).toEqual(["submitted", "under_review", "more_information_required", "approved", "declined", "agreement_pending"]);
    for (const s of STATUSES) expect(TRANSITIONS[s]).toBeDefined();
  });
});

describe("checking the answers (the one function the form and the server both run)", () => {
  it("accepts good answers and hands them back cleaned", () => {
    const { data, errors } = checkAnswers({ ...good, email: "  Thandi@Example.COM ", projectTitle: "Bootcamp\r\n  ", beneficiaries: "60", totalBudget: "80 000", amountRequested: "50,000" }, "2026-10-09");
    expect(errors).toEqual({}); expect(data).toMatchObject({ email: "thandi@example.com", projectTitle: "Bootcamp", beneficiaries: 60, totalBudget: 80000, amountRequested: 50000, organisation: "Khayelitsha Youth Hub" });
  });
  it("removes control characters from what people type, but keeps the line breaks in a long answer", () => {
    const { data, errors } = checkAnswers({ ...good, applicantName: "Tha\u0000ndi\u0007 Nkosi\u007f", executiveSummary: good.executiveSummary + "\n\nSecond paragraph.\u0008" }, "2026-10-09");
    expect(errors).toEqual({}); expect(data.applicantName).toBe("Thandi Nkosi");
    expect(data.executiveSummary.endsWith("\n\nSecond paragraph.")).toBe(true); expect(data.executiveSummary).not.toMatch(/[\u0000-\u0008\u007f]/);
  });
  it("names every wrong answer at once, not just the first", () => {
    const { errors } = checkAnswers({}, "2026-10-09");
    expect(Object.keys(errors).sort()).toEqual(["amountRequested", "applicantName", "background", "benefits", "benefitsValue", "beneficiaries", "category", "city", "consent.accuracy", "consent.authorised", "consent.processing", "consent.terms", "contactPerson", "country", "currency", "email", "endDate", "executiveSummary", "expenditure", "financialControls", "geographicArea", "implementationPlan", "orgType", "organisation", "outcomes", "phone", "physicalAddress", "problem", "projectTitle", "province", "startDate", "targetAudience", "taxStatus", "totalBudget", "whyVink", "alignment"].sort());
  });
  it("does not need an organisation name from an individual, who is their own organisation", () => {
    const { data, errors } = checkAnswers({ ...good, orgType: "individual", organisation: "" }, "2026-10-09");
    expect(errors.organisation).toBeUndefined(); expect(data.organisation).toBe("Thandi Nkosi");
  });
  it("checks the rand limits itself for a request made in rand, but leaves other currencies to the server", () => {
    expect(checkAnswers({ ...good, totalBudget: 4000, amountRequested: 4000, ownContribution: 0, otherSponsorsAmount: 0, expenditure: [{ description: "All", amount: 4000 }] }, "2026-10-09").errors.amountRequested).toMatch(/between R5.?000 and R500.?000/);
    expect(checkAnswers({ ...good, currency: "USD", totalBudget: 100, amountRequested: 100, ownContribution: 0, otherSponsorsAmount: 0, expenditure: [{ description: "All", amount: 100 }] }, "2026-10-09").errors.amountRequested).toBeUndefined();
  });
});

describe("taking an application", () => {
  it("stores it, emails the team with the documents attached and the applicant as the reply address, and sends the applicant a receipt", async () => {
    const r = await svc.submit(good, ngoDocs());
    expect(r).toMatchObject({ ok: true, respondWithin: "1–2 business days" });
    const ref = (r as { ref: string }).ref; expect(ref).toMatch(/^SP-[A-Z2-9]{6}$/);
    expect(mail.sent).toHaveLength(2);
    const [team, receipt] = mail.sent;
    expect(team).toMatchObject({ to: "sponsorships@vink.co.za", from: "VINK Sponsorships and Partnerships <sponsorships@vink.co.za>", replyTo: "Thandi Nkosi <thandi@example.com>" });
    expect(team.subject).toContain(ref); expect(team.subject).toContain("Township Entrepreneurs Bootcamp");
    expect(team.text).toContain("Khayelitsha Youth Hub"); expect(team.text).toContain("Offered to VINK: Brand logo placement, Social media exposure");
    expect(team.attachments?.map((a) => a.filename).sort()).toEqual(["budget.xlsx", "npo certificate.pdf", "proposal.pdf"]);
    expect(receipt).toMatchObject({ to: "thandi@example.com", replyTo: "sponsorships@vink.co.za" });
    expect(receipt.text).toContain(ref); expect(receipt.text).toContain("quarterly basis"); expect(receipt.text).toContain("within 6 weeks of the review date"); expect(receipt.text).toMatch(/never send us a password/);
    const list = await svc.list();
    expect(list.applications[0]).toMatchObject({ ref, status: "submitted", organisation: "Khayelitsha Youth Hub", email: "thandi@example.com", amountRequested: 50000, amountZar: 50000, delivered: true });
  });

  it("keeps every document byte for byte, with its checksum and scan result", async () => {
    const docs = ngoDocs(); const ref = ((await svc.submit(good, docs)) as { ref: string }).ref;
    const a = (await svc.get(ref))!;
    expect(a.documents).toHaveLength(3);
    for (const d of a.documents) {
      const sent = docs.find((x) => x.kind === d.kind)!;
      const back = (await svc.document(ref, d.id))!;
      expect(back.data.equals(sent.data)).toBe(true); expect(back.filename).toBe(sent.filename); expect(d.sizeBytes).toBe(sent.data.length);
      expect(d.scanStatus).toBe("unscanned");                                  // no antivirus is configured here, and the result says so rather than "clean"
    }
    expect(a.screening.some((s) => /not checked by an antivirus/.test(s.note))).toBe(true);
  });

  it("checks every answer and says which one is wrong", async () => {
    const bad = async (patch: Record<string, unknown>, field: string) => {
      const r = await svc.submit({ ...good, ...patch }, ngoDocs());
      expect(r, `${field} should be refused`).toMatchObject({ ok: false, status: 400 });
      expect((r as { fields: Record<string, string> }).fields[field], `${field} should be named`).toBeTruthy();
    };
    await bad({ orgType: "club" }, "orgType"); await bad({ category: "yachts" }, "category"); await bad({ applicantName: "A" }, "applicantName");
    await bad({ email: "nope" }, "email"); await bad({ email: "a@b.com\nBcc: x@y.com" }, "email"); await bad({ phone: "call me" }, "phone");
    await bad({ province: "Atlantis" }, "province"); await bad({ website: "javascript:alert(1)" }, "website"); await bad({ taxStatus: "maybe" }, "taxStatus"); await bad({ taxNumber: "" }, "taxNumber");
    await bad({ executiveSummary: "too short" }, "executiveSummary"); await bad({ beneficiaries: 0 }, "beneficiaries"); await bad({ beneficiaries: 2.5 }, "beneficiaries");
    await bad({ startDate: "2026-10-08" }, "startDate");                      // before today
    await bad({ startDate: "2026-02-31" }, "startDate");                      // not a real date
    await bad({ endDate: "2026-10-30" }, "endDate");                          // before the start
    await bad({ currency: "XYZ" }, "currency"); await bad({ totalBudget: "lots" }, "totalBudget"); await bad({ financialControls: "none" }, "financialControls");
    await bad({ benefits: [] }, "benefits"); await bad({ benefits: ["a yacht"] }, "benefits"); await bad({ benefitsValue: "good" }, "benefitsValue");
    await bad({ consent: { ...good.consent, terms: false } }, "consent.terms"); await bad({ consent: {} }, "consent.accuracy");
    await bad({ registrationNumber: "" , orgType: "company" }, "registrationNumber");
    await bad({ executiveSummary: "x".repeat(1501) }, "executiveSummary");              // too long is refused, never silently cut off
    await bad({ projectTitle: "T".repeat(151) }, "projectTitle"); await bad({ website: "https://a.example/" + "p".repeat(200) }, "website");
    expect(mail.sent).toHaveLength(0); expect((await svc.list()).total).toBe(0);
  });

  it("makes the money add up: the breakdown must equal the budget, and the funding cannot exceed it", async () => {
    const r1 = await svc.submit({ ...good, expenditure: [{ description: "Everything", amount: 79000 }] }, ngoDocs());
    expect((r1 as { fields: Record<string, string> }).fields.expenditure).toMatch(/adds up to .*79.*total project budget/);
    const r2 = await svc.submit({ ...good, amountRequested: 60000 }, ngoDocs());              // 60k + 20k + 10k = 90k > 80k
    expect((r2 as { fields: Record<string, string> }).fields.amountRequested).toMatch(/more than the total project budget/);
    expect(await svc.submit({ ...good, expenditure: [] }, ngoDocs())).toMatchObject({ ok: false });
    expect(await svc.submit({ ...good, expenditure: [{ description: "x", amount: 80000 }] }, ngoDocs())).toMatchObject({ ok: false });
    const gap = await svc.submit({ ...good, otherSponsorsAmount: 0, otherSponsorsNotes: "" }, ngoDocs());   // 50k + 20k = 70k < 80k: allowed, but staff are told
    expect(gap.ok).toBe(true);
    expect((await svc.get((gap as { ref: string }).ref))!.screening.some((s) => /Funding gap of ZAR 10[\s\u00a0,]?000/.test(s.note))).toBe(true);
  });

  it("applies the published R5,000 to R500,000 limits, converting other currencies at VINK's stored rate", async () => {
    const small = await svc.submit({ ...good, totalBudget: 5000, amountRequested: 4999, ownContribution: 1, otherSponsorsAmount: 0, otherSponsorsNotes: "", expenditure: [{ description: "All", amount: 5000 }] }, ngoDocs());
    expect((small as { fields: Record<string, string> }).fields.amountRequested).toMatch(/between R5.?000 and R500.?000/);
    const big = await svc.submit({ ...good, totalBudget: 600000, amountRequested: 500001, ownContribution: 0, otherSponsorsAmount: 0, otherSponsorsNotes: "", expenditure: [{ description: "All", amount: 600000 }] }, ngoDocs());
    expect(big.ok).toBe(false);
    const edge = await svc.submit({ ...good, totalBudget: 500000, amountRequested: 500000, ownContribution: 0, otherSponsorsAmount: 0, otherSponsorsNotes: "", expenditure: [{ description: "All", amount: 500000 }] }, ngoDocs());
    expect(edge.ok).toBe(true);
    // 1 rand buys 0.05 USD, so USD 2,000 is R40,000: inside the limits
    await db.query(`INSERT INTO fx_rates (pair, rate) VALUES ('ZAR-USD', 0.05)`);
    const usd = await svc.submit({ ...good, projectTitle: "Dollar request", currency: "USD", totalBudget: 4000, amountRequested: 2000, ownContribution: 1000, otherSponsorsAmount: 1000, expenditure: [{ description: "All", amount: 4000 }] }, ngoDocs());
    expect(usd.ok).toBe(true);
    const row = (await svc.get((usd as { ref: string }).ref))!; expect(row).toMatchObject({ currency: "USD", amountRequested: 2000, amountZar: 40000, fxRate: 0.05 });
    expect(mail.sent.at(-2)!.text).toContain("about ZAR 40"); 
    const tiny = await svc.submit({ ...good, projectTitle: "Tiny dollar request", currency: "USD", totalBudget: 100, amountRequested: 100, ownContribution: 0, otherSponsorsAmount: 0, otherSponsorsNotes: "", expenditure: [{ description: "All", amount: 100 }] }, ngoDocs());
    expect((tiny as { fields: Record<string, string> }).fields.amountRequested).toMatch(/about ZAR 2.?000/);   // USD 100 is R2,000: under the minimum
    // no stored rate for the currency: accepted, and staff are told to check it by hand
    const gbp = await svc.submit({ ...good, projectTitle: "Pound request", currency: "GBP" }, ngoDocs());
    expect(gbp.ok).toBe(true);
    expect((await svc.get((gbp as { ref: string }).ref))!.screening.some((s) => /could not be converted to rand/.test(s.note))).toBe(true);
  });

  it("notes, for staff only, where an application sits against the published criteria", async () => {
    const ref = ((await svc.submit({ ...good, orgType: "company", registrationNumber: "2020/123456/07", province: "Gauteng", projectTitle: "A company event" }, [file("proposal", "p.pdf", pdf()), file("registration", "r.pdf", pdf()), file("budget", "b.pdf", pdf())])) as { ref: string }).ref;
    const notes = (await svc.get(ref))!.screening.map((s) => s.note).join(" | ");
    expect(notes).toMatch(/registered company/); expect(notes).toMatch(/Outside the Western Cape \(Gauteng\)/);
    expect(mail.sent.at(-2)!.text).toContain("For review:");                        // the team is shown them...
    expect(mail.sent.at(-1)!.text).not.toMatch(/Outside the Western Cape|published criteria/);   // ...the applicant is not
  });

  it("strips header-injection tricks and ignores the hidden trap field", async () => {
    const r = await svc.submit({ ...good, projectTitle: "Bootcamp\r\nBcc: evil@x.com", applicantName: "Eve\r\nCc: x@y.com" }, ngoDocs());
    expect(r.ok).toBe(true);
    expect(mail.sent[0].subject).not.toMatch(/[\r\n]/); expect(mail.sent[0].replyTo).not.toMatch(/[\r\n]/);
    mail.sent.length = 0;
    expect(await svc.submit({ ...good, projectTitle: "Another", faxNumber: "123" }, ngoDocs())).toMatchObject({ ok: true });    // looks like success to a bot
    expect(mail.sent).toHaveLength(0); expect((await svc.list()).total).toBe(1);
  });

  it("treats the same applicant sending the same project again within ten minutes as one application", async () => {
    const a = await svc.submit(good, ngoDocs()), b = await svc.submit({ ...good, email: "THANDI@example.com" }, ngoDocs());
    expect((b as { ref: string; duplicate?: boolean })).toMatchObject({ ref: (a as { ref: string }).ref, duplicate: true });
    expect((await svc.list()).total).toBe(1); expect(mail.sent).toHaveLength(2);
    clock = new Date(clock.getTime() + 11 * 60_000);
    const c = await svc.submit(good, ngoDocs());
    expect((c as { ref: string }).ref).not.toBe((a as { ref: string }).ref); expect((await svc.list()).total).toBe(2);
  });
});

describe("the documents", () => {
  const refuse = async (files: UploadedFile[], app: Record<string, unknown> = good) => {
    const r = await svc.submit(app, files);
    expect(r.ok).toBe(false); expect((await svc.list()).total).toBe(0); expect(mail.sent).toHaveLength(0);
    return (r as { error: string; fields: Record<string, string> }).fields.documents;
  };
  it("must include every document the organisation type and category call for, and says which are missing", async () => {
    expect(await refuse([file("proposal", "p.pdf", pdf())])).toMatch(/NGO or charity registration certificate.*Project budget and financial statements/);
    expect(await refuse([file("proposal", "p.pdf", pdf()), file("budget", "b.pdf", pdf())], { ...good, orgType: "individual", organisation: "" })).toMatch(/Proof of address/);
    expect(await refuse(ngoDocs(), { ...good, category: "events" })).toMatch(/Event programme or project plan/);
    expect(await refuse(ngoDocs(), { ...good, category: "equipment" })).toMatch(/Quotations for equipment or products requested/);
    expect(await refuse(ngoDocs(), { ...good, category: "media" })).toMatch(/Brand profile, audience statistics or media kit/);
    const ok = await svc.submit({ ...good, category: "events" }, [...ngoDocs(), file("programme", "programme.docx", zip())]);
    expect(ok.ok).toBe(true);
  });
  it("accepts several files for one document, and optional documents", async () => {
    const r = await svc.submit(good, [...ngoDocs(), file("proposal", "annex.pdf", pdf("a")), file("previous_reports", "photo.png", png()), file("support_letters", "letter.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]))]);
    expect(r.ok).toBe(true); expect((await svc.get((r as { ref: string }).ref))!.documents).toHaveLength(6);
  });
  it("refuses a document the application does not ask for", async () => {
    expect(await refuse([...ngoDocs(), file("proof_of_address", "bill.pdf", pdf())].concat(file("registration", "x.pdf", pdf())), { ...good, orgType: "individual", organisation: "" })).toBeTruthy();
    expect(await refuse([...ngoDocs(), file("made_up", "x.pdf", pdf())])).toMatch(/does not ask for/);
  });
  it("accepts only PDF, DOCX, XLSX, JPG and PNG, judged by the file's first bytes as well as its name", async () => {
    expect(await refuse([...ngoDocs(), file("tax", "notes.txt", Buffer.from("hello"))])).toMatch(/not an accepted file type/);
    expect(await refuse([...ngoDocs(), file("tax", "run.exe", Buffer.from("MZ\u0090\u0000"))])).toMatch(/not an accepted file type/);
    expect(await refuse([...ngoDocs(), file("tax", "budget.pdf", Buffer.from("MZ\u0090\u0000 a program in disguise"))])).toMatch(/not really a PDF file/);
    expect(await refuse([...ngoDocs(), file("tax", "photo.png", pdf())])).toMatch(/not really a PNG file/);
    expect(await refuse([...ngoDocs(), file("tax", "empty.pdf", Buffer.alloc(0))])).toMatch(/is empty/);
  });
  it("refuses a virus or a program disguised as a document, and never stores or emails it", async () => {
    expect(await refuse([...ngoDocs(), file("tax", "invoice.pdf", Buffer.from("%PDF-1.4\n" + EICAR))])).toMatch(/invoice\.pdf" was refused: EICAR test virus/);
    expect(await refuse([...ngoDocs(), file("tax", "invoice.pdf.exe", pdf())])).toMatch(/not an accepted file type/);
  });
  it("limits the size and number of files", async () => {
    expect(await refuse([...ngoDocs(), file("tax", "huge.pdf", Buffer.concat([pdf(), Buffer.alloc(FILE_RULES.maxBytes)]))])).toMatch(/larger than 10 MB/);
    const many = Array.from({ length: FILE_RULES.maxFiles + 1 }, (_, i) => file("support_letters", `l${i}.pdf`, pdf(String(i))));
    expect(await refuse([...ngoDocs(), ...many])).toMatch(/at most 15 files/);
  });
  it("cleans the file name a person chose, so it cannot climb out of a folder or carry control characters", async () => {
    const ref = ((await svc.submit(good, [file("proposal", "..\\..\\evil\u0000/p\"<>.pdf", pdf()), ...ngoDocs().slice(1)])) as { ref: string }).ref;
    const names = (await svc.get(ref))!.documents.map((d) => d.filename);
    expect(names.some((n) => /[\\/<>"\u0000]/.test(n))).toBe(false); expect(names).toContain("p.pdf");
  });
});

describe("when email is down", () => {
  it("never loses an application: it is saved, shown as not delivered, and sent when email comes back", async () => {
    let down = true; const sent: EmailMessage[] = [];
    const flaky: EmailSender = { name: "flaky", async send(m) { if (down) throw new Error("mail is down"); sent.push(m); } };
    const s = createSponsorshipService({ db, mail: flaky, env: {} as NodeJS.ProcessEnv, now: () => clock });
    const r = await s.submit(good, ngoDocs());
    expect(r.ok).toBe(true);
    expect((await s.list()).applications[0].delivered).toBe(false); expect(await s.undeliveredCount()).toBe(0);
    clock = new Date(clock.getTime() + 20 * 60_000); expect(await s.undeliveredCount()).toBe(1);   // the monitor tells a person after 15 minutes
    expect(await s.retryUnsent()).toBe(0); expect(sent).toHaveLength(0);
    down = false;
    expect(await s.retryUnsent()).toBe(1);
    expect(sent.map((m) => m.to).sort()).toEqual(["sponsorships@vink.co.za", "thandi@example.com"]);
    expect(sent.find((m) => m.to === "sponsorships@vink.co.za")!.attachments).toHaveLength(3);
    expect((await s.list()).applications[0].delivered).toBe(true); expect(await s.retryUnsent()).toBe(0);
  });
  it("still sends the team the application without the files when they are too big to attach", async () => {
    const small = createSponsorshipService({ db, mail, env: {} as NodeJS.ProcessEnv, now: () => clock, attachLimitBytes: 10 });       // a tiny limit stands in for the 25 MB one
    const r = await small.submit(good, ngoDocs()); expect(r.ok).toBe(true);
    const team = mail.sent[0]; expect(team.attachments).toBeUndefined(); expect(team.text).toMatch(/too large to attach/);
    expect((await small.get((r as { ref: string }).ref))!.documents).toHaveLength(3);                                                   // they are still stored
    expect(createSponsorshipService({ db, mail, env: {} as NodeJS.ProcessEnv, now: () => clock }).list).toBeDefined();
  });
});

describe("following an application", () => {
  it("shows the applicant where it stands, to them and nobody else", async () => {
    const ref = ((await svc.submit(good, ngoDocs())) as { ref: string }).ref;
    expect(await svc.track(ref, "THANDI@example.com")).toMatchObject({ ref, status: "submitted", statusLabel: "Submitted", project: "Township Entrepreneurs Bootcamp", timeline: [{ status: "submitted", label: "Submitted", message: null }] });
    expect(await svc.track(ref, "someone@else.com")).toBeNull(); expect(await svc.track("SP-ZZZZZZ", "thandi@example.com")).toBeNull();
    expect(await svc.track("not a ref", "thandi@example.com")).toBeNull(); expect(await svc.track(ref, "")).toBeNull();
  });
});

describe("staff working an application", () => {
  const later = () => { clock = new Date(clock.getTime() + 5_000); };      // each change happens a few seconds after the last, as it does in real life
  const open = async () => { const ref = ((await svc.submit(good, ngoDocs())) as { ref: string }).ref; later(); return ref; };
  it("moves it through the statuses, needing a reason each time, and tells the applicant", async () => {
    const ref = await open(); mail.sent.length = 0;
    expect(await svc.setStatus(ref, { status: "under_review", reason: "", by: "u1" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.setStatus(ref, { status: "nonsense", reason: "x y z", by: "u1" })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.setStatus("SP-AAAAAA", { status: "under_review", reason: "start", by: "u1" })).toMatchObject({ ok: false, status: 404 });
    expect(await svc.setStatus(ref, { status: "approved", reason: "skipping review", by: "u1" })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Valid next steps: under_review, declined") });
    expect(await svc.setStatus(ref, { status: "under_review", reason: "Assigned to the committee", by: "u1" })).toEqual({ ok: true }); later();
    expect(await svc.setStatus(ref, { status: "more_information_required", reason: "Budget unclear", by: "u1" })).toMatchObject({ ok: false, error: expect.stringContaining("what information is needed") });
    expect(await svc.setStatus(ref, { status: "more_information_required", reason: "Budget unclear", applicantMessage: "Please send a quote for the venue hire.", by: "u1" })).toEqual({ ok: true }); later();
    expect(await svc.setStatus(ref, { status: "under_review", reason: "Quote received", by: "u2" })).toEqual({ ok: true }); later();
    expect(await svc.setStatus(ref, { status: "approved", reason: "Committee approved", applicantMessage: "Congratulations.", by: "u2" })).toEqual({ ok: true }); later();
    expect(await svc.setStatus(ref, { status: "agreement_pending", reason: "Agreement sent", by: "u2" })).toEqual({ ok: true }); later();
    await new Promise((r) => setTimeout(r, 20));
    const toApplicant = mail.sent.filter((m) => m.to === "thandi@example.com");
    expect(toApplicant.map((m) => m.subject)).toEqual([`Your sponsorship application ${ref}: Under review`, `Your sponsorship application ${ref}: More information required`, `Your sponsorship application ${ref}: Under review`, `Your sponsorship application ${ref}: Approved`, `Your sponsorship application ${ref}: Agreement pending`]);
    expect(toApplicant[1].text).toContain("Please send a quote for the venue hire.");
    const a = (await svc.get(ref))!;
    expect(a.status).toBe("agreement_pending"); expect(a.history.map((h) => h.toStatus)).toEqual(["submitted", "under_review", "more_information_required", "under_review", "approved", "agreement_pending"]);
    expect(a.history[2]).toMatchObject({ reason: "Budget unclear", applicantMessage: "Please send a quote for the venue hire.", changedBy: "u1" });
  });
  it("shows the applicant what they were told, and never the reviewer's own reasons", async () => {
    const ref = await open();
    await svc.setStatus(ref, { status: "under_review", reason: "INTERNAL: applicant looks like a repeat request", by: "u1" }); later();
    await svc.setStatus(ref, { status: "more_information_required", reason: "INTERNAL: budget has gaps", applicantMessage: "Please explain the venue costs.", by: "u1" });
    const t = (await svc.track(ref, "thandi@example.com"))!;
    expect(t.status).toBe("more_information_required"); expect(t.timeline.map((x) => x.message)).toEqual([null, null, "Please explain the venue costs."]);
    expect(JSON.stringify(t)).not.toMatch(/INTERNAL|repeat request|screening/);
  });
  it("lets a declined application be reconsidered, with the reason kept, and stops moves that make no sense", async () => {
    const ref = await open();
    expect((await svc.setStatus(ref, { status: "declined", reason: "Outside the criteria", by: "u1" })).ok).toBe(true); later();
    expect(await svc.setStatus(ref, { status: "approved", reason: "x y z", by: "u1" })).toMatchObject({ ok: false, status: 409 });
    expect((await svc.setStatus(ref, { status: "under_review", reason: "Reconsidered after an appeal", by: "u3" })).ok).toBe(true);
    expect((await svc.get(ref))!.history.at(-1)).toMatchObject({ fromStatus: "declined", toStatus: "under_review", reason: "Reconsidered after an appeal", changedBy: "u3" });
  });
  it("lists and searches applications", async () => {
    const a = ((await svc.submit(good, ngoDocs())) as { ref: string }).ref;
    const b = ((await svc.submit({ ...good, projectTitle: "Netball League", organisation: "Ocean View Netball", email: "coach@netball.example", category: "sports" }, ngoDocs())) as { ref: string }).ref;
    await svc.setStatus(b, { status: "under_review", reason: "Taken on", by: "u1" });
    expect((await svc.list()).total).toBe(2);
    expect((await svc.list({ status: "under_review" })).applications.map((x) => x.ref)).toEqual([b]);
    expect((await svc.list({ q: "netball" })).applications.map((x) => x.ref)).toEqual([b]);
    expect((await svc.list({ q: a.toLowerCase() })).applications.map((x) => x.ref)).toEqual([a]);
    expect((await svc.list({ q: "coach@netball" })).applications.map((x) => x.ref)).toEqual([b]);
    expect((await svc.list({ limit: 1 })).applications).toHaveLength(1);
    expect((await svc.list({ q: "nothing like this" })).total).toBe(0);
  });
});

describe("the routes", () => {
  let server: Server, url = "";
  beforeEach(async () => {
    const app = express();
    app.use("/api/sponsorship", createSponsorshipRouter(svc));
    app.use((req, _r, next) => { req.user = { userId: "00000000-0000-0000-0000-000000000090", username: "admin", role: "superadmin" }; next(); });
    app.use("/admin", createSponsorshipAdminRouter({ db, svc }));
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const form = (data: unknown, files: UploadedFile[] = ngoDocs()) => { const fd = new FormData(); fd.append("data", typeof data === "string" ? data : JSON.stringify(data)); for (const f of files) fd.append(`doc_${f.kind}`, new Blob([f.data]), f.filename); return fd; };
  const apply = async (data: unknown, files?: UploadedFile[]) => { const r = await fetch(url + "/api/sponsorship", { method: "POST", body: form(data, files) }); return { status: r.status, body: await r.json() as Record<string, any> }; };
  const post = async (p: string, body: unknown) => { const r = await fetch(url + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as Record<string, any> }; };

  it("takes an application with its documents as one multipart request, then lets the applicant track it and staff work it", async () => {
    const ok = await apply(good);
    expect(ok).toMatchObject({ status: 201, body: { success: true } }); const ref = ok.body.data.ref as string; expect(ok.body.data.message).toContain(ref);
    expect((await post("/api/sponsorship/track", { ref, email: "thandi@example.com" })).body.data).toMatchObject({ ref, status: "submitted" });
    expect((await post("/api/sponsorship/track", { ref, email: "wrong@example.com" })).status).toBe(404);
    const list = await (await fetch(url + "/admin?status=submitted")).json() as { applications: { ref: string }[]; total: number };
    expect(list).toMatchObject({ total: 1 }); expect(list.applications[0].ref).toBe(ref);
    const detail = (await (await fetch(url + `/admin/${ref}`)).json() as { data: { documents: { id: string; filename: string }[]; nextStatuses: string[] } }).data;
    expect(detail.documents).toHaveLength(3); expect(detail.nextStatuses).toEqual(["under_review", "declined"]);
    const dl = await fetch(url + `/admin/${ref}/documents/${detail.documents.find((d) => d.filename === "budget.xlsx")!.id}`);
    expect(dl.status).toBe(200); expect(dl.headers.get("content-disposition")).toContain('attachment; filename="budget.xlsx"'); expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await dl.arrayBuffer()).equals(zip())).toBe(true);
    expect((await post(`/admin/${ref}/status`, { status: "under_review", reason: "Taken on" })).status).toBe(200);
    expect((await post(`/admin/${ref}/status`, { status: "agreement_pending", reason: "too soon" })).status).toBe(409);
    expect((await post("/admin/retry", {})).body).toMatchObject({ success: true, sent: 0 });
    expect((await fetch(url + "/admin/not-a-ref")).status).toBe(400); expect((await fetch(url + "/admin/SP-AAAAAA")).status).toBe(404);
    expect((await fetch(url + `/admin/${ref}/documents/not-a-uuid`)).status).toBe(400);
  });
  it("reports which answers are wrong, and refuses unreadable or oversized uploads", async () => {
    const bad = await apply({ ...good, email: "nope", amountRequested: 1 });
    expect(bad).toMatchObject({ status: 400, body: { success: false, fields: { email: expect.any(String) } } });
    expect((await apply("this is not json")).status).toBe(400);
    expect((await apply(good, [...ngoDocs(), file("tax", "huge.pdf", Buffer.concat([pdf(), Buffer.alloc(FILE_RULES.maxBytes)]))])).body.error).toMatch(/larger than 10 MB/);
    const fd = form(good); fd.append("somefile", new Blob([pdf()]), "x.pdf");
    const stray = await fetch(url + "/api/sponsorship", { method: "POST", body: fd }); expect(stray.status).toBe(400);
    expect((await (await fetch(url + "/admin")).json() as { total: number }).total).toBe(0);
  });
  it("limits how many applications one address can send in an hour, and how often it can look one up", async () => {
    let last = 0;
    for (let i = 0; i < 7; i++) last = (await apply({ ...good, projectTitle: `Project number ${i}` })).status;
    expect(last).toBe(429);
    let t = 0; for (let i = 0; i < 32; i++) t = (await post("/api/sponsorship/track", { ref: "SP-AAAAAA", email: "a@b.co" })).status;
    expect(t).toBe(429);
  });
});

describe("the rules are the same on the server and on the website", () => {
  it("has the website's copy of the rules byte for byte identical to the server's", () => {
    const server = fs.readFileSync(path.resolve(__dirname, "../config/sponsorship.ts"), "utf8");
    const web = fs.readFileSync(path.resolve(__dirname, "../../../src/app/data/sponsorship.ts"), "utf8");
    expect(web).toBe(server);
  });
});
