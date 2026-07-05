// ─── VMS AFC Revenue Distribution System ─────────────────────────────────────
//
// Revenue flow per tap:
// 1. Passenger pays fare + R0.50 (VMS tap fee)
// 2. Driver earns fare - R0.50 (VMS tap fee)
// 3. VMS earns R1.00 total (R0.50 from each side)
//    └─ R0.10 → device Investor (10% of R1.00)
//    └─ R0.90 → VMS Platform
// 4. At trip end: R20 trip levy deducted from driver
//    └─ Association receives R20
//    └─ Marshall receives (agreed %) of R20
//    └─ Association keeps (100% - marshall%) of R20
// 5. Monthly: R250 rental per device → Investor

export type LevyAccountType =
  | "passenger"
  | "driver"
  | "investor"
  | "association"
  | "marshall"
  | "vms_platform"
  | "taxi_owner";

export type LevyTxnType =
  | "tap_fare"           // passenger pays fare
  | "tap_fee_passenger"  // R0.50 from passenger
  | "tap_fee_driver"     // R0.50 from driver
  | "investor_tap"       // R0.10 to investor per tap
  | "vms_platform_tap"   // R0.90 to VMS
  | "trip_levy"          // R20 from driver → association
  | "marshall_share"     // % of levy → marshall
  | "device_rental"      // R250/month → investor
  | "refund"
  | "adjustment";

export interface LevyAccount {
  id: string;
  type: LevyAccountType;
  ownerId: string;
  ownerName: string;
  balance: number;         // current ZAR balance
  totalIn: number;         // lifetime credits
  totalOut: number;        // lifetime debits
  currency: "ZAR";
  status: "active" | "suspended";
  createdAt: string;
  lastTransactionAt: string | null;
  metadata: Record<string, unknown>;
}

export interface AFCDevice {
  id: string;
  serialNumber: string;
  investorId: string;       // who owns this device (investor account)
  taxiOwnerId: string;      // who the device is installed in
  driverId: string;         // current driver using the device
  associationId: string;    // which taxi association this route belongs to
  marshallId: string;       // the marshall for this route
  routeId: string;
  monthlyRental: number;    // default R250
  rentalDueDate: string;
  status: "active" | "inactive" | "maintenance";
  installedAt: string;
  lastActiveAt: string | null;
  currentTripId: string | null;
  tapCount: number;         // total taps since installation
}

export interface AFCTap {
  id: string;
  deviceId: string;
  tripId: string;
  passengerId: string;
  passengerAccountId: string;
  driverId: string;
  driverAccountId: string;
  investorAccountId: string;
  associationAccountId: string;
  routeId: string;
  routeName: string;
  fareAmount: number;          // e.g. 14.00
  // Deductions from passenger
  passengerTapFee: number;     // 0.50
  passengerTotal: number;      // fare + 0.50
  // Deductions from driver
  driverTapFee: number;        // 0.50
  driverNet: number;           // fare - 0.50
  // VMS earnings
  vmsFee: number;              // 1.00 (sum of both fees)
  investorShare: number;       // 0.10 (10% of vmsFee)
  vmsPlatformShare: number;    // 0.90
  paymentPath: "offline" | "online_fast" | "online_network";
  authCode: string;
  processingMs: number;
  timestamp: string;
  settled: boolean;
}

export interface AFCTrip {
  id: string;
  deviceId: string;
  driverId: string;
  driverAccountId: string;
  associationId: string;
  associationAccountId: string;
  marshallId: string;
  marshallAccountId: string;
  marshallPercentage: number;  // e.g. 10 (10%)
  routeId: string;
  routeName: string;
  startedAt: string;
  endedAt: string | null;
  tapCount: number;
  grossFare: number;           // total fare collected
  tripLevy: number;            // 20.00 deducted from driver
  associationShare: number;    // levy × (1 - marshallPct/100)
  marshallShare: number;       // levy × (marshallPct/100)
  driverLevyDeducted: boolean;
  status: "active" | "completed" | "voided";
}

export interface AssociationMarshallAgreement {
  id: string;
  associationId: string;
  associationName: string;
  marshallId: string;
  marshallName: string;
  marshallPercentage: number;   // % of R20 levy that goes to marshall
  effectiveFrom: string;
  approvedBy: string;
  status: "active" | "pending" | "terminated";
  notes: string;
}

export interface LevyTransaction {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  type: LevyTxnType;
  referenceId: string;    // tapId or tripId or rentalId
  description: string;
  timestamp: string;
  balanceAfter: number;   // balance of toAccount after this txn
}

export interface MonthlyRentalBilling {
  id: string;
  deviceId: string;
  investorAccountId: string;
  taxiOwnerAccountId: string;
  amount: number;          // 250.00
  billingPeriod: string;   // "2024-06"
  status: "pending" | "paid" | "overdue";
  dueDate: string;
  paidAt: string | null;
}

export interface RevenueSnapshot {
  timestamp: string;
  totalTapsToday: number;
  totalFareToday: number;
  totalVmsEarningsToday: number;
  totalInvestorEarningsToday: number;
  totalLeviesCollectedToday: number;
  totalMarshallPaymentsToday: number;
  totalRentalsThisMonth: number;
  activeDevices: number;
  activeDrivers: number;
  activePassengers: number;
}
