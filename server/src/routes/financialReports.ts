import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import {
  tripRecords, journalEntries, bankStatementEntries,
  driverPayConfigs, generatePayslip,
} from "../data/financialStore.js";
import type { TripRecord, JournalEntry, BalanceSheet, IncomeStatement, CashFlowStatement } from "../types/financial.js";

const router: ReturnType<typeof Router> = Router();

// ─── Trip / Passenger Records ────────────────────────────────────────────────

// GET /trips?driverId&date
router.get("/trips", (req: Request, res: Response): void => {
  const { driverId, date, limit = "50" } = req.query as Record<string, string>;
  let data = [...tripRecords].sort((a, b) => new Date(b.tapTimestamp).getTime() - new Date(a.tapTimestamp).getTime());
  if (driverId) data = data.filter(t => t.driverId === driverId);
  if (date)     data = data.filter(t => t.tapTimestamp.startsWith(date));
  res.json({ success: true, data: data.slice(0, +limit), meta: { total: data.length } });
});

// POST /trips — record a new trip (card tap or cash entry)
router.post("/trips", (req: Request, res: Response): void => {
  const { driverId, vehicleReg, passengerName, passengerCard, fareAmount, paymentMethod, routeName, notes } = req.body;
  if (!driverId || !fareAmount || !paymentMethod) {
    res.status(400).json({ success: false, error: "driverId, fareAmount, paymentMethod required" }); return;
  }
  const trip: TripRecord = {
    id: uuid(), driverId, vehicleReg: vehicleReg ?? "", passengerName: passengerName ?? null,
    passengerCard: passengerCard ?? null, fareAmount: +fareAmount, currency: "ZAR",
    paymentMethod, routeName: routeName ?? "", tapTimestamp: new Date().toISOString(),
    settledAt: paymentMethod === "cash" ? new Date().toISOString() : null,
    authCode: paymentMethod === "card" ? `AUTH${Math.floor(100000 + Math.random() * 900000)}` : null,
    notes: notes ?? "",
  };
  tripRecords.unshift(trip);
  res.status(201).json({ success: true, data: trip });
});

// GET /trips/summary?driverId&periodStart&periodEnd
router.get("/trips/summary", (req: Request, res: Response): void => {
  const { driverId, periodStart, periodEnd } = req.query as Record<string, string>;
  let data = [...tripRecords];
  if (driverId)    data = data.filter(t => t.driverId === driverId);
  if (periodStart) data = data.filter(t => t.tapTimestamp >= periodStart);
  if (periodEnd)   data = data.filter(t => t.tapTimestamp <= periodEnd);
  const cardTotal  = +data.filter(t => t.paymentMethod === "card").reduce((s, t) => s + t.fareAmount, 0).toFixed(2);
  const cashTotal  = +data.filter(t => t.paymentMethod === "cash").reduce((s, t) => s + t.fareAmount, 0).toFixed(2);
  const totalFares = +(cardTotal + cashTotal).toFixed(2);
  const config = driverPayConfigs.find(c => c.driverId === driverId);
  const targetAmount = config?.paymentModel === "target" ? (config.monthlyTarget ?? 0) : null;
  res.json({ success: true, data: { tripCount: data.length, cardTotal, cashTotal, totalFares, targetAmount, targetAchieved: targetAmount ? totalFares >= targetAmount : null, passengerList: data.map(t => ({ name: t.passengerName, card: t.passengerCard, method: t.paymentMethod, amount: t.fareAmount, time: t.tapTimestamp })) } });
});

// ─── Driver Pay Config ───────────────────────────────────────────────────────

router.get("/driver-config/:driverId", (req: Request, res: Response): void => {
  const config = driverPayConfigs.find(c => c.driverId === req.params.driverId);
  if (!config) { res.status(404).json({ success: false, error: "Driver configuration not found" }); return; }
  res.json({ success: true, data: config });
});

router.patch("/driver-config/:driverId", (req: Request, res: Response): void => {
  const config = driverPayConfigs.find(c => c.driverId === req.params.driverId);
  if (!config) { res.status(404).json({ success: false, error: "Driver configuration not found" }); return; }
  Object.assign(config, req.body);
  res.json({ success: true, data: config });
});

// ─── Payslip ─────────────────────────────────────────────────────────────────

router.get("/payslip/:driverId", (req: Request, res: Response): void => {
  const { periodStart, periodEnd } = req.query as Record<string, string>;
  const config = driverPayConfigs.find(c => c.driverId === req.params.driverId);
  if (!config) { res.status(404).json({ success: false, error: "Driver not found" }); return; }
  const now = new Date();
  const start = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end   = periodEnd   ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
  const payslip = generatePayslip(config, start, end, tripRecords);
  res.json({ success: true, data: payslip });
});

// ─── Bank Statement ───────────────────────────────────────────────────────────

router.get("/bank-statement/:accountId", (req: Request, res: Response): void => {
  const { from, to } = req.query as Record<string, string>;
  let data = bankStatementEntries.filter(e => e.accountId === req.params.accountId);
  if (from) data = data.filter(e => e.date >= from);
  if (to)   data = data.filter(e => e.date <= to);
  data.sort((a, b) => a.date.localeCompare(b.date));
  const openingBalance = data[0]?.balance ?? 0;
  const closingBalance = data[data.length - 1]?.balance ?? 0;
  const totalCredits = +data.reduce((s, e) => s + (e.credit ?? 0), 0).toFixed(2);
  const totalDebits  = +data.reduce((s, e) => s + (e.debit  ?? 0), 0).toFixed(2);
  res.json({ success: true, data, meta: { total: data.length, openingBalance, closingBalance, totalCredits, totalDebits } });
});

// POST /bank-statement/entry — add manual entry
router.post("/bank-statement/entry", (req: Request, res: Response): void => {
  const { accountId, date, description, reference, debit, credit, category } = req.body;
  if (!accountId || !date || !description) { res.status(400).json({ success: false, error: "accountId, date, description required" }); return; }
  const lastEntry = [...bankStatementEntries].filter(e => e.accountId === accountId).sort((a,b) => b.date.localeCompare(a.date))[0];
  const prevBalance = lastEntry?.balance ?? 0;
  const newBalance = +(prevBalance + (credit ?? 0) - (debit ?? 0)).toFixed(2);
  const entry = { id: uuid(), accountId, date, description, reference: reference ?? `MAN-${Date.now()}`, debit: debit ?? null, credit: credit ?? null, balance: newBalance, category: category ?? "other_income", source: "manual" as const };
  bankStatementEntries.push(entry);
  res.status(201).json({ success: true, data: entry });
});

// ─── Journal Entries ──────────────────────────────────────────────────────────

router.get("/journal/:businessId", (req: Request, res: Response): void => {
  const { from, to, entryType } = req.query as Record<string, string>;
  let data = journalEntries.filter(e => e.businessId === req.params.businessId);
  if (from) data = data.filter(e => e.date >= from);
  if (to)   data = data.filter(e => e.date <= to);
  if (entryType) data = data.filter(e => e.entryType === entryType);
  data.sort((a, b) => b.date.localeCompare(a.date));
  res.json({ success: true, data, meta: { total: data.length } });
});

router.post("/journal", (req: Request, res: Response): void => {
  const { businessId, date, account, description, debit, credit, category, entryType } = req.body;
  if (!businessId || !date || !account || !description) { res.status(400).json({ success: false, error: "businessId, date, account, description required" }); return; }
  const entry: JournalEntry = { id: uuid(), businessId, date, account, description, debit: +debit || 0, credit: +credit || 0, category, entryType, source: "manual", createdAt: new Date().toISOString() };
  journalEntries.unshift(entry);
  res.status(201).json({ success: true, data: entry });
});

// ─── Financial Statements ─────────────────────────────────────────────────────

// GET /statements/income?businessId&from&to
router.get("/statements/income", (req: Request, res: Response): void => {
  const { businessId = "biz-001", from, to } = req.query as Record<string, string>;
  let entries = journalEntries.filter(e => e.businessId === businessId);
  if (from) entries = entries.filter(e => e.date >= from);
  if (to)   entries = entries.filter(e => e.date <= to);
  const income = (cat: string) => +entries.filter(e => e.category === cat).reduce((s, e) => s + e.credit, 0).toFixed(2);
  const expense = (cat: string) => +entries.filter(e => e.category === cat).reduce((s, e) => s + e.debit, 0).toFixed(2);
  const fareRevenueCard = income("fare_card");
  const fareRevenueCash = income("fare_cash");
  const otherIncome = income("other_income") + income("levy_income");
  const totalRevenue = +(fareRevenueCard + fareRevenueCash + otherIncome).toFixed(2);
  const driverWages = expense("driver_wages");
  const associationLevy = expense("association_levy");
  const afcDeviceRental = expense("afc_rental");
  const totalCostOfSales = +(driverWages + associationLevy + afcDeviceRental).toFixed(2);
  const grossProfit = +(totalRevenue - totalCostOfSales).toFixed(2);
  const fuelCosts = expense("fuel");
  const vehicleMaintenance = expense("vehicle_maintenance");
  const insurance = expense("insurance");
  const depreciation = expense("depreciation");
  const adminExpenses = expense("admin");
  const otherExpenses = expense("other_expense");
  const totalOpExpenses = +(fuelCosts + vehicleMaintenance + insurance + depreciation + adminExpenses + otherExpenses).toFixed(2);
  const operatingProfit = +(grossProfit - totalOpExpenses).toFixed(2);
  const loanInterest = expense("loan_interest");
  const bankCharges = expense("other_expense");
  const totalFinanceCosts = +(loanInterest + bankCharges).toFixed(2);
  const profitBeforeTax = +(operatingProfit - totalFinanceCosts).toFixed(2);
  const taxExpense = +(Math.max(0, profitBeforeTax * 0.27)).toFixed(2);
  const netProfit = +(profitBeforeTax - taxExpense).toFixed(2);
  const is: IncomeStatement = { businessId, periodStart: from ?? "2024-01-01", periodEnd: to ?? new Date().toISOString().split("T")[0], fareRevenueCard, fareRevenueCash, otherIncome, totalRevenue, driverWages, associationLevy, afcDeviceRental, totalCostOfSales, grossProfit, grossProfitMargin: totalRevenue > 0 ? +((grossProfit / totalRevenue) * 100).toFixed(1) : 0, fuelCosts, vehicleMaintenance, insurance, depreciation, adminExpenses, otherExpenses, totalOpExpenses, operatingProfit, loanInterest, bankCharges, totalFinanceCosts, profitBeforeTax, taxExpense, netProfit, netProfitMargin: totalRevenue > 0 ? +((netProfit / totalRevenue) * 100).toFixed(1) : 0 };
  res.json({ success: true, data: is });
});

// GET /statements/balance-sheet?businessId&asAt
router.get("/statements/balance-sheet", (req: Request, res: Response): void => {
  const { businessId = "biz-001" } = req.query as Record<string, string>;
  const entries = journalEntries.filter(e => e.businessId === businessId);
  const assetTotal = (cat: string) => +entries.filter(e => e.category === cat).reduce((s, e) => s + e.debit - e.credit, 0).toFixed(2);
  const liabTotal  = (cat: string) => +entries.filter(e => e.category === cat).reduce((s, e) => s + e.credit - e.debit, 0).toFixed(2);
  const bankBal = bankStatementEntries.filter(e => e.accountId === "biz-001").sort((a,b) => b.date.localeCompare(a.date))[0]?.balance ?? 0;
  const bs: BalanceSheet = {
    businessId, asAt: new Date().toISOString().split("T")[0],
    currentAssets: { cashInHand: 2840, bankBalance: +bankBal.toFixed(2), debtors: 1200, otherCurrent: 0, total: 0 },
    nonCurrentAssets: { vehicles: 285000, accumulatedDepreciation: -42750, afcDevices: 18500, otherFixed: 0, total: 0 },
    totalAssets: 0,
    currentLiabilities: { tradeCreditors: 3200, taxPayable: 1840, uifPayable: 320, otherCurrent: 0, total: 0 },
    nonCurrentLiabilities: { vehicleLoan: 198400, otherLongTerm: 0, total: 0 },
    totalLiabilities: 0,
    equity: { openingCapital: 50000, retainedEarnings: 18420, currentYearProfit: 0, drawings: -12000, total: 0 },
    liabilitiesAndEquity: 0, balanced: false,
  };
  bs.currentAssets.total = +(bs.currentAssets.cashInHand + bs.currentAssets.bankBalance + bs.currentAssets.debtors).toFixed(2);
  bs.nonCurrentAssets.total = +(bs.nonCurrentAssets.vehicles + bs.nonCurrentAssets.accumulatedDepreciation + bs.nonCurrentAssets.afcDevices).toFixed(2);
  bs.totalAssets = +(bs.currentAssets.total + bs.nonCurrentAssets.total).toFixed(2);
  bs.currentLiabilities.total = +(bs.currentLiabilities.tradeCreditors + bs.currentLiabilities.taxPayable + bs.currentLiabilities.uifPayable).toFixed(2);
  bs.nonCurrentLiabilities.total = +bs.nonCurrentLiabilities.vehicleLoan.toFixed(2);
  bs.totalLiabilities = +(bs.currentLiabilities.total + bs.nonCurrentLiabilities.total).toFixed(2);
  bs.equity.currentYearProfit = +(bs.totalAssets - bs.totalLiabilities - bs.equity.openingCapital - bs.equity.retainedEarnings - bs.equity.drawings).toFixed(2);
  bs.equity.total = +(bs.equity.openingCapital + bs.equity.retainedEarnings + bs.equity.currentYearProfit + bs.equity.drawings).toFixed(2);
  bs.liabilitiesAndEquity = +(bs.totalLiabilities + bs.equity.total).toFixed(2);
  bs.balanced = Math.abs(bs.totalAssets - bs.liabilitiesAndEquity) < 1;
  res.json({ success: true, data: bs });
});

// GET /statements/cash-flow?businessId&from&to
router.get("/statements/cash-flow", (req: Request, res: Response): void => {
  const { businessId = "biz-001", from, to } = req.query as Record<string, string>;
  let entries = bankStatementEntries.filter(e => e.accountId === businessId || e.accountId === "drv-001");
  if (from) entries = entries.filter(e => e.date >= from);
  if (to)   entries = entries.filter(e => e.date <= to);
  const credits = (cat: string) => +entries.filter(e => e.category === cat).reduce((s, e) => s + (e.credit ?? 0), 0).toFixed(2);
  const debits  = (cat: string) => +entries.filter(e => e.category === cat).reduce((s, e) => s + (e.debit  ?? 0), 0).toFixed(2);
  const openBal = entries.sort((a,b) => a.date.localeCompare(b.date))[0]?.balance ?? 0;
  const closeBal = entries.sort((a,b) => b.date.localeCompare(a.date))[0]?.balance ?? 0;
  const cf: CashFlowStatement = {
    businessId, periodStart: from ?? "2024-01-01", periodEnd: to ?? new Date().toISOString().split("T")[0],
    openingCashBalance: +(openBal - entries.filter(e=>e.credit).reduce((s,e)=>s+(e.credit??0),0) + entries.filter(e=>e.debit).reduce((s,e)=>s+(e.debit??0),0)).toFixed(2),
    cashFromFaresCard: credits("fare_card"), cashFromFaresCash: credits("fare_cash"),
    cashPaidDrivers: debits("salary"), cashPaidFuel: debits("fuel"),
    cashPaidMaintenance: debits("maintenance"), cashPaidLevy: debits("levy"),
    cashPaidInsurance: debits("insurance"), cashPaidAdmin: 0,
    netOperatingCashFlow: 0,
    vehiclePurchases: 0, vehicleProceeds: 0, afcDevicePurchases: 0, netInvestingCashFlow: 0,
    loanDrawdowns: 0, loanRepayments: debits("loan_repayment"), ownerDrawings: 0, ownerCapitalInjections: 0,
    netFinancingCashFlow: 0,
    netChangeInCash: 0, closingCashBalance: +closeBal.toFixed(2),
  };
  cf.netOperatingCashFlow = +(cf.cashFromFaresCard + cf.cashFromFaresCash - cf.cashPaidDrivers - cf.cashPaidFuel - cf.cashPaidMaintenance - cf.cashPaidLevy - cf.cashPaidInsurance - cf.cashPaidAdmin).toFixed(2);
  cf.netInvestingCashFlow = +(cf.vehicleProceeds - cf.vehiclePurchases - cf.afcDevicePurchases).toFixed(2);
  cf.netFinancingCashFlow = +(cf.loanDrawdowns - cf.loanRepayments - cf.ownerDrawings + cf.ownerCapitalInjections).toFixed(2);
  cf.netChangeInCash = +(cf.netOperatingCashFlow + cf.netInvestingCashFlow + cf.netFinancingCashFlow).toFixed(2);
  res.json({ success: true, data: cf });
});

export default router;
