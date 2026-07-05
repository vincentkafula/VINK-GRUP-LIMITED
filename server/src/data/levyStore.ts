import { v4 as uuid } from "uuid";
import type {
  LevyAccount, AFCDevice, AFCTap, AFCTrip,
  AssociationMarshallAgreement, LevyTransaction, MonthlyRentalBilling,
} from "../types/levySystem.js";

const now = () => new Date().toISOString();

// ─── Fee constants (configurable) ────────────────────────────────────────────
export const FEES = {
  PASSENGER_TAP_FEE: 0.50,    // R0.50 charged to passenger per tap
  DRIVER_TAP_FEE:    0.50,    // R0.50 charged to driver per tap
  VMS_FEE_TOTAL:     1.00,    // R1.00 total VMS earnings per tap
  INVESTOR_SHARE_PCT: 10,     // 10% of VMS fee → device investor = R0.10
  TRIP_LEVY:         20.00,   // R20 per trip deducted from driver → association
  DEVICE_MONTHLY_RENTAL: 250.00, // R250/month rental device owner → investor
};

// ─── Seeded accounts ──────────────────────────────────────────────────────────
const mkAccount = (
  type: LevyAccount["type"], ownerId: string, ownerName: string,
  balance = 0, meta: Record<string,unknown> = {}
): LevyAccount => ({
  id: uuid(), type, ownerId, ownerName, balance, totalIn: balance,
  totalOut: 0, currency: "ZAR", status: "active",
  createdAt: "2024-01-01T00:00:00Z", lastTransactionAt: null, metadata: meta,
});

export const levyAccounts: LevyAccount[] = [
  // VMS Platform
  { ...mkAccount("vms_platform", "vms", "VMS Platform Account", 284_750), id: "la-vms" },
  // Investors
  { ...mkAccount("investor", "inv-001", "Themba Nkosi (Investor)", 42_850), id: "la-inv001" },
  { ...mkAccount("investor", "inv-002", "Priya Investments CC", 28_400), id: "la-inv002" },
  // Associations
  { ...mkAccount("association", "assoc-001", "Cape Flats Taxi Association", 187_240), id: "la-assoc001" },
  { ...mkAccount("association", "assoc-002", "Bellville Metro Operators", 94_820), id: "la-assoc002" },
  // Marshalls
  { ...mkAccount("marshall", "marsh-001", "Moses Davids (Marshall)", 18_420), id: "la-marsh001" },
  { ...mkAccount("marshall", "marsh-002", "Sipho Mthembu (Marshall)", 9_840), id: "la-marsh002" },
  // Drivers
  { ...mkAccount("driver", "drv-001", "Sipho Dlamini", 3_842), id: "la-drv001" },
  { ...mkAccount("driver", "drv-002", "Thabo Nkosi", 5_120), id: "la-drv002" },
  { ...mkAccount("driver", "drv-003", "Nomvula Zulu", 2_987), id: "la-drv003" },
  // Passengers
  { ...mkAccount("passenger", "pax-001", "Aisha Petersen", 247.50), id: "la-pax001" },
  { ...mkAccount("passenger", "pax-002", "Kevin de Bruyn", 380.00), id: "la-pax002" },
  { ...mkAccount("passenger", "pax-003", "Zanele Mokoena", 125.00), id: "la-pax003" },
  // Taxi owners
  { ...mkAccount("taxi_owner", "own-001", "Cape Metro Taxis (Pty) Ltd", 0), id: "la-own001" },
];

// ─── AFC Devices ──────────────────────────────────────────────────────────────
export const afcDevices: AFCDevice[] = [
  { id: "dev-001", serialNumber: "AFC-CPT-00847", investorId: "inv-001", taxiOwnerId: "own-001", driverId: "drv-001", associationId: "assoc-001", marshallId: "marsh-001", routeId: "r1", monthlyRental: 250, rentalDueDate: "2024-07-01", status: "active", installedAt: "2024-01-15T08:00:00Z", lastActiveAt: now(), currentTripId: null, tapCount: 4_284 },
  { id: "dev-002", serialNumber: "AFC-CPT-00923", investorId: "inv-001", taxiOwnerId: "own-001", driverId: "drv-002", associationId: "assoc-001", marshallId: "marsh-001", routeId: "r2", monthlyRental: 250, rentalDueDate: "2024-07-01", status: "active", installedAt: "2024-02-01T08:00:00Z", lastActiveAt: now(), currentTripId: null, tapCount: 3_102 },
  { id: "dev-003", serialNumber: "AFC-CPT-01145", investorId: "inv-002", taxiOwnerId: "own-001", driverId: "drv-003", associationId: "assoc-002", marshallId: "marsh-002", routeId: "r3", monthlyRental: 250, rentalDueDate: "2024-07-01", status: "active", installedAt: "2024-03-10T08:00:00Z", lastActiveAt: now(), currentTripId: null, tapCount: 2_847 },
];

// ─── Association-Marshall agreements ─────────────────────────────────────────
export const agreements: AssociationMarshallAgreement[] = [
  { id: "agr-001", associationId: "assoc-001", associationName: "Cape Flats Taxi Association", marshallId: "marsh-001", marshallName: "Moses Davids", marshallPercentage: 15, effectiveFrom: "2024-01-01", approvedBy: "Association Executive", status: "active", notes: "Marshall collects 15% of the R20 trip levy per trip under his routes" },
  { id: "agr-002", associationId: "assoc-002", associationName: "Bellville Metro Operators", marshallId: "marsh-002", marshallName: "Sipho Mthembu", marshallPercentage: 12, effectiveFrom: "2024-03-01", approvedBy: "Association Executive", status: "active", notes: "Marshall collects 12% of R20 levy" },
];

// ─── Taps history ─────────────────────────────────────────────────────────────
export const afcTaps: AFCTap[] = [];

// ─── Trips ────────────────────────────────────────────────────────────────────
export const afcTrips: AFCTrip[] = [];

// ─── Levy transactions ────────────────────────────────────────────────────────
export const levyTransactions: LevyTransaction[] = [];

// ─── Monthly rentals ──────────────────────────────────────────────────────────
export const rentalBillings: MonthlyRentalBilling[] = [
  { id: uuid(), deviceId: "dev-001", investorAccountId: "la-inv001", taxiOwnerAccountId: "la-own001", amount: 250, billingPeriod: "2024-06", status: "paid", dueDate: "2024-06-01", paidAt: "2024-06-01T08:00:00Z" },
  { id: uuid(), deviceId: "dev-002", investorAccountId: "la-inv001", taxiOwnerAccountId: "la-own001", amount: 250, billingPeriod: "2024-06", status: "paid", dueDate: "2024-06-01", paidAt: "2024-06-01T08:00:00Z" },
  { id: uuid(), deviceId: "dev-003", investorAccountId: "la-inv002", taxiOwnerAccountId: "la-own001", amount: 250, billingPeriod: "2024-06", status: "paid", dueDate: "2024-06-01", paidAt: "2024-06-03T10:00:00Z" },
];

// ─── Core revenue distribution function ──────────────────────────────────────

export function processAFCTap(params: {
  deviceId: string;
  passengerId: string;
  fareAmount: number;
  routeName: string;
  paymentPath: AFCTap["paymentPath"];
  processingMs: number;
}): { tap: AFCTap; transactions: LevyTransaction[] } {
  const device = afcDevices.find(d => d.id === params.deviceId);
  if (!device) throw new Error(`Device ${params.deviceId} not found`);

  const agr = agreements.find(a => a.associationId === device.associationId && a.status === "active");
  const passengerAccount   = levyAccounts.find(a => a.ownerId === params.passengerId);
  const driverAccount      = levyAccounts.find(a => a.ownerId === device.driverId);
  const investorAccount    = levyAccounts.find(a => a.ownerId === device.investorId);
  const associationAccount = levyAccounts.find(a => a.ownerId === device.associationId);
  const vmsAccount         = levyAccounts.find(a => a.type === "vms_platform");

  if (!passengerAccount || !driverAccount || !investorAccount || !associationAccount || !vmsAccount) {
    throw new Error("One or more accounts not found");
  }

  // Calculate all splits
  const passengerFee   = FEES.PASSENGER_TAP_FEE;           // R0.50
  const driverFee      = FEES.DRIVER_TAP_FEE;              // R0.50
  const vmsFee         = FEES.VMS_FEE_TOTAL;               // R1.00
  const investorShare  = +(vmsFee * FEES.INVESTOR_SHARE_PCT / 100).toFixed(2); // R0.10
  const vmsKeeps       = +(vmsFee - investorShare).toFixed(2);                 // R0.90
  const passengerTotal = +(params.fareAmount + passengerFee).toFixed(2);
  const driverNet      = +(params.fareAmount - driverFee).toFixed(2);

  const tapId = uuid();
  const ts = now();

  // Create tap record
  const tap: AFCTap = {
    id: tapId, deviceId: params.deviceId, tripId: device.currentTripId ?? "no-trip",
    passengerId: params.passengerId, passengerAccountId: passengerAccount.id,
    driverId: device.driverId, driverAccountId: driverAccount.id,
    investorAccountId: investorAccount.id, associationAccountId: associationAccount.id,
    routeId: device.routeId, routeName: params.routeName,
    fareAmount: params.fareAmount,
    passengerTapFee: passengerFee, passengerTotal,
    driverTapFee: driverFee, driverNet,
    vmsFee, investorShare, vmsPlatformShare: vmsKeeps,
    paymentPath: params.paymentPath, authCode: `AUTH${Math.floor(100000 + Math.random() * 900000)}`,
    processingMs: params.processingMs, timestamp: ts, settled: true,
  };

  // Apply balance changes
  passengerAccount.balance   = +(passengerAccount.balance - passengerTotal).toFixed(2);
  passengerAccount.totalOut  += passengerTotal;
  driverAccount.balance      = +(driverAccount.balance + driverNet).toFixed(2);
  driverAccount.totalIn      += driverNet;
  investorAccount.balance    = +(investorAccount.balance + investorShare).toFixed(2);
  investorAccount.totalIn    += investorShare;
  vmsAccount.balance         = +(vmsAccount.balance + vmsKeeps).toFixed(2);
  vmsAccount.totalIn         += vmsKeeps;
  device.tapCount++;
  device.lastActiveAt = ts;
  [passengerAccount, driverAccount, investorAccount, vmsAccount].forEach(a => { a.lastTransactionAt = ts; });

  // Create transaction audit trail
  const txns: LevyTransaction[] = [
    { id: uuid(), fromAccountId: passengerAccount.id, toAccountId: driverAccount.id, amount: params.fareAmount, type: "tap_fare", referenceId: tapId, description: `Fare payment — ${params.routeName}`, timestamp: ts, balanceAfter: driverAccount.balance },
    { id: uuid(), fromAccountId: passengerAccount.id, toAccountId: vmsAccount.id, amount: passengerFee, type: "tap_fee_passenger", referenceId: tapId, description: `VMS tap fee (passenger side)`, timestamp: ts, balanceAfter: vmsAccount.balance },
    { id: uuid(), fromAccountId: driverAccount.id, toAccountId: vmsAccount.id, amount: driverFee, type: "tap_fee_driver", referenceId: tapId, description: `VMS tap fee (driver side)`, timestamp: ts, balanceAfter: vmsAccount.balance },
    { id: uuid(), fromAccountId: vmsAccount.id, toAccountId: investorAccount.id, amount: investorShare, type: "investor_tap", referenceId: tapId, description: `Investor share (10% of VMS fee) — device ${device.serialNumber}`, timestamp: ts, balanceAfter: investorAccount.balance },
  ];

  afcTaps.push(tap);
  levyTransactions.push(...txns);

  return { tap, transactions: txns };
}

export function processEndTrip(params: {
  deviceId: string;
  tripId: string;
}): { trip: AFCTrip; transactions: LevyTransaction[] } {
  const device = afcDevices.find(d => d.id === params.deviceId);
  if (!device) throw new Error("Device not found");

  const agr = agreements.find(a => a.associationId === device.associationId && a.status === "active");
  const marshallPct    = agr?.marshallPercentage ?? 0;
  const driverAccount  = levyAccounts.find(a => a.ownerId === device.driverId);
  const assocAccount   = levyAccounts.find(a => a.ownerId === device.associationId);
  const marshallAccount = agr ? levyAccounts.find(a => a.ownerId === agr.marshallId) : null;

  if (!driverAccount || !assocAccount) throw new Error("Accounts not found");

  const levy          = FEES.TRIP_LEVY;                                      // R20
  const marshallShare = +(levy * marshallPct / 100).toFixed(2);
  const assocShare    = +(levy - marshallShare).toFixed(2);

  // Count taps for this trip
  const tripTaps   = afcTaps.filter(t => t.tripId === params.tripId);
  const grossFare  = tripTaps.reduce((s, t) => s + t.fareAmount, 0);
  const ts = now();
  const tripId = params.tripId;

  // Deduct levy from driver
  driverAccount.balance  = +(driverAccount.balance - levy).toFixed(2);
  driverAccount.totalOut += levy;
  driverAccount.lastTransactionAt = ts;

  // Credit association
  assocAccount.balance += assocShare;
  assocAccount.totalIn += assocShare;
  assocAccount.lastTransactionAt = ts;

  // Credit marshall
  if (marshallAccount) {
    marshallAccount.balance += marshallShare;
    marshallAccount.totalIn += marshallShare;
    marshallAccount.lastTransactionAt = ts;
  }

  const trip: AFCTrip = {
    id: tripId, deviceId: params.deviceId, driverId: device.driverId,
    driverAccountId: driverAccount.id, associationId: device.associationId,
    associationAccountId: assocAccount.id, marshallId: agr?.marshallId ?? "",
    marshallAccountId: marshallAccount?.id ?? "",
    marshallPercentage: marshallPct, routeId: device.routeId, routeName: "",
    startedAt: ts, endedAt: ts, tapCount: tripTaps.length, grossFare,
    tripLevy: levy, associationShare: assocShare, marshallShare,
    driverLevyDeducted: true, status: "completed",
  };

  const txns: LevyTransaction[] = [
    { id: uuid(), fromAccountId: driverAccount.id, toAccountId: assocAccount.id, amount: assocShare, type: "trip_levy", referenceId: tripId, description: `Trip levy to association (${100 - marshallPct}% of R${levy})`, timestamp: ts, balanceAfter: assocAccount.balance },
  ];
  if (marshallAccount) {
    txns.push({ id: uuid(), fromAccountId: driverAccount.id, toAccountId: marshallAccount.id, amount: marshallShare, type: "marshall_share", referenceId: tripId, description: `Marshall share (${marshallPct}% of R${levy} trip levy)`, timestamp: ts, balanceAfter: marshallAccount.balance });
  }

  afcTrips.push(trip);
  levyTransactions.push(...txns);
  device.currentTripId = null;

  return { trip, transactions: txns };
}

export function processMonthlyRental(deviceId: string): LevyTransaction | null {
  const device   = afcDevices.find(d => d.id === deviceId);
  if (!device) return null;
  const investor = levyAccounts.find(a => a.ownerId === device.investorId);
  const owner    = levyAccounts.find(a => a.ownerId === device.taxiOwnerId);
  if (!investor || !owner) return null;

  const amount = device.monthlyRental;
  owner.balance     = +(owner.balance - amount).toFixed(2);
  owner.totalOut    += amount;
  investor.balance  = +(investor.balance + amount).toFixed(2);
  investor.totalIn  += amount;
  const ts = now();
  [owner, investor].forEach(a => { a.lastTransactionAt = ts; });

  const txn: LevyTransaction = {
    id: uuid(), fromAccountId: owner.id, toAccountId: investor.id,
    amount, type: "device_rental", referenceId: deviceId,
    description: `Monthly device rental — ${device.serialNumber}`,
    timestamp: ts, balanceAfter: investor.balance,
  };
  levyTransactions.push(txn);
  return txn;
}

export function getRevenueSnapshot() {
  const today = new Date().toISOString().slice(0, 10);
  const todayTaps  = afcTaps.filter(t => t.timestamp.startsWith(today));
  const todayTrips = afcTrips.filter(t => t.endedAt?.startsWith(today));
  const thisMonth  = new Date().toISOString().slice(0, 7);
  return {
    timestamp: now(),
    totalTapsToday: todayTaps.length,
    totalFareToday: +todayTaps.reduce((s, t) => s + t.fareAmount, 0).toFixed(2),
    totalVmsEarningsToday: +todayTaps.reduce((s, t) => s + t.vmsPlatformShare, 0).toFixed(2),
    totalInvestorEarningsToday: +todayTaps.reduce((s, t) => s + t.investorShare, 0).toFixed(2),
    totalLeviesCollectedToday: +todayTrips.reduce((s, t) => s + t.tripLevy, 0).toFixed(2),
    totalMarshallPaymentsToday: +todayTrips.reduce((s, t) => s + t.marshallShare, 0).toFixed(2),
    totalRentalsThisMonth: +rentalBillings.filter(r => r.billingPeriod === thisMonth && r.status === "paid").reduce((s, r) => s + r.amount, 0).toFixed(2),
    activeDevices: afcDevices.filter(d => d.status === "active").length,
    activeDrivers: levyAccounts.filter(a => a.type === "driver" && a.status === "active").length,
    activePassengers: levyAccounts.filter(a => a.type === "passenger" && a.status === "active").length,
    totalLifetimeTaps: afcDevices.reduce((s, d) => s + d.tapCount, 0),
    vmsTotalBalance: levyAccounts.find(a => a.type === "vms_platform")?.balance ?? 0,
  };
}
