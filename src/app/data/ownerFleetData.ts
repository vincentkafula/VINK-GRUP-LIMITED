/* =========================================================
   OWNER FLEET DASHBOARD — data layer
   Same shape as the reference provided for this dashboard. Every table,
   chart and financial statement in OwnerFleetDashboardViewer reads from
   this file, so wiring in live data later only means replacing this
   with a real fetch().
   ========================================================= */

export interface FleetStat {
  key: string; label: string; value: string; delta: string; up: boolean;
  color: string; series: number[];
}

export const company = { name: "John Kamau", role: "Owner", currency: "KES" };
export const period = { label: "02 May 2025 - 08 May 2025" };

export const stats: FleetStat[] = [
  { key: "vehicles", label: "Total Vehicles", value: "12", delta: "8.3%", up: true,
    color: "blue", series: [4, 6, 5, 7, 6, 8, 7, 9, 8, 10, 9, 12] },
  { key: "drivers", label: "Total Drivers", value: "18", delta: "5.6%", up: true,
    color: "green", series: [10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 18] },
  { key: "routes", label: "Total Routes", value: "6", delta: "3.1%", up: true,
    color: "purple", series: [3, 4, 3, 4, 5, 4, 5, 4, 5, 6, 5, 6] },
  { key: "trips", label: "Trips (This Week)", value: "248", delta: "12.4%", up: true,
    color: "orange", series: [120, 140, 132, 150, 161, 158, 170, 180, 190, 210, 230, 248] },
  { key: "revenue", label: "Revenue (This Week)", value: "KES 125,860", delta: "14.7%", up: true,
    color: "teal", series: [60000, 68000, 64000, 72000, 80000, 78000, 90000, 95000, 102000, 110000, 118000, 125860] },
];

export const vehicles = [
  { reg: "KAA 123A", model: "Toyota Prius", year: 2020, status: "Active", driver: "David Kimani", mileage: 82340, lastService: "2025-04-02" },
  { reg: "KBB 456B", model: "Nissan X-Trail", year: 2019, status: "Active", driver: "Elizabeth Akinyi", mileage: 101250, lastService: "2025-03-21" },
  { reg: "KCC 789C", model: "Toyota Axio", year: 2018, status: "Maintenance", driver: "—", mileage: 143870, lastService: "2025-05-05" },
  { reg: "KDD 101D", model: "Honda Fit", year: 2021, status: "Active", driver: "Paul Mutua", mileage: 54210, lastService: "2025-04-18" },
  { reg: "KEE 222E", model: "Toyota Noah", year: 2019, status: "Inactive", driver: "Grace Wanjiru", mileage: 98430, lastService: "2025-02-11" },
  { reg: "KFF 333F", model: "Toyota Vitz", year: 2020, status: "Active", driver: "John Ochieng", mileage: 76510, lastService: "2025-04-29" },
  { reg: "KGG 444G", model: "Mazda Demio", year: 2017, status: "Active", driver: "Samuel Njoroge", mileage: 132900, lastService: "2025-03-30" },
  { reg: "KHH 555H", model: "Toyota Fielder", year: 2019, status: "Active", driver: "Ann Wambui", mileage: 88760, lastService: "2025-04-10" },
  { reg: "KII 666I", model: "Subaru Forester", year: 2018, status: "Maintenance", driver: "—", mileage: 121340, lastService: "2025-05-07" },
  { reg: "KJJ 777J", model: "Toyota Premio", year: 2021, status: "Active", driver: "Peter Kariuki", mileage: 41220, lastService: "2025-04-25" },
  { reg: "KKK 888K", model: "Nissan Note", year: 2019, status: "Active", driver: "Mary Chebet", mileage: 69880, lastService: "2025-03-15" },
  { reg: "KLL 999L", model: "Toyota Wish", year: 2018, status: "Inactive", driver: "—", mileage: 156700, lastService: "2025-01-20" },
];

export const drivers = [
  { name: "David Kimani", phone: "0701 234 567", status: "Active", trips: 45, rating: 4.8, vehicle: "KAA 123A" },
  { name: "Elizabeth Akinyi", phone: "0702 345 678", status: "Active", trips: 62, rating: 4.9, vehicle: "KBB 456B" },
  { name: "John Ochieng", phone: "0703 456 789", status: "Active", trips: 38, rating: 4.6, vehicle: "KFF 333F" },
  { name: "Paul Mutua", phone: "0704 567 890", status: "On Trip", trips: 55, rating: 4.7, vehicle: "KDD 101D" },
  { name: "Grace Wanjiru", phone: "0705 678 901", status: "Inactive", trips: 12, rating: 4.2, vehicle: "KEE 222E" },
  { name: "Samuel Njoroge", phone: "0706 789 012", status: "Active", trips: 41, rating: 4.5, vehicle: "KGG 444G" },
  { name: "Ann Wambui", phone: "0707 890 123", status: "Active", trips: 33, rating: 4.8, vehicle: "KHH 555H" },
  { name: "Peter Kariuki", phone: "0708 901 234", status: "On Trip", trips: 58, rating: 4.9, vehicle: "KJJ 777J" },
  { name: "Mary Chebet", phone: "0709 012 345", status: "Active", trips: 29, rating: 4.4, vehicle: "KKK 888K" },
];

export const routes = [
  { name: "CBD - Airport", distance: "18 km", trips: 45, revenue: 22500, condition: "moderate", from: [-1.2833, 36.8172], to: [-1.3192, 36.9278] },
  { name: "CBD - Westlands", distance: "8 km", trips: 62, revenue: 18600, condition: "fast", from: [-1.2833, 36.8172], to: [-1.2648, 36.8020] },
  { name: "CBD - Karen", distance: "15 km", trips: 38, revenue: 16200, condition: "fast", from: [-1.2833, 36.8172], to: [-1.3194, 36.7076] },
  { name: "CBD - Thika Rd", distance: "22 km", trips: 55, revenue: 21800, condition: "slow", from: [-1.2833, 36.8172], to: [-1.1938, 36.9182] },
  { name: "CBD - Mombasa Rd", distance: "10 km", trips: 47, revenue: 16750, condition: "slow", from: [-1.2833, 36.8172], to: [-1.3410, 36.8500] },
  { name: "CBD - Ngong Rd", distance: "12 km", trips: 31, revenue: 14200, condition: "moderate", from: [-1.2833, 36.8172], to: [-1.3007, 36.7580] },
];

export const liveVehicles = [
  { reg: "KAA 123A", lat: -1.2833, lng: 36.8172, condition: "fast" },
  { reg: "KBB 456B", lat: -1.2700, lng: 36.8100, condition: "moderate" },
  { reg: "KDD 101D", lat: -1.3050, lng: 36.7850, condition: "fast" },
  { reg: "KFF 333F", lat: -1.2950, lng: 36.8400, condition: "slow" },
  { reg: "KGG 444G", lat: -1.3150, lng: 36.8600, condition: "moderate" },
  { reg: "KHH 555H", lat: -1.2600, lng: 36.7950, condition: "fast" },
  { reg: "KJJ 777J", lat: -1.3300, lng: 36.8300, condition: "slow" },
];

export const notifications = [
  { title: "KCC 789C sent to maintenance", body: "Scheduled service flagged after 143,870 km.", time: "12 min ago", type: "warning" },
  { title: "New trip milestone", body: "Fleet crossed 248 trips this week (+12.4%).", time: "1 hr ago", type: "success" },
  { title: "Driver rating updated", body: "Elizabeth Akinyi now rated 4.9★ after 62 trips.", time: "3 hr ago", type: "info" },
  { title: "KII 666I sent to maintenance", body: "Subaru Forester flagged for brake inspection.", time: "5 hr ago", type: "warning" },
  { title: "Weekly revenue report ready", body: "KES 125,860 collected across 6 routes.", time: "Yesterday", type: "info" },
  { title: "Insurance renewal due", body: "3 vehicles renew within 14 days.", time: "Yesterday", type: "warning" },
  { title: "New driver onboarded", body: "Mary Chebet added to the roster.", time: "2 days ago", type: "success" },
  { title: "Route revenue up on CBD - Thika Rd", body: "Revenue grew 9% week-on-week.", time: "2 days ago", type: "success" },
];

export const balanceSheet = {
  asOf: "08 May 2025",
  assets: [
    { label: "Cash & Bank", value: 612750 },
    { label: "Vehicles (net book value)", value: 1520000 },
    { label: "Spare Parts Inventory", value: 187250 },
    { label: "Accounts Receivable", value: 130000 },
  ],
  liabilities: [
    { label: "Vehicle Loans Payable", value: 720000 },
    { label: "Accounts Payable", value: 140000 },
    { label: "Accrued Salaries", value: 100000 },
  ],
  equity: [
    { label: "Owner's Capital", value: 1200000 },
    { label: "Retained Earnings", value: 290000 },
  ],
};

export const incomeStatement = {
  period: "02 May - 08 May 2025",
  income: [
    { label: "Trip Fares", value: 108360 },
    { label: "Delivery Contracts", value: 12500 },
    { label: "Vehicle Advertising", value: 5000 },
  ],
  expenses: [
    { label: "Fuel", value: 28950 },
    { label: "Driver Wages", value: 22000 },
    { label: "Maintenance & Repairs", value: 9500 },
    { label: "Insurance", value: 5500 },
    { label: "Licensing & Permits", value: 3000 },
  ],
};

export const cashFlow = {
  period: "02 May - 08 May 2025",
  inflow: [
    { label: "Cash from Trips", value: 120200 },
    { label: "Cash from Contracts", value: 10000 },
  ],
  outflow: [
    { label: "Fuel & Maintenance", value: 38450 },
    { label: "Driver Wages", value: 22000 },
    { label: "Loan Repayment", value: 13350 },
  ],
  openingBalance: 256350,
};

// ---- derived / computed helpers (same formulas as the reference) --------
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
