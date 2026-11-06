/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EarningsScreen, PayslipsScreen, MoneyCheckScreen, MyDetails } from "./MarshalPay";
import { rand } from "./ui";

const R = (cents: number) => rand(cents / 100).replace(/\s/g, " ");              // the app writes rand with non-breaking spaces; the page text is read with plain ones
type Reply = { status?: number; body: unknown; type?: string };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const EARN = { success: true, from: "2026-10-26", to: "2026-11-01", days: [{ date: "2026-10-26", rank: "Langa", trips: 18, feesCents: 36000, commissionCents: 14400 }, { date: "2026-10-27", rank: "Langa", trips: 17, feesCents: 34000, commissionCents: 13600 }], totals: { trips: 35, feesCents: 70000, commissionCents: 28000, onPayslipCents: 14400, accruingCents: 13600 } };
const DAY = { success: true, date: "2026-10-26", trips: [{ departureId: "d1", time: "2026-10-26T04:05:00Z", rank: "Langa", registration: "CA 111-111", driver: "Dee Driver", feeCents: 2000, feeStatus: "paid", rateBp: 4000, commissionCents: 800, payslip: "PS-20261101-M0001" }, { departureId: "d2", time: "2026-10-26T04:15:00Z", rank: "Langa", registration: "CA 222-222", driver: null, feeCents: 2000, feeStatus: "owed", rateBp: 4000, commissionCents: 800, payslip: null }] };
const SLIP = { id: "p1", number: "PS-20261101-M0001", status: "paid", association: "Langa Taxi Association", marshal: "Mo Marshal", marshalNumber: "M-0001", ranks: "Langa", periodStart: "2026-10-26", periodEnd: "2026-11-01", issuedAt: "2026-11-02T08:00:00Z", trips: 120, tripFeeTotalCents: 240000,
  grossCommissionCents: 96000, otherEarningsCents: 0, deductionsCents: 15000, netCents: 81000, withheldCents: 0, feesOwedTrips: 8, feesOwedCents: 16000, commissionPayableOn: "recorded",
  lines: [{ id: "l1", side: "earning", kind: "commission", label: "Commission: 120 trips at R20.00 fee, 40%", amountCents: 96000, reason: null, reference: null }, { id: "l2", side: "deduction", kind: "advance", label: "Advance repayment", amountCents: 10000, reason: "Advance taken 14 Oct (R200.00 still to repay after this)", reference: "ADV-0007" }, { id: "l3", side: "deduction", kind: "association_fee", label: "Association fee", amountCents: 5000, reason: "Weekly fee", reference: "FEE-W44" }],
  payment: { method: "bank", reference: "EFT-4411", paidAt: "2026-11-02T10:00:00Z", waiting: null }, daily: [{ date: "2026-10-26", rank: "Langa", trips: 18, feesCents: 36000, commissionCents: 14400, late: false }, { date: "2026-10-20", rank: "Langa", trips: 1, feesCents: 2000, commissionCents: 800, late: true }],
  ytd: { from: "2026-01-01", grossCents: 720000, deductionsCents: 105000, netCents: 615000 }, note: "Generated from system trip records. This is not a tax document: no PAYE is calculated unless a PAYE rule has been configured." };
beforeEach(() => {
  calls = []; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => {
    if (p.startsWith("/api/portal/marshal/earnings/day/")) return { body: DAY }; if (p.startsWith("/api/portal/marshal/earnings")) return { body: EARN };
    if (m === "GET" && p === "/api/portal/marshal/payslips") return { body: { success: true, payslips: [{ id: "p1", number: SLIP.number, association: SLIP.association, periodStart: SLIP.periodStart, periodEnd: SLIP.periodEnd, status: "paid", trips: 120, grossCents: 96000, deductionsCents: 15000, netCents: 81000 }] } };
    if (p === "/api/portal/marshal/payslips/p1") return { body: { success: true, payslip: SLIP } }; if (p === "/api/portal/marshal/payslips/p1.pdf") return { body: "", type: "pdf" };
    if (m === "GET" && p === "/api/portal/marshal/disputes") return { body: { success: true, disputes: [] } }; if (m === "POST" && p === "/api/portal/marshal/disputes") return { status: 201, body: { success: true, id: "q1" } };
    if (p.startsWith("/api/portal/marshal/profile")) return { body: { success: true, profile: { marshalNumber: "M-0001", language: "en", class: "independent" }, consents: [{ purpose: "payroll_records", granted: false }] } };
    if (p.startsWith("/api/portal/marshal/consents/")) return { body: { success: true } };
    if (p.startsWith("/api/portal/marshal/money-check")) return { body: { success: true, from: "2026-10-26", to: "2026-11-01", trips: 120, feesDueCents: 240000, feesReceivedCents: 224000, feesOutstandingCents: 16000, feesWaivedCents: 0, tripsOwed: 8, outstanding: [{ driver: "Sam Driver", vehicle: "CA 333-333", trips: 5, cents: 10000 }, { driver: "Lee Driver", vehicle: "CA 444-444", trips: 3, cents: 6000 }], commissionEarnedCents: 96000, commissionPayableCents: 96000, commissionWithheldCents: 0, commissionRule: "recorded" } };
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
const posts = () => calls.filter((c) => c.method === "POST");

describe("my earnings", () => {
  it("shows the period's trips, commission and what is still building up, day by day", async () => {
    render(<EarningsScreen />); expect(await screen.findByText("2026-10-26")).toBeInTheDocument(); expect(calls[0].path).toBe("/api/portal/marshal/earnings");
    expect(screen.getByText(R(28000))).toBeInTheDocument(); expect(screen.getByText(R(13600), { selector: "p" })).toBeInTheDocument(); expect(screen.getByText("35")).toBeInTheDocument();
    const row = screen.getByText("2026-10-26").closest("tr")!; for (const t of ["Langa", "18", R(36000), R(14400)]) expect(within(row).getByText(t)).toBeInTheDocument();
  });
  it("asks for the chosen period", async () => {
    render(<EarningsScreen />); await screen.findByText("2026-10-26"); fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } }); fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-15" } });
    await waitFor(() => expect(calls.at(-1)!.path).toBe("/api/portal/marshal/earnings?from=2026-10-01&to=2026-10-15"));
  });
  it("opens the trips behind a day, with the fee status, the commission and the payslip, and lets the marshal query one trip", async () => {
    render(<EarningsScreen />); fireEvent.click(await screen.findByRole("button", { name: "2026-10-26" })); expect(await screen.findByText(/CA 111-111 · Dee Driver/)).toBeInTheDocument();
    expect(screen.getByText(/On payslip PS-20261101-M0001/)).toBeInTheDocument(); expect(screen.getByText(/Not on a payslip yet/)).toBeInTheDocument(); expect(screen.getByText(/\(Paid\)/)).toBeInTheDocument(); expect(screen.getByText(/\(Owed\)/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Query this trip")[1]); fireEvent.change(screen.getByLabelText(/What is wrong/), { target: { value: "I did not load this vehicle" } }); fireEvent.click(screen.getByRole("button", { name: "Send query" }));
    await waitFor(() => expect(posts()).toEqual([{ method: "POST", path: "/api/portal/marshal/disputes", body: { targetType: "trip", targetId: "d2", message: "I did not load this vehicle" } }])); expect(await screen.findByText(/The association will answer under My queries/)).toBeInTheDocument();
  });
  it("shows the server's reason when a query is refused, and says so when there are no trips", async () => {
    routes = ((orig) => (m: string, p: string, b: any) => (m === "POST" ? { status: 409, body: { success: false, error: "You already have an open query about that" } } : orig(m, p, b)))(routes);
    render(<EarningsScreen />); fireEvent.click(await screen.findByRole("button", { name: "2026-10-26" })); await screen.findByText(/CA 111-111/); fireEvent.click(screen.getAllByText("Query this trip")[0]); fireEvent.change(screen.getByLabelText(/What is wrong/), { target: { value: "wrong count" } }); fireEvent.click(screen.getByRole("button", { name: "Send query" }));
    expect(await screen.findByText("You already have an open query about that")).toBeInTheDocument(); cleanup();
    routes = () => ({ body: { ...EARN, days: [], totals: { trips: 0, feesCents: 0, commissionCents: 0, onPayslipCents: 0, accruingCents: 0 } } }); render(<EarningsScreen />); expect(await screen.findByText("No trips in this period.")).toBeInTheDocument();
  });
});

describe("my payslips", () => {
  const open = async () => { render(<PayslipsScreen />); fireEvent.click(await screen.findByRole("button", { name: "Open" })); await screen.findByText(/Payslip PS-20261101-M0001/); };
  it("lists them, and opens one as the payslip: earnings, deductions with their reasons, net pay, payment, year to date and each day", async () => {
    await open(); expect(screen.getByText("Net pay " + R(81000))).toBeInTheDocument(); expect(screen.getByText("Total earnings " + R(96000))).toBeInTheDocument(); expect(screen.getByText("Total deductions " + R(15000))).toBeInTheDocument();
    expect(screen.getByText("Commission: 120 trips at R20.00 fee, 40%")).toBeInTheDocument(); expect(screen.getByText("(ADV-0007)")).toBeInTheDocument(); expect(screen.getByText(/R200.00 still to repay after this/)).toBeInTheDocument();
    expect(screen.getByText(/Paid 2026-11-02 by bank, reference EFT-4411/)).toBeInTheDocument(); expect(screen.getByText(/Earned/)).toHaveTextContent(`Earned ${R(720000)} · Deductions ${R(105000)} · Net ${R(615000)}`); expect(screen.getByText("2026-10-20 (late)")).toBeInTheDocument();
    expect(screen.getByText(/Drivers still owe trip fees for 8 trips/)).toHaveTextContent("Your commission is counted when the fee is recorded, so this does not change your pay."); expect(screen.getByText(/not a tax document/)).toBeInTheDocument();
  });
  it("says there are no payslips yet", async () => { routes = (m, p) => (p === "/api/portal/marshal/payslips" ? { body: { success: true, payslips: [] } } : p.endsWith("/disputes") ? { body: { success: true, disputes: [] } } : p.startsWith("/api/portal/marshal/profile") ? { body: { success: true, profile: { marshalNumber: "M-1", language: "en", class: "independent" }, consents: [] } } : undefined); render(<PayslipsScreen />); expect(await screen.findByText(/No payslips yet/)).toBeInTheDocument(); });
  it("lets the marshal query any line, sending that line's id", async () => {
    await open(); fireEvent.click(screen.getAllByText("Query this line")[1]); fireEvent.change(screen.getByLabelText(/What is wrong/), { target: { value: "I never took an advance" } }); fireEvent.click(screen.getByRole("button", { name: "Send query" }));
    await waitFor(() => expect(posts()).toEqual([{ method: "POST", path: "/api/portal/marshal/disputes", body: { targetType: "payslip_line", targetId: "l2", message: "I never took an advance" } }]));
  });
  it("downloads the PDF with the signed-in session, shows a failure, and offers WhatsApp and email with the figures in the message", async () => {
    await open(); fireEvent.click(screen.getByRole("button", { name: /Download PDF/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe("/api/portal/marshal/payslips/p1.pdf")); await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const wa = screen.getByRole("link", { name: "Share on WhatsApp" }) as HTMLAnchorElement; expect(wa.href).toMatch(/^https:\/\/wa\.me\/\?text=/); const msg = decodeURIComponent(wa.href.split("text=")[1]); expect(msg).toContain("PS-20261101-M0001"); expect(msg).toContain(R(81000)); expect(msg).toContain("2026-10-26 to 2026-11-01");
    const mail = screen.getByRole("link", { name: "Email" }) as HTMLAnchorElement; expect(mail.href).toMatch(/^mailto:\?subject=Payslip%20PS-20261101-M0001&body=/);
    routes = ((orig) => (m: string, p: string, b: any) => (p.endsWith(".pdf") ? { status: 500, body: { error: "The PDF could not be made" } } : orig(m, p, b)))(routes); fireEvent.click(screen.getByRole("button", { name: /Download PDF/ })); expect(await screen.findByText("The PDF could not be made")).toBeInTheDocument();
  });
  it("shows a payslip that is not paid yet as waiting, and the stricter commission rule when the association uses it", async () => {
    routes = ((orig) => (m: string, p: string, b: any) => (p === "/api/portal/marshal/payslips/p1" ? { body: { success: true, payslip: { ...SLIP, status: "issued", payment: { method: "wallet", reference: null, paidAt: null, waiting: "Waiting to be paid" }, commissionPayableOn: "paid", withheldCents: 6400 } } } : orig(m, p, b)))(routes);
    await open(); expect(screen.getByText("Not paid yet: Waiting to be paid.")).toBeInTheDocument(); expect(screen.getByText(/Drivers still owe/)).toHaveTextContent(`Commission on these (${R(6400)}) is held until the fee is paid.`);
  });
  it("shows my queries with their status, the answer and any credit", async () => {
    routes = ((orig) => (m: string, p: string, b: any) => (m === "GET" && p === "/api/portal/marshal/disputes" ? { body: { success: true, disputes: [{ id: "q1", targetType: "payslip_line", message: "I counted 3 trips on Tuesday", status: "upheld", response: "A trip was missed", creditCents: 800, createdAt: "2026-11-03T08:00:00Z" }, { id: "q2", targetType: "trip", message: "wrong driver", status: "open", response: null, creditCents: null, createdAt: "2026-11-03T09:00:00Z" }] } } : orig(m, p, b)))(routes);
    render(<PayslipsScreen />); expect(await screen.findByText("I counted 3 trips on Tuesday")).toBeInTheDocument(); expect(screen.getByText("Upheld")).toBeInTheDocument(); expect(screen.getByText("Waiting for an answer")).toBeInTheDocument(); expect(screen.getByText(/Answer: A trip was missed/)).toHaveTextContent(`Credit ${R(800)} on your next payslip`);
  });
});

describe("the money check", () => {
  it("shows fees due, received and owed, the commission earned and payable, who owes, and that a driver paying late does not change the pay", async () => {
    render(<MoneyCheckScreen />); const s = await screen.findByText(/2026-10-26 to 2026-11-01/); expect(s).toHaveTextContent(`120 trips. Trip fees due ${R(240000)}, received ${R(224000)}, still owed by drivers ${R(16000)}.`);
    expect(screen.getByText(/Your commission earned/)).toHaveTextContent(`Your commission earned ${R(96000)}; payable ${R(96000)}.`); expect(screen.getByText(/a driver paying late does not change your pay/)).toBeInTheDocument(); expect(screen.getByText("Sam Driver · CA 333-333: 5 trips, " + R(10000))).toBeInTheDocument();
  });
  it("explains the stricter rule and what is held back, and asks for the chosen period", async () => {
    routes = ((orig) => (m: string, p: string, b: any) => (p.startsWith("/api/portal/marshal/money-check") ? { body: { success: true, from: "a", to: "b", trips: 1, feesDueCents: 2000, feesReceivedCents: 0, feesOutstandingCents: 2000, feesWaivedCents: 0, tripsOwed: 1, outstanding: [], commissionEarnedCents: 800, commissionPayableCents: 0, commissionWithheldCents: 800, commissionRule: "paid" } } : orig(m, p, b)))(routes);
    render(<MoneyCheckScreen />); expect(await screen.findByText(/is held until drivers pay their fees/)).toBeInTheDocument(); expect(screen.getByText("Your association pays commission once the driver has paid the trip fee.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } }); await waitFor(() => expect(calls.at(-1)!.path).toBe("/api/portal/marshal/money-check?from=2026-10-01"));
  });
});

describe("my details and privacy", () => {
  it("shows the marshal number, saves the chosen language, gives and withdraws consent, and is honest that only English exists for now", async () => {
    render(<MyDetails />); expect(await screen.findByText("M-0001")).toBeInTheDocument(); expect(screen.getByText(/The screens are in English for now/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zu" } }); await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/portal/marshal/profile" && c.body.language === "zu")).toBe(true));
    fireEvent.click(screen.getByRole("checkbox")); await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/portal/marshal/consents/payroll_records" && c.body.granted === true)).toBe(true));
  });
});
