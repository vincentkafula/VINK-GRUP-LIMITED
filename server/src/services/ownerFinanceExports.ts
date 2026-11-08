import type { Db } from "../portal/common.js";
import { createOwnerFinance, CATEGORIES, CATEGORY_TEXT, type PeriodKind } from "./ownerFinance.js";
import { renderPdf, type Section } from "./reports.js";
import { createOwnerBusiness } from "./ownerBusiness.js";

/**
 * EXPORTS OF THE OWNER'S FINANCES (docs/OWNER_DASHBOARD.md, slice D2): CSV for an accountant's spreadsheet, and a PDF for an accountant, a lender or SARS to read. They show exactly what the owner recorded and say so: they are the owner's own records, not audited accounts, and not tax advice.
 * Money in a CSV is a plain number of rand (so a spreadsheet can add it up); in the PDF it is written as rand. Income is what the owner recorded receiving from drivers.
 */
export type Fail = { ok: false; status: number; error: string };
export type Res<T> = { ok: true; value: T } | Fail;
export interface Table { filename: string; columns: string[]; rows: unknown[][] }
/** Rand with a space between thousands and a point before the cents, as the rest of the app writes it: R4 500.00, and -R100.00 for a loss. */
const rand = (c: number) => { const [i, d] = Math.abs(c / 100).toFixed(2).split("."); return `${c < 0 ? "-" : ""}R${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${d}`; };
const num = (c: number) => Math.round(c) / 100;
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
type Opts = { period?: PeriodKind; on?: string; from?: string; to?: string };

export function createOwnerFinanceExports(db: Db, now: () => Date = () => new Date()) {
  const fin = createOwnerFinance(db, now), biz = createOwnerBusiness(db, now);
  const ownerName = async (owner: string) => String((await db.query(`SELECT name FROM users WHERE id = $1`, [owner])).rows[0]?.name ?? "The owner");

  /** One row per vehicle, then costs not tied to a vehicle, then the fleet: income, each cost category that was used, profit before finance, instalments paid and cash profit. */
  async function profitCsv(owner: string, o: Opts): Promise<Res<Table>> {
    const p = await fin.profit(owner, o); if (!p.ok) return p; const v = p.value as any, cats = CATEGORIES.filter((k) => v.fleet.costs.some((c: any) => c.category === k)), cell = (x: any, k: string) => num(x.costs.find((c: any) => c.category === k)?.cents ?? 0);
    const line = (name: string, x: any) => [name, num(x.incomeCents), ...cats.map((k) => cell(x, k)), num(x.costCents), num(x.profitBeforeFinanceCents), num(x.instalmentCents), num(x.cashProfitCents)];
    return { ok: true, value: { filename: `profit-and-loss-${v.period.from}-to-${v.period.to}.csv`, columns: ["Vehicle", "Income received from drivers", ...cats.map((k) => CATEGORY_TEXT[k]), "Total running costs", "Profit before finance", "Loan instalments paid", "Cash profit"], rows: [...v.vehicles.map((x: any) => line(x.registration, x)), ...(v.unallocated.costCents > 0 ? [line("Not tied to a vehicle", v.unallocated)] : []), line("Whole fleet", v.fleet)] } };
  }
  /** Every cost in the period, one per row, oldest first (and, within a day, by category and then amount, so the same records always give the same file), with the vehicle, the driver (for a fine) and its status. Voided costs are left out. */
  async function costsCsv(owner: string, o: Opts): Promise<Res<Table>> {
    const range = await fin.profit(owner, o); if (!range.ok) return range; const per = (range.value as any).period, cs = await fin.costs(owner, { from: per.from, to: per.to });
    return { ok: true, value: { filename: `costs-${per.from}-to-${per.to}.csv`, columns: ["Date", "Vehicle", "Category", "Paid to", "Reference", "Driver", "Amount", "Fine status", "Note"], rows: cs.slice().sort((a, b) => a.incurredOn.localeCompare(b.incurredOn) || a.category.localeCompare(b.category) || a.amountCents - b.amountCents).map((c) => [c.incurredOn, c.vehicle ?? "Whole business", CATEGORY_TEXT[c.category as keyof typeof CATEGORY_TEXT] ?? c.category, c.payee, c.reference, c.driver, num(c.amountCents), c.fineStatus, c.note]) } };
  }
  /** Each finance agreement, with what the lender last said was owed. */
  async function loansCsv(owner: string, onDay?: string): Promise<Res<Table>> {
    const l = await fin.finances(owner, onDay); return { ok: true, value: { filename: `vehicle-finance-${l.today}.csv`, columns: ["Vehicle", "Lender", "Agreement reference", "Original amount", "Owed (as the lender last said)", "As at", "Monthly instalment", "Due on day", "Started", "Last instalment due", "Status", "Settled on", "Paid so far"], rows: l.finances.map((f) => [f.registration, f.lender, f.reference, num(f.originalCents), num(f.balanceCents), f.balanceOn, num(f.instalmentCents), f.dueDay, f.startDate, f.finalDueOn, f.status === "active" ? "Active" : "Settled", f.settledOn, num(f.paidCents)]) } };
  }
  /** A profit and loss statement an accountant, a lender or SARS can read: what it is, the fleet's figures, each vehicle, the costs by category, and the finance agreements. */
  async function profitPdf(owner: string, o: Opts): Promise<Res<{ filename: string; pdf: Buffer }>> {
    const p = await fin.profit(owner, o); if (!p.ok) return p; const v = p.value as any, b = await biz.get(owner), name = b?.tradingName ?? await ownerName(owner), loans = await fin.finances(owner, v.period.to <= now().toISOString().slice(0, 10) ? v.period.to : undefined), unpaid = (await fin.costs(owner, { category: "fine" })).filter((c) => c.fineStatus === "unpaid"), f = v.fleet;
    const sections: Section[] = [
      { heading: "What this statement is", lines: [`This is ${name}'s own record of what the vehicles earned and cost to run for ${v.period.label}. It is made from what the owner recorded: it has not been audited, and it is not tax advice.`, "Income is what the owner recorded receiving from drivers. A loan instalment includes repayment of capital: for tax, an accountant treats only the interest as an expense, so profit is shown both before and after instalments."] },
      ...(b ? [{ heading: "The business", facts: [["Trading as", b.tradingName], ["How it trades", b.kindText], ...(b.registeredName ? [["Registered name", b.registeredName]] : []), ...(b.registrationNumber ? [["Registration number", b.registrationNumber]] : []), ...(b.vatNumber ? [["VAT number", b.vatNumber]] : []), ...(b.address ? [["Address", b.address]] : []), ...(b.phone ? [["Phone", b.phone]] : []), ...(b.email ? [["Email", b.email]] : [])] } as Section] : []),
      { heading: "The whole fleet", facts: [["Period", `${v.period.from} to ${v.period.to}`], ["Income received from drivers", rand(f.incomeCents)], ["Running costs", rand(f.costCents)], ["Profit before finance", rand(f.profitBeforeFinanceCents)], ["Loan instalments paid", rand(f.instalmentCents)], ["Cash profit", rand(f.cashProfitCents)], ["Margin (cash profit as a share of income)", f.marginPercent === null ? "No income in this period" : `${f.marginPercent}%`], ["Compared with the period before", `${v.changeCents >= 0 ? "Up" : "Down"} ${rand(Math.abs(v.changeCents))} (it was ${rand(v.previous.fleet.cashProfitCents)}, ${v.period.previousFrom} to ${v.period.previousTo})`]] },
      { heading: "Each vehicle", table: { columns: ["Vehicle", "Income", "Running costs", "Profit before finance", "Instalments", "Cash profit"], rows: [...v.vehicles.map((x: any) => [x.registration, rand(x.incomeCents), rand(x.costCents), rand(x.profitBeforeFinanceCents), rand(x.instalmentCents), rand(x.cashProfitCents)]), ...(v.unallocated.costCents > 0 ? [["Not tied to a vehicle", rand(0), rand(v.unallocated.costCents), rand(-v.unallocated.costCents), rand(0), rand(-v.unallocated.costCents)]] : [])], widths: [100, 76, 80, 90, 76, 70] } },
      { heading: "Running costs by category", table: { columns: ["Category", "Amount"], rows: f.costs.map((c: any) => [c.label, rand(c.cents)]), widths: [300, 192] } },
      { heading: "Vehicle finance", lines: loans.finances.length ? ["The amount owed is what the lender last said, as at the date shown. It is not worked out from the instalments."] : [], table: { columns: ["Vehicle", "Lender", "Owed", "As at", "Instalment", "Status"], rows: loans.finances.map((x) => [x.registration, x.lender, rand(x.balanceCents), x.balanceOn, rand(x.instalmentCents), x.status === "active" ? "Active" : "Settled"]), widths: [90, 110, 90, 70, 72, 60] } },
      { heading: "Fines", lines: [unpaid.length ? `${unpaid.length} fine${unpaid.length === 1 ? " is" : "s are"} recorded as unpaid, ${rand(unpaid.reduce((a, c) => a + c.amountCents, 0))} in all.` : "No fine is recorded as unpaid.", "A fine that is disputed is not counted as a cost until it is settled."] },
    ];
    const pdf = await renderPdf({ title: `Profit and loss: ${v.period.label}`, association: name, subtitle: "Vehicle profit and loss", generatedOn: now().toISOString().slice(0, 10), sections }); return { ok: true, value: { filename: `profit-and-loss-${slug(v.period.label)}.pdf`, pdf } };
  }
  return { profitCsv, costsCsv, loansCsv, profitPdf };
}
export type OwnerFinanceExports = ReturnType<typeof createOwnerFinanceExports>;
