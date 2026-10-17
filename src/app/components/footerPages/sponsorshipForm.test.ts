import { describe, it, expect, beforeEach } from "vitest";
import {
  initialState, STEPS, validateStep, validateAll, validateDocuments, fileProblem, funding, numberOf, stepOfField, firstStepWithProblem, slotsFor, provinceChoices, saToday,
  buildFormData, toPayload, saveDraft, loadDraft, clearDraft, isBlank, sizeText, type FormState, type Files,
} from "./sponsorshipForm";
import { PROVINCES_ZA, FILE_RULES, checkAnswers } from "../../data/sponsorship";

const TODAY = "2026-10-09";
const filled = (): FormState => ({
  ...initialState(),
  orgType: "ngo", applicantName: "Thandi Nkosi", organisation: "Khayelitsha Youth Hub", registrationNumber: "NPO 123-456", contactPerson: "Thandi Nkosi", email: "thandi@example.com", phone: "082 000 0000",
  physicalAddress: "12 Lingelethu Road, Khayelitsha", country: "South Africa", province: "Western Cape", city: "Cape Town", taxStatus: "exempt", taxNumber: "930012345",
  category: "youth",
  projectTitle: "Township Entrepreneurs Bootcamp", executiveSummary: "A twelve week business skills programme for sixty young people in Khayelitsha, ending with a pitch day judged by local business owners.",
  background: "Youth unemployment in our area is above sixty percent. Our objective is to give young people practical skills to start small businesses.",
  problem: "Young people leave school without any practical business training and have no access to mentors or start-up capital.",
  targetAudience: "Unemployed young people aged 18 to 25", geographicArea: "Khayelitsha, Cape Town", beneficiaries: "60", startDate: "2026-11-01", endDate: "2026-12-15",
  implementationPlan: "Weeks one to four cover basics. Weeks five to eight are mentored practice. Weeks nine to twelve are pitch preparation and the pitch day.",
  outcomes: "Sixty participants complete the programme and at least twenty start a business within six months, tracked by follow-up surveys.",
  whyVink: "VINK serves the taxi industry that our participants and their families depend on every day.",
  alignment: "The programme supports township economic development, one of VINK's published focus areas.",
  currency: "ZAR", totalBudget: "80000", amountRequested: "50000", ownContribution: "20000", otherSponsorsAmount: "10000", otherSponsorsNotes: "Local ward committee",
  expenditure: [{ id: 1, description: "Facilitators", amount: "45000" }, { id: 2, description: "Venue and materials", amount: "25000" }, { id: 3, description: "Pitch day", amount: "10000" }],
  financialControls: "Two signatories on every payment, monthly reports to the board, and an independent examiner.",
  benefits: ["logo", "social"], benefitsValue: "Logo on all materials and about four thousand people reached through our social channels.",
  consent: { accuracy: true, authorised: true, terms: true, processing: true },
});
const file = (name: string, size = 100) => new File([new Uint8Array(size)], name);

describe("the steps", () => {
  it("are the seven sections of the application, in order", () => {
    expect(STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(STEPS.map((s) => s.short)).toEqual(["Organisation", "Category", "Proposal", "Budget", "Benefits", "Documents", "Submit"]);
  });
  it("accept a fully filled application at every step", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(validateStep(n, filled(), TODAY), `step ${n}`).toEqual({});
    expect(validateStep(7, filled(), TODAY)).toEqual({});
  });
  it("only report the problems that belong to the step being looked at", () => {
    const empty = initialState();
    for (let n = 1; n <= 7; n++) for (const k of Object.keys(validateStep(n, empty, TODAY))) expect(stepOfField(k), `${k} on step ${n}`).toBe(n);
    expect(Object.keys(validateStep(1, empty, TODAY)).length).toBeGreaterThan(8);
    expect(Object.keys(validateStep(2, empty, TODAY))).toEqual(["category"]);
  });
  it("asks only for what applies: a company number from a company, an organisation name not from an individual", () => {
    expect(validateStep(1, { ...filled(), orgType: "company", registrationNumber: "" }, TODAY).registrationNumber).toBeTruthy();
    expect(validateStep(1, { ...filled(), orgType: "ngo", registrationNumber: "" }, TODAY).registrationNumber).toBeUndefined();
    expect(validateStep(1, { ...filled(), orgType: "individual", organisation: "" }, TODAY).organisation).toBeUndefined();
    expect(validateStep(1, { ...filled(), orgType: "school", organisation: "" }, TODAY).organisation).toBeTruthy();
    expect(validateStep(1, { ...filled(), taxStatus: "exempt", taxNumber: "" }, TODAY).taxNumber).toBeTruthy();
    expect(validateStep(1, { ...filled(), taxStatus: "not_applicable", taxNumber: "" }, TODAY).taxNumber).toBeUndefined();
  });
  it("checks each kind of answer: email, phone, web address, dates, whole numbers", () => {
    const bad = (patch: Partial<FormState>, step: number, field: string) => expect(validateStep(step, { ...filled(), ...patch }, TODAY)[field], field).toBeTruthy();
    bad({ email: "nope" }, 1, "email"); bad({ phone: "call me" }, 1, "phone"); bad({ website: "javascript:alert(1)" }, 1, "website"); bad({ province: "Atlantis" }, 1, "province");
    bad({ beneficiaries: "0" }, 3, "beneficiaries"); bad({ beneficiaries: "2.5" }, 3, "beneficiaries"); bad({ startDate: "2026-10-08" }, 3, "startDate"); bad({ endDate: "2026-10-30" }, 3, "endDate");
    bad({ executiveSummary: "too short" }, 3, "executiveSummary"); bad({ executiveSummary: "x".repeat(1501) }, 3, "executiveSummary"); bad({ benefits: [] }, 5, "benefits");
    expect(validateStep(1, { ...filled(), website: "" }, TODAY).website).toBeUndefined();
  });
  it("uses the same words the server does, because it is the same function", () => {
    const s = { ...filled(), email: "nope", startDate: "2026-10-08" };
    const server = checkAnswers(toPayload(s), TODAY).errors;
    expect(validateStep(1, s, TODAY).email).toBe(server.email); expect(validateStep(3, s, TODAY).startDate).toBe(server.startDate);
  });
});

describe("amounts and funding", () => {
  it("reads a typed amount however it is written", () => {
    expect(numberOf("12500")).toBe(12500); expect(numberOf("12 500")).toBe(12500); expect(numberOf("12,500.50")).toBe(12500.5); expect(numberOf("12 500,50")).toBe(12500.5);
    expect(numberOf("")).toBeNull(); expect(numberOf("lots")).toBeNull(); expect(numberOf("1e3x")).toBeNull();
  });
  it("never turns something that is not a number into 0", () => {
    expect(validateStep(4, { ...filled(), ownContribution: "abc" }, TODAY).ownContribution).toBeTruthy();
    expect(validateStep(4, { ...filled(), totalBudget: "lots" }, TODAY).totalBudget).toBeTruthy();
    expect(validateStep(4, { ...filled(), ownContribution: "", otherSponsorsAmount: "", otherSponsorsNotes: "", totalBudget: "70000", expenditure: [{ id: 1, description: "All", amount: "70000" }] }, TODAY)).toEqual({});   // blank optional amounts are 0
  });
  it("adds up the breakdown, the funding, and the gap as people type", () => {
    expect(funding(filled())).toMatchObject({ total: 80000, requested: 50000, own: 20000, others: 10000, breakdown: 80000, breakdownDiff: 0, funded: 80000, gap: 0 });
    expect(funding({ ...filled(), otherSponsorsAmount: "" })).toMatchObject({ funded: 70000, gap: 10000 });
    expect(funding({ ...filled(), expenditure: [{ id: 1, description: "x", amount: "79 000" }] })).toMatchObject({ breakdown: 79000, breakdownDiff: 1000 });
    expect(funding(initialState())).toMatchObject({ total: 0, breakdown: 0, gap: 0 });
  });
  it("makes the breakdown match the budget and keeps the funding within it", () => {
    expect(validateStep(4, { ...filled(), expenditure: [{ id: 1, description: "All", amount: "79000" }] }, TODAY).expenditure).toMatch(/adds up to .*79.*total project budget/);
    expect(validateStep(4, { ...filled(), amountRequested: "60000" }, TODAY).amountRequested).toMatch(/more than the total project budget/);
    expect(validateStep(4, { ...filled(), expenditure: [] }, TODAY).expenditure).toMatch(/at least one line/);
    expect(validateStep(4, { ...filled(), expenditure: [{ id: 1, description: "", amount: "80000" }] }, TODAY).expenditure).toMatch(/Line 1/);
  });
  it("applies the R5,000 to R500,000 limits to a request made in rand, and leaves other currencies to the server", () => {
    const req = (amountRequested: string, currency = "ZAR") => validateStep(4, { ...filled(), currency, totalBudget: amountRequested, amountRequested, ownContribution: "0", otherSponsorsAmount: "0", otherSponsorsNotes: "", expenditure: [{ id: 1, description: "All", amount: amountRequested }] }, TODAY).amountRequested;
    expect(req("4999")).toMatch(/between R5.?000 and R500.?000/); expect(req("500001")).toMatch(/between/); expect(req("5000")).toBeUndefined(); expect(req("500000")).toBeUndefined();
    expect(req("100", "USD")).toBeUndefined();
  });
});

describe("South African provinces", () => {
  it("are the official names the server accepts, not the ISO spellings (\"Kwazulu-Natal\", \"North-West\")", () => {
    expect(provinceChoices("South Africa")).toEqual([...PROVINCES_ZA]);
    for (const p of provinceChoices("South Africa")) expect(validateStep(1, { ...filled(), province: p }, TODAY).province, p).toBeUndefined();
    expect(validateStep(1, { ...filled(), province: "Kwazulu-Natal" }, TODAY).province).toBeTruthy();
  });
  it("come from the country data for other countries, where any region name of two characters or more is taken", () => {
    expect(provinceChoices("Zambia")).toContain("Lusaka");
    expect(validateStep(1, { ...filled(), country: "Zambia", province: "Lusaka" }, TODAY).province).toBeUndefined();
    expect(validateStep(1, { ...filled(), country: "Zambia", province: "" }, TODAY).province).toBe("Enter the province or region");
  });
});

describe("documents", () => {
  const ok = (): Files => ({ proposal: [file("p.pdf")], registration: [file("r.pdf")], budget: [file("b.xlsx")] });
  it("are required according to who is applying and what for", () => {
    expect(slotsFor(filled()).filter((s) => s.required).map((s) => s.id)).toEqual(["proposal", "registration", "budget"]);
    expect(slotsFor({ ...filled(), orgType: "individual" }).filter((s) => s.required).map((s) => s.id)).toEqual(["proposal", "budget", "proof_of_address"]);
    expect(slotsFor({ ...filled(), category: "events" }).find((s) => s.id === "programme")!.required).toBe(true);
  });
  it("must all be attached, and the message says which are missing", () => {
    expect(validateDocuments(filled(), ok())).toEqual({});
    expect(validateDocuments(filled(), { proposal: [file("p.pdf")] }).documents).toMatch(/NGO or charity registration certificate.*Project budget/);
    expect(validateDocuments({ ...filled(), category: "equipment" }, ok()).documents).toMatch(/Quotations/);
  });
  it("accept PDF, DOCX, XLSX, JPG and PNG up to 10 MB, and say why anything else is refused", () => {
    for (const n of ["a.pdf", "a.DOCX", "a.xlsx", "a.jpg", "a.jpeg", "a.png"]) expect(fileProblem({ name: n, size: 10 }), n).toBeNull();
    expect(fileProblem({ name: "a.exe", size: 10 })).toMatch(/not an accepted file type/); expect(fileProblem({ name: "a.pdf.exe", size: 10 })).toMatch(/not an accepted/);
    expect(fileProblem({ name: "a.pdf", size: 0 })).toMatch(/is empty/); expect(fileProblem({ name: "a.pdf", size: FILE_RULES.maxBytes + 1 })).toMatch(/larger than 10 MB/);
    expect(fileProblem({ name: "a.pdf", size: FILE_RULES.maxBytes })).toBeNull();
  });
  it("are limited in number and in total size", () => {
    const many = Array.from({ length: FILE_RULES.maxFiles + 1 }, (_, i) => file(`l${i}.pdf`));
    expect(validateDocuments(filled(), { ...ok(), support_letters: many }).documents).toMatch(/at most 15 files/);
    const big = [file("a.pdf", 9_000_000), file("b.pdf", 9_000_000), file("c.pdf", 9_000_000), file("d.pdf", 9_000_000)];
    expect(validateDocuments(filled(), { ...ok(), tax: big }).documents).toMatch(/together are larger than 30 MB/);
  });
  it("show their size in words", () => { expect(sizeText(100)).toBe("1 KB"); expect(sizeText(2048)).toBe("2 KB"); expect(sizeText(3.5 * 1024 * 1024)).toBe("3.5 MB"); });
});

describe("checking everything at the end", () => {
  it("finds a problem on any step, and the earliest step to go back to", () => {
    expect(validateAll(filled(), { proposal: [file("p.pdf")], registration: [file("r.pdf")], budget: [file("b.xlsx")] }, TODAY)).toEqual({});
    const e = validateAll({ ...filled(), email: "nope", benefits: [] }, {}, TODAY);
    expect(Object.keys(e).sort()).toEqual(["benefits", "documents", "email"]);
    expect(firstStepWithProblem(e)).toBe(1); expect(firstStepWithProblem({ benefits: "x", documents: "y" })).toBe(5); expect(firstStepWithProblem({})).toBe(8);
  });
  it("knows which step every answer belongs to", () => {
    const at: Record<string, number> = { email: 1, category: 2, projectTitle: 3, totalBudget: 4, expenditure: 4, benefits: 5, benefitsValue: 5, documents: 6, "consent.terms": 7 };
    for (const [k, n] of Object.entries(at)) expect(stepOfField(k), k).toBe(n);
  });
  it("counts today in South Africa, two hours ahead of UTC", () => {
    expect(saToday(Date.parse("2026-10-09T21:59:00Z"))).toBe("2026-10-09"); expect(saToday(Date.parse("2026-10-09T22:00:00Z"))).toBe("2026-10-10");
  });
});

describe("what is sent", () => {
  it("is the answers as JSON in one field (numbers as numbers) and each document as its own file part", () => {
    const fd = buildFormData({ ...filled(), email: "  Thandi@Example.com " }, { proposal: [file("p.pdf"), file("annex.pdf")], budget: [file("b.xlsx")] });
    const data = JSON.parse(String(fd.get("data")));
    expect(data).toMatchObject({ orgType: "ngo", email: "Thandi@Example.com", beneficiaries: 60, totalBudget: 80000, amountRequested: 50000, currency: "ZAR", benefits: ["logo", "social"] });
    expect(data.expenditure).toEqual([{ description: "Facilitators", amount: 45000 }, { description: "Venue and materials", amount: 25000 }, { description: "Pitch day", amount: 10000 }]);
    expect(data.consent).toEqual({ accuracy: true, authorised: true, terms: true, processing: true });
    expect(fd.getAll("doc_proposal")).toHaveLength(2); expect((fd.get("doc_budget") as File).name).toBe("b.xlsx"); expect(fd.has("doc_registration")).toBe(false);
  });
  it("uses the physical address as the postal address when they are the same", () => {
    expect(toPayload({ ...filled(), samePostal: true }).postalAddress).toBe("12 Lingelethu Road, Khayelitsha");
    expect(toPayload({ ...filled(), samePostal: false, postalAddress: "PO Box 1" }).postalAddress).toBe("PO Box 1");
  });
  it("passes the hidden trap field along so the server can see a robot filled it", () => {
    expect(JSON.parse(String(buildFormData({ ...filled(), faxNumber: "123" }, {}).get("data"))).faxNumber).toBe("123");
  });
});

describe("the draft kept on this device", () => {
  beforeEach(() => localStorage.clear());
  it("is not saved until something has been typed, and is saved from then on", () => {
    saveDraft(initialState(), 1); expect(loadDraft()).toBeNull(); expect(isBlank(initialState())).toBe(true);
    saveDraft({ ...initialState(), applicantName: "Thandi Nkosi", organisation: "Youth Hub" }, 2);
    expect(isBlank({ ...initialState(), organisation: "Youth Hub" })).toBe(false);
    const d = loadDraft()!; expect(d.step).toBe(2); expect(d.state.organisation).toBe("Youth Hub"); expect(new Date(d.savedAt).getTime()).toBeGreaterThan(0);
  });
  it("keeps the answers but never the confirmations, and clears when told to", () => {
    saveDraft({ ...filled(), faxNumber: "bot" }, 5);
    const d = loadDraft()!; expect(d.state.projectTitle).toBe("Township Entrepreneurs Bootcamp"); expect(d.state.expenditure).toHaveLength(3);
    expect(d.state.consent).toEqual({ accuracy: false, authorised: false, terms: false, processing: false }); expect(d.state.faxNumber).toBe("");
    clearDraft(); expect(loadDraft()).toBeNull();
  });
  it("never reopens on the last step (documents are not kept, so the person has to attach them again)", () => {
    saveDraft(filled(), 7); expect(loadDraft()!.step).toBe(6);
  });
  it("ignores a damaged or hand-edited draft instead of breaking the form", () => {
    for (const bad of ["not json", "{}", JSON.stringify({ savedAt: "x", step: "2", state: {} }), JSON.stringify({ savedAt: "x", step: 2, state: { expenditure: "no", benefits: [] } }), "null"]) { localStorage.setItem("vink-sponsorship-draft-v1", bad); expect(loadDraft(), bad).toBeNull(); }
    localStorage.setItem("vink-sponsorship-draft-v1", JSON.stringify({ savedAt: "2026-10-09T10:00:00Z", step: 3, state: { applicantName: "Only this", expenditure: [], benefits: [] } }));
    expect(loadDraft()!.state).toMatchObject({ applicantName: "Only this", country: "South Africa", currency: "ZAR" });         // missing answers fall back to the defaults
  });
});
