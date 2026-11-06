import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CommissionScreen, PayRunScreen, QueriesScreen, parseBrackets } from "./AssociationCommission";
import { rand } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const R = (cents: number) => rand(cents / 100).replace(/\s/g, " ");
type Reply = { status?: number; body: unknown; type?: string };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const SETTINGS = { success: true, settings: { mode: "off", payableOn: "recorded", payPeriod: "weekly", tiersEnabled: false, deductionCapBp: 5000, uifApplies: false, uifRateBp: 100, shiftLimitMinutes: 600, weekLimitMinutes: 3600, shiftGapMinutes: 180, cashoutEnabled: false, cashoutCapBp: 5000, payeEnabled: false, alertEmail: null, alertPhone: null }, currentPeriod: { start: "2026-11-02", end: "2026-11-08" }, lastFinishedPeriod: { start: "2026-10-26", end: "2026-11-01" },
  reasons: [{ code: "breakdown", kind: "queue", label: "Breakdown" }, { code: "goodwill", kind: "fee", label: "Goodwill" }, { code: "association_absorbs", kind: "fee", label: "Association absorbs the fee" }] };
const RULES = { success: true, feeRules: [{ id: "f1", scope: "association", rank: null, route: null, amountCents: 2000, effectiveFrom: "2026-01-01", note: null }], rates: [{ id: "r1", scope: "default", rank: null, marshal: null, rateBp: 4000, effectiveFrom: "2026-01-01", note: null }, { id: "r2", scope: "marshal", rank: null, marshal: "Mo Marshal", rateBp: 5000, effectiveFrom: "2026-02-01", note: null }], tiers: [] };
const TRIPS = { success: true, trips: [{ departureId: "d1", time: "2026-11-02T04:00:00Z", rank: "Langa", marshal: "Mo Marshal", registration: "CA 111-111", driver: "Dee Driver", mode: "live", feeCents: 2000, rateBp: 4000, commissionCents: 800, reversed: false, feeStatus: "owed" }, { departureId: "d2", time: "2026-11-02T04:10:00Z", rank: "Langa", marshal: "Mo Marshal", registration: "CA 222-222", driver: null, mode: "live", feeCents: 2000, rateBp: 4000, commissionCents: 800, reversed: false, feeStatus: "paid" }] };
const SLIP = { id: "p1", number: "PS-20261101-M0001", status: "draft", marshal: "Mo Marshal", periodStart: "2026-10-26", periodEnd: "2026-11-01", trips: 120, grossCommissionCents: 96000, otherEarningsCents: 0, deductionsCents: 15000, netCents: 81000, withheldCents: 0, feesOwedTrips: 8, feesOwedCents: 16000,
  lines: [{ id: "l1", side: "earning", kind: "commission", label: "Commission: 120 trips at R20.00 fee, 40%", amountCents: 96000, reason: null, reference: null }, { id: "l2", side: "deduction", kind: "advance", label: "Advance repayment", amountCents: 10000, reason: "Advance 14 Oct", reference: "ADV-0007" }], payment: { method: null, reference: null, paidAt: null, waiting: null } };
beforeEach(() => {
  calls = []; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => {
    if (p === "/api/portal/association/commission/settings") return { body: SETTINGS }; if (p === "/api/portal/association/commission/rules") return { body: RULES };
    if (p === "/api/portal/association/tokens/routes") return { body: { success: true, routes: [{ id: "rt1", name: "Langa to Bellville" }] } };
    if (p === "/api/portal/association/commission/tax-tables" && m === "GET") return { body: { success: true, tables: [{ taxYear: "2026/27", effectiveFrom: "2026-03-01", effectiveTo: "2027-02-28", brackets: [{ upToCents: 24510000, rateBp: 1800 }, { upToCents: null, rateBp: 4500 }], primaryRebateCents: 1782000, uifCeilingMonthlyCents: 1771200, source: "SARS, rates of tax for individuals" }] } };
    if (p === "/api/portal/association/ranks") return { body: { success: true, ranks: [{ id: "k1", name: "Langa rank" }, { id: "k2", name: "Bellville rank" }] } };
    if (p === "/api/portal/association/commission/marshals") return { body: { success: true, marshals: [{ id: "m1", name: "Mo Marshal", marshalNumber: "M-0001", class: "independent", uifApplies: false, startedOn: null }, { id: "m2", name: "Mia Marshal", marshalNumber: "M-0002", class: "employee", uifApplies: true, startedOn: null }] } };
    if (p.startsWith("/api/portal/association/commission/trips") && m === "GET") return { body: TRIPS };
    if (p.startsWith("/api/portal/association/commission/reconciliation")) return { body: { success: true, trips: 2, feesDueCents: 4000, feesReceivedCents: 2000, feesOutstandingCents: 2000, commissionEarnedCents: 1600, commissionPayableCents: 1600, outstanding: [{ driver: "Dee Driver", vehicle: "CA 111-111", trips: 1, cents: 2000 }] } };
    if (m === "PUT" || m === "POST") return { status: 200, body: { success: true } };
    if (p.startsWith("/api/portal/association/payruns")) return { body: { success: true, period: { start: "2026-10-26", end: "2026-11-01" }, finished: true, payslips: [{ id: "p1", number: SLIP.number, marshal: "Mo Marshal", status: "draft", trips: 120, grossCents: 96000, deductionsCents: 15000, netCents: 81000 }] } };
    if (p === "/api/portal/association/payslips/p1") return { body: { success: true, payslip: SLIP } }; if (p.endsWith(".pdf")) return { body: "", type: "pdf" };
    if (p.startsWith("/api/portal/association/adjustments")) return { body: { success: true, adjustments: [{ id: "a1", marshal: "Mo Marshal", kind: "advance", label: "Advance repayment", reason: "Advance 14 Oct", reference: "ADV-0007", totalCents: 30000, remainingCents: 20000, active: true }] } };
    if (p.startsWith("/api/portal/association/disputes")) return { body: { success: true, disputes: [{ id: "q1", raisedBy: "Mo Marshal", role: "marshal", targetType: "payslip_line", message: "I counted 3 trips on Tuesday", status: "open", response: null, creditCents: null, createdAt: "2026-11-03T08:00:00Z" }, { id: "q2", raisedBy: "Dee Driver", role: "driver", targetType: "trip", message: "I did not do this trip", status: "upheld", response: "Duplicate", creditCents: null, createdAt: "2026-11-03T09:00:00Z" }] } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 });
    if (r.type === "pdf") return new Response("%PDF-1.3", { status: 200, headers: { "content-type": "application/pdf" } });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the commission screen", () => {
  it("shows the settings with what each mode means, and the pay periods", async () => {
    render(<CommissionScreen />); expect(await screen.findByText("Commission settings")).toBeInTheDocument(); expect(screen.getByText(/Today's behaviour: the marshal fee goes to the marshal/)).toBeInTheDocument();
    expect(screen.getByText(/Pay period now: 2026-11-02 to 2026-11-08. Last finished: 2026-10-26 to 2026-11-01/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Commission is"), { target: { value: "commission" } }); expect(screen.getByText(/Live: the driver pays the trip fee to the association/)).toBeInTheDocument();
  });
  it("saves every setting in the units the server wants (whole cents of percent), including UIF only when it is switched on", async () => {
    render(<CommissionScreen />); await screen.findByText("Commission settings");
    fireEvent.change(screen.getByLabelText("Commission is"), { target: { value: "shadow" } }); fireEvent.change(screen.getByLabelText("Commission becomes payable"), { target: { value: "paid" } }); fireEvent.change(screen.getByLabelText("Pay period"), { target: { value: "fortnightly" } });
    fireEvent.change(screen.getByLabelText(/Most deductions may take/), { target: { value: "40" } }); fireEvent.click(screen.getByLabelText(/Use tiers/)); fireEvent.click(screen.getByLabelText(/Take UIF from employees/)); fireEvent.change(screen.getByLabelText("UIF rate (%)"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" })); await waitFor(() => expect(writes()).toEqual([{ method: "PUT", path: "/api/portal/association/commission/settings", body: { mode: "shadow", payableOn: "paid", payPeriod: "fortnightly", tiersEnabled: true, deductionCapBp: 4000, uifApplies: true, uifRateBp: 100, shiftLimitMinutes: 600, weekLimitMinutes: 3600, shiftGapMinutes: 180, cashoutEnabled: false, cashoutCapBp: 5000, payeEnabled: false, alertEmail: "", alertPhone: "" } }]));
  });
  it("shows the server's reason when settings are refused (commission needs a rate before it can be switched on)", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 409, body: { success: false, error: "Set the commission rate first: there is nothing to calculate with" } } : o(m, p, b)))(routes);
    render(<CommissionScreen />); await screen.findByText("Commission settings"); fireEvent.change(screen.getByLabelText("Commission is"), { target: { value: "commission" } }); fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText(/Set the commission rate first/)).toBeInTheDocument();
  });
  it("lists the rules, shows what a day of trips would pay, and adds a fee, a rate for a marshal and a rate for a rank in the units the server wants", async () => {
    render(<CommissionScreen />); expect(await screen.findByText(/A day of 20 trips at/)).toHaveTextContent(`A day of 20 trips at ${R(2000)} and 40% pays the marshal ${R(16000)}.`); expect(screen.getByText(/50% · Mo Marshal · from 2026-02-01/)).toBeInTheDocument();
    pick("Trip fee applies to", "rank"); pick("Fee rank", "k1"); fireEvent.change(screen.getByLabelText("Trip fee (R)"), { target: { value: "22,50" } }); fireEvent.change(screen.getByLabelText("Fee from"), { target: { value: "2026-12-01" } }); fireEvent.click(screen.getByRole("button", { name: "Add trip fee" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/commission/fee-rules", body: { scope: "rank", rankId: "k1", amountCents: 2250, effectiveFrom: "2026-12-01" } }));
    pick("Commission rate applies to", "marshal"); pick("Rate marshal", "m2"); fireEvent.change(screen.getByLabelText("Rate (% of the trip fee)"), { target: { value: "45" } }); fireEvent.change(screen.getByLabelText("Rate from"), { target: { value: "2026-12-01" } }); fireEvent.click(screen.getByRole("button", { name: "Add rate" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/commission/rates", body: { scope: "marshal", marshalId: "m2", rateBp: 4500, effectiveFrom: "2026-12-01" } }));
    pick("Commission rate applies to", "rank"); pick("Rate rank", "k2"); fireEvent.change(screen.getByLabelText("Rate (% of the trip fee)"), { target: { value: "42.5" } }); fireEvent.change(screen.getByLabelText("Rate from"), { target: { value: "2026-12-01" } }); fireEvent.click(screen.getByRole("button", { name: "Add rate" }));
    await waitFor(() => expect(writes().at(-1)!.body).toEqual({ scope: "rank", rankId: "k2", rateBp: 4250, effectiveFrom: "2026-12-01" }));
  });
  it("offers tiers only when the association uses them", async () => {
    render(<CommissionScreen />); await screen.findByText(/A day of 20 trips/); expect(screen.queryByLabelText("Tier after")).toBeNull(); cleanup();
    routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/commission/settings") ? { body: { ...SETTINGS, settings: { ...SETTINGS.settings, tiersEnabled: true } } } : o(m, p, b)))(routes);
    render(<CommissionScreen />); await screen.findByLabelText("Tier after"); fireEvent.change(screen.getByLabelText("Tier after"), { target: { value: "60" } }); fireEvent.change(screen.getByLabelText("Tier rate"), { target: { value: "45" } }); fireEvent.change(screen.getByLabelText("Tier from"), { target: { value: "2026-12-01" } }); fireEvent.click(screen.getByRole("button", { name: "Add tier" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/commission/tiers", body: { afterTrips: 60, rateBp: 4500, effectiveFrom: "2026-12-01" } }));
  });
  it("shows each trip's fee, rate and commission, and waives an unpaid fee with a reason (offering absorb), only for fees that are owed", async () => {
    render(<CommissionScreen />); await screen.findByText("Trips and what they earned (last 7 days)"); expect(await screen.findByText("CA 111-111")).toBeInTheDocument(); expect(screen.getAllByText("Waive")).toHaveLength(1);                 // only the owed one
    fireEvent.click(screen.getByText("Waive")); expect(within(screen.getByLabelText("Reason")).queryByText("Breakdown")).toBeNull(); expect(within(screen.getByLabelText("Reason")).getByText("Goodwill")).toBeInTheDocument();          // only fee reasons are offered
    pick("Reason", "association_absorbs"); fireEvent.change(screen.getByLabelText("Say why"), { target: { value: "Association covers it" } }); fireEvent.click(screen.getByLabelText(/The association absorbs it/));
    fireEvent.click(screen.getByRole("button", { name: "Waive the fee" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/commission/trips/d1/waive", body: { reasonCode: "association_absorbs", reason: "Association covers it", absorb: true } }));
  });
  it("shows the money check and calculates past trips from a date, saying how many were done", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/backfill") ? { body: { success: true, recorded: 3, skipped: 1 } } : o(m, p, b)))(routes);
    render(<CommissionScreen />); expect(await screen.findByText(/trip fees due/)).toHaveTextContent(`2 trips · trip fees due ${R(4000)}, received ${R(2000)}, outstanding ${R(2000)}.`); expect(screen.getByText("Dee Driver · CA 111-111: 1 trip, " + R(2000))).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Catch up from"), { target: { value: "2026-10-01" } }); fireEvent.click(screen.getByRole("button", { name: "Calculate" })); expect(await screen.findByText("3 trips calculated, 1 already done.")).toBeInTheDocument();
    expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/commission/backfill", body: { from: "2026-10-01" } });
  });
});

describe("the pay run", () => {
  it("shows the last finished period, prepares payslips and says how many, and lists them with their net pay", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p.endsWith("/payruns") ? { body: { success: true, period: { start: "2026-10-26", end: "2026-11-01" }, drafted: 1, empty: 1 } } : o(m, p, b)))(routes);
    render(<PayRunScreen />); expect(await screen.findByText("2026-10-26 to 2026-11-01")).toBeInTheDocument(); expect(screen.getAllByText("Mo Marshal").length).toBeGreaterThan(0); expect(screen.getByText(R(81000))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prepare payslips" })); expect(await screen.findByText("1 payslip prepared, 1 marshal with nothing to show.")).toBeInTheDocument(); expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/payruns", body: { start: "2026-10-26" } });
  });
  it("reviews a draft payslip, issues it by the chosen method, and for bank or cash records the payment with a reference", async () => {
    render(<PayRunScreen />); fireEvent.click(await screen.findByRole("button", { name: "Review" })); expect(await screen.findByText(/PS-20261101-M0001 · Mo Marshal/)).toBeInTheDocument(); expect(screen.getByText("Advance repayment (ADV-0007)")).toBeInTheDocument(); expect(screen.getByText(/Net pay/)).toHaveTextContent("Net pay " + R(81000));
    pick("Pay by", "bank"); fireEvent.click(screen.getByRole("button", { name: "Issue payslip" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/payslips/p1/issue", body: { method: "bank" } }));
    cleanup(); routes = ((o) => (m: string, p: string, b: any) => (p === "/api/portal/association/payslips/p1" ? { body: { success: true, payslip: { ...SLIP, status: "issued", payment: { method: "bank", reference: null, paidAt: null, waiting: null } } } } : o(m, p, b)))(routes);
    render(<PayRunScreen />); fireEvent.click(await screen.findByRole("button", { name: "Review" })); await screen.findByLabelText("Payment reference"); fireEvent.change(screen.getByLabelText("Payment reference"), { target: { value: "EFT-4411" } }); fireEvent.change(screen.getByLabelText("Date paid"), { target: { value: "2026-11-02" } }); fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/payslips/p1/payment", body: { method: "bank", reference: "EFT-4411", paidAt: "2026-11-02" } }));
  });
  it("explains a wallet payslip that is waiting for money, offers no manual payment for it, and downloads the PDF", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === "/api/portal/association/payslips/p1" ? { body: { success: true, payslip: { ...SLIP, status: "issued", payment: { method: "wallet", reference: null, paidAt: null, waiting: "Not enough money in the payer's account yet" } } } } : o(m, p, b)))(routes);
    render(<PayRunScreen />); fireEvent.click(await screen.findByRole("button", { name: "Review" })); expect(await screen.findByText(/the money engine pays it from the association's VINK account and retries/)).toBeInTheDocument(); expect(screen.queryByLabelText("Payment reference")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe("/api/portal/association/payslips/p1.pdf"));
  });
  it("shows the server's reason when issuing is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p.endsWith("/issue") ? { status: 409, body: { success: false, error: "The figures have changed since this draft was made: review it again" } } : o(m, p, b)))(routes);
    render(<PayRunScreen />); fireEvent.click(await screen.findByRole("button", { name: "Review" })); await screen.findByText(/PS-20261101-M0001/); fireEvent.click(screen.getByRole("button", { name: "Issue payslip" })); expect(await screen.findByText(/The figures have changed since this draft was made/)).toBeInTheDocument();
  });
  it("asks for another period by any day in it", async () => {
    render(<PayRunScreen />); await screen.findByText("2026-10-26 to 2026-11-01"); fireEvent.change(screen.getByLabelText("Pay period day"), { target: { value: "2026-10-14" } }); await waitFor(() => expect(calls.at(-1)!.path).toBe("/api/portal/association/payruns?start=2026-10-14"));
  });
  it("adds a deduction with its reason and an instalment in cents, lists adjustments, and cancels one", async () => {
    render(<PayRunScreen />); await screen.findByText(/Advance repayment \(ADV-0007\)/); pick("Adjustment marshal", "m1"); pick("Adjustment kind", "advance"); fireEvent.change(screen.getByLabelText("Adjustment reason"), { target: { value: "Advance 14 Oct" } }); fireEvent.change(screen.getByLabelText("Adjustment amount"), { target: { value: "300" } }); fireEvent.change(screen.getByLabelText("Adjustment per period"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/adjustments", body: { marshalId: "m1", kind: "advance", reason: "Advance 14 Oct", totalCents: 30000, perPeriodCents: 10000 } }));
    expect(screen.getByText(/R 200,00 still to apply|still to apply/)).toBeInTheDocument(); fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]); await waitFor(() => expect(writes().at(-1)!.path).toBe("/api/portal/association/adjustments/a1/cancel"));
  });
  it("sets each marshal's class and UIF", async () => {
    render(<PayRunScreen />); await screen.findByText("Marshals' payslip details"); pick("Class of Mo Marshal", "employee"); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: "/api/portal/association/commission/marshals/m1", body: { class: "employee" } }));
    fireEvent.click(screen.getByLabelText("UIF for Mo Marshal")); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: "/api/portal/association/commission/marshals/m1", body: { uifApplies: true } }));
  });
});

describe("queries from marshals and drivers", () => {
  it("lists them, and answers an open one with a reason and, for a marshal, a credit in cents; the effect is explained", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p.endsWith("/respond") ? { body: { success: true, status: "upheld", effect: "credit_on_next_payslip" } } : o(m, p, b)))(routes);
    render(<QueriesScreen />); expect(await screen.findByText(/I counted 3 trips on Tuesday/)).toBeInTheDocument(); expect(screen.getByText(/Answer: Duplicate/)).toBeInTheDocument(); expect(screen.getAllByLabelText("Decision")).toHaveLength(1);        // the answered one has no form
    fireEvent.change(screen.getByLabelText("Reason for the answer"), { target: { value: "A trip was missed" } }); fireEvent.change(screen.getByLabelText("Credit (R)"), { target: { value: "8" } }); fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    expect(await screen.findByText(/Answered. The credit will appear on the marshal's next payslip./)).toBeInTheDocument(); expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/disputes/q1/respond", body: { decision: "upheld", response: "A trip was missed", creditCents: 800 } });
  });
  it("offers no credit on a driver's query, explains a refund that is needed, filters by status, and shows the server's refusal", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "GET" && p.startsWith("/api/portal/association/disputes") ? { body: { success: true, disputes: [{ id: "q3", raisedBy: "Dee Driver", role: "driver", targetType: "trip", message: "not my trip", status: "open", response: null, creditCents: null, createdAt: "2026-11-03T08:00:00Z" }] } } : m === "POST" ? { status: 400, body: { success: false, error: "Give the reason, so the person sees why" } } : o(m, p, b)))(routes);
    render(<QueriesScreen />); await screen.findByText(/not my trip/); expect(screen.queryByLabelText("Credit (R)")).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Answer" })); expect(await screen.findByText("Give the reason, so the person sees why")).toBeInTheDocument();
    pick("Show queries", "open"); await waitFor(() => expect(calls.at(-1)!.path).toBe("/api/portal/association/disputes?status=open"));
  });
});

describe("the new commission controls", () => {
  it("saves the shift limits in minutes and the cash-out switch and share in the units the server wants", async () => {
    render(<CommissionScreen />); await screen.findByText("Commission settings"); fireEvent.change(screen.getByLabelText("Longest shift"), { target: { value: "9,5" } }); fireEvent.change(screen.getByLabelText("Longest week"), { target: { value: "54" } }); fireEvent.change(screen.getByLabelText("Shift gap"), { target: { value: "120" } });
    expect(screen.queryByLabelText("Cash-out share")).toBeNull(); fireEvent.click(screen.getByLabelText(/Let marshals draw commission they have already earned/)); fireEvent.change(screen.getByLabelText("Cash-out share"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ shiftLimitMinutes: 570, weekLimitMinutes: 3240, shiftGapMinutes: 120, cashoutEnabled: true, cashoutCapBp: 4000 }));
  });
  it("adds a trip fee for one route", async () => {
    render(<CommissionScreen />); await screen.findByText(/A day of 20 trips/); pick("Trip fee applies to", "route"); pick("Fee route", "rt1"); fireEvent.change(screen.getByLabelText("Trip fee (R)"), { target: { value: "25" } }); fireEvent.change(screen.getByLabelText("Fee from"), { target: { value: "2026-12-01" } }); fireEvent.click(screen.getByRole("button", { name: "Add trip fee" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/commission/fee-rules", body: { scope: "route", routeId: "rt1", amountCents: 2500, effectiveFrom: "2026-12-01" } }));
  });
  it("offers a refund for a fee the driver has paid (and a waiver for one still owed), saying the driver is paid back", async () => {
    render(<CommissionScreen />); await screen.findByText("CA 222-222"); expect(screen.getByText("Refund")).toBeInTheDocument(); expect(screen.getByText("Waive")).toBeInTheDocument(); fireEvent.click(screen.getByText("Refund")); pick("Reason", "goodwill"); fireEvent.change(screen.getByLabelText("Say why"), { target: { value: "Never left" } });
    fireEvent.click(screen.getByRole("button", { name: "Refund the driver" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/commission/trips/d2/refund", body: { reasonCode: "goodwill", reason: "Never left", absorb: false } })); expect(await screen.findByText(/the driver is paid back through the money engine/)).toBeInTheDocument();
  });
  it("revises an issued payslip that has not been paid, with a reason, and says to prepare it again; a paid one cannot be revised", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === "/api/portal/association/payslips/p1" ? { body: { success: true, payslip: { ...SLIP, status: "issued", payment: { method: "bank", reference: null, paidAt: null, waiting: null } } } } : o(m, p, b)))(routes);
    render(<PayRunScreen />); fireEvent.click(await screen.findByRole("button", { name: "Review" })); fireEvent.click(await screen.findByText("Revise this payslip")); fireEvent.change(screen.getByLabelText("Why it is revised"), { target: { value: "A trip was left out" } }); fireEvent.click(screen.getByRole("button", { name: "Revise" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/payslips/p1/revise", body: { note: "A trip was left out" } })); expect(await screen.findByText(/Prepare the payslips again to make the corrected version/)).toBeInTheDocument(); cleanup();
    routes = ((o) => (m: string, p: string, b: any) => (p === "/api/portal/association/payslips/p1" ? { body: { success: true, payslip: { ...SLIP, status: "paid", payment: { method: "bank", reference: "EFT", paidAt: "2026-11-02T10:00:00Z", waiting: null } } } } : o(m, p, b)))(routes);
    render(<PayRunScreen />); fireEvent.click(await screen.findByRole("button", { name: "Review" })); await screen.findByText(/Paid 2026-11-02/); expect(screen.queryByText("Revise this payslip")).toBeNull();
  });
});

describe("PAYE, alerts and the tax tables", () => {
  it("saves the PAYE switch and the alert email and phone, trimmed", async () => {
    render(<CommissionScreen />); await screen.findByText("Commission settings"); fireEvent.click(screen.getByLabelText(/Work out PAYE/)); fireEvent.change(screen.getByLabelText("Alert email"), { target: { value: "  ops@langa.example " } }); fireEvent.change(screen.getByLabelText("Alert phone"), { target: { value: " +27821234567 " } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ payeEnabled: true, alertEmail: "ops@langa.example", alertPhone: "+27821234567" }));
  });
  it("shows the tables PAYE is worked from with their source, and says what happens with none", async () => {
    render(<CommissionScreen />); expect((await screen.findByText("2026/27")).closest("li")).toHaveTextContent(`2026/27 · 2026-03-01 to 2027-02-28 · 2 brackets, from 18% to 45% · rebate ${R(1782000)} · UIF ceiling ${R(1771200)} a month`); expect(screen.getByText("SARS, rates of tax for individuals")).toBeInTheDocument(); expect(screen.getByText(/no PAYE is calculated and the payslip says so/)).toBeInTheDocument();
  });
  it("shows the age rebates beside each table, and defaults an empty age rebate to none", async () => {
    render(<CommissionScreen />); const li = (await screen.findByText("2026/27")).closest("li")!; expect(li).toHaveTextContent(`age rebates ${R(0)} (65 and over) and ${R(0)} (75 and over)`);                    // the test data has none: shown as R0, never blank or NaN
    routes = ((o) => (m: string, p: string, b: any) => (p === "/api/portal/association/commission/tax-tables" && m === "GET" ? { body: { success: true, tables: [{ taxYear: "2026/27", effectiveFrom: "2026-03-01", effectiveTo: "2027-02-28", brackets: [{ upToCents: 24510000, rateBp: 1800 }, { upToCents: null, rateBp: 4500 }], primaryRebateCents: 1782000, secondaryRebateCents: 976500, tertiaryRebateCents: 324900, uifCeilingMonthlyCents: 1771200, source: "SARS" }] } } : o(m, p, b)))(routes);
    cleanup(); render(<CommissionScreen />); expect((await screen.findByText("2026/27")).closest("li")).toHaveTextContent(`age rebates ${R(976500)} (65 and over) and ${R(324900)} (75 and over)`);
  });
  it("reads brackets typed as the top of each in rand and its rate, and refuses a line it cannot read", () => {
    expect(parseBrackets("245100 18\n383 100 26\nabove 45")).toEqual([{ upToCents: 24510000, rateBp: 1800 }, { upToCents: 38310000, rateBp: 2600 }, { upToCents: null, rateBp: 4500 }]); expect(parseBrackets("1000,50 18.5%\n\nABOVE 45")).toEqual([{ upToCents: 100050, rateBp: 1850 }, { upToCents: null, rateBp: 4500 }]);
    expect(parseBrackets("lots 18")).toBeNull(); expect(parseBrackets("245100")).toBeNull(); expect(parseBrackets("")).toEqual([]);
  });
  it("adds next year's table in the units the server wants, with its source, and explains a bracket line it cannot read without sending anything", async () => {
    render(<CommissionScreen />); await screen.findByText(/2026\/27/); fireEvent.click(screen.getByText("Add next year's table")); fireEvent.change(screen.getByLabelText("Tax year"), { target: { value: "2027/28" } }); fireEvent.change(screen.getByLabelText("Table from"), { target: { value: "2027-03-01" } }); fireEvent.change(screen.getByLabelText("Table to"), { target: { value: "2028-02-29" } });
    fireEvent.change(screen.getByLabelText("Primary rebate"), { target: { value: "18 000" .replace(" ", "") } }); fireEvent.change(screen.getByLabelText("Secondary rebate"), { target: { value: "9900" } }); fireEvent.change(screen.getByLabelText("Tertiary rebate"), { target: { value: "3300,50" } }); fireEvent.change(screen.getByLabelText("UIF ceiling"), { target: { value: "18000" } }); fireEvent.change(screen.getByLabelText("Table source"), { target: { value: "SARS Budget 2027" } });
    fireEvent.change(screen.getByLabelText("Tax brackets"), { target: { value: "oops" } }); fireEvent.click(screen.getByRole("button", { name: "Add the table" })); expect(await screen.findByText(/Each bracket line is the top amount then the rate/)).toBeInTheDocument(); expect(writes()).toEqual([]);
    fireEvent.change(screen.getByLabelText("Tax brackets"), { target: { value: "250000 18\n400000 26\nabove 45" } }); fireEvent.click(screen.getByRole("button", { name: "Add the table" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/portal/association/commission/tax-tables", body: { taxYear: "2027/28", effectiveFrom: "2027-03-01", effectiveTo: "2028-02-29", brackets: [{ upToCents: 25000000, rateBp: 1800 }, { upToCents: 40000000, rateBp: 2600 }, { upToCents: null, rateBp: 4500 }], primaryRebateCents: 1800000, secondaryRebateCents: 990000, tertiaryRebateCents: 330050, uifCeilingMonthlyCents: 1800000, source: "SARS Budget 2027" } }));
  });
});

describe("a marshal's date of birth, for PAYE", () => {
  it("is asked for only for employees, shown as it was saved, and sent (or cleared) when changed", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === "/api/portal/association/commission/marshals" && m === "GET" ? { body: { success: true, marshals: [{ id: "m1", name: "Mo Marshal", marshalNumber: "M-0001", class: "employee", uifApplies: true, startedOn: null, birthDate: "1960-05-01" }, { id: "m2", name: "Mia Marshal", marshalNumber: "M-0002", class: "independent", uifApplies: false, startedOn: null, birthDate: null }] } } : o(m, p, b)))(routes);
    render(<PayRunScreen />); await screen.findByText("Marshals' payslip details"); expect(screen.getByLabelText("Date of birth of Mo Marshal")).toHaveValue("1960-05-01"); expect(screen.queryByLabelText("Date of birth of Mia Marshal")).toBeNull();
    fireEvent.change(screen.getByLabelText("Date of birth of Mo Marshal"), { target: { value: "1961-02-03" } }); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: "/api/portal/association/commission/marshals/m1", body: { birthDate: "1961-02-03" } }));
    fireEvent.change(screen.getByLabelText("Date of birth of Mo Marshal"), { target: { value: "" } }); await waitFor(() => expect(writes().at(-1)!.body).toEqual({ birthDate: null }));
  });
});

