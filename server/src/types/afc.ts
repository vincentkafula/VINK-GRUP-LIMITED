// ─── AFC (Automatic Fare Collection) Device System ────────────────────────────

export type DeviceStatus  = "online" | "offline" | "maintenance" | "suspended";
export type TapResult     = "approved" | "declined" | "insufficient_funds" | "card_blocked" | "timeout";
export type RouteType     = "urban" | "intercity" | "rural" | "airport";

// ─── AFC Device ────────────────────────────────────────────────────────────────
export interface AFCDevice {
  id: string;
  referenceNumber: string;    // e.g. AFC-CPT-00847 — unique identifier for each device
  serialNumber: string;       // hardware serial
  driverId: string;           // registered driver
  driverName: string;
  driverWalletRef: string;    // driver's Vink reference number (receives fare payments)
  taxiRegistration: string;   // vehicle plate
  taxiMake: string;
  taxiCapacity: number;
  routeId: string;
  routeName: string;
  fareAmount: number;         // ZAR — standard fare for this route
  status: DeviceStatus;
  wifiEnabled: boolean;       // free passenger WiFi
  lastPingAt: string;
  installedAt: string;
  firmwareVersion: string;
  batteryLevel: number;       // percentage
  signalStrength: number;     // 0-4 bars
  totalTransactionsAllTime: number;
  totalRevenueAllTime: number;
  todayTransactions: number;
  todayRevenue: number;
  associationId: string;
  associationName: string;
  gpsLat: number;
  gpsLng: number;
  currentPassengerCount: number;
}

// ─── AFC Route ─────────────────────────────────────────────────────────────────
export interface AFCRoute {
  id: string;
  name: string;               // e.g. "Khayelitsha → Cape Town CBD"
  type: RouteType;
  origin: string;
  destination: string;
  standardFare: number;       // ZAR
  peakFare: number;
  offPeakFare: number;
  distanceKm: number;
  estimatedMinutes: number;
  activeDevices: number;      // how many AFC devices on this route
  operatingHours: string;     // e.g. "05:30 – 22:00"
  region: string;
}

// ─── Fare Tap Transaction ──────────────────────────────────────────────────────
export interface FareTap {
  id: string;
  deviceId: string;
  deviceRef: string;          // AFC device reference number
  driverId: string;
  driverWalletRef: string;
  passengerCardLast4: string;  // masked
  passengerName: string | null;
  routeId: string;
  routeName: string;
  fareAmount: number;
  processingFee: number;       // R0.50 — VMS fee
  driverCredit: number;        // 85% of fare
  associationCredit: number;   // 5% of fare
  communityCredit: number;     // 5% → neighbourhood watch
  communityBankCredit: number; // 5% → community bank fund
  result: TapResult;
  processingMs: number;        // how fast the tap was processed
  wifiSessionGranted: boolean; // did passenger get WiFi?
  createdAt: string;
}

// ─── Driver Wallet ─────────────────────────────────────────────────────────────
export interface DriverWallet {
  driverId: string;
  referenceNumber: string;
  driverName: string;
  balance: number;
  pendingBalance: number;
  todayEarnings: number;
  weekEarnings: number;
  monthEarnings: number;
  totalTaps: number;
  lastTapAt: string | null;
  linkedBankAccount: string | null;
  autoPayoutEnabled: boolean;
  payoutThreshold: number;
}

// ─── Taxi Association ──────────────────────────────────────────────────────────
export interface TaxiAssociation {
  id: string;
  name: string;
  region: string;
  totalDevices: number;
  activeDevices: number;
  totalDrivers: number;
  balance: number;           // accumulated 5% from all fares
  monthlyRevenue: number;
  routeIds: string[];
}

// ─── AFC Platform KPI ──────────────────────────────────────────────────────────
export interface AFCKpi {
  timestamp: string;
  totalDevices: number;
  onlineDevices: number;
  totalTapsToday: number;
  totalRevenueTodayZar: number;
  avgProcessingMs: number;
  wifiSessionsToday: number;
  approvalRate: number;       // percentage
  vmsInterchangeToday: number; // R0.50 × total taps
  driverPayoutsToday: number;
  communityFundToday: number;
}
