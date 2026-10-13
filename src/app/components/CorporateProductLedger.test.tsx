// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { CorporateProductLedgerViewer } from "./CorporateProductLedgerViewer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement;
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true })))); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

const render = async (cat: "account" | "solutions" | "loan") => { await act(async () => { root.render(<CorporateProductLedgerViewer isOpen onClose={() => {}} initialCategory={cat} onNavigate={() => {}} onOpenApp={() => {}} />); }); };
const names = () => [...host.querySelectorAll(".pav-acct-name")].map((h) => h.textContent);
const openDetails = async (i: number) => { await act(async () => { (host.querySelectorAll(".pav-cta-group .pav-btn:nth-child(2)")[i] as HTMLElement).click(); }); };

describe("Corporate Banking pages", () => {
  it("keeps the names of the three pages", async () => {
    await render("account");
    expect([...host.querySelectorAll(".pav-subnav-item")].map((b) => b.textContent)).toEqual(["Account", "Solutions & Credit Cards", "Loan", "Social Responsibility"]);
    expect(host.querySelector(".pav-ledger-head h2")!.textContent).toBe("All corporate accounts");
  });
  it("shows the six accounts for public funds, without invented fees", async () => {
    await render("account");
    expect(names()).toEqual(["Government Treasury Account", "Project Account", "Escrow / Disbursement Account", "Collections Account", "Contractor Account", "Foreign Currency Account"]);
    expect(host.querySelectorAll(".pav-price-text")).toHaveLength(6); expect(host.querySelector(".pav-cur")).toBeNull();
    expect(host.textContent).toContain("5 to 10 business days");
  });
  it("opens the details of an account with its features, documents and steps", async () => {
    await render("account"); await openDetails(0);
    const d = host.querySelector("[data-product-detail]")!.textContent!;
    for (const t of ["Government Treasury Account", "Account features", "Documents required: government bodies", "Letter of request on official letterhead", "How to open an account", "Account activation"]) expect(d).toContain(t);
  });
  it("shows the contractor documents on the contractor account", async () => {
    await render("account"); await openDetails(4); expect(host.querySelector("[data-product-detail]")!.textContent).toContain("Audited financial statements for the last two years");
  });
  it("shows the credit facilities with their tenors, and the details with pricing and the notice", async () => {
    await render("solutions");
    expect(names()).toEqual(["Sovereign Term Loan", "Project Finance Facility", "Bridge Facility", "Equipment Term Loan", "Equipment Finance Lease", "Revolving Equipment Credit Line", "Guarantees and Performance Bonds"]);
    expect(host.textContent).toContain("7 to 15 years, with grace period");
    await openDetails(0); const d = host.querySelector("[data-product-detail]")!.textContent!;
    for (const t of ["Pricing", "reference rate plus a margin", "Security and credit support", "How to apply", "not an offer or commitment to lend"]) expect(d).toContain(t);
  });
  it("shows the sectors and the equipment programmes on the loan page", async () => {
    await render("loan");
    expect(names()).toEqual(["Road Development", "Railway Development", "Schools", "Hospitals and Clinics", "Universities", "Housing Development", "Agriculture", "Road Construction Machinery", "Housing Construction Machinery", "Agricultural Machinery"]);
    await openDetails(7); const d = host.querySelector("[data-product-detail]")!.textContent!;
    for (const t of ["5 to 10 years", "Financing structures", "Finance lease", "What every equipment facility includes", "Terms are indicative"]) expect(d).toContain(t);
  });
  it("does not carry the About us text or the bank-name placeholders", async () => {
    for (const c of ["account", "solutions", "loan"] as const) { await render(c); await openDetails(0); const t = host.textContent!; expect(t).not.toContain("[Bank Name]"); expect(t).not.toContain("[Licence No.]"); expect(t).not.toContain("A corporate bank built to fund"); }
  });
});
