/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FinanceOverview, FeesAndReceiptsScreen, ExpensesScreen, IncomeStatementScreen } from "./AssociationFinance";
import { rand } from "./ui";

const R = (cents: number) => rand(cents / 100).replace(/\s/g, " ");
type Reply = { status?: number; body: unknown; file?: boolean };
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/association";
const FLAGS = [{ id: "fin:cash", severity: "high", message: "R300.00 of cash has not been banked, the oldest from 2026-09-01 (62 days)" }, { id: "fin:noreceipt", severity: "medium", message: "1 member has levies marked paid with no receipt (R100.00): issue receipts so every payment can be shown" }];
const SUMMARY = { success: true, today: "2026-11-02", settings: { approvalThresholdCents: 500000 }, cash: { cashReceivedCents: 30000, bankedCents: 0, onHandCents: 30000, unbankedCents: 30000, oldestUnbankedOn: "2026-09-01", oldestUnbankedDays: 62 }, measures: { collectedThisMonthCents: 120000, expensesThisMonthCents: 30000, netThisMonthCents: 90000, owedByMembersCents: 60000, overdueCents: 40000, membersOverdue: 2, pendingExpenses: 1 }, flags: FLAGS };
const FEES = [{ id: "f1", kind: "membership", name: "Annual membership", amountCents: 60000, effectiveFrom: "2026-01-01", active: true, approvedBy: "Resolution 4", overCap: true }, { id: "f2", kind: "levy", name: "Rank repairs", amountCents: 90000, effectiveFrom: "2026-01-01", active: false, approvedBy: null, overCap: false }];
const RECEIPTS = [{ id: "r2", number: 2, member: "Olu Owner", memberId: "m1", category: "levy", amountCents: 35000, method: "eft", receivedOn: "2026-11-02", note: null, voided: true, voidReason: "Wrong member" }, { id: "r1", number: 1, member: "Visiting operator", memberId: null, category: "other", amountCents: 10000, method: "cash", receivedOn: "2026-11-01", note: null, voided: false, voidReason: null }];
const MEMBERS = [{ memberId: "m1", name: "Olu Owner", chargedCents: 130000, paidCents: 80000, paidWithoutReceiptCents: 20000, unallocatedCents: 5000, owedCents: 50000, balanceCents: 45000, overdueCents: 50000, daysOverdue: 120 }, { memberId: "m2", name: "Ona Owner", chargedCents: 0, paidCents: 0, paidWithoutReceiptCents: 0, unallocatedCents: 0, owedCents: 0, balanceCents: 0, overdueCents: 0, daysOverdue: 0 }];
const STATEMENT = { success: true, member: "Olu Owner", lines: [{ date: "2026-07-05", kind: "charge", ref: "", description: "Annual membership", amountCents: 60000, balanceCents: 60000 }, { date: "2026-10-01", kind: "receipt", ref: "R-000001", description: "levy", amountCents: 10000, balanceCents: 50000 }], openLevies: [{ id: "lv1", title: "Annual membership", remainingCents: 50000, dueOn: "2026-08-04" }], owedCents: 50000, note: "Some levies are marked paid without a receipt. Their payment is not shown above." };
const EXPENSES = [{ id: "e1", incurredOn: "2026-10-12", category: "Rank maintenance", payee: "Lights & Co", amountCents: 800000, description: "New lights", requestedBy: "Thabo Mokoena", status: "pending", requiredApprovals: 2, rejectedReason: null, approvals: [{ officeBearerId: "b2", name: "Sipho Dube" }] }, { id: "e2", incurredOn: "2026-10-15", category: "Fuel", payee: "Garage", amountCents: 10000, description: null, requestedBy: "Sipho Dube", status: "rejected", requiredApprovals: 1, rejectedReason: "No quote", approvals: [] }];
const STMT_MONTH = { success: true, period: "2026-10", income: [{ category: "levy", amountCents: 40000 }, { category: "membership", amountCents: 60000 }], expenses: [{ category: "Rank maintenance", amountCents: 30000 }], incomeCents: 100000, expensesCents: 30000, netCents: 70000 };
const STMT_YEAR = { ...STMT_MONTH, period: "2026", months: [{ month: "2026-09", incomeCents: 60000, expensesCents: 0, netCents: 60000 }, { month: "2026-10", incomeCents: 100000, expensesCents: 30000, netCents: 70000 }], budget: [{ category: "levy", budgetCents: null, actualCents: 40000, varianceCents: null }, { category: "membership", budgetCents: 200000, actualCents: 120000, varianceCents: -80000 }] };
beforeEach(() => {
  calls = []; URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  routes = (m, p) => {
    if (p === `${P}/finance/summary`) return { body: SUMMARY }; if (p === `${P}/finance/fees` && m === "GET") return { body: { success: true, fees: FEES } }; if (p === `${P}/finance/receipts` && m === "GET") return { body: { success: true, receipts: RECEIPTS } }; if (p === `${P}/finance/members` && m === "GET") return { body: { success: true, members: MEMBERS } };
    if (p.startsWith(`${P}/finance/members/`) && p.endsWith("/statement")) return { body: STATEMENT }; if (p === `${P}/finance/expenses` && m === "GET") return { body: { success: true, expenses: EXPENSES } };
    if (p === `${P}/compliance/office-bearers`) return { body: { success: true, officeBearers: [{ id: "b1", name: "Thabo Mokoena", office: "Chairperson" }, { id: "b2", name: "Sipho Dube", office: "Treasurer" }, { id: "b3", name: "Lerato Nel", office: "Secretary" }] } };
    if (p === `${P}/finance/cash`) return { body: { success: true, cashReceivedCents: 30000, bankedCents: 0, onHandCents: 30000, unbankedCents: 30000, oldestUnbankedOn: "2026-09-01", oldestUnbankedDays: 62, overBankedCents: 0 } }; if (p === `${P}/finance/deposits` && m === "GET") return { body: { success: true, deposits: [{ id: "d1", depositedOn: "2026-10-30", amountCents: 20000, reference: "DEP-1" }] } };
    if (p.startsWith(`${P}/finance/statement.csv`) || p.includes(".pdf")) return { body: "x", file: true }; if (p.startsWith(`${P}/finance/statement?month`)) return { body: STMT_MONTH }; if (p.startsWith(`${P}/finance/statement?year`)) return { body: STMT_YEAR };
    if (m === "POST" || m === "PUT" || m === "DELETE") return { status: m === "POST" ? 201 : 200, body: { success: true, id: "new" } };
    return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 }); if (r.file) return new Response("x", { status: 200, headers: { "content-type": "application/pdf" } }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the finance overview", () => {
  it("shows the month's figures, what is owed and overdue, waiting expenses, and what needs attention", async () => {
    render(<FinanceOverview />); expect(await screen.findByText(R(120000))).toBeInTheDocument(); expect(screen.getAllByText(R(30000)).length).toBeGreaterThan(0); expect(screen.getByText(R(60000))).toBeInTheDocument();
    expect(screen.getByText(/Net this month/)).toHaveTextContent(`Net this month ${R(90000)}. 2 members are overdue (${R(40000)}). 1 expense is waiting for approval.`); expect(screen.getByText("Needs attention (2)")).toBeInTheDocument(); expect(screen.getByText("Act now")).toBeInTheDocument(); expect(screen.getByText(/R300.00 of cash has not been banked/)).toBeInTheDocument();
  });
  it("says nothing needs attention and nobody is overdue when that is true", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/finance/summary` ? { body: { ...SUMMARY, flags: [], measures: { ...SUMMARY.measures, membersOverdue: 0, overdueCents: 0, pendingExpenses: 0 } } } : o(m, p, b)))(routes); render(<FinanceOverview />); expect(await screen.findByText("Nothing needs attention.")).toBeInTheDocument(); expect(screen.getByText(/Nobody is overdue/)).toBeInTheDocument();
  });
  it("saves the approval threshold in cents (a comma works), and shows the server's reason when it is refused", async () => {
    render(<FinanceOverview />); await screen.findByText(R(120000)); expect(screen.getByLabelText("Approval threshold")).toHaveValue("5000"); pick("Approval threshold", "2 500,50".replace(" ", "")); fireEvent.click(screen.getByRole("button", { name: "Save" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/finance/settings`, body: { approvalThresholdCents: 250050 } }));
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 400, body: { success: false, error: "The approval threshold is an amount of cents" } } : o(m, p, b)))(routes); fireEvent.click(screen.getByRole("button", { name: "Save" })); expect(await screen.findByText("The approval threshold is an amount of cents")).toBeInTheDocument();
  });
  it("offers a way into the finance screens", async () => {
    const open = vi.fn(); render(<FinanceOverview onOpen={open} />); await screen.findByText(R(120000)); for (const t of ["Fees and receipts", "Expenses and banking", "Income statement"]) fireEvent.click(screen.getByText(t)); expect(open.mock.calls.map((c) => c[0])).toEqual(["Fees & receipts", "Expenses & banking", "Income statement"]);
  });
});

describe("fees and charges", () => {
  it("lists the approved fees, warns about one above the limit, and shows one that is switched off", async () => {
    render(<FeesAndReceiptsScreen />); const li = (await screen.findByText("Annual membership")).closest("li")!; expect(li).toHaveTextContent(`Membership fee) · ${R(60000)} · from 2026-01-01 · Resolution 4`); expect(within(li).getByText("Above the limit")).toBeInTheDocument(); expect(screen.getByText("Rank repairs").closest("li")).toHaveTextContent("switched off");
  });
  it("adds a fee in cents and says when it is above the limit, charges every member with an optional due date, and switches a fee on or off", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p === `${P}/finance/fees` ? { status: 201, body: { success: true, id: "n", overCap: true } } : m === "POST" && p === `${P}/finance/charges` ? { status: 201, body: { success: true, created: 2, skipped: 1 } } : o(m, p, b)))(routes);
    render(<FeesAndReceiptsScreen />); await screen.findByText("Annual membership"); pick("Fee name", "Joining fee"); pick("Fee kind", "joining"); pick("Fee amount", "12 000,50".replace(" ", "")); pick("Fee from", "2026-11-01"); pick("Fee approved by", "Resolution 9"); fireEvent.click(screen.getByRole("button", { name: "Add fee" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/fees`, body: { kind: "joining", name: "Joining fee", amountCents: 1200050, effectiveFrom: "2026-11-01", approvedBy: "Resolution 9" } })); expect(await screen.findByText(/above the limit for your province, so it cannot be charged/)).toBeInTheDocument();
    pick("Charge due date", "2026-12-15"); fireEvent.click(screen.getAllByRole("button", { name: "Charge all members" })[0]); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/charges`, body: { feeId: "f1", all: true, dueOn: "2026-12-15" } })); expect(await screen.findByText("2 charged, 1 already had it.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch on" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/fees/f2/active`, body: { active: true } }));
  });
  it("shows the server's reason when charging is refused (a fee above the cap)", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p.endsWith("/charges") ? { status: 400, body: { success: false, error: "That fee (R600.00) is above the limit of R500.00 for your province" } } : o(m, p, b)))(routes); render(<FeesAndReceiptsScreen />); await screen.findByText("Annual membership"); fireEvent.click(screen.getAllByRole("button", { name: "Charge all members" })[0]); expect(await screen.findByText(/above the limit of R500.00 for your province/)).toBeInTheDocument();
  });
});

describe("receipts and member accounts", () => {
  it("lists receipts by number, shows a voided one struck through with its reason, and offers a PDF of each", async () => {
    render(<FeesAndReceiptsScreen />); const r2 = (await screen.findByText("R-000002")).closest("li")!; expect(r2).toHaveTextContent("Olu Owner"); expect(within(r2).getByText("Void")).toBeInTheDocument(); expect(r2).toHaveTextContent("Wrong member"); expect(within(r2).queryByRole("button", { name: "Void" })).toBeNull(); expect(screen.getByText("R-000001").closest("li")).toHaveTextContent("Visiting operator");
    fireEvent.click(within(r2).getByRole("button", { name: /PDF/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/finance/receipts/r2.pdf`)); await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });
  it("issues a receipt for a non-member by name, in cents, and says which number it got", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p === `${P}/finance/receipts` ? { status: 201, body: { success: true, id: "n", number: 7 } } : o(m, p, b)))(routes); render(<FeesAndReceiptsScreen />); await screen.findByText("R-000001");
    pick("Payer name", "Visiting operator"); pick("Receipt for", "other"); pick("Receipt amount", "150"); pick("Receipt method", "cash"); pick("Receipt date", "2026-11-02"); fireEvent.click(screen.getByRole("button", { name: "Issue receipt" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/receipts`, body: { memberId: null, payerName: "Visiting operator", category: "other", amountCents: 15000, method: "cash", receivedOn: "2026-11-02" } })); expect(await screen.findByText("Receipt R-000007 issued.")).toBeInTheDocument();
  });
  it("offers a member's open charges to pay against, and sends the charge (and no category) when one is chosen", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p === `${P}/finance/receipts` ? { status: 201, body: { success: true, id: "n", number: 8 } } : o(m, p, b)))(routes); render(<FeesAndReceiptsScreen />); await screen.findByText("R-000001"); pick("Receipt member", "m1");
    const sel = await screen.findByLabelText("Receipt levy"); await waitFor(() => expect(within(sel).getAllByRole("option")).toHaveLength(2)); expect(within(sel).getByText(`Annual membership: ${R(50000)} owed, due 2026-08-04`)).toBeInTheDocument(); pick("Receipt levy", "lv1"); expect(screen.queryByLabelText("Receipt for")).toBeNull(); pick("Receipt amount", "500"); pick("Receipt method", "eft");
    fireEvent.click(screen.getByRole("button", { name: "Issue receipt" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ memberId: "m1", levyId: "lv1", amountCents: 50000, method: "eft" })); expect(writes().at(-1)!.body.category).toBeUndefined();
  });
  it("shows the server's reason when a receipt is refused", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p === `${P}/finance/receipts` ? { status: 409, body: { success: false, error: "That is more than is owed on that levy (R350.00)" } } : o(m, p, b)))(routes); render(<FeesAndReceiptsScreen />); await screen.findByText("R-000001"); pick("Payer name", "X"); pick("Receipt amount", "999"); fireEvent.click(screen.getByRole("button", { name: "Issue receipt" })); expect(await screen.findByText(/more than is owed on that levy/)).toBeInTheDocument();
  });
  it("voids a receipt only with a reason, and sends the reason", async () => {
    render(<FeesAndReceiptsScreen />); const li = (await screen.findByText("R-000001")).closest("li")!; fireEvent.click(within(li).getByRole("button", { name: "Void" })); pick("Why void", "Banked twice"); fireEvent.click(screen.getByRole("button", { name: "Void this receipt" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/receipts/r1/void`, body: { reason: "Banked twice" } }));
  });
  it("shows each member's account in plain words and a statement with a running balance and the note about payments with no receipt", async () => {
    render(<FeesAndReceiptsScreen />); const li = (await screen.findByText("Olu Owner", { selector: "b" })).closest("li")!; expect(li).toHaveTextContent(`charged ${R(130000)} · paid ${R(80000)} · owes ${R(50000)}`); expect(li).toHaveTextContent(`${R(50000)} overdue 120 days`); expect(li).toHaveTextContent(`${R(5000)} paid on account`); expect(li).toHaveTextContent(`${R(20000)} paid with no receipt`);
    expect(screen.getByText("Ona Owner", { selector: "b" }).closest("li")).toHaveTextContent(`owes ${R(0)}`); fireEvent.click(within(li).getByRole("button", { name: "Statement" })); const row = (await screen.findByText(/R-000001 · levy/)).closest("tr")!; expect(row).toHaveTextContent(`-${R(10000)}`); expect(row).toHaveTextContent(R(50000)); expect(screen.getByText(/marked paid without a receipt/)).toBeInTheDocument();
  });
});

describe("expenses and banking", () => {
  it("records an expense in cents and says how many approvals it needs and from whom", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p === `${P}/finance/expenses` ? { status: 201, body: { success: true, id: "n", requiredApprovals: 2 } } : o(m, p, b)))(routes); render(<ExpensesScreen />); await screen.findByText("Lights & Co", { exact: false });
    pick("Expense category", "Fuel"); pick("Expense payee", "Garage"); pick("Expense amount", "8000"); pick("Expense requested by", "Thabo Mokoena"); pick("Expense description", "Diesel"); pick("Expense date", "2026-11-01"); fireEvent.click(screen.getByRole("button", { name: "Record expense" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/expenses`, body: { incurredOn: "2026-11-01", category: "Fuel", payee: "Garage", amountCents: 800000, requestedBy: "Thabo Mokoena", description: "Diesel" } })); expect(await screen.findByText(/It needs 2 approvals from different office bearers/)).toBeInTheDocument();
  });
  it("shows each expense's approvals so far and who has approved, and offers only office bearers who have not", async () => {
    render(<ExpensesScreen />); const li = (await screen.findByText("Lights & Co", { exact: false })).closest("li")!; expect(li).toHaveTextContent("1 of 2 approvals"); expect(li).toHaveTextContent("Approved by Sipho Dube"); const sel = within(li).getByLabelText("Approver for Lights & Co"); expect(within(sel).queryByText(/Sipho Dube/)).toBeNull(); expect(within(sel).getByText("Lerato Nel (Secretary)")).toBeInTheDocument();
    expect(screen.getByText(/Garage/).closest("li")).toHaveTextContent("Rejected: No quote"); expect(screen.getByText(/Garage/).closest("li")).not.toHaveTextContent("Approve");
  });
  it("approves with the chosen office bearer, and shows the server's reason when someone may not approve (their own request)", async () => {
    render(<ExpensesScreen />); await screen.findByText("Lights & Co", { exact: false }); pick("Approver for Lights & Co", "b3"); fireEvent.click(screen.getByRole("button", { name: "Approve" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/expenses/e1/approve`, body: { officeBearerId: "b3" } }));
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p.endsWith("/approve") ? { status: 400, body: { success: false, error: "Nobody can approve what they asked for themselves" } } : o(m, p, b)))(routes); pick("Approver for Lights & Co", "b1"); fireEvent.click(screen.getByRole("button", { name: "Approve" })); expect(await screen.findByText("Nobody can approve what they asked for themselves")).toBeInTheDocument();
  });
  it("rejects with a reason", async () => {
    render(<ExpensesScreen />); await screen.findByText("Lights & Co", { exact: false }); fireEvent.click(screen.getByRole("button", { name: "Reject" })); pick("Why reject", "Too expensive"); fireEvent.click(screen.getByRole("button", { name: "Reject it" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/expenses/e1/reject`, body: { reason: "Too expensive" } }));
  });
  it("tells the association to record office bearers first when there are none", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/compliance/office-bearers` ? { body: { success: true, officeBearers: [] } } : o(m, p, b)))(routes); render(<ExpensesScreen />); expect(await screen.findByText(/Record your office bearers under Registration first/)).toBeInTheDocument();
  });
  it("shows cash received against banked and what is not yet banked with its age, and records a deposit in cents", async () => {
    render(<ExpensesScreen />); expect(await screen.findByText(/Cash received/)).toHaveTextContent(`Cash received ${R(30000)}, banked ${R(0)}. Not yet banked: ${R(30000)}, the oldest from 2026-09-01 (62 days).`); expect(screen.getByText(/DEP-1/)).toBeInTheDocument();
    pick("Deposit date", "2026-11-02"); pick("Deposit amount", "300"); pick("Deposit reference", "DEP-2"); fireEvent.click(screen.getByRole("button", { name: "Record deposit" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/finance/deposits`, body: { depositedOn: "2026-11-02", amountCents: 30000, reference: "DEP-2" } }));
  });
  it("says all cash has been banked when it has, and warns when more was banked than recorded", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/finance/cash` ? { body: { success: true, cashReceivedCents: 30000, bankedCents: 30000, onHandCents: 0, unbankedCents: 0, oldestUnbankedOn: null, oldestUnbankedDays: null, overBankedCents: 0 } } : o(m, p, b)))(routes); render(<ExpensesScreen />); expect(await screen.findByText(/All cash received has been banked/)).toBeInTheDocument(); cleanup();
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/finance/cash` ? { body: { success: true, cashReceivedCents: 10000, bankedCents: 15000, onHandCents: -5000, unbankedCents: 0, oldestUnbankedOn: null, oldestUnbankedDays: null, overBankedCents: 5000 } } : o(m, p, b)))(routes); render(<ExpensesScreen />); expect(await screen.findByText(/More has been banked than cash receipts recorded/)).toBeInTheDocument();
  });
});

describe("the income statement and budget", () => {
  it("states the month's income and expenses with totals and the net, and says what counts", async () => {
    render(<IncomeStatementScreen />); expect(await screen.findByText("Total income")).toBeInTheDocument(); expect(calls.some((c) => /statement\?month=\d{4}-\d{2}$/.test(c.path))).toBe(true); expect(screen.getByText(/Net/, { selector: "p" })).toHaveTextContent(`Net ${R(70000)}`); expect(screen.getByText("Rank maintenance")).toBeInTheDocument(); expect(screen.getByText(/receipts that are not void/)).toBeInTheDocument();
  });
  it("switches to a year with months and the budget alongside, and exports a CSV for the chosen period", async () => {
    render(<IncomeStatementScreen />); await screen.findByText("Total income"); pick("Statement period", "year"); pick("Statement year", "2026"); expect(await screen.findByText("Against the budget")).toBeInTheDocument(); expect(screen.getByText("2026-10").closest("tr")).toHaveTextContent(`${R(100000)}${R(30000)}${R(70000)}`);
    const b = screen.getByText("membership", { selector: "td" }).closest("tr")!; expect(b).toHaveTextContent(R(200000)); expect(b).toHaveTextContent(R(120000)); expect(b).toHaveTextContent(R(-80000)); expect(screen.getByText("levy", { selector: "td" }).closest("tr")).toHaveTextContent("No budget");
    fireEvent.click(screen.getByRole("button", { name: /Download CSV/ })); await waitFor(() => expect(calls.at(-1)!.path).toBe(`${P}/finance/statement.csv?year=2026`));
  });
  it("sets a budget for the year in cents, and shows the server's reason when it is refused", async () => {
    render(<IncomeStatementScreen />); await screen.findByText("Total income"); pick("Budget category", "membership"); pick("Budget amount", "2000"); fireEvent.click(screen.getByRole("button", { name: "Set budget" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/finance/budgets`, body: { year: new Date().getFullYear(), category: "membership", amountCents: 200000 } }));
    routes = ((o) => (m: string, p: string, b: any) => (m === "PUT" ? { status: 400, body: { success: false, error: "Give the category" } } : o(m, p, b)))(routes); fireEvent.click(screen.getByRole("button", { name: "Set budget" })); expect(await screen.findByText("Give the category")).toBeInTheDocument();
  });
  it("says so when a month has nothing in it", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p.startsWith(`${P}/finance/statement?month`) ? { body: { success: true, period: "2026-10", income: [], expenses: [], incomeCents: 0, expensesCents: 0, netCents: 0 } } : o(m, p, b)))(routes); render(<IncomeStatementScreen />); expect((await screen.findAllByText("None.")).length).toBe(2);
  });
});
