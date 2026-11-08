/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/common.js";
import { createOwnerFinance } from "./ownerFinance.js";
import { createOwnerFinanceExports, type OwnerFinanceExports } from "./ownerFinanceExports.js";

/** The worked example from the profit and loss tests (November 2026), exported. Clock: Wednesday 18 Nov 2026. */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { O1: id(3), O2: id(4), D1: id(6) }, V = { v1: id(20), v2: id(21), v3: id(22) };
const NOW = new Date("2026-11-18T08:00:00Z"), TODAY = "2026-11-18";
const R = (rand: number) => Math.round(rand * 100);
const pdfText = (buf: Buffer) => [...buf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => Buffer.from(x[1], "hex").toString("latin1")).join("");
let db: Db, ex: OwnerFinanceExports;
const ok = <T>(r: any): T => { expect(r.ok, JSON.stringify(r)).toBe(true); return r.value; };
const income = (vehicle: string, rand: number, on: string, voided = false, owner = U.O1) => db.query(`INSERT INTO driver_payments (owner_id, vehicle_id, amount_cents, paid_on, method, voided_at) VALUES ($1,$2,$3,$4,'cash',$5)`, [owner, vehicle, R(rand), on, voided ? NOW.toISOString() : null]);

beforeEach(async () => {
  db = allPortalsDb(); ex = createOwnerFinanceExports(db, () => NOW); const f = createOwnerFinance(db, () => NOW);
  for (const [i, nm, r] of [[U.O1, "Olu Owner", "vehicle_owner"], [U.O2, "=cmd|' /C calc'!A0", "vehicle_owner"], [U.D1, "Dan Driver", "driver"]] as const) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, i, nm, `${i}@x.test`, r]);
  await db.query(`INSERT INTO owner_drivers (owner_id, driver_id, status, requested_by) VALUES ($1,$2,'active','owner')`, [U.O1, U.D1]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration, make, seats) VALUES ($1,$2,'CA 111-111','Toyota',15),($3,$2,'CA 222-222','Toyota',15),($4,$5,'CA 333-333','Toyota',15)`, [V.v1, U.O1, V.v2, V.v3, U.O2]);
  await income(V.v1, 2000, "2026-11-03"); await income(V.v1, 1500, "2026-11-12"); await income(V.v1, 999, "2026-11-05", true); await income(V.v2, 1000, "2026-11-04"); await income(V.v1, 800, "2026-10-15");
  await f.addCost(U.O1, { vehicleId: V.v1, category: "fuel", amountCents: R(600), incurredOn: "2026-11-06", payee: "Engen" }); await f.addCost(U.O1, { vehicleId: V.v1, category: "insurance", amountCents: R(300), incurredOn: "2026-11-01", payee: "Santam" }); await f.addCost(U.O1, { vehicleId: V.v1, category: "fine", amountCents: R(200), incurredOn: "2026-11-09", driverId: U.D1, reference: "N-9", payee: "City of Cape Town" }); await f.addCost(U.O1, { vehicleId: V.v1, category: "fine", amountCents: R(500), incurredOn: "2026-11-09", fineStatus: "disputed", reference: "N-10" });
  await f.addCost(U.O1, { category: "association", amountCents: R(100), incurredOn: "2026-11-02", payee: "Langa TA" }); await f.addCost(U.O1, { vehicleId: V.v1, category: "fuel", amountCents: R(200), incurredOn: "2026-10-15" }); const gone = ok<any>(await f.addCost(U.O1, { vehicleId: V.v1, category: "fuel", amountCents: R(777), incurredOn: "2026-11-07" })); await f.voidCost(U.O1, gone.id, "mistake");
  const fid = ok<any>(await f.addFinance(U.O1, { vehicleId: V.v1, lender: "WesBank", reference: "AGR-77", originalCents: R(450000), balanceCents: R(300000), balanceOn: "2026-10-31", instalmentCents: R(9000), dueDay: 20, startDate: "2026-01-20", finalDueOn: "2029-01-20" })).id; await f.recordInstalment(U.O1, fid, { amountCents: R(900), paidOn: "2026-11-02" });
});
const nov = { period: "month" as const, on: TODAY };

describe("the profit and loss CSV", () => {
  it("has a row per vehicle, the costs not tied to a vehicle, and the fleet, with a column for each kind of cost that was used, in plain numbers of rand", async () => {
    const t = ok<any>(await ex.profitCsv(U.O1, nov)); expect(t.filename).toBe("profit-and-loss-2026-11-01-to-2026-11-30.csv"); expect(t.columns).toEqual(["Vehicle", "Income received from drivers", "Fuel", "Insurance", "Fines", "Association costs", "Total running costs", "Profit before finance", "Loan instalments paid", "Cash profit"]);
    expect(t.rows).toEqual([["CA 111-111", 3500, 600, 300, 200, 0, 1100, 2400, 900, 1500], ["CA 222-222", 1000, 0, 0, 0, 0, 0, 1000, 0, 1000], ["Not tied to a vehicle", 0, 0, 0, 0, 100, 100, -100, 0, -100], ["Whole fleet", 4500, 600, 300, 200, 100, 1200, 3300, 900, 2400]]);
  });
  it("is another period's figures when asked: the quarter, the tax year, or any dates, and refuses a bad one", async () => {
    expect(ok<any>(await ex.profitCsv(U.O1, { period: "quarter", on: TODAY })).rows.at(-1)).toEqual(["Whole fleet", 5300, 800, 300, 200, 100, 1400, 3900, 900, 3000]); expect(ok<any>(await ex.profitCsv(U.O1, { period: "tax_year", on: TODAY })).filename).toBe("profit-and-loss-2026-03-01-to-2027-02-28.csv"); expect(ok<any>(await ex.profitCsv(U.O1, { period: "custom", from: "2026-11-03", to: "2026-11-03" })).rows.at(-1)).toEqual(["Whole fleet", 2000, 0, 2000, 0, 2000]);                  // no cost was used that day, so there are no cost columns
    expect(await ex.profitCsv(U.O1, { period: "custom" })).toMatchObject({ ok: false, status: 400 });
  });
  it("shows only the owner's own vehicles, and omits the 'not tied' row when there is none", async () => { const t = ok<any>(await ex.profitCsv(U.O2, nov)); expect(t.rows.map((r: any[]) => r[0])).toEqual(["CA 333-333", "Whole fleet"]); expect(JSON.stringify(t)).not.toContain("CA 111-111"); });
});

describe("the costs CSV", () => {
  it("lists every cost in the period, oldest first, with the vehicle or the whole business, the driver for a fine, the fine's status, and leaves out a voided cost", async () => {
    const t = ok<any>(await ex.costsCsv(U.O1, nov)); expect(t.filename).toBe("costs-2026-11-01-to-2026-11-30.csv"); expect(t.columns).toEqual(["Date", "Vehicle", "Category", "Paid to", "Reference", "Driver", "Amount", "Fine status", "Note"]);
    expect(t.rows).toEqual([["2026-11-01", "CA 111-111", "Insurance", "Santam", null, null, 300, null, null], ["2026-11-02", "Whole business", "Association costs", "Langa TA", null, null, 100, null, null], ["2026-11-06", "CA 111-111", "Fuel", "Engen", null, null, 600, null, null], ["2026-11-09", "CA 111-111", "Fines", "City of Cape Town", "N-9", "Dan Driver", 200, "unpaid", null], ["2026-11-09", "CA 111-111", "Fines", null, "N-10", null, 500, "disputed", null]]);
  });
  it("refuses a period that is not valid and shows nothing of another owner's", async () => { expect(await ex.costsCsv(U.O1, { period: "custom", from: "2026-12-01", to: "2026-01-01" })).toMatchObject({ ok: false, status: 400 }); expect(ok<any>(await ex.costsCsv(U.O2, nov)).rows).toEqual([]); });
});

describe("the vehicle finance CSV", () => {
  it("lists each agreement with what the lender last said was owed and as at when", async () => {
    const t = ok<any>(await ex.loansCsv(U.O1, TODAY)); expect(t.filename).toBe("vehicle-finance-2026-11-18.csv"); expect(t.columns[4]).toBe("Owed (as the lender last said)"); expect(t.rows).toEqual([["CA 111-111", "WesBank", "AGR-77", 450000, 300000, "2026-10-31", 9000, 20, "2026-01-20", "2029-01-20", "Active", null, 900]]);
    expect(ok<any>(await ex.loansCsv(U.O2)).rows).toEqual([]);
  });
});

describe("the profit and loss PDF", () => {
  it("says what it is and is not, names the owner and the period, gives the fleet's figures before and after instalments, and compares with the period before", async () => {
    const r = ok<any>(await ex.profitPdf(U.O1, nov)); expect(r.filename).toBe("profit-and-loss-november-2026.pdf"); expect(r.pdf.subarray(0, 5).toString()).toBe("%PDF-"); const t = pdfText(r.pdf);
    for (const s of ["Olu Owner", "Profit and loss: November 2026", "it has not been audited, and it is not tax advice", "an accountant treats only the interest as an expense", "2026-11-01 to 2026-11-30", "R4 500.00", "R1 200.00", "R3 300.00", "R900.00", "R2 400.00", "53.3%", "Up R1 800.00 (it was R600.00, 2026-10-02 to 2026-10-31)", "Generated by VINK on 2026-11-18 from Olu Owner's own records"]) expect(t, s).toContain(s);
  });
  it("shows each vehicle, the costs not tied to a vehicle as a loss, the costs by category, the loan as the lender last said, and the unpaid fines", async () => {
    const t = pdfText(ok<any>(await ex.profitPdf(U.O1, nov)).pdf); for (const s of ["CA 111-111", "R3 500.00", "R1 100.00", "R2 400.00", "R1 500.00", "CA 222-222", "R1 000.00", "Not tied to a vehicle", "-R100.00", "Fuel", "R600.00", "Association costs", "R100.00", "WesBank", "R300 000.00", "2026-10-31", "is not worked out from the instalments", "1 fine is recorded as unpaid, R200.00 in all", "A fine that is disputed is not counted as a cost until it is settled"]) expect(t, s).toContain(s);
  });
  it("says there was no income when there was none, refuses a bad period, and never shows another owner's vehicles", async () => {
    expect(pdfText(ok<any>(await ex.profitPdf(U.O1, { period: "custom", from: "2026-09-01", to: "2026-09-30" })).pdf)).toContain("No income in this period"); expect(await ex.profitPdf(U.O1, { period: "custom" })).toMatchObject({ ok: false, status: 400 }); const t = pdfText(ok<any>(await ex.profitPdf(U.O2, nov)).pdf); expect(t).toContain("CA 333-333"); expect(t).not.toContain("CA 111-111");
  });
});
