/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OwnerFinanceScreen } from "./OwnerFinance";
import { rand } from "./ui";

const R = (c: number) => (c < 0 ? "-" : "") + rand(Math.abs(c) / 100).replace(/\s/g, " "), norm = (t: string | null | undefined) => (t ?? "").replace(/\s/g, " ");
type Reply = { status?: number; body: unknown; file?: boolean } | "network";
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/owner";
const line = (reg: string | null, o: any = {}) => ({ registration: reg, vehicleId: reg, incomeCents: 0, costCents: 0, profitBeforeFinanceCents: 0, instalmentCents: 0, cashProfitCents: 0, costs: [], ...o });
const PROFIT = { success: true, period: { kind: "month", label: "November 2026", from: "2026-11-01", to: "2026-11-30", previousFrom: "2026-10-02", previousTo: "2026-10-31" },
  vehicles: [line("CA 111-111", { incomeCents: 350000, costCents: 110000, profitBeforeFinanceCents: 240000, instalmentCents: 90000, cashProfitCents: 150000 }), line("CA 222-222", { incomeCents: 100000, profitBeforeFinanceCents: 100000, cashProfitCents: 100000 })], unallocated: line(null, { costCents: 10000, profitBeforeFinanceCents: -10000, cashProfitCents: -10000 }),
  fleet: line(null, { incomeCents: 450000, costCents: 120000, profitBeforeFinanceCents: 330000, instalmentCents: 90000, cashProfitCents: 240000, marginPercent: 53.3, costs: [{ category: "fuel", label: "Fuel", cents: 60000 }, { category: "association", label: "Association costs", cents: 10000 }] }), changeCents: 180000, previous: { fleet: { cashProfitCents: 60000 } },
  months: Array.from({ length: 12 }, (_, i) => ({ month: `${i < 1 ? "2025" : "2026"}-${String(((i + 11) % 12) + 1).padStart(2, "0")}`, incomeCents: 1000 * i, costCents: 100 * i, instalmentCents: 0, cashProfitCents: 900 * i })) };
const OVERVIEW = { success: true, today: "2026-11-18", month: { incomeCents: 450000, costCents: 120000, cashProfitCents: 240000 }, finance: { activeAgreements: 1, owedCents: 30000000, monthlyInstalmentsCents: 900000 }, unpaidFines: { count: 1, cents: 20000 }, flags: [{ id: "mnt:overdue:v2", severity: "high", message: "CA 222-222: the service was due on 2026-11-01 and is overdue" }, { id: "fines:unpaid", severity: "medium", message: "1 fine is unpaid, R200.00 in all" }, { id: "mnt:none:v1", severity: "low", message: "CA 111-111: no service or repair has been recorded" }] };
const COSTS = [{ id: "c1", vehicle: "CA 111-111", vehicleId: "v1", driver: "Dan Driver", category: "fine", amountCents: 20000, incurredOn: "2026-11-09", payee: "City of Cape Town", reference: "N-9", note: null, fineStatus: "unpaid", fromMaintenance: false, voided: false },
  { id: "c2", vehicle: "CA 111-111", vehicleId: "v1", driver: null, category: "fuel", amountCents: 60000, incurredOn: "2026-11-06", payee: "Engen", reference: null, note: null, fineStatus: null, fromMaintenance: false, voided: false },
  { id: "c3", vehicle: "CA 111-111", vehicleId: "v1", driver: null, category: "maintenance", amountCents: 250000, incurredOn: "2026-10-01", payee: null, reference: null, note: null, fineStatus: null, fromMaintenance: true, voided: false },
  { id: "c4", vehicle: null, vehicleId: null, driver: null, category: "association", amountCents: 10000, incurredOn: "2026-11-02", payee: "Langa TA", reference: null, note: null, fineStatus: "disputed", fromMaintenance: false, voided: false }];
const LOAN = { id: "l1", vehicleId: "v1", registration: "CA 111-111", lender: "WesBank", reference: "AGR-77", originalCents: 45000000, balanceCents: 30000000, balanceOn: "2026-10-31", instalmentCents: 900000, dueDay: 20, startDate: "2024-01-20", finalDueOn: null, status: "active", settledOn: null, nextDueOn: "2026-11-20", lastPaidOn: "2026-10-20", paidCents: 900000, instalmentsLeft: 34, missingInstalment: true, payments: [{ id: "p1", amountCents: 900000, paidOn: "2026-10-20", voided: false }, { id: "p2", amountCents: 10000, paidOn: "2026-09-20", voided: true }] };
const MSTATUS = { success: true, vehicles: [{ vehicleId: "v1", registration: "CA 111-111", status: "due_soon", lastServiceOn: "2026-10-01", odometerKm: 114000, nextDueOn: "2026-11-30", nextDueKm: 115000 }, { vehicleId: "v2", registration: "CA 222-222", status: "overdue", lastServiceOn: "2026-05-01", odometerKm: null, nextDueOn: "2026-11-01", nextDueKm: null }, { vehicleId: "v3", registration: "CA 333-333", status: "none", lastServiceOn: null, odometerKm: null, nextDueOn: null, nextDueKm: null }] };
const MLOG = { success: true, entries: [{ id: "m1", vehicleId: "v1", vehicle: "CA 111-111", servicedOn: "2026-10-01", kind: "service", description: "Full service", odometerKm: 100000, nextDueOn: "2026-11-30", nextDueKm: 115000, costCents: 250000, voided: false }, { id: "m2", vehicleId: "v1", vehicle: "CA 111-111", servicedOn: "2026-10-20", kind: "reading", description: null, odometerKm: 114000, nextDueOn: null, nextDueKm: null, costCents: 0, voided: false }] };

beforeEach(() => {
  localStorage.clear(); calls = []; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => {
    if (p === `${P}/driver-pay/fleet`) return { body: { success: true, vehicles: [{ vehicleId: "v1", registration: "CA 111-111" }, { vehicleId: "v2", registration: "CA 222-222" }] } };
    if (p === `${P}/drivers`) return { body: { success: true, drivers: [{ driverId: "d1", name: "Dan Driver", status: "active" }, { driverId: "d9", name: "Pending Pete", status: "pending" }] } };
    if (p === `${P}/finance/overview`) return { body: OVERVIEW }; if (p.startsWith(`${P}/finance/profit`)) return { body: PROFIT }; if (p.startsWith(`${P}/finance/costs`) && m === "GET") return { body: { success: true, costs: COSTS } }; if (p === `${P}/finance/loans` && m === "GET") return { body: { success: true, finances: [LOAN], measures: { activeAgreements: 1, owedCents: 30000000, monthlyInstalmentsCents: 900000 } } };
    if (p === `${P}/finance/maintenance/status`) return { body: MSTATUS }; if (p === `${P}/finance/maintenance` && m === "GET") return { body: MLOG }; if (p.includes("/export/")) return { body: "x", file: true };
    if (m === "POST") return { status: 201, body: { success: true, id: "new", duplicate: false } }; if (m === "PUT") return { body: { success: true } }; return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (r === "network") throw new TypeError("Failed to fetch"); if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 });
    if (r.file) return new Response("x", { status: 200, headers: { "content-type": "text/csv" } }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const tab = async (name: string) => { render(<OwnerFinanceScreen />); fireEvent.click(screen.getByRole("tab", { name })); };
const override = (match: (m: string, p: string) => boolean, reply: Reply) => { const o = routes; routes = (m, p, b) => (match(m, p) ? reply : o(m, p, b)); };

describe("the overview", () => {
  it("opens on this month's figures with a plain note that it is the owner's own record, and what needs attention, most serious first", async () => {
    render(<OwnerFinanceScreen />); expect(await screen.findByText(/not audited and it is not tax advice/)).toBeInTheDocument(); for (const v of [450000, 120000, 240000, 30000000]) expect(screen.getByText(R(v))).toBeInTheDocument();
    const lis = screen.getAllByRole("listitem").map((l) => l.textContent ?? ""); expect(lis.findIndex((t) => t.includes("overdue"))).toBeLessThan(lis.findIndex((t) => t.includes("unpaid"))); expect(lis.findIndex((t) => t.includes("unpaid"))).toBeLessThan(lis.findIndex((t) => t.includes("no service")));
  });
  it("says when nothing needs attention, and offers the five tabs with the first selected", async () => {
    override((m, p) => p === `${P}/finance/overview`, { body: { ...OVERVIEW, flags: [], month: null } }); render(<OwnerFinanceScreen />); expect(await screen.findByText("Nothing needs attention.")).toBeInTheDocument(); expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Profit and loss", "Costs and fines", "Loans", "Servicing"]); expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("profit and loss", () => {
  it("shows the period, what was received, what it cost, profit before and after instalments, what share was kept, and how it compares with the period before", async () => {
    await tab("Profit and loss"); expect(await screen.findByText("November 2026")).toBeInTheDocument(); for (const l of ["Received from drivers", "Running costs", "Profit before loan instalments", "Left over after instalments"]) expect(screen.getAllByText(l).length).toBeGreaterThan(0); expect(screen.getByText(R(330000))).toBeInTheDocument(); expect(norm(screen.getByText(/You kept 53\.3% of what you received/).textContent)).toBe(`You kept 53.3% of what you received. Up ${R(180000)} on the period before (${R(60000)}).`);
  });
  it("shows each vehicle and costs not tied to a vehicle, the costs by kind and twelve months", async () => {
    await tab("Profit and loss"); await screen.findByText("November 2026"); const rows = screen.getAllByRole("row").map((r) => norm(r.textContent)); expect(rows.find((r) => r.startsWith("CA 111-111"))).toBe(`CA 111-111${R(350000)}${R(110000)}${R(90000)}${R(150000)}`); expect(rows.find((r) => r.startsWith("Not tied to a vehicle"))).toBe(`Not tied to a vehicle${R(0)}${R(10000)}${R(0)}${R(-10000)}`); expect(screen.getByText(`Fuel: ${R(60000)}`)).toBeInTheDocument(); expect(screen.getByText(`Association costs: ${R(10000)}`)).toBeInTheDocument(); expect(rows.filter((r) => /^20\d\d-\d\d/.test(r)).length).toBe(12);
  });
  it("says so when there was no income, and explains why profit is shown before and after instalments", async () => {
    override((m, p) => p.startsWith(`${P}/finance/profit`), { body: { ...PROFIT, fleet: { ...PROFIT.fleet, incomeCents: 0, marginPercent: null }, changeCents: -5000 } }); await tab("Profit and loss"); expect(norm((await screen.findByText(/No income was recorded in this period/)).textContent)).toBe(`No income was recorded in this period. Down ${R(5000)} on the period before (${R(60000)}).`); expect(screen.getByText(/includes repayment of capital\. For tax, an accountant treats only the interest as an expense/)).toBeInTheDocument();
  });
  it("asks for another period, and for two dates before it asks for a custom one", async () => {
    await tab("Profit and loss"); await screen.findByText("November 2026"); pick("Profit period", "quarter"); await waitFor(() => expect(calls.some((c) => c.path.includes("period=quarter"))).toBe(true)); pick("Profit period", "custom"); expect(await screen.findByText("Choose the first and last day.")).toBeInTheDocument(); expect(calls.some((c) => c.path.includes("period=custom"))).toBe(false);
    pick("Profit from", "2026-01-01"); pick("Profit to", "2026-06-30"); await waitFor(() => expect(calls.some((c) => c.path.includes("period=custom") && c.path.includes("from=2026-01-01") && c.path.includes("to=2026-06-30"))).toBe(true));
  });
  it("downloads the PDF, the spreadsheet, the costs and the loans for the period shown", async () => {
    await tab("Profit and loss"); await screen.findByText("November 2026"); pick("Profit period", "tax_year"); await waitFor(() => expect(calls.some((c) => c.path.includes("period=tax_year"))).toBe(true)); for (const [name, frag] of [["Download as PDF", "/finance/export/profit.pdf?period=tax_year"], ["Download as a spreadsheet", "/finance/export/profit.csv?period=tax_year"], ["Download the costs", "/finance/export/costs.csv?period=tax_year"], ["Download the loans", "/finance/export/loans.csv"]] as const) { fireEvent.click(screen.getByRole("button", { name })); await waitFor(() => expect(calls.at(-1)!.path).toContain(frag)); }
  });
});

describe("costs and fines", () => {
  it("lists each cost with what it was for, where, when, to whom, the driver for a fine, and a fine's status in words", async () => {
    await tab("Costs and fines"); const fine = (await screen.findByText(R(20000), { selector: "b" })).closest("li")!; expect(fine).toHaveTextContent(`${R(20000)} · Fine · CA 111-111 · 2026-11-09 · City of Cape Town · N-9 · driver Dan Driver · Not paid yet`); expect(screen.getByText(R(250000), { selector: "b" }).closest("li")).toHaveTextContent("From the maintenance log"); expect(screen.getByText(R(10000), { selector: "b" }).closest("li")).toHaveTextContent("Whole business"); expect(screen.getByText(R(10000), { selector: "b" }).closest("li")).toHaveTextContent("Disputed (not counted yet)");
  });
  it("sends a cost in cents with its kind, vehicle and date and a client reference, and clears the amount", async () => {
    await tab("Costs and fines"); await screen.findByText(R(20000), { selector: "b" }); pick("Cost vehicle", "v1"); pick("Cost kind", "insurance"); pick("Cost amount", "300.50"); pick("Cost payee", "Santam"); fireEvent.click(screen.getByRole("button", { name: "Save the cost" })); await waitFor(() => expect(writes().at(-1)!.path).toBe(`${P}/finance/costs`)); const b = writes().at(-1)!.body;
    expect(b).toMatchObject({ category: "insurance", amountCents: 30050, vehicleId: "v1", payee: "Santam" }); expect(b.incurredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(b.clientRef).toMatch(/^cost-/); expect(b.driverId).toBeUndefined(); expect(await screen.findByText("Saved.")).toBeInTheDocument(); expect(screen.getByLabelText("Cost amount")).toHaveValue("");
  });
  it("sends no vehicle for the whole business, and offers the driver only for a fine", async () => {
    await tab("Costs and fines"); await screen.findByText(R(20000), { selector: "b" }); expect(screen.queryByLabelText("Fine driver")).toBeNull(); pick("Cost kind", "fine"); expect(within(screen.getByLabelText("Fine driver")).queryByText("Pending Pete")).toBeNull(); pick("Fine driver", "d1"); pick("Cost amount", "200"); fireEvent.click(screen.getByRole("button", { name: "Save the cost" })); await waitFor(() => expect(writes()).toHaveLength(1)); expect(writes()[0].body).toMatchObject({ category: "fine", driverId: "d1" }); expect(writes()[0].body.vehicleId).toBeUndefined();
  });
  it("asks for a proper amount before sending, and shows the server's reason when a cost is refused", async () => {
    await tab("Costs and fines"); await screen.findByText(R(20000), { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: "Save the cost" })); expect(await screen.findByText(/Type the amount in rand/)).toBeInTheDocument(); expect(writes()).toEqual([]); override((m, p) => m === "POST" && p.endsWith("/finance/costs"), { status: 400, body: { success: false, error: "Give the date it was paid (not in the future, and within the last three years)" } }); pick("Cost amount", "100"); fireEvent.click(screen.getByRole("button", { name: "Save the cost" })); expect(await screen.findByText(/not in the future, and within the last three years/)).toBeInTheDocument();
  });
  it("with no signal, keeps the cost on the phone, says so, and sends it once with the same reference when the signal returns", async () => {
    let online = false; const orig = routes; routes = (m, p, b) => (m === "POST" && p.endsWith("/finance/costs") && !online ? "network" : orig(m, p, b)); await tab("Costs and fines"); await screen.findByText(R(20000), { selector: "b" }); pick("Cost amount", "250"); fireEvent.click(screen.getByRole("button", { name: "Save the cost" })); expect(await screen.findByText("Saved on this phone. It will be sent when you are online.")).toBeInTheDocument();
    const q = JSON.parse(localStorage.getItem("vink.marshal.outbox.v1") ?? "[]"); expect(q).toHaveLength(1); const ref = q[0].body.clientRef; online = true; fireEvent.click(await screen.findByRole("button", { name: "Send now" })); await waitFor(() => expect(JSON.parse(localStorage.getItem("vink.marshal.outbox.v1") ?? "[]")).toEqual([])); expect(writes().filter((c) => c.path.endsWith("/finance/costs")).at(-1)!.body.clientRef).toBe(ref);
  });
  it("marks a fine paid or disputed, and offers the other states only", async () => {
    await tab("Costs and fines"); const fine = (await screen.findByText(R(20000), { selector: "b" })).closest("li")!; expect(within(fine).queryByRole("button", { name: /Mark not paid/ })).toBeNull(); fireEvent.click(within(fine).getByRole("button", { name: "Mark paid (N-9)" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/finance/costs/c1/fine-status`, body: { status: "paid" } })); expect(within(fine).getByRole("button", { name: "Mark disputed (N-9)" })).toBeInTheDocument();
  });
  it("cancels a cost entered by mistake with a reason, but not one that came from the maintenance log", async () => {
    await tab("Costs and fines"); const fuel = (await screen.findByText(R(60000), { selector: "b" })).closest("li")!; fireEvent.click(within(fuel).getByRole("button", { name: "Entered by mistake?" })); pick("Reason for cancelling the cost", "Entered twice"); fireEvent.click(screen.getByRole("button", { name: "Cancel this cost" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/costs/c2/void`, body: { reason: "Entered twice" } })); expect(within(screen.getByText(R(250000), { selector: "b" }).closest("li")!).queryByRole("button", { name: "Entered by mistake?" })).toBeNull();
  });
  it("shows only one vehicle's costs when asked", async () => { await tab("Costs and fines"); await screen.findByText(R(20000), { selector: "b" }); pick("Costs filter", "v1"); await waitFor(() => expect(calls.some((c) => c.path === `${P}/finance/costs?vehicleId=v1`)).toBe(true)); });
});

describe("loans", () => {
  it("shows what is owed as the lender said and when, the instalment and due day, the rough count left (and why it is rough), the total and an unrecorded instalment", async () => {
    await tab("Loans"); const l = (await screen.findByText("CA 111-111", { selector: "b" })).closest("div")!; expect(norm(l.textContent)).toContain(`WesBank · AGR-77 · owes ${R(30000000)} (as the lender said on 2026-10-31) · ${R(900000)} on day 20 of the month · next 2026-11-20 · about 34 instalments left (a rough guess: it ignores interest)`); expect(norm(screen.getByText(/Owed in all:/).textContent)).toContain(R(30000000)); expect(screen.getByText("The last instalment has not been written down.")).toBeInTheDocument(); expect(screen.getByText(/because an instalment includes interest/)).toBeInTheDocument(); expect(norm(screen.getByText(/2026-09-20/).textContent)).toBe(`2026-09-20 · ${R(10000)} (cancelled)`);
  });
  it("writes down an instalment in cents with its date and a reference, starting from the usual amount", async () => {
    await tab("Loans"); await screen.findByText("CA 111-111", { selector: "b" }); expect(screen.getByLabelText("Instalment amount CA 111-111")).toHaveValue("9000"); pick("Instalment date CA 111-111", "2026-10-20"); fireEvent.click(screen.getByRole("button", { name: "Write down the instalment for CA 111-111" })); await waitFor(() => expect(writes().at(-1)!.path).toBe(`${P}/finance/loans/l1/instalments`)); expect(writes().at(-1)!.body).toMatchObject({ amountCents: 900000, paidOn: "2026-10-20" }); expect(writes().at(-1)!.body.clientRef).toMatch(/^inst-/);
  });
  it("updates what the lender says is owed, accepting 0, and settles a loan", async () => {
    await tab("Loans"); await screen.findByText("CA 111-111", { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: "Update what is owed for CA 111-111" })); expect(await screen.findByText(/Type the amount in rand \(0 if nothing is owed\)/)).toBeInTheDocument(); pick("New balance CA 111-111", "285000"); pick("Balance date CA 111-111", "2026-11-15"); fireEvent.click(screen.getByRole("button", { name: "Update what is owed for CA 111-111" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/finance/loans/l1/balance`, body: { balanceCents: 28500000, balanceOn: "2026-11-15" } }));
    pick("New balance CA 111-111", "0"); fireEvent.click(screen.getByRole("button", { name: "Update what is owed for CA 111-111" })); await waitFor(() => expect(writes().at(-1)!.body.balanceCents).toBe(0)); fireEvent.click(screen.getByRole("button", { name: "It is paid off: CA 111-111" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/finance/loans/l1/settle` }));
  });
  it("adds a loan with the amounts in cents, refusing a missing vehicle, bad amounts or a bad due day before sending", async () => {
    await tab("Loans"); await screen.findByText("CA 111-111", { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: "Add the loan" })); expect(await screen.findByText("Choose the vehicle.")).toBeInTheDocument(); pick("Loan vehicle", "v2"); fireEvent.click(screen.getByRole("button", { name: "Add the loan" })); expect(await screen.findByText(/Type the amounts in rand/)).toBeInTheDocument(); pick("Loan original", "450000"); pick("Loan balance", "0"); pick("Loan instalment", "9000"); fireEvent.click(screen.getByRole("button", { name: "Add the loan" })); expect(await screen.findByText(/day of the month it is due/)).toBeInTheDocument(); expect(writes()).toEqual([]);
    pick("Loan due day", "20"); pick("Loan lender", "Absa"); pick("Loan start", "2026-01-20"); pick("Loan reference", "X-1"); fireEvent.click(screen.getByRole("button", { name: "Add the loan" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/finance/loans`, body: { vehicleId: "v2", lender: "Absa", originalCents: 45000000, balanceCents: 0, instalmentCents: 900000, dueDay: 20, startDate: "2026-01-20", reference: "X-1" } }));
  });
  it("says when no loan is recorded", async () => { override((m, p) => p === `${P}/finance/loans` && m === "GET", { body: { success: true, finances: [], measures: { activeAgreements: 0, owedCents: 0, monthlyInstalmentsCents: 0 } } }); await tab("Loans"); expect(await screen.findByText("No loan is recorded.")).toBeInTheDocument(); });
});

describe("servicing", () => {
  it("shows where each vehicle is in words, with the last service, the odometer and when the next is due", async () => {
    await tab("Servicing"); const row = async (reg: string) => { await screen.findByText("Service due soon"); return screen.getAllByText(reg, { selector: "b" }).map((b) => b.closest("li")!).find((li) => /Service|Nothing recorded/.test(li.textContent ?? ""))!; }; expect(await row("CA 111-111")).toHaveTextContent("Service due soon"); expect(norm((await row("CA 111-111")).textContent)).toContain("last done 2026-10-01 · 114 000 km · next by 2026-11-30 · or at 115 000 km"); expect(await row("CA 222-222")).toHaveTextContent("Service overdue"); expect(await row("CA 333-333")).toHaveTextContent("Nothing recorded");
  });
  it("lists what has been done with its cost and odometer", async () => { await tab("Servicing"); await screen.findByText("Full service", { exact: false }); const items = screen.getAllByRole("listitem").map((l) => norm(l.textContent)); expect(items.some((t) => t.startsWith(`2026-10-01 · CA 111-111 · Service · Full service · 100 000 km · ${R(250000)}`))).toBe(true); expect(items.some((t) => t.startsWith("2026-10-20 · CA 111-111 · Odometer reading only · 114 000 km"))).toBe(true); });
  it("saves a service in cents and kilometres with only what was filled in, and hides the cost and next-service boxes for a reading", async () => {
    await tab("Servicing"); await screen.findByText("Full service", { exact: false }); pick("Service vehicle", "v1"); pick("Service odometer", "120 000"); pick("Service cost", "2500"); pick("Service next date", "2027-04-01"); pick("Service next km", "135000"); pick("Service notes", "Oil and filters"); fireEvent.click(screen.getByRole("button", { name: "Save it" })); await waitFor(() => expect(writes().at(-1)!.path).toBe(`${P}/finance/maintenance`));
    expect(writes().at(-1)!.body).toMatchObject({ vehicleId: "v1", kind: "service", odometerKm: 120000, costCents: 250000, nextDueOn: "2027-04-01", nextDueKm: 135000, description: "Oil and filters" }); pick("Service kind", "reading"); expect(screen.queryByLabelText("Service cost")).toBeNull(); pick("Service odometer", "121000"); fireEvent.click(screen.getByRole("button", { name: "Save it" })); await waitFor(() => expect(writes()).toHaveLength(2)); expect(writes()[1].body).toEqual({ vehicleId: "v1", kind: "reading", servicedOn: writes()[1].body.servicedOn, odometerKm: 121000 });
  });
  it("refuses a missing vehicle and numbers that are not whole before sending, and shows the server's reason", async () => {
    await tab("Servicing"); await screen.findByText("Full service", { exact: false }); fireEvent.click(screen.getByRole("button", { name: "Save it" })); expect(await screen.findByText("Choose the vehicle.")).toBeInTheDocument(); pick("Service vehicle", "v1"); pick("Service odometer", "1 2 abc"); fireEvent.click(screen.getByRole("button", { name: "Save it" })); expect(await screen.findByText(/whole number of kilometres/)).toBeInTheDocument(); expect(writes()).toEqual([]);
    override((m, p) => m === "POST" && p.endsWith("/finance/maintenance"), { status: 400, body: { success: false, error: "The next service is at a higher number of kilometres than now" } }); pick("Service odometer", "100"); pick("Service next km", "50"); fireEvent.click(screen.getByRole("button", { name: "Save it" })); expect(await screen.findByText(/higher number of kilometres than now/)).toBeInTheDocument();
  });
  it("cancels an entry entered by mistake, with a reason", async () => {
    await tab("Servicing"); fireEvent.click(await screen.findByRole("button", { name: "Entered by mistake? (2026-10-01 CA 111-111)" })); pick("Reason for cancelling the entry", "Wrong vehicle"); fireEvent.click(screen.getByRole("button", { name: "Cancel this entry" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/maintenance/m1/void`, body: { reason: "Wrong vehicle" } }));
  });
});
