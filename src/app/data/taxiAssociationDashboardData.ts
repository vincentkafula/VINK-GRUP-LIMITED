/* =========================================================
   TAXI ASSOCIATION DASHBOARD — data layer
   The uploaded reference only included index.html (nav shell, script
   tags referencing js/data.js etc.) -- the actual data file wasn't
   provided, so this is realistic, internally consistent placeholder
   data matching the reference's own sidebar structure (Vehicles,
   Owners, Drivers, Routes, Map, Balance Sheet, Income Statement, Cash
   Flow, Tax, Tax association fee), in South African Rand and using a
   real South African taxi association naming convention, consistent
   with VINK's own established taxi-industry focus elsewhere on this
   site. Replace with a real fetch() once this is wired to live data.
   ========================================================= */

export interface AssocStat {
  key: string; label: string; value: string; delta: string; up: boolean;
  color: string; series: number[];
}

export const association = { name: "Khayelitsha Taxi Association", region: "Cape Town, South Africa", currency: "ZAR" };
export const period = { label: "02 May 2025 - 08 May 2025" };

export const stats: AssocStat[] = [
  { key: "owners", label: "Total Owners", value: "34", delta: "6.3%", up: true,
    color: "purple", series: [22, 24, 23, 26, 25, 28, 27, 30, 29, 32, 31, 34] },
  { key: "vehicles", label: "Total Vehicles", value: "97", delta: "9.1%", up: true,
    color: "blue", series: [70, 74, 72, 78, 76, 82, 80, 86, 84, 90, 88, 97] },
  { key: "drivers", label: "Total Drivers", value: "142", delta: "7.4%", up: true,
    color: "green", series: [100, 108, 104, 112, 110, 118, 115, 122, 120, 128, 135, 142] },
  { key: "routes", label: "Total Routes", value: "11", delta: "0%", up: true,
    color: "orange", series: [11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11] },
];

export const owners = [
  { name: "Thabo Nkosi", phone: "071 234 5678", vehicles: 5, drivers: 6, status: "Active", joined: "2019-03-12" },
  { name: "Nomvula Dlamini", phone: "072 345 6789", vehicles: 4, drivers: 4, status: "Active", joined: "2018-07-04" },
  { name: "Sipho Mahlangu", phone: "073 456 7890", vehicles: 3, drivers: 3, status: "Active", joined: "2020-01-22" },
  { name: "Zanele Khumalo", phone: "074 567 8901", vehicles: 6, drivers: 8, status: "Active", joined: "2017-11-09" },
  { name: "Bongani Zulu", phone: "075 678 9012", vehicles: 2, drivers: 2, status: "Suspended", joined: "2021-05-16" },
  { name: "Precious Mokoena", phone: "076 789 0123", vehicles: 4, drivers: 5, status: "Active", joined: "2019-09-27" },
  { name: "Mandla Sithole", phone: "077 890 1234", vehicles: 3, drivers: 3, status: "Active", joined: "2020-08-14" },
  { name: "Lindiwe Ndlovu", phone: "078 901 2345", vehicles: 5, drivers: 6, status: "Active", joined: "2018-02-19" },
];

export const vehicles = [
  { reg: "CA 45-671", model: "Toyota Quantum", year: 2021, status: "Active", owner: "Thabo Nkosi", driver: "Jabu Radebe", mileage: 118400, lastService: "2025-04-08" },
  { reg: "CA 88-902", model: "Toyota Quantum", year: 2020, status: "Active", owner: "Nomvula Dlamini", driver: "Sindiswa Cele", mileage: 142650, lastService: "2025-03-27" },
  { reg: "CA 12-334", model: "Toyota Hiace", year: 2018, status: "Maintenance", owner: "Sipho Mahlangu", driver: "—", mileage: 189300, lastService: "2025-05-06" },
  { reg: "CA 56-778", model: "Toyota Quantum", year: 2022, status: "Active", owner: "Zanele Khumalo", driver: "Vusi Maseko", mileage: 64200, lastService: "2025-04-21" },
  { reg: "CA 90-123", model: "Nissan NV350", year: 2019, status: "Active", owner: "Precious Mokoena", driver: "Nokuthula Buthelezi", mileage: 133870, lastService: "2025-04-15" },
  { reg: "CA 34-556", model: "Toyota Quantum", year: 2017, status: "Inactive", owner: "Bongani Zulu", driver: "—", mileage: 201500, lastService: "2025-01-30" },
  { reg: "CA 67-889", model: "Toyota Hiace", year: 2021, status: "Active", owner: "Mandla Sithole", driver: "Thandeka Mabaso", mileage: 91200, lastService: "2025-04-30" },
  { reg: "CA 21-445", model: "Toyota Quantum", year: 2020, status: "Active", owner: "Lindiwe Ndlovu", driver: "Sipho Ngcobo", mileage: 108900, lastService: "2025-03-18" },
];

export const drivers = [
  { name: "Jabu Radebe", phone: "081 123 4567", status: "Active", trips: 51, rating: 4.7, vehicle: "CA 45-671" },
  { name: "Sindiswa Cele", phone: "082 234 5678", status: "Active", trips: 66, rating: 4.9, vehicle: "CA 88-902" },
  { name: "Vusi Maseko", phone: "083 345 6789", status: "On Trip", trips: 39, rating: 4.5, vehicle: "CA 56-778" },
  { name: "Nokuthula Buthelezi", phone: "084 456 7890", status: "Active", trips: 58, rating: 4.8, vehicle: "CA 90-123" },
  { name: "Thandeka Mabaso", phone: "085 567 8901", status: "Active", trips: 44, rating: 4.6, vehicle: "CA 67-889" },
  { name: "Sipho Ngcobo", phone: "086 678 9012", status: "On Trip", trips: 62, rating: 4.9, vehicle: "CA 21-445" },
];

export const routes = [
  { name: "Khayelitsha - Cape Town CBD", distance: "32 km", trips: 210, revenue: 84000, condition: "moderate", from: [-34.0378, 18.6742], to: [-33.9249, 18.4241] },
  { name: "Khayelitsha - Bellville", distance: "24 km", trips: 156, revenue: 62400, condition: "slow", from: [-34.0378, 18.6742], to: [-33.8994, 18.6292] },
  { name: "Mitchells Plain - Cape Town CBD", distance: "27 km", trips: 178, revenue: 71200, condition: "moderate", from: [-34.0392, 18.6169], to: [-33.9249, 18.4241] },
  { name: "Khayelitsha - Wynberg", distance: "22 km", trips: 134, revenue: 53600, condition: "fast", from: [-34.0378, 18.6742], to: [-34.0016, 18.4644] },
  { name: "Gugulethu - Cape Town CBD", distance: "16 km", trips: 121, revenue: 48400, condition: "fast", from: [-33.9709, 18.5636], to: [-33.9249, 18.4241] },
  { name: "Nyanga - Bellville", distance: "19 km", trips: 98, revenue: 39200, condition: "moderate", from: [-33.9808, 18.5822], to: [-33.8994, 18.6292] },
];

export const liveVehicles = [
  { reg: "CA 45-671", lat: -33.9700, lng: 18.5100, condition: "fast" },
  { reg: "CA 88-902", lat: -33.9500, lng: 18.5800, condition: "moderate" },
  { reg: "CA 56-778", lat: -33.9900, lng: 18.4900, condition: "fast" },
  { reg: "CA 90-123", lat: -34.0100, lng: 18.5500, condition: "slow" },
  { reg: "CA 67-889", lat: -33.9300, lng: 18.5300, condition: "moderate" },
  { reg: "CA 21-445", lat: -34.0000, lng: 18.6000, condition: "fast" },
];

export const notifications = [
  { title: "CA 12-334 sent to maintenance", body: "Scheduled service flagged after 189,300 km.", time: "18 min ago", type: "warning" },
  { title: "New weekly trip record", body: "Association crossed 897 trips this week across all routes.", time: "2 hr ago", type: "success" },
  { title: "Owner suspended pending review", body: "Bongani Zulu suspended after outstanding association fees.", time: "4 hr ago", type: "warning" },
  { title: "Driver rating milestone", body: "Sindiswa Cele now rated 4.9★ after 66 trips.", time: "6 hr ago", type: "info" },
  { title: "Tax association fee reminder", body: "8 owners have fees due within 7 days.", time: "Yesterday", type: "warning" },
  { title: "New owner onboarded", body: "Lindiwe Ndlovu joined with 5 vehicles.", time: "2 days ago", type: "success" },
];

export const balanceSheet = {
  asOf: "08 May 2025",
  assets: [
    { label: "Cash & Bank", value: 1840500 },
    { label: "Member Vehicles (net book value)", value: 9650000 },
    { label: "Rank Facility & Equipment", value: 620000 },
    { label: "Accounts Receivable (owner fees)", value: 310000 },
  ],
  liabilities: [
    { label: "Facility Loan Payable", value: 2100000 },
    { label: "Accounts Payable", value: 380000 },
    { label: "Accrued Staff Salaries", value: 240000 },
  ],
  equity: [
    { label: "Association Capital", value: 8200000 },
    { label: "Retained Earnings", value: 1500500 },
  ],
};

export const incomeStatement = {
  period: "02 May - 08 May 2025",
  income: [
    { label: "Owner Association Fees", value: 285600 },
    { label: "Rank Facility Fees", value: 42000 },
    { label: "Advertising & Sponsorship", value: 18500 },
  ],
  expenses: [
    { label: "Staff Salaries", value: 96000 },
    { label: "Rank Maintenance", value: 34500 },
    { label: "Security Services", value: 28000 },
    { label: "Insurance & Compliance", value: 21000 },
    { label: "Administration", value: 12500 },
  ],
};

export const cashFlow = {
  period: "02 May - 08 May 2025",
  inflow: [
    { label: "Cash from Owner Fees", value: 285600 },
    { label: "Cash from Facility Fees", value: 42000 },
  ],
  outflow: [
    { label: "Staff & Admin", value: 108500 },
    { label: "Rank Maintenance & Security", value: 62500 },
    { label: "Loan Repayment", value: 38000 },
  ],
  openingBalance: 1621900,
};

export const taxSubmissions = [
  { period: "Apr 2025", type: "PAYE", amount: 84200, status: "Submitted", dueDate: "2025-05-07" },
  { period: "Apr 2025", type: "VAT", amount: 51300, status: "Submitted", dueDate: "2025-05-25" },
  { period: "May 2025", type: "PAYE", amount: 0, status: "Pending", dueDate: "2025-06-07" },
];

export const taxAssociationFees = [
  { owner: "Thabo Nkosi", vehicles: 5, monthlyFee: 2500, status: "Paid", dueDate: "2025-05-01" },
  { owner: "Nomvula Dlamini", vehicles: 4, monthlyFee: 2000, status: "Paid", dueDate: "2025-05-01" },
  { owner: "Sipho Mahlangu", vehicles: 3, monthlyFee: 1500, status: "Overdue", dueDate: "2025-05-01" },
  { owner: "Zanele Khumalo", vehicles: 6, monthlyFee: 3000, status: "Paid", dueDate: "2025-05-01" },
  { owner: "Bongani Zulu", vehicles: 2, monthlyFee: 1000, status: "Overdue", dueDate: "2025-05-01" },
  { owner: "Precious Mokoena", vehicles: 4, monthlyFee: 2000, status: "Paid", dueDate: "2025-05-01" },
  { owner: "Mandla Sithole", vehicles: 3, monthlyFee: 1500, status: "Paid", dueDate: "2025-05-01" },
  { owner: "Lindiwe Ndlovu", vehicles: 5, monthlyFee: 2500, status: "Pending", dueDate: "2025-05-01" },
];

// ---- derived / computed helpers ------------------------------------
const sum = (arr: { value: number }[]) => arr.reduce((a, b) => a + b.value, 0);

const totalAssets = sum(balanceSheet.assets);
const totalLiabilities = sum(balanceSheet.liabilities);
const totalEquity = sum(balanceSheet.equity);
const totalIncome = sum(incomeStatement.income);
const totalExpenses = sum(incomeStatement.expenses);
const netProfit = totalIncome - totalExpenses;
const profitMargin = ((netProfit / totalIncome) * 100).toFixed(1);
const totalInflow = sum(cashFlow.inflow);
const totalOutflow = sum(cashFlow.outflow);
const netCashFlow = totalInflow - totalOutflow;
const closingBalance = cashFlow.openingBalance + netCashFlow;

export const computed = {
  totalAssets, totalLiabilities, totalEquity, totalIncome, totalExpenses,
  netProfit, profitMargin, totalInflow, totalOutflow, netCashFlow, closingBalance,
};
