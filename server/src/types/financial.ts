// ─── VMS Financial Reporting System ──────────────────────────────────────────

export type PaymentMethod = "card" | "cash" | "wallet";
export type PaymentModel  = "salary" | "target";
export type PeriodType    = "weekly" | "monthly";

// ─── Trip / Passenger Record ─────────────────────────────────────────────────

export interface TripRecord {
  id: string;
  driverId: string;
  vehicleReg: string;
  passengerName: string | null; // from card name or manually entered
  passengerCard: string | null; // masked PAN e.g. **** 4291
  fareAmount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  routeName: string;
  tapTimestamp: string;
  settledAt: string | null;
  authCode: string | null;
  notes: string;
}

// ─── Driver Payment Configuration ────────────────────────────────────────────

export interface DriverPayConfig {
  driverId: string;
  driverName: string;
  idNumber: string;
  vehicleReg: string;
  ownerName: string;
  ownerPhone: string;
  associationName: string;
  paymentModel: PaymentModel;
  // Salary model
  monthlyGross: number;
  // Target model
  dailyTarget: number;   // driver keeps everything above this (daily)
  weeklyTarget: number;
  monthlyTarget: number;
  // Deductions
  vehicleRentalMonthly: number;  // paid to vehicle owner
  associationLevyMonthly: number;
  insuranceMonthly: number;
  fuelAllowanceMonthly: number;
  uniformDeduction: number;
  otherDeductions: number;
  bankAccountNumber: string;
  bankName: string;
  taxNumber: string;
}

// ─── Payslip ──────────────────────────────────────────────────────────────────

export interface Payslip {
  id: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  employerName: string;
  employerReg: string;
  employerAddress: string;
  employeeName: string;
  employeeId: string;
  employeeTaxNo: string;
  bankAccount: string;
  bankName: string;
  vehicleReg: string;
  // Earnings
  faresTotalCard: number;
  faresTotalCash: number;
  bonusAmount: number;
  totalGross: number;
  // Deductions
  vehicleRental: number;
  associationLevy: number;
  insurance: number;
  paye: number;         // Pay-as-you-earn tax
  uif: number;          // Unemployment Insurance Fund
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  tripsCount: number;
  periodType: PeriodType;
  paymentModel: PaymentModel;
  targetAmount: number | null;
  targetAchieved: boolean | null;
}

// ─── Bank Statement Entry ─────────────────────────────────────────────────────

export interface BankStatementEntry {
  id: string;
  accountId: string;         // driver or business
  date: string;
  description: string;
  reference: string;
  debit: number | null;
  credit: number | null;
  balance: number;
  category: "fare_card" | "fare_cash" | "fuel" | "maintenance" | "rental" |
            "salary" | "levy" | "insurance" | "loan_repayment" | "transfer" |
            "other_income" | "other_expense";
  source: "auto" | "manual";
}

// ─── Manual Journal Entry (for financial statements) ─────────────────────────

export interface JournalEntry {
  id: string;
  businessId: string;
  date: string;
  account: string;       // e.g. "Fuel Expense", "Vehicle Depreciation"
  description: string;
  debit: number;
  credit: number;
  category: IncomeCategory | ExpenseCategory | AssetCategory | LiabilityCategory;
  entryType: "income" | "expense" | "asset" | "liability" | "equity";
  source: "auto" | "manual";
  createdAt: string;
}

export type IncomeCategory   = "fare_card" | "fare_cash" | "levy_income" | "other_income";
export type ExpenseCategory  = "fuel" | "driver_wages" | "vehicle_maintenance" | "insurance" |
                               "association_levy" | "loan_interest" | "depreciation" |
                               "afc_rental" | "admin" | "other_expense";
export type AssetCategory    = "cash_in_hand" | "bank_balance" | "vehicle" | "afc_device" |
                               "debtors" | "other_asset";
export type LiabilityCategory = "vehicle_loan" | "trade_creditors" | "tax_payable" |
                                "uif_payable" | "other_liability";

// ─── Balance Sheet ─────────────────────────────────────────────────────────────

export interface BalanceSheet {
  businessId: string;
  asAt: string;
  // Assets
  currentAssets: {
    cashInHand: number;
    bankBalance: number;
    debtors: number;
    otherCurrent: number;
    total: number;
  };
  nonCurrentAssets: {
    vehicles: number;
    accumulatedDepreciation: number;
    afcDevices: number;
    otherFixed: number;
    total: number;
  };
  totalAssets: number;
  // Liabilities
  currentLiabilities: {
    tradeCreditors: number;
    taxPayable: number;
    uifPayable: number;
    otherCurrent: number;
    total: number;
  };
  nonCurrentLiabilities: {
    vehicleLoan: number;
    otherLongTerm: number;
    total: number;
  };
  totalLiabilities: number;
  // Equity
  equity: {
    openingCapital: number;
    retainedEarnings: number;
    currentYearProfit: number;
    drawings: number;
    total: number;
  };
  liabilitiesAndEquity: number;
  balanced: boolean;
}

// ─── Income Statement ─────────────────────────────────────────────────────────

export interface IncomeStatement {
  businessId: string;
  periodStart: string;
  periodEnd: string;
  // Revenue
  fareRevenueCard: number;
  fareRevenueCash: number;
  otherIncome: number;
  totalRevenue: number;
  // Cost of sales
  driverWages: number;
  associationLevy: number;
  afcDeviceRental: number;
  totalCostOfSales: number;
  grossProfit: number;
  grossProfitMargin: number;
  // Operating expenses
  fuelCosts: number;
  vehicleMaintenance: number;
  insurance: number;
  depreciation: number;
  adminExpenses: number;
  otherExpenses: number;
  totalOpExpenses: number;
  operatingProfit: number;
  // Finance costs
  loanInterest: number;
  bankCharges: number;
  totalFinanceCosts: number;
  profitBeforeTax: number;
  taxExpense: number;
  netProfit: number;
  netProfitMargin: number;
}

// ─── Cash Flow Statement ──────────────────────────────────────────────────────

export interface CashFlowStatement {
  businessId: string;
  periodStart: string;
  periodEnd: string;
  openingCashBalance: number;
  // Operating
  cashFromFaresCard: number;
  cashFromFaresCash: number;
  cashPaidDrivers: number;
  cashPaidFuel: number;
  cashPaidMaintenance: number;
  cashPaidLevy: number;
  cashPaidInsurance: number;
  cashPaidAdmin: number;
  netOperatingCashFlow: number;
  // Investing
  vehiclePurchases: number;
  vehicleProceeds: number;
  afcDevicePurchases: number;
  netInvestingCashFlow: number;
  // Financing
  loanDrawdowns: number;
  loanRepayments: number;
  ownerDrawings: number;
  ownerCapitalInjections: number;
  netFinancingCashFlow: number;
  netChangeInCash: number;
  closingCashBalance: number;
}
