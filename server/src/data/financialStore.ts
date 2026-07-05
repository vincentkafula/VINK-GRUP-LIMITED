import { v4 as uuid } from "uuid";
import type {
  TripRecord, DriverPayConfig, Payslip, BankStatementEntry,
  JournalEntry, BalanceSheet, IncomeStatement, CashFlowStatement,
} from "../types/financial.js";

// ─── Demo Driver Pay Config ───────────────────────────────────────────────────

export const driverPayConfigs: DriverPayConfig[] = [
  {
    driverId: "drv-001",
    driverName: "Sipho Dlamini",
    idNumber: "8707125482085",
    vehicleReg: "CA 847-891",
    ownerName: "Vincent Kafula",
    ownerPhone: "+27 21 007 0772",
    associationName: "Khayelitsha Taxi Association",
    paymentModel: "target",
    monthlyGross: 0,
    dailyTarget: 350,
    weeklyTarget: 2450,
    monthlyTarget: 9800,
    vehicleRentalMonthly: 3500,
    associationLevyMonthly: 450,
    insuranceMonthly: 680,
    fuelAllowanceMonthly: 0,
    uniformDeduction: 0,
    otherDeductions: 0,
    bankAccountNumber: "1234567890",
    bankName: "Standard Bank",
    taxNumber: "9312345678",
  },
  {
    driverId: "drv-002",
    driverName: "Thabo Nkosi",
    idNumber: "9203075482082",
    vehicleReg: "CA 312-554",
    ownerName: "Vincent Kafula",
    ownerPhone: "+27 21 007 0772",
    associationName: "Khayelitsha Taxi Association",
    paymentModel: "salary",
    monthlyGross: 8500,
    dailyTarget: 0,
    weeklyTarget: 0,
    monthlyTarget: 0,
    vehicleRentalMonthly: 0,
    associationLevyMonthly: 450,
    insuranceMonthly: 0,
    fuelAllowanceMonthly: 1200,
    uniformDeduction: 150,
    otherDeductions: 0,
    bankAccountNumber: "9876543210",
    bankName: "Nedbank",
    taxNumber: "9312345679",
  },
];

// ─── Demo Trip Records ────────────────────────────────────────────────────────

function daysAgo(d: number) { return new Date(Date.now() - d * 86400000).toISOString(); }

export const tripRecords: TripRecord[] = [
  // Today
  { id: uuid(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "Nomsa Zulu", passengerCard: "**** 8842", fareAmount: 14.00, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(Date.now()-3600000).toISOString(), settledAt: new Date(Date.now()-3590000).toISOString(), authCode: "AUTH847219", notes: "" },
  { id: uuid(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "Sipho Khumalo", passengerCard: "**** 3317", fareAmount: 14.00, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(Date.now()-7200000).toISOString(), settledAt: new Date(Date.now()-7190000).toISOString(), authCode: "AUTH338821", notes: "" },
  { id: uuid(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: null, passengerCard: null, fareAmount: 14.00, currency: "ZAR", paymentMethod: "cash", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(Date.now()-9000000).toISOString(), settledAt: new Date(Date.now()-9000000).toISOString(), authCode: null, notes: "Cash from elder woman, short trip" },
  { id: uuid(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "Priya Naidoo", passengerCard: "**** 7751", fareAmount: 14.00, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(Date.now()-10800000).toISOString(), settledAt: new Date(Date.now()-10790000).toISOString(), authCode: "AUTH992147", notes: "" },
  { id: uuid(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "James van der Berg", passengerCard: "**** 5523", fareAmount: 14.00, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: new Date(Date.now()-12000000).toISOString(), settledAt: new Date(Date.now()-11990000).toISOString(), authCode: "AUTH004411", notes: "" },
  { id: uuid(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: null, passengerCard: null, fareAmount: 14.00, currency: "ZAR", paymentMethod: "cash", routeName: "Mitchell's Plain → Bellville", tapTimestamp: new Date(Date.now()-14400000).toISOString(), settledAt: new Date(Date.now()-14400000).toISOString(), authCode: null, notes: "" },
  // Yesterday
  { id: uuid(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "Lindiwe Mokoena", passengerCard: "**** 2294", fareAmount: 14.00, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: daysAgo(1), settledAt: daysAgo(1), authCode: "AUTH772190", notes: "" },
  { id: uuid(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: "Amahle Zulu", passengerCard: "**** 9981", fareAmount: 14.00, currency: "ZAR", paymentMethod: "card", routeName: "Khayelitsha → Cape Town CBD", tapTimestamp: daysAgo(1), settledAt: daysAgo(1), authCode: "AUTH882200", notes: "" },
  { id: uuid(), driverId: "drv-001", vehicleReg: "CA 847-891", passengerName: null, passengerCard: null, fareAmount: 13.00, currency: "ZAR", paymentMethod: "cash", routeName: "Gugulethu → Claremont", tapTimestamp: daysAgo(1), settledAt: daysAgo(1), authCode: null, notes: "" },
];

// ─── Demo Journal Entries ─────────────────────────────────────────────────────

export const journalEntries: JournalEntry[] = [
  // Auto entries from fares
  { id: uuid(), businessId: "biz-001", date: new Date().toISOString().split("T")[0], account: "Fare Revenue (Card)", description: "AFC card fares — today", debit: 0, credit: 56.00, category: "fare_card", entryType: "income", source: "auto", createdAt: new Date().toISOString() },
  { id: uuid(), businessId: "biz-001", date: new Date().toISOString().split("T")[0], account: "Fare Revenue (Cash)", description: "Cash fares — today", debit: 0, credit: 28.00, category: "fare_cash", entryType: "income", source: "auto", createdAt: new Date().toISOString() },
  // Manual entries
  { id: uuid(), businessId: "biz-001", date: new Date(Date.now()-86400000).toISOString().split("T")[0], account: "Fuel Cost", description: "BP garage N2 fill-up", debit: 1245.00, credit: 0, category: "fuel", entryType: "expense", source: "manual", createdAt: new Date().toISOString() },
  { id: uuid(), businessId: "biz-001", date: new Date(Date.now()-172800000).toISOString().split("T")[0], account: "Vehicle Maintenance", description: "Tyre replacement front left", debit: 890.00, credit: 0, category: "vehicle_maintenance", entryType: "expense", source: "manual", createdAt: new Date().toISOString() },
  { id: uuid(), businessId: "biz-001", date: new Date(Date.now()-259200000).toISOString().split("T")[0], account: "Driver Wages", description: "Sipho Dlamini — week 1 target payout", debit: 2850.00, credit: 0, category: "driver_wages", entryType: "expense", source: "manual", createdAt: new Date().toISOString() },
  { id: uuid(), businessId: "biz-001", date: new Date(Date.now()-345600000).toISOString().split("T")[0], account: "Association Levy", description: "KTA monthly levy", debit: 450.00, credit: 0, category: "association_levy", entryType: "expense", source: "manual", createdAt: new Date().toISOString() },
  { id: uuid(), businessId: "biz-001", date: new Date(Date.now()-432000000).toISOString().split("T")[0], account: "Insurance", description: "Santam commercial vehicle insurance", debit: 1680.00, credit: 0, category: "insurance", entryType: "expense", source: "manual", createdAt: new Date().toISOString() },
  { id: uuid(), businessId: "biz-001", date: new Date(Date.now()-518400000).toISOString().split("T")[0], account: "Loan Repayment — Principal", description: "FNB vehicle loan — monthly instalment principal", debit: 3200.00, credit: 0, category: "other_expense", entryType: "expense", source: "manual", createdAt: new Date().toISOString() },
  { id: uuid(), businessId: "biz-001", date: new Date(Date.now()-518400000).toISOString().split("T")[0], account: "Loan Interest", description: "FNB vehicle loan — monthly interest", debit: 1480.00, credit: 0, category: "other_expense", entryType: "expense", source: "manual", createdAt: new Date().toISOString() },
  { id: uuid(), businessId: "biz-001", date: new Date(Date.now()-604800000).toISOString().split("T")[0], account: "Fare Revenue (Card)", description: "AFC card fares — last week", debit: 0, credit: 4842.00, category: "fare_card", entryType: "income", source: "auto", createdAt: new Date().toISOString() },
  { id: uuid(), businessId: "biz-001", date: new Date(Date.now()-604800000).toISOString().split("T")[0], account: "Fare Revenue (Cash)", description: "Cash fares — last week", debit: 0, credit: 1260.00, category: "fare_cash", entryType: "income", source: "auto", createdAt: new Date().toISOString() },
];

// ─── Bank Statement Entries ───────────────────────────────────────────────────

let runningBalance = 12847.50;
function mkEntry(accountId: string, date: string, desc: string, ref: string, debit: number | null, credit: number | null, category: BankStatementEntry["category"], source: "auto" | "manual"): BankStatementEntry {
  runningBalance = credit ? runningBalance + credit : runningBalance - (debit ?? 0);
  return { id: uuid(), accountId, date, description: desc, reference: ref, debit, credit, balance: +runningBalance.toFixed(2), category, source };
}

export const bankStatementEntries: BankStatementEntry[] = [
  mkEntry("drv-001", new Date(Date.now()-30*86400000).toISOString().split("T")[0], "Opening balance", "OB-30", null, 8420.00, "other_income", "auto"),
  mkEntry("drv-001", new Date(Date.now()-29*86400000).toISOString().split("T")[0], "AFC Card fares settled", "AFC-20240101", null, 420.00, "fare_card", "auto"),
  mkEntry("drv-001", new Date(Date.now()-28*86400000).toISOString().split("T")[0], "BP Garage — fuel", "FUE-001", 650.00, null, "fuel", "manual"),
  mkEntry("drv-001", new Date(Date.now()-27*86400000).toISOString().split("T")[0], "AFC Card fares settled", "AFC-20240102", null, 392.00, "fare_card", "auto"),
  mkEntry("drv-001", new Date(Date.now()-25*86400000).toISOString().split("T")[0], "Cash fares deposited", "CSH-20240103", null, 280.00, "fare_cash", "manual"),
  mkEntry("drv-001", new Date(Date.now()-24*86400000).toISOString().split("T")[0], "Tyre replacement", "MNT-001", 890.00, null, "maintenance", "manual"),
  mkEntry("drv-001", new Date(Date.now()-21*86400000).toISOString().split("T")[0], "KTA Association levy", "LEVY-JUN", 450.00, null, "levy", "manual"),
  mkEntry("drv-001", new Date(Date.now()-20*86400000).toISOString().split("T")[0], "AFC Card fares settled", "AFC-20240110", null, 2841.00, "fare_card", "auto"),
  mkEntry("drv-001", new Date(Date.now()-19*86400000).toISOString().split("T")[0], "Cash fares deposited", "CSH-20240110", null, 840.00, "fare_cash", "manual"),
  mkEntry("drv-001", new Date(Date.now()-18*86400000).toISOString().split("T")[0], "FNB Vehicle loan instalment", "LOAN-FNB", 4680.00, null, "loan_repayment", "auto"),
  mkEntry("drv-001", new Date(Date.now()-14*86400000).toISOString().split("T")[0], "AFC Card fares settled", "AFC-20240117", null, 1980.00, "fare_card", "auto"),
  mkEntry("drv-001", new Date(Date.now()-13*86400000).toISOString().split("T")[0], "Santam insurance premium", "INS-JUN", 680.00, null, "insurance", "auto"),
  mkEntry("drv-001", new Date(Date.now()-7*86400000).toISOString().split("T")[0], "AFC Card fares settled", "AFC-20240124", null, 2240.00, "fare_card", "auto"),
  mkEntry("drv-001", new Date(Date.now()-6*86400000).toISOString().split("T")[0], "Cash fares deposited", "CSH-20240124", null, 560.00, "fare_cash", "manual"),
  mkEntry("drv-001", new Date(Date.now()-5*86400000).toISOString().split("T")[0], "BP Garage — fuel", "FUE-002", 595.00, null, "fuel", "manual"),
  mkEntry("drv-001", new Date(Date.now()-1*86400000).toISOString().split("T")[0], "AFC Card fares settled", "AFC-20240130", null, 490.00, "fare_card", "auto"),
  mkEntry("drv-001", new Date().toISOString().split("T")[0], "Cash fares deposited", "CSH-20240131", null, 84.00, "fare_cash", "manual"),
];

// ─── Payslip generation helper ────────────────────────────────────────────────

export function generatePayslip(config: DriverPayConfig, periodStart: string, periodEnd: string, trips: TripRecord[]): Payslip {
  const periodTrips = trips.filter(t => t.driverId === config.driverId && t.tapTimestamp >= periodStart && t.tapTimestamp <= periodEnd);
  const faresTotalCard = periodTrips.filter(t => t.paymentMethod === "card").reduce((s, t) => s + t.fareAmount, 0);
  const faresTotalCash = periodTrips.filter(t => t.paymentMethod === "cash").reduce((s, t) => s + t.fareAmount, 0);
  const totalGross = config.paymentModel === "salary" ? config.monthlyGross : faresTotalCard + faresTotalCash;
  const vehicleRental = config.vehicleRentalMonthly;
  const associationLevy = config.associationLevyMonthly;
  const insurance = config.insuranceMonthly;
  // PAYE: simplified 18% above R87,300 annual threshold (R7,275/month)
  const taxableIncome = Math.max(0, totalGross - vehicleRental - associationLevy - insurance);
  const paye = taxableIncome > 7275 ? +(taxableIncome * 0.18).toFixed(2) : 0;
  const uif = +(Math.min(totalGross * 0.01, 177.12)).toFixed(2); // 1% capped
  const otherDeductions = config.otherDeductions + config.uniformDeduction;
  const totalDeductions = +(vehicleRental + associationLevy + insurance + paye + uif + otherDeductions).toFixed(2);
  const netPay = +(totalGross - totalDeductions).toFixed(2);
  const targetAmount = config.paymentModel === "target" ? config.monthlyTarget : null;
  return {
    id: uuid(),
    driverId: config.driverId,
    periodStart, periodEnd,
    issueDate: new Date().toISOString().split("T")[0],
    employerName: config.associationName,
    employerReg: "2018/079316/07",
    employerAddress: "8 Rose Street, Cape Town CBD, 8001",
    employeeName: config.driverName,
    employeeId: config.idNumber,
    employeeTaxNo: config.taxNumber,
    bankAccount: config.bankAccountNumber,
    bankName: config.bankName,
    vehicleReg: config.vehicleReg,
    faresTotalCard: +faresTotalCard.toFixed(2),
    faresTotalCash: +faresTotalCash.toFixed(2),
    bonusAmount: 0,
    totalGross: +totalGross.toFixed(2),
    vehicleRental, associationLevy, insurance,
    paye, uif, otherDeductions,
    totalDeductions, netPay,
    tripsCount: periodTrips.length,
    periodType: "monthly",
    paymentModel: config.paymentModel,
    targetAmount,
    targetAchieved: targetAmount ? totalGross >= targetAmount : null,
  };
}
