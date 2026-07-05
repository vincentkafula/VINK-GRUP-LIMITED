import { v4 as uuid } from "uuid";
import type { AFCDevice, AFCRoute, FareTap, DriverWallet, TaxiAssociation, AFCKpi } from "../types/afc.js";

// ─── Routes ───────────────────────────────────────────────────────────────────
export const afcRoutes: AFCRoute[] = [
  { id: "r01", name: "Khayelitsha → Cape Town CBD",       type: "urban",     origin: "Khayelitsha",     destination: "Cape Town CBD",       standardFare: 14.00, peakFare: 16.00, offPeakFare: 12.00, distanceKm: 28, estimatedMinutes: 45, activeDevices: 0, operatingHours: "05:00 – 22:00", region: "Western Cape" },
  { id: "r02", name: "Mitchell's Plain → Bellville",      type: "urban",     origin: "Mitchell's Plain", destination: "Bellville",           standardFare: 11.50, peakFare: 13.00, offPeakFare: 10.00, distanceKm: 18, estimatedMinutes: 35, activeDevices: 0, operatingHours: "05:30 – 21:00", region: "Western Cape" },
  { id: "r03", name: "Gugulethu → Claremont",             type: "urban",     origin: "Gugulethu",       destination: "Claremont",           standardFare: 13.00, peakFare: 15.00, offPeakFare: 11.00, distanceKm: 14, estimatedMinutes: 30, activeDevices: 0, operatingHours: "05:30 – 21:30", region: "Western Cape" },
  { id: "r04", name: "Langa → Observatory",               type: "urban",     origin: "Langa",           destination: "Observatory",         standardFare: 10.00, peakFare: 12.00, offPeakFare: 9.00,  distanceKm: 12, estimatedMinutes: 25, activeDevices: 0, operatingHours: "06:00 – 20:00", region: "Western Cape" },
  { id: "r05", name: "Nyanga → Wynberg",                  type: "urban",     origin: "Nyanga",          destination: "Wynberg",             standardFare: 12.50, peakFare: 14.00, offPeakFare: 11.00, distanceKm: 10, estimatedMinutes: 22, activeDevices: 0, operatingHours: "05:30 – 22:00", region: "Western Cape" },
  { id: "r06", name: "Soweto → Johannesburg CBD",         type: "urban",     origin: "Soweto",          destination: "Johannesburg CBD",     standardFare: 16.00, peakFare: 18.00, offPeakFare: 14.00, distanceKm: 22, estimatedMinutes: 40, activeDevices: 0, operatingHours: "04:30 – 23:00", region: "Gauteng" },
  { id: "r07", name: "Cape Town → Stellenbosch",          type: "intercity", origin: "Cape Town",       destination: "Stellenbosch",        standardFare: 45.00, peakFare: 50.00, offPeakFare: 40.00, distanceKm: 52, estimatedMinutes: 60, activeDevices: 0, operatingHours: "06:00 – 20:00", region: "Western Cape" },
  { id: "r08", name: "Lusaka → Kitwe",                   type: "intercity", origin: "Lusaka",          destination: "Kitwe",               standardFare: 95.00, peakFare: 110.00,offPeakFare: 85.00, distanceKm: 320, estimatedMinutes: 240, activeDevices: 0, operatingHours: "06:00 – 18:00", region: "Zambia" },
];

// ─── Taxi Associations ─────────────────────────────────────────────────────────
export const taxiAssociations: TaxiAssociation[] = [
  { id: "ta01", name: "Cape Amalgamated Taxi Association (CATA)", region: "Western Cape", totalDevices: 0, activeDevices: 0, totalDrivers: 0, balance: 284_500, monthlyRevenue: 94_200, routeIds: ["r01","r02","r03","r04","r05"] },
  { id: "ta02", name: "Johannesburg Metro Taxi Council (JMTC)",    region: "Gauteng",      totalDevices: 0, activeDevices: 0, totalDrivers: 0, balance: 512_800, monthlyRevenue: 188_400, routeIds: ["r06"] },
  { id: "ta03", name: "Zambia Road Transport Association (ZRTA)",  region: "Zambia",       totalDevices: 0, activeDevices: 0, totalDrivers: 0, balance: 48_200,  monthlyRevenue: 18_900,  routeIds: ["r08"] },
];

// ─── Driver Wallets ────────────────────────────────────────────────────────────
export const driverWallets: DriverWallet[] = [
  { driverId: "drv-001", referenceNumber: "VMS-DRV-2024-00001", driverName: "Sipho Dlamini",    balance: 4_284.50, pendingBalance: 847.50,  todayEarnings: 847.50,   weekEarnings: 4_284.50,   monthEarnings: 18_420.00, totalTaps: 2847, lastTapAt: new Date(Date.now() - 180000).toISOString(), linkedBankAccount: "Standard Bank ****4291", autoPayoutEnabled: true,  payoutThreshold: 5000 },
  { driverId: "drv-002", referenceNumber: "VMS-DRV-2024-00002", driverName: "Thabo Nkosi",      balance: 2_142.00, pendingBalance: 482.00,  todayEarnings: 482.00,   weekEarnings: 2_142.00,   monthEarnings: 9_840.00,  totalTaps: 1423, lastTapAt: new Date(Date.now() - 600000).toISOString(), linkedBankAccount: "Nedbank ****8834",        autoPayoutEnabled: false, payoutThreshold: 3000 },
  { driverId: "drv-003", referenceNumber: "VMS-DRV-2024-00003", driverName: "Priya Naidoo",     balance: 3_890.00, pendingBalance: 0,        todayEarnings: 624.00,   weekEarnings: 3_890.00,   monthEarnings: 14_200.00, totalTaps: 2241, lastTapAt: new Date(Date.now() - 900000).toISOString(), linkedBankAccount: "FNB ****3317",            autoPayoutEnabled: true,  payoutThreshold: 4000 },
  { driverId: "drv-004", referenceNumber: "VMS-DRV-2024-00004", driverName: "James van Berg",   balance: 1_247.50, pendingBalance: 247.50,  todayEarnings: 247.50,   weekEarnings: 1_247.50,   monthEarnings: 5_840.00,  totalTaps: 892,  lastTapAt: new Date(Date.now() - 3600000).toISOString(),linkedBankAccount: null,                      autoPayoutEnabled: false, payoutThreshold: 2000 },
  { driverId: "drv-005", referenceNumber: "VMS-DRV-2024-00005", driverName: "Lindiwe Mokoena",  balance: 5_124.00, pendingBalance: 624.00,  todayEarnings: 988.00,   weekEarnings: 5_124.00,   monthEarnings: 22_840.00, totalTaps: 3421, lastTapAt: new Date(Date.now() - 120000).toISOString(), linkedBankAccount: "Absa ****7751",           autoPayoutEnabled: true,  payoutThreshold: 5000 },
];

// ─── AFC Devices ──────────────────────────────────────────────────────────────
export const afcDevices: AFCDevice[] = [
  { id: "dev-001", referenceNumber: "AFC-CPT-00847", serialNumber: "VMS2024SN00847", driverId: "drv-001", driverName: "Sipho Dlamini",   driverWalletRef: "VMS-DRV-2024-00001", taxiRegistration: "CA 847-891", taxiMake: "Toyota HiAce 14-seater", taxiCapacity: 14, routeId: "r01", routeName: "Khayelitsha → Cape Town CBD",   fareAmount: 14.00, status: "online",  wifiEnabled: true,  lastPingAt: new Date().toISOString(),                           installedAt: "2024-01-15T08:00:00Z", firmwareVersion: "AFC v3.2.1", batteryLevel: 92, signalStrength: 4, totalTransactionsAllTime: 2847, totalRevenueAllTime: 39_858, todayTransactions: 28, todayRevenue: 392.00, associationId: "ta01", associationName: "CATA", gpsLat: -33.9249, gpsLng: 18.4241, currentPassengerCount: 11 },
  { id: "dev-002", referenceNumber: "AFC-CPT-00312", serialNumber: "VMS2024SN00312", driverId: "drv-002", driverName: "Thabo Nkosi",     driverWalletRef: "VMS-DRV-2024-00002", taxiRegistration: "CA 312-554", taxiMake: "Toyota HiAce 14-seater", taxiCapacity: 14, routeId: "r02", routeName: "Mitchell's Plain → Bellville",   fareAmount: 11.50, status: "online",  wifiEnabled: true,  lastPingAt: new Date(Date.now() - 15000).toISOString(),          installedAt: "2024-02-01T08:00:00Z", firmwareVersion: "AFC v3.2.1", batteryLevel: 78, signalStrength: 3, totalTransactionsAllTime: 1423, totalRevenueAllTime: 16_364, todayTransactions: 18, todayRevenue: 207.00, associationId: "ta01", associationName: "CATA", gpsLat: -33.9898, gpsLng: 18.5672, currentPassengerCount: 8 },
  { id: "dev-003", referenceNumber: "AFC-CPT-00991", serialNumber: "VMS2024SN00991", driverId: "drv-003", driverName: "Priya Naidoo",    driverWalletRef: "VMS-DRV-2024-00003", taxiRegistration: "CA 991-223", taxiMake: "Quantum 15-seater",      taxiCapacity: 15, routeId: "r03", routeName: "Gugulethu → Claremont",       fareAmount: 13.00, status: "online",  wifiEnabled: true,  lastPingAt: new Date(Date.now() - 30000).toISOString(),          installedAt: "2024-02-15T08:00:00Z", firmwareVersion: "AFC v3.2.0", batteryLevel: 65, signalStrength: 4, totalTransactionsAllTime: 2241, totalRevenueAllTime: 29_133, todayTransactions: 22, todayRevenue: 286.00, associationId: "ta01", associationName: "CATA", gpsLat: -33.9748, gpsLng: 18.5234, currentPassengerCount: 13 },
  { id: "dev-004", referenceNumber: "AFC-CPT-00445", serialNumber: "VMS2024SN00445", driverId: "drv-004", driverName: "James van Berg",  driverWalletRef: "VMS-DRV-2024-00004", taxiRegistration: "CA 445-881", taxiMake: "Toyota HiAce 14-seater", taxiCapacity: 14, routeId: "r04", routeName: "Langa → Observatory",          fareAmount: 10.00, status: "offline", wifiEnabled: false, lastPingAt: new Date(Date.now() - 3600000).toISOString(),        installedAt: "2024-03-01T08:00:00Z", firmwareVersion: "AFC v3.1.5", batteryLevel: 23, signalStrength: 0, totalTransactionsAllTime: 892,  totalRevenueAllTime: 8_920,  todayTransactions: 0,  todayRevenue: 0,      associationId: "ta01", associationName: "CATA", gpsLat: -33.9283, gpsLng: 18.4742, currentPassengerCount: 0 },
  { id: "dev-005", referenceNumber: "AFC-CPT-00772", serialNumber: "VMS2024SN00772", driverId: "drv-005", driverName: "Lindiwe Mokoena", driverWalletRef: "VMS-DRV-2024-00005", taxiRegistration: "CA 772-339", taxiMake: "Quantum 15-seater",      taxiCapacity: 15, routeId: "r05", routeName: "Nyanga → Wynberg",            fareAmount: 12.50, status: "online",  wifiEnabled: true,  lastPingAt: new Date(Date.now() - 5000).toISOString(),           installedAt: "2024-03-15T08:00:00Z", firmwareVersion: "AFC v3.2.1", batteryLevel: 88, signalStrength: 4, totalTransactionsAllTime: 3421, totalRevenueAllTime: 42_762, todayTransactions: 35, todayRevenue: 437.50, associationId: "ta01", associationName: "CATA", gpsLat: -34.0123, gpsLng: 18.4932, currentPassengerCount: 14 },
  { id: "dev-006", referenceNumber: "AFC-JHB-01284", serialNumber: "VMS2024SN01284", driverId: "drv-001", driverName: "Bongani Zulu",    driverWalletRef: "VMS-DRV-2024-00006", taxiRegistration: "GP 284-11",  taxiMake: "Toyota HiAce 14-seater", taxiCapacity: 14, routeId: "r06", routeName: "Soweto → Johannesburg CBD",    fareAmount: 16.00, status: "online",  wifiEnabled: true,  lastPingAt: new Date(Date.now() - 8000).toISOString(),           installedAt: "2024-04-01T08:00:00Z", firmwareVersion: "AFC v3.2.1", batteryLevel: 95, signalStrength: 3, totalTransactionsAllTime: 1842, totalRevenueAllTime: 29_472, todayTransactions: 31, todayRevenue: 496.00, associationId: "ta02", associationName: "JMTC", gpsLat: -26.2041, gpsLng: 28.0473, currentPassengerCount: 12 },
];

// Update route active device counts
afcRoutes.forEach(route => { route.activeDevices = afcDevices.filter(d => d.routeId === route.id && d.status === "online").length; });
taxiAssociations.forEach(assoc => { assoc.totalDevices = afcDevices.filter(d => d.associationId === assoc.id).length; assoc.activeDevices = afcDevices.filter(d => d.associationId === assoc.id && d.status === "online").length; assoc.totalDrivers = new Set(afcDevices.filter(d => d.associationId === assoc.id).map(d => d.driverId)).size; });

// ─── Fare Tap History ─────────────────────────────────────────────────────────
const mkTap = (deviceId: string, result: FareTap["result"] = "approved"): FareTap => {
  const dev = afcDevices.find(d => d.id === deviceId)!;
  const fare = dev?.fareAmount ?? 14;
  const fee = 0.50;
  const driverCut = +(fare * 0.85).toFixed(2);
  const assocCut  = +(fare * 0.05).toFixed(2);
  const commCut   = +(fare * 0.05).toFixed(2);
  const bankCut   = +(fare * 0.05).toFixed(2);
  return {
    id: uuid(), deviceId, deviceRef: dev?.referenceNumber ?? "", driverId: dev?.driverId ?? "",
    driverWalletRef: dev?.driverWalletRef ?? "",
    passengerCardLast4: String(Math.floor(Math.random() * 9000 + 1000)),
    passengerName: null, routeId: dev?.routeId ?? "", routeName: dev?.routeName ?? "",
    fareAmount: fare, processingFee: fee, driverCredit: driverCut, associationCredit: assocCut,
    communityCredit: commCut, communityBankCredit: bankCut, result,
    processingMs: Math.floor(Math.random() * 1800 + 400),
    wifiSessionGranted: result === "approved" && (dev?.wifiEnabled ?? false),
    createdAt: new Date(Date.now() - Math.random() * 8 * 3600000).toISOString(),
  };
};

export const fareTaps: FareTap[] = [
  ...Array.from({ length: 12 }, () => mkTap("dev-001")),
  ...Array.from({ length: 8  }, () => mkTap("dev-002")),
  ...Array.from({ length: 10 }, () => mkTap("dev-003")),
  ...Array.from({ length: 14 }, () => mkTap("dev-005")),
  ...Array.from({ length: 13 }, () => mkTap("dev-006")),
  mkTap("dev-001", "declined"),
  mkTap("dev-002", "insufficient_funds"),
].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

// ─── Platform KPI ─────────────────────────────────────────────────────────────
export function getAfcKpi(): AFCKpi {
  const approved = fareTaps.filter(t => t.result === "approved");
  return {
    timestamp: new Date().toISOString(),
    totalDevices: afcDevices.length,
    onlineDevices: afcDevices.filter(d => d.status === "online").length,
    totalTapsToday: fareTaps.length,
    totalRevenueTodayZar: +approved.reduce((s, t) => s + t.fareAmount, 0).toFixed(2),
    avgProcessingMs: Math.round(approved.reduce((s, t) => s + t.processingMs, 0) / (approved.length || 1)),
    wifiSessionsToday: approved.filter(t => t.wifiSessionGranted).length,
    approvalRate: +((approved.length / fareTaps.length) * 100).toFixed(1),
    vmsInterchangeToday: +(approved.length * 0.50).toFixed(2),
    driverPayoutsToday: +approved.reduce((s, t) => s + t.driverCredit, 0).toFixed(2),
    communityFundToday: +approved.reduce((s, t) => s + t.communityCredit + t.communityBankCredit, 0).toFixed(2),
  };
}
