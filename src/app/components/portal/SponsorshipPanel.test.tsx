import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ call: vi.fn(), getData: vi.fn(), send: vi.fn(), fetchFile: vi.fn() }));
vi.mock("./sponsorshipApi", () => ({ call: h.call, getData: h.getData, send: h.send, fetchFile: h.fetchFile }));
vi.mock("../../services/apiClient", () => ({ authFetch: vi.fn() }));

import { SponsorshipPanel } from "./SponsorshipPanel";
import { SponsorshipDetail } from "./SponsorshipDetail";
import { DEFAULT_WEIGHTS } from "../../data/sponsorship";

const me = (over = {}) => ({ userId: "u-ben", name: "Ben Reviewer", role: "customer", isSuper: false, isFinance: false, canReview: true, sectionName: "Sponsorships and Partnerships", settings: { weights: DEFAULT_WEIGHTS, approvalLimitZar: null }, ...over });
const row = (over = {}) => ({ ref: "SP-ABC234", status: "under_review", statusLabel: "Under review", applicantName: "Thandi Nkosi", organisation: "Khayelitsha Youth Hub", orgType: "ngo", email: "thandi@example.com", category: "youth", projectTitle: "Township Entrepreneurs Bootcamp", country: "South Africa", province: "Western Cape", currency: "ZAR", amountRequested: 50000, amountZar: 50000, assignedTo: null, assignedName: null, replied: false, delivered: true, createdAt: "2026-10-09T10:00:00Z", updatedAt: "2026-10-09T10:00:00Z", ...over });
const all = (n: number) => ({ strategic: n, impact: n, feasibility: n, budget: n, reach: n, measurable: n });
const detail = (over: Record<string, unknown> = {}) => ({
  ...row(), id: "id-1", fxRate: null, consentAt: "2026-10-09T10:00:00Z", statusMessage: null,
  details: { contactPerson: "Thandi Nkosi", phone: "082 000 0000", registrationNumber: "NPO 1", physicalAddress: "12 Lingelethu Road", city: "Cape Town", province: "Western Cape", country: "South Africa", website: "", startDate: "2026-11-01", endDate: "2026-12-15", beneficiaries: 60, geographicArea: "Khayelitsha", benefits: ["logo", "social"], totalBudget: 80000, ownContribution: 20000, otherSponsorsAmount: 10000, expenditure: [{ description: "Facilitators", amount: 45000 }, { description: "Venue", amount: 35000 }], executiveSummary: "A twelve week programme.", background: "Youth unemployment is high." },
  screening: [{ level: "review", note: "Applicant is an individual. Confirm the community benefit." }, { level: "info", note: "Funding gap of ZAR 10 000." }],
  documents: [{ id: "d1", kind: "proposal", filename: "proposal.pdf", mime: "application/pdf", sizeBytes: 2048, sha256: "x", scanStatus: "unscanned", scanDetail: null, sourceId: null }, { id: "d2", kind: "additional", filename: "quote.pdf", mime: "application/pdf", sizeBytes: 1024, sha256: "y", scanStatus: "clean", scanDetail: null, sourceId: "rep-1" }],
  history: [{ fromStatus: null, toStatus: "submitted", reason: "Application submitted", applicantMessage: null, changedBy: null, at: "2026-10-09T10:00:00Z" }, { fromStatus: "submitted", toStatus: "under_review", reason: "Taken on", applicantMessage: null, changedBy: "u-ben", at: "2026-10-10T10:00:00Z" }],
  nextStatuses: ["more_information_required", "approved", "declined"], review: { weights: DEFAULT_WEIGHTS, reviewers: [], average: null }, award: null, replies: [], reports: [], mayApprove: true, assignedTo: null, assignedName: null, ...over,
});
const award = (over = {}) => ({ id: "aw1", amount: 45000, currency: "ZAR", amountZar: 45000, conditions: "Facilitators only", stage: "agreement_pending", stageLabel: "Agreement pending", agreementSentAt: null, agreementSignedAt: null, signedOn: null, agreementNote: null, milestones: [], payments: [], disbursed: 0, remaining: 45000, ...over });
let D = detail();
const sent = () => h.send.mock.calls.map((c) => [c[0], c[1], c[2]]);

beforeEach(() => {
  D = detail(); h.send.mockReset().mockResolvedValue({ data: {} }); h.fetchFile.mockReset().mockResolvedValue(undefined);
  h.call.mockReset().mockImplementation(async (p: string) => (p.startsWith("/staff") ? { data: { staff: [{ id: "u-ben", name: "Ben Reviewer", role: "customer" }, { id: "u-amy", name: "Amy Super", role: "superadmin" }] } } : { data: { total: 2, applications: [row(), row({ ref: "SP-XYZ789", projectTitle: "Netball League", organisation: "Ocean View Netball", status: "more_information_required", statusLabel: "More information required", replied: true, assignedName: "Ben Reviewer", assignedTo: "u-ben" })] } }));
  h.getData.mockReset().mockImplementation(async (p: string) => {
    if (p === "/me") return { data: me() }; if (p === "/settings") return { data: { weights: DEFAULT_WEIGHTS, approvalLimitZar: 40000 } };
    if (p.startsWith("/reports/summary")) return { data: { total: 2, byStatus: [{ id: "submitted", label: "Submitted", count: 1 }], byCategory: [{ id: "youth", label: "Youth empowerment", count: 2, requestedZar: 100000, awardedZar: 0 }], byLocation: [{ id: "WC", label: "Western Cape", count: 2, requestedZar: 100000, awardedZar: 0 }], byMonth: [{ id: "2026-10", label: "2026-10", count: 2, requestedZar: 100000, awardedZar: 0 }], totals: { requestedZar: 100000, awardedZar: 45000, disbursedZar: 20000, notConverted: 1 }, scores: { reviewed: 1, average: 80 } } };
    if (p === "/budget") return { data: { totals: { requestedZar: 100000, approvedZar: 45000, committedZar: 45000, paidZar: 20000, awards: 1, notConverted: 0 }, awards: [{ ref: "SP-ABC234", organisation: "Khayelitsha Youth Hub", project: "Bootcamp", category: "Youth", stage: "active", stageLabel: "Agreement signed", currency: "ZAR", awarded: 45000, awardedZar: 45000, paid: 20000, paidZar: 20000, remaining: 25000, milestonesDone: 1, milestonesTotal: 2, overdue: 1 }] } };
    return { data: D };
  });
});
afterEach(() => cleanup());
const asMe = (m = me()) => render(<SponsorshipDetail refNo="SP-ABC234" me={m} onBack={() => {}} />);
const tab = (n: string | RegExp) => fireEvent.click(screen.getByRole("tab", { name: n }));

describe("the Sponsorships panel", () => {
  it("shows each person only the sections they can use", async () => {
    const names = async (m: object) => { h.getData.mockImplementation(async (p: string) => (p === "/me" ? { data: me(m) } : { data: {} })); cleanup(); render(<SponsorshipPanel />); await screen.findByRole("tablist"); return screen.getAllByRole("tab").map((t) => t.textContent); };
    expect(await names({})).toEqual(["Applications", "Reports"]);
    expect(await names({ isFinance: true })).toEqual(["Applications", "Reports", "Budget"]);
    expect(await names({ isSuper: true, isFinance: true })).toEqual(["Applications", "Reports", "Budget", "Settings"]);
  });
  it("shows finance staff the budget and nothing else, and opens on it", async () => {
    h.getData.mockImplementation(async (p: string) => (p === "/me" ? { data: me({ isFinance: true, canReview: false }) } : p === "/budget" ? { data: { totals: { requestedZar: 100000, approvedZar: 45000, committedZar: 45000, paidZar: 20000, awards: 1, notConverted: 0 }, awards: [] } } : { data: {} }));
    render(<SponsorshipPanel />);
    expect((await screen.findAllByRole("tab")).map((t) => t.textContent)).toEqual(["Budget"]);
    expect(screen.getByRole("tab", { name: "Budget" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("Committed")).toBeTruthy(); expect(screen.queryByLabelText("Search applications")).toBeNull();     // never asks the server for the applications they may not read
    expect(h.call).not.toHaveBeenCalledWith(expect.stringMatching(/^\/\?/));
  });
  it("says so when someone has no part of it to use", async () => {
    h.getData.mockImplementation(async (p: string) => (p === "/me" ? { data: me({ canReview: false }) } : { data: {} }));
    render(<SponsorshipPanel />); expect(await screen.findByText("You are not approved to work on sponsorships.")).toBeTruthy(); expect(screen.queryByRole("tablist")).toBeNull();
  });
  it("lists applications with their status, who has replied, and who is looking after each", async () => {
    render(<SponsorshipPanel />);
    const list = await screen.findByRole("list", { name: "Applications" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2); expect(list.textContent).toContain("Township Entrepreneurs Bootcamp"); expect(list.textContent).toContain("Not assigned");
    const second = within(list).getAllByRole("listitem")[1]; expect(second.textContent).toContain("Replied"); expect(second.textContent).toContain("Looked after by Ben Reviewer"); expect(second.textContent).toContain("More information required");
  });
  it("filters by status, by who is looking after it, and by search, and says when nothing matches", async () => {
    render(<SponsorshipPanel />); await screen.findByRole("list", { name: "Applications" });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "under_review" } }); await waitFor(() => expect(h.call).toHaveBeenLastCalledWith(expect.stringContaining("status=under_review")));
    fireEvent.change(screen.getByLabelText("Looked after by"), { target: { value: "me" } }); await waitFor(() => expect(h.call).toHaveBeenLastCalledWith(expect.stringContaining("assigned=me")));
    fireEvent.change(screen.getByLabelText("Search applications"), { target: { value: "netball" } }); await waitFor(() => expect(h.call).toHaveBeenLastCalledWith(expect.stringContaining("q=netball")), { timeout: 2000 });
    h.call.mockResolvedValue({ data: { total: 0, applications: [] } }); fireEvent.change(screen.getByLabelText("Search applications"), { target: { value: "zzz" } }); expect(await screen.findByText("No applications match.", {}, { timeout: 2000 })).toBeTruthy();
  });
  it("pages through a long list", async () => {
    h.call.mockResolvedValue({ data: { total: 60, applications: Array.from({ length: 25 }, (_, i) => row({ ref: `SP-AAAA${String(i).padStart(2, "0")}` })) } });
    render(<SponsorshipPanel />); await screen.findByText("1–25 of 60");
    fireEvent.click(screen.getByRole("button", { name: /Next/ })); await waitFor(() => expect(h.call).toHaveBeenLastCalledWith(expect.stringContaining("offset=25")));
  });
  it("opens an application and comes back to the list", async () => {
    render(<SponsorshipPanel />); fireEvent.click((await screen.findAllByRole("button", { name: /Township Entrepreneurs Bootcamp/ }))[0]);
    expect(await screen.findByRole("heading", { name: "Township Entrepreneurs Bootcamp" })).toBeTruthy(); expect(screen.queryByRole("tablist", { name: "Sponsorship sections" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /All applications/ })); expect(await screen.findByRole("list", { name: "Applications" })).toBeTruthy();
  });
  it("shows the reports, filtered by date, and downloads the spreadsheet", async () => {
    render(<SponsorshipPanel />); fireEvent.click(await screen.findByRole("tab", { name: "Reports" }));
    expect(await screen.findByText(/1 application has been scored, averaging 80%/)).toBeTruthy(); expect(screen.getByText(/1 could not be converted to rand/)).toBeTruthy(); expect(screen.getByText("Youth empowerment")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } }); await waitFor(() => expect(h.getData).toHaveBeenLastCalledWith("/reports/summary?from=2026-10-01"));
    fireEvent.click(screen.getByRole("button", { name: "Download spreadsheet" })); await waitFor(() => expect(h.fetchFile).toHaveBeenCalledWith("/reports/export.csv?from=2026-10-01", { save: "sponsorship-applications.csv" }));
  });
  it("shows the budget: asked for, approved, committed and paid, and each award's milestones", async () => {
    h.getData.mockImplementation(async (p: string) => (p === "/me" ? { data: me({ isFinance: true }) } : p === "/budget" ? { data: { totals: { requestedZar: 100000, approvedZar: 45000, committedZar: 45000, paidZar: 20000, awards: 1, notConverted: 0 }, awards: [{ ref: "SP-ABC234", organisation: "Khayelitsha Youth Hub", project: "Bootcamp", category: "Youth", stage: "active", stageLabel: "Agreement signed", currency: "ZAR", awarded: 45000, awardedZar: 45000, paid: 20000, paidZar: 20000, remaining: 25000, milestonesDone: 1, milestonesTotal: 2, overdue: 1 }] } } : { data: {} }));
    render(<SponsorshipPanel />); fireEvent.click(await screen.findByRole("tab", { name: "Budget" }));
    const awards = await screen.findByRole("list", { name: "Awards" }); expect(awards.textContent).toContain("1 milestone overdue"); expect(awards.textContent).toMatch(/Left ZAR 25.?000/); expect(awards.textContent).toContain("Milestones 1/2");
    expect(screen.getByText("Committed").nextElementSibling!.textContent).toMatch(/R\s?45.?000/);
  });
  it("saves the weights and the approval limit, and clearing the limit means no limit", async () => {
    h.getData.mockImplementation(async (p: string) => (p === "/me" ? { data: me({ isSuper: true, isFinance: true }) } : p === "/settings" ? { data: { weights: DEFAULT_WEIGHTS, approvalLimitZar: 40000 } } : { data: {} }));
    render(<SponsorshipPanel />); fireEvent.click(await screen.findByRole("tab", { name: "Settings" }));
    await waitFor(() => expect((screen.getByLabelText("Approval limit") as HTMLInputElement).value).toBe("40000"));
    fireEvent.change(screen.getByLabelText("Weight for Strategic alignment"), { target: { value: "3" } }); fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(sent()).toContainEqual(["PUT", "/settings", { weights: { ...DEFAULT_WEIGHTS, strategic: 3 }, approvalLimitZar: 40000 }]));
    fireEvent.change(screen.getByLabelText("Approval limit"), { target: { value: "" } }); fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(sent().at(-1)).toEqual(["PUT", "/settings", { weights: DEFAULT_WEIGHTS, approvalLimitZar: null }]));      // (the screen shows the server's values again after saving, and this fake server keeps none)
    fireEvent.change(screen.getByLabelText("Weight for Reach"), { target: { value: "7" } }); expect((screen.getByLabelText("Weight for Reach") as HTMLInputElement).value).toBe("7");
    fireEvent.click(screen.getByRole("button", { name: "Count them all equally" })); expect((screen.getByLabelText("Weight for Reach") as HTMLInputElement).value).toBe("1");
  });
});

describe("one application", () => {
  it("shows what the applicant wrote, the notes only staff see, and the files, with a download for each", async () => {
    asMe(); await screen.findByRole("heading", { name: "Township Entrepreneurs Bootcamp" });
    expect(screen.getByText(/Applicant is an individual/)).toBeTruthy(); expect(screen.getByText("Khayelitsha Youth Hub (NGO or non-profit organisation)")).toBeTruthy(); expect(screen.getByText("Facilitators")).toBeTruthy();
    expect(screen.getByText("Not scanned for viruses")).toBeTruthy();
    expect(screen.queryByText("quote.pdf")).toBeNull();                                                                            // a reply's file is on the follow-up tab, not here
    fireEvent.click(screen.getByRole("button", { name: "Download" })); await waitFor(() => expect(h.fetchFile).toHaveBeenCalledWith("/SP-ABC234/documents/d1", { save: "proposal.pdf" }));
  });
  it("shows the award's own stage beside the status, because the status list ends at agreement pending", async () => {
    D = detail({ status: "agreement_pending", statusLabel: "Agreement pending", award: award({ stage: "active", stageLabel: "Agreement signed" }) }); asMe();
    expect(await screen.findByText("Agreement pending")).toBeTruthy(); expect(screen.getByText("Award: Agreement signed")).toBeTruthy();
  });
  it("warns that the team's email did not go, and that the applicant has replied", async () => {
    D = detail({ delivered: false, replied: true }); asMe();
    expect(await screen.findByText("Team email not sent")).toBeTruthy(); expect(screen.getByText("The applicant has replied")).toBeTruthy();
  });
});

describe("reviewing", () => {
  it("shows a total as scores are chosen, saves them, and says scores never decide anything", async () => {
    asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Review");
    expect(screen.getByText(/never approve or decline an application/)).toBeTruthy(); expect(screen.getByText("Score every criterion to see your total.")).toBeTruthy();
    for (const c of ["Strategic alignment", "Community impact", "Feasibility", "Budget quality", "Reach", "Measurable benefits"]) fireEvent.change(screen.getByLabelText(new RegExp(`^${c}`)), { target: { value: "4" } });
    expect(screen.getByText("80%")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Solid plan" } }); fireEvent.click(screen.getByRole("button", { name: "Save my scores" }));
    await waitFor(() => expect(sent()).toContainEqual(["PUT", "/SP-ABC234/score", { scores: all(4), comment: "Solid plan" }]));
  });
  it("starts from the reviewer's own scores and lets them replace them, and shows everyone's with the average", async () => {
    D = detail({ review: { weights: DEFAULT_WEIGHTS, average: 70, reviewers: [{ reviewerId: "u-ben", reviewerName: "Ben Reviewer", scores: all(3), comment: "Fine", total: 60, updatedAt: "2026-10-10T10:00:00Z" }, { reviewerId: "u-amy", reviewerName: "Amy Super", scores: all(4), comment: null, total: 80, updatedAt: "2026-10-10T11:00:00Z" }] } });
    asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Review");
    expect((screen.getByLabelText(/^Strategic alignment/) as HTMLSelectElement).value).toBe("3"); expect(screen.getByRole("button", { name: "Replace my scores" })).toBeTruthy();
    expect(screen.getByText(/Average of 2 reviewers/).textContent).toContain("70%"); expect(screen.getByText("Amy Super")).toBeTruthy();
  });
  it("hands the application to someone who works on sponsorships, or to nobody", async () => {
    asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Review");
    await waitFor(() => expect(within(screen.getByLabelText("Assign to")).getByText("Amy Super")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Assign to"), { target: { value: "u-amy" } }); fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    await waitFor(() => expect(sent()).toContainEqual(["POST", "/SP-ABC234/assign", { userId: "u-amy" }]));
    fireEvent.change(screen.getByLabelText("Assign to"), { target: { value: "" } }); fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    await waitFor(() => expect(sent().at(-1)).toEqual(["POST", "/SP-ABC234/assign", { userId: null }]));
  });
});

describe("deciding", () => {
  it("offers only the moves that are allowed, sends the reason and the message, and keeps a history", async () => {
    asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Decision");
    expect([...(screen.getByLabelText("Move to") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["More information required", "Approved", "Declined"]);
    fireEvent.change(screen.getByLabelText("Reason (kept in the history)"), { target: { value: "Budget unclear" } });
    fireEvent.change(screen.getByLabelText(/What do you need from the applicant/), { target: { value: "Please send a quote for the venue hire." } });
    fireEvent.click(screen.getByRole("button", { name: "Move to “More information required”" }));
    await waitFor(() => expect(sent()).toContainEqual(["POST", "/SP-ABC234/status", { status: "more_information_required", reason: "Budget unclear", applicantMessage: "Please send a quote for the venue hire." }]));
    const hist = screen.getByRole("heading", { name: "History" }).closest("section")!; expect(hist.textContent).toContain("Reason: Taken on"); expect(hist.textContent).toContain("Application submitted");
  });
  it("does not offer a move when there is none, and blocks an approval above the limit with the reason", async () => {
    D = detail({ nextStatuses: [] }); asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Decision"); expect(screen.getByText(/nothing further to do/)).toBeTruthy(); cleanup();
    D = detail({ mayApprove: false }); asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Decision");
    fireEvent.change(screen.getByLabelText("Move to"), { target: { value: "approved" } });
    expect(screen.getByRole("alert").textContent).toMatch(/above the approval limit.*Super Administrator/); expect(screen.queryByRole("button", { name: /Move to “Approved”/ })).toBeNull();
  });
});

describe("the award", () => {
  it("cannot be made before approval", async () => {
    asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Award"); expect(screen.getByText("Approve the application before awarding an amount.")).toBeTruthy();
  });
  it("is made with an amount and conditions, starting from what was asked for", async () => {
    D = detail({ status: "approved", statusLabel: "Approved" }); asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Award");
    expect((screen.getByLabelText("Amount awarded") as HTMLInputElement).value).toBe("50000");
    fireEvent.change(screen.getByLabelText("Amount awarded"), { target: { value: "45000" } }); fireEvent.change(screen.getByLabelText("Conditions"), { target: { value: "Facilitators only" } }); fireEvent.click(screen.getByRole("button", { name: "Make the award" }));
    await waitFor(() => expect(sent()).toContainEqual(["POST", "/SP-ABC234/award", { amount: "45000", conditions: "Facilitators only" }]));
  });
  it("sends the letter and agreement, then marks it signed, and says that is a record and not an electronic signature", async () => {
    D = detail({ status: "approved", statusLabel: "Approved", award: award() }); asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Award");
    expect(screen.getByText(/The agreement is a template.*legal advisers/)).toBeTruthy(); expect(screen.queryByText(/not an electronic signature/)).toBeNull(); expect(screen.getByText(/Payments can be recorded once the agreement is signed/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Read the award letter" })); await waitFor(() => expect(h.fetchFile).toHaveBeenCalledWith("/SP-ABC234/award/letter.pdf", { open: true }));
    fireEvent.click(screen.getByRole("button", { name: "Read the agreement" })); await waitFor(() => expect(h.fetchFile).toHaveBeenCalledWith("/SP-ABC234/award/agreement.pdf", { open: true }));
    fireEvent.click(screen.getByRole("button", { name: "Send the award letter and agreement" })); await waitFor(() => expect(sent()).toContainEqual(["POST", "/SP-ABC234/agreement", { action: "send", note: undefined }]));
    cleanup(); D = detail({ status: "agreement_pending", award: award({ agreementSentAt: "2026-10-12T09:00:00Z" }) }); asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Award");
    expect(screen.getByText(/not an electronic signature/)).toBeTruthy(); expect(screen.queryByLabelText("Amount awarded")).toBeNull();               // sent: the award can no longer be edited
    fireEvent.change(screen.getByLabelText("Date signed"), { target: { value: "2026-10-14" } }); fireEvent.click(screen.getByRole("button", { name: "Mark the agreement signed" }));
    await waitFor(() => expect(sent().at(-1)).toEqual(["POST", "/SP-ABC234/agreement", { action: "signed", signedOn: "2026-10-14", note: undefined }]));
  });
  it("keeps milestones: add, tick off, remove", async () => {
    D = detail({ status: "agreement_pending", award: award({ agreementSentAt: "x", milestones: [{ id: "m1", title: "Programme starts", dueDate: "2026-11-01", status: "pending", doneAt: null, note: null }] }) });
    asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab("Award");
    fireEvent.click(screen.getByLabelText("Programme starts done")); await waitFor(() => expect(sent()).toContainEqual(["POST", "/SP-ABC234/milestones/m1", { status: "done" }]));
    fireEvent.click(screen.getByRole("button", { name: "Remove Programme starts" })); await waitFor(() => expect(sent()).toContainEqual(["DELETE", "/SP-ABC234/milestones/m1", undefined]));
    fireEvent.change(screen.getByLabelText("Milestone name"), { target: { value: "Pitch day" } }); fireEvent.change(screen.getByLabelText("Milestone due date"), { target: { value: "2026-12-15" } }); fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(sent()).toContainEqual(["POST", "/SP-ABC234/milestones", { title: "Pitch day", dueDate: "2026-12-15" }]));
  });
  it("records payments for finance staff only, and shows what is left", async () => {
    const signed = award({ stage: "active", stageLabel: "Agreement signed", agreementSentAt: "x", agreementSignedAt: "y", signedOn: "2026-10-08", disbursed: 20000, remaining: 25000, payments: [{ id: "p1", kind: "cash", kindLabel: "Payment", amount: 20000, paidOn: "2026-10-09", reference: "EFT 8841", note: null, recordedBy: "u-fin", createdAt: "2026-10-09T10:00:00Z" }] });
    D = detail({ status: "agreement_pending", award: signed }); asMe(me()); await screen.findByRole("tablist", { name: "Application sections" }); tab("Award");
    expect(screen.getByText(/ZAR 20.?000 of ZAR 45.?000 paid.*ZAR 25.?000 left/)).toBeTruthy(); expect(screen.getByText(/EFT 8841/)).toBeTruthy();
    expect(screen.getByText(/Only finance staff and Super Administrators can record payments/)).toBeTruthy(); expect(screen.queryByLabelText("Payment amount")).toBeNull(); cleanup();
    asMe(me({ isFinance: true })); await screen.findByRole("tablist", { name: "Application sections" }); tab("Award");
    fireEvent.change(screen.getByLabelText("Payment amount"), { target: { value: "5000" } }); fireEvent.change(screen.getByLabelText("Payment reference"), { target: { value: "EFT 9000" } }); fireEvent.click(screen.getByRole("button", { name: "Record the payment" }));
    await waitFor(() => expect(sent().at(-1)![1]).toBe("/SP-ABC234/payments")); expect(sent().at(-1)![2]).toMatchObject({ kind: "cash", amount: "5000", reference: "EFT 9000" });
  });
});

describe("the applicant's follow-up", () => {
  it("shows replies with their files, and tells staff to move the application on", async () => {
    D = detail({ status: "more_information_required", replied: true, replies: [{ id: "rep-1", message: "The quote for the hall is attached: R12,500.", at: "2026-10-13T09:00:00Z" }] });
    asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab(/Follow-up/);
    expect(screen.getByText("The quote for the hall is attached: R12,500.")).toBeTruthy(); expect(screen.getByText("quote.pdf")).toBeTruthy(); expect(screen.getByText(/Move the application on from the Decision tab/)).toBeTruthy();
  });
  it("shows a final report with its evidence, and accepts it or returns it with a note", async () => {
    D = detail({ status: "agreement_pending", award: award({ stage: "active", stageLabel: "Agreement signed", agreementSentAt: "x", agreementSignedAt: "y" }), reports: [{ id: "r1", beneficiaries: 58, summary: "We ran the programme for fifty-eight young people.", outcomes: "Twenty-two started a business.", benefitsDelivered: { logo: "On all banners" }, spent: 44200, expenditureNotes: "As budgeted", challenges: null, status: "submitted", statusLabel: "Submitted", reviewNote: null, reviewedBy: null, reviewedAt: null, createdAt: "2026-10-20T09:00:00Z" }] });
    asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab(/Follow-up/);
    expect(screen.getByText("We ran the programme for fifty-eight young people.")).toBeTruthy(); expect(screen.getByText("On all banners")).toBeTruthy(); expect(screen.getByText("58")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Note to the applicant/), { target: { value: "Please add the receipts for the hall." } }); fireEvent.click(screen.getByRole("button", { name: "Return it for changes" }));
    await waitFor(() => expect(sent()).toContainEqual(["POST", "/SP-ABC234/reports/r1/review", { decision: "returned", note: "Please add the receipts for the hall." }]));
    fireEvent.click(screen.getByRole("button", { name: "Accept the report" })); await waitFor(() => expect(sent().at(-1)![2]).toMatchObject({ decision: "accepted" }));
  });
  it("shows a settled report without the review buttons", async () => {
    D = detail({ reports: [{ id: "r1", beneficiaries: 58, summary: "We ran the programme.", outcomes: "Twenty-two started a business.", benefitsDelivered: {}, spent: 1, expenditureNotes: null, challenges: null, status: "accepted", statusLabel: "Accepted", reviewNote: "Excellent work.", reviewedBy: "u-amy", reviewedAt: "2026-10-21T09:00:00Z", createdAt: "2026-10-20T09:00:00Z" }] });
    asMe(); await screen.findByRole("tablist", { name: "Application sections" }); tab(/Follow-up/);
    expect(screen.getByText("Accepted")).toBeTruthy(); expect(screen.getByText(/Your note: Excellent work/)).toBeTruthy(); expect(screen.queryByRole("button", { name: "Accept the report" })).toBeNull();
  });
});
