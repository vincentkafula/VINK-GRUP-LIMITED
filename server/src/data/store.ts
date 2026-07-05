import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import type {
  AdminUser, Subscriber, CellTower, ActiveCall, DataSession,
  SmsMessage, CallDetailRecord, Invoice, FraudAlert,
  LawfulInterceptRecord, SimCard, PortingRequest, SupportTicket,
  RoamingPartner, CarrierRoute, SystemAlert, KpiSnapshot,
} from "../types/mvno.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randF = (min: number, max: number) => +(Math.random() * (max - min) + min).toFixed(2);
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const msisdn = (i: number) => `+2782${String(i).padStart(7, "0")}`;
const imsi = (i: number) => `65501${String(i).padStart(10, "0")}`;

// ─── Seed Data ────────────────────────────────────────────────────────────────

export const db = {
  // Auth
  users: [
    {
      id: uuid(),
      username: "superadmin",
      passwordHash: bcrypt.hashSync("Admin@1234", 10),
      role: "superadmin" as const,
      name: "Super Administrator",
      email: "admin@vink.com",
      lastLogin: ago(30),
      createdAt: ago(43800),
    },
    {
      id: uuid(),
      username: "noc1",
      passwordHash: bcrypt.hashSync("Noc@5678", 10),
      role: "noc_engineer" as const,
      name: "NOC Engineer 1",
      email: "noc1@vink.com",
      lastLogin: ago(10),
      createdAt: ago(8760),
    },
    {
      id: uuid(),
      username: "billing1",
      passwordHash: bcrypt.hashSync("Bill@9012", 10),
      role: "billing_admin" as const,
      name: "Billing Admin",
      email: "billing@vink.com",
      lastLogin: ago(120),
      createdAt: ago(4380),
    },
  ] as AdminUser[],

  // Subscribers
  subscribers: Array.from({ length: 200 }, (_, i) => ({
    id: uuid(),
    msisdn: msisdn(i + 1000000),
    imsi: imsi(i),
    imei: `35${String(rand(100000000, 999999999)).padStart(9, "0")}${rand(0, 9)}`,
    status: (["active", "active", "active", "active", "suspended", "porting"][i % 6]) as Subscriber["status"],
    plan: ["Prepaid 1GB", "Prepaid 5GB", "Postpaid 20GB", "Postpaid Unlimited", "SIM Only 10GB"][i % 5],
    dataBalanceMB: rand(0, 20480),
    smsBalance: rand(0, 500),
    voiceBalanceMin: rand(0, 2000),
    homeNetwork: "ZA-VINK",
    currentCell: `TOWER-${String(rand(1, 120)).padStart(4, "0")}`,
    roaming: i % 15 === 0,
    roamingNetwork: i % 15 === 0 ? ["UK-O2", "US-TMOB", "DE-DT", "FR-ORAN"][i % 4] : null,
    createdAt: ago(rand(1440, 525600)),
    lastSeen: ago(rand(0, 60)),
  })) as Subscriber[],

  // Cell towers
  towers: Array.from({ length: 120 }, (_, i) => ({
    id: `TOWER-${String(i + 1).padStart(4, "0")}`,
    name: `Tower ${i + 1} - ${["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth", "Bloemfontein"][i % 6]}`,
    lat: randF(-34.0, -22.0),
    lng: randF(16.0, 33.0),
    region: ["Gauteng", "Western Cape", "KZN", "Limpopo", "Eastern Cape", "Free State"][i % 6],
    technology: (["4G", "4G", "4G", "5G", "3G"][i % 5]) as CellTower["technology"],
    status: (i % 30 === 0 ? "offline" : i % 8 === 0 ? "warning" : "online") as CellTower["status"],
    connectedSubscribers: rand(50, 800),
    loadPercent: rand(20, 95),
    uplinkMbps: randF(100, 1000),
    downlinkMbps: randF(500, 5000),
    lastHeartbeat: ago(rand(0, 2)),
  })) as CellTower[],

  // Active calls
  calls: Array.from({ length: 50 }, (_, i) => ({
    id: uuid(),
    callerMsisdn: msisdn(i + 1000000),
    calleeMsisdn: msisdn(i + 1100000),
    status: (["connected", "connected", "connected", "ringing", "held"][i % 5]) as ActiveCall["status"],
    startedAt: ago(rand(0, 60)),
    durationSec: rand(5, 3600),
    cellTowerId: `TOWER-${String(rand(1, 120)).padStart(4, "0")}`,
    codec: ["G711", "G722", "AMR-WB", "EVS"][i % 4],
    encrypted: i % 3 !== 0,
  })) as ActiveCall[],

  // Data sessions
  dataSessions: Array.from({ length: 80 }, (_, i) => ({
    id: uuid(),
    imsi: imsi(i),
    msisdn: msisdn(i + 1000000),
    apn: ["internet", "mms", "iot.vink.net", "enterprise.vink.net"][i % 4],
    ipv4: `10.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,
    uplinkKbps: rand(10, 50000),
    downlinkKbps: rand(50, 200000),
    startedAt: ago(rand(0, 480)),
    bytesUpload: rand(1024, 104857600),
    bytesDownload: rand(1024, 1073741824),
    rat: (["4G", "4G", "5G", "3G"][i % 4]) as DataSession["rat"],
  })) as DataSession[],

  // SMS messages
  smsMessages: Array.from({ length: 100 }, (_, i) => ({
    id: uuid(),
    senderMsisdn: msisdn(i + 1000000),
    recipientMsisdn: msisdn(i + 1100000),
    status: (["delivered", "delivered", "delivered", "queued", "failed"][i % 5]) as SmsMessage["status"],
    submittedAt: ago(rand(0, 120)),
    deliveredAt: i % 5 < 3 ? ago(rand(0, 60)) : null,
    messageLength: rand(10, 160),
    encoding: (i % 5 === 0 ? "UCS2" : "GSM7") as SmsMessage["encoding"],
    retryCount: i % 5 === 4 ? rand(1, 3) : 0,
  })) as SmsMessage[],

  // CDRs
  cdrs: Array.from({ length: 300 }, (_, i) => ({
    id: uuid(),
    msisdn: msisdn(i % 200 + 1000000),
    type: (["voice", "data", "sms", "roaming", "international"][i % 5]) as CallDetailRecord["type"],
    startedAt: ago(rand(0, 1440)),
    durationSec: rand(0, 3600),
    dataBytes: rand(0, 104857600),
    chargeAmount: randF(0, 50),
    currency: "ZAR",
    taxAmount: randF(0, 7.5),
    planRated: i % 3 !== 0,
  })) as CallDetailRecord[],

  // Invoices
  invoices: Array.from({ length: 50 }, (_, i) => ({
    id: uuid(),
    msisdn: msisdn(i + 1000000),
    subscriberId: uuid(),
    periodStart: ago(43200),
    periodEnd: ago(11520),
    totalAmount: randF(99, 999),
    taxAmount: randF(13, 150),
    currency: "ZAR",
    status: (["paid", "paid", "pending", "overdue", "disputed"][i % 5]) as Invoice["status"],
    lineItems: [
      { description: "Monthly Plan", amount: randF(79, 499) },
      { description: "Data Add-on", amount: randF(10, 100) },
      { description: "VAT (15%)", amount: randF(13, 90) },
    ],
    issuedAt: ago(rand(1440, 4320)),
    dueDate: ago(-1440 * 14),
    paidAt: i % 5 < 2 ? ago(rand(0, 1440)) : null,
  })) as Invoice[],

  // Fraud alerts
  fraudAlerts: Array.from({ length: 20 }, (_, i) => ({
    id: uuid(),
    imsi: imsi(i),
    msisdn: msisdn(i + 1000000),
    type: (["cloning", "roaming_abuse", "premium_rate", "sim_swap", "dos", "bypass"][i % 6]) as FraudAlert["type"],
    severity: (i % 4 === 0 ? "critical" : i % 3 === 0 ? "warning" : "info") as FraudAlert["severity"],
    description: [
      "Duplicate IMSI detected on multiple cells simultaneously",
      "Abnormal roaming usage spike — 40× normal volume",
      "Premium-rate calls outside subscriber plan profile",
      "SIM swap request without owner verification",
      "Flood of REGISTER messages from single device",
      "CLI spoofing detected on international termination",
    ][i % 6],
    detectedAt: ago(rand(0, 480)),
    resolvedAt: i % 4 === 0 ? ago(rand(0, 60)) : null,
    blocked: i % 2 === 0,
    riskScore: randF(3, 9.8),
  })) as FraudAlert[],

  // Lawful intercept
  interceptRecords: Array.from({ length: 4 }, (_, i) => ({
    id: uuid(),
    targetMsisdn: msisdn(i + 1050000),
    warrantId: `WARRANT-${2024000 + i}`,
    issuingAuthority: ["SAPS", "NPA", "SSA", "HAWKS"][i],
    startDate: ago(1440 * rand(1, 30)),
    endDate: ago(-1440 * rand(1, 90)),
    active: true,
    type: (["voice", "data", "sms", "all"][i]) as LawfulInterceptRecord["type"],
  })) as LawfulInterceptRecord[],

  // SIM cards
  simCards: Array.from({ length: 500 }, (_, i) => ({
    id: uuid(),
    iccid: `8927${String(i).padStart(15, "0")}`,
    imsi: imsi(i),
    msisdn: i < 200 ? msisdn(i + 1000000) : null,
    type: (i % 5 === 0 ? "esim" : "physical") as SimCard["type"],
    status: (["active", "active", "allocated", "unallocated", "suspended"][i % 5]) as SimCard["status"],
    subscriberId: i < 200 ? uuid() : null,
    activatedAt: i < 200 ? ago(rand(1440, 525600)) : null,
    batchId: `BATCH-2024-${String(Math.floor(i / 50)).padStart(3, "0")}`,
    createdAt: ago(rand(1440, 525600)),
  })) as SimCard[],

  // Porting requests
  portingRequests: Array.from({ length: 15 }, (_, i) => ({
    id: uuid(),
    msisdn: msisdn(i + 1200000),
    donorNetwork: ["MTN-ZA", "VODACOM-ZA", "CELL-C-ZA", "TELKOM-ZA"][i % 4],
    recipientNetwork: "ZA-VINK",
    status: (["completed", "in_progress", "pending", "rejected"][i % 4]) as PortingRequest["status"],
    requestedAt: ago(rand(60, 4320)),
    completedAt: i % 4 === 0 ? ago(rand(0, 120)) : null,
    rejectionReason: i % 4 === 3 ? "Outstanding balance on donor network" : null,
  })) as PortingRequest[],

  // Support tickets
  tickets: Array.from({ length: 60 }, (_, i) => ({
    id: uuid(),
    subscriberId: uuid(),
    msisdn: msisdn(i + 1000000),
    category: (["billing", "technical", "porting", "activation", "roaming", "fraud", "general"][i % 7]) as SupportTicket["category"],
    subject: [
      "Incorrect charge on invoice",
      "No data connectivity after recharge",
      "Port-in not completed after 24h",
      "SIM not activating",
      "Roaming not working in London",
      "Suspicious transactions on account",
      "Update contact details",
    ][i % 7],
    description: "Customer reported issue — investigation in progress.",
    status: (["open", "in-progress", "resolved", "closed"][i % 4]) as SupportTicket["status"],
    priority: (["low", "medium", "high", "urgent"][i % 4]) as SupportTicket["priority"],
    assignedAgent: i % 3 !== 0 ? `Agent-${rand(1, 15)}` : null,
    createdAt: ago(rand(10, 2880)),
    updatedAt: ago(rand(0, 60)),
    resolvedAt: i % 4 >= 2 ? ago(rand(0, 120)) : null,
    csatScore: i % 4 >= 2 ? rand(3, 5) : null,
  })) as SupportTicket[],

  // Roaming partners
  roamingPartners: [
    { id: uuid(), networkName: "UK-O2", mcc: "234", mnc: "10", country: "United Kingdom", status: "active" as const, agreementType: "bilateral" as const, activeRoamers: 820, revenue30dUSD: 14200 },
    { id: uuid(), networkName: "US-TMOBILE", mcc: "310", mnc: "260", country: "United States", status: "active" as const, agreementType: "bilateral" as const, activeRoamers: 640, revenue30dUSD: 22100 },
    { id: uuid(), networkName: "DE-DTAG", mcc: "262", mnc: "01", country: "Germany", status: "active" as const, agreementType: "hub" as const, activeRoamers: 310, revenue30dUSD: 8700 },
    { id: uuid(), networkName: "FR-ORANGE", mcc: "208", mnc: "01", country: "France", status: "active" as const, agreementType: "bilateral" as const, activeRoamers: 280, revenue30dUSD: 7400 },
    { id: uuid(), networkName: "AU-OPTUS", mcc: "505", mnc: "02", country: "Australia", status: "active" as const, agreementType: "bilateral" as const, activeRoamers: 190, revenue30dUSD: 5100 },
    { id: uuid(), networkName: "NG-MTN", mcc: "621", mnc: "30", country: "Nigeria", status: "inactive" as const, agreementType: "unilateral" as const, activeRoamers: 0, revenue30dUSD: 0 },
    { id: uuid(), networkName: "KE-SAFARICOM", mcc: "639", mnc: "02", country: "Kenya", status: "active" as const, agreementType: "bilateral" as const, activeRoamers: 420, revenue30dUSD: 9300 },
    { id: uuid(), networkName: "ZW-ECONET", mcc: "648", mnc: "01", country: "Zimbabwe", status: "restricted" as const, agreementType: "bilateral" as const, activeRoamers: 55, revenue30dUSD: 800 },
  ] as RoamingPartner[],

  // Carrier routes
  carrierRoutes: [
    { id: uuid(), destination: "ZA", carrier: "On-Net ZA-VINK", routeType: "on-net" as const, status: "online" as const, asr: 72.4, acd: 185, pdd: 280, ratePerMin: 0.00, currency: "ZAR" },
    { id: uuid(), destination: "GB", carrier: "BICS International", routeType: "international" as const, status: "online" as const, asr: 68.1, acd: 210, pdd: 320, ratePerMin: 0.85, currency: "ZAR" },
    { id: uuid(), destination: "US", carrier: "LUMEN Technologies", routeType: "international" as const, status: "online" as const, asr: 71.2, acd: 195, pdd: 340, ratePerMin: 0.92, currency: "ZAR" },
    { id: uuid(), destination: "CN", carrier: "China Telecom Global", routeType: "international" as const, status: "warning" as const, asr: 41.0, acd: 90, pdd: 580, ratePerMin: 1.20, currency: "ZAR" },
    { id: uuid(), destination: "MTN-ZA", carrier: "MTN South Africa", routeType: "off-net" as const, status: "online" as const, asr: 74.8, acd: 178, pdd: 290, ratePerMin: 0.45, currency: "ZAR" },
    { id: uuid(), destination: "VODACOM-ZA", carrier: "Vodacom South Africa", routeType: "off-net" as const, status: "online" as const, asr: 75.1, acd: 181, pdd: 285, ratePerMin: 0.45, currency: "ZAR" },
  ] as CarrierRoute[],

  // System alerts
  alerts: [
    { id: uuid(), component: "Packet Core", title: "High Load", message: "GGSN/PGW load at 81% — approaching capacity threshold", severity: "warning" as const, createdAt: ago(2), acknowledgedAt: null, resolvedAt: null, acknowledgedBy: null },
    { id: uuid(), component: "Fraud Engine", title: "New Fraud Cases", message: "3 new suspicious IMSIs flagged for SIM cloning", severity: "warning" as const, createdAt: ago(8), acknowledgedAt: null, resolvedAt: null, acknowledgedBy: null },
    { id: uuid(), component: "SMSC", title: "Queue Spike", message: "SMS delivery queue depth exceeded 200 messages", severity: "info" as const, createdAt: ago(14), acknowledgedAt: ago(12), resolvedAt: null, acknowledgedBy: "noc1" },
    { id: uuid(), component: "Cell Tower", title: "Tower Offline", message: "Tower TOWER-0031 has gone offline — investigating", severity: "critical" as const, createdAt: ago(35), acknowledgedAt: ago(30), resolvedAt: null, acknowledgedBy: "noc1" },
    { id: uuid(), component: "Billing", title: "CDR Batch Complete", message: "Rating batch #20240617-003 processed 34,200 CDRs", severity: "info" as const, createdAt: ago(31), acknowledgedAt: ago(30), resolvedAt: ago(29), acknowledgedBy: "billing1" },
    { id: uuid(), component: "Roaming", title: "ZW-ECONET Restricted", message: "Roaming agreement with ZW-ECONET placed under restriction", severity: "warning" as const, createdAt: ago(120), acknowledgedAt: ago(100), resolvedAt: null, acknowledgedBy: "superadmin" },
  ] as SystemAlert[],

  // KPI history (last 24 hours, one per hour)
  kpiHistory: Array.from({ length: 24 }, (_, i) => ({
    timestamp: ago((23 - i) * 60),
    totalSubscribers: 2401840 + rand(-50, 200),
    activeSubscribers: 1800000 + rand(-5000, 5000),
    networkUptimePct: 99.97 - randF(0, 0.05),
    activeDataSessions: 1248300 + rand(-20000, 30000),
    activeVoiceCalls: 48290 + rand(-2000, 3000),
    smsQueueDepth: rand(50, 400),
    revenueToday: 284120 + rand(-5000, 8000),
    fraudAlertsActive: rand(8, 18),
    avgNetworkLoadPct: 68 + rand(-5, 8),
    totalTowerCount: 120,
    towersOnline: 118 + (i > 12 ? 0 : rand(-1, 0)),
    activeSims: 2401840,
    openTickets: 1840 + rand(-50, 100),
    roamingUsers: 18400 + rand(-200, 300),
    dataThroughputGbps: randF(8.5, 14.8),
  })) as KpiSnapshot[],
};

// ─── Current KPI (live snapshot) ─────────────────────────────────────────────

export function getCurrentKpi(): KpiSnapshot {
  return {
    timestamp: new Date().toISOString(),
    totalSubscribers: 2401840,
    activeSubscribers: db.subscribers.filter(s => s.status === "active").length,
    networkUptimePct: 99.97,
    activeDataSessions: db.dataSessions.length,
    activeVoiceCalls: db.calls.filter(c => c.status === "connected").length,
    smsQueueDepth: db.smsMessages.filter(s => s.status === "queued").length,
    revenueToday: db.cdrs.reduce((sum, c) => sum + c.chargeAmount, 0),
    fraudAlertsActive: db.fraudAlerts.filter(f => !f.resolvedAt).length,
    avgNetworkLoadPct: Math.round(db.towers.reduce((s, t) => s + t.loadPercent, 0) / db.towers.length),
    totalTowerCount: db.towers.length,
    towersOnline: db.towers.filter(t => t.status === "online").length,
    activeSims: db.simCards.filter(s => s.status === "active").length,
    openTickets: db.tickets.filter(t => t.status === "open" || t.status === "in-progress").length,
    roamingUsers: db.subscribers.filter(s => s.roaming).length,
    dataThroughputGbps: +((db.dataSessions.reduce((s, d) => s + d.downlinkKbps, 0) / 1_000_000)).toFixed(2),
  };
}
