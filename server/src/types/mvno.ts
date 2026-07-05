// ─── Core Enums ─────────────────────────────────────────────────────────────

export type NodeStatus = "online" | "warning" | "offline";
export type SubscriberStatus = "active" | "suspended" | "terminated" | "porting";
export type SimType = "physical" | "esim" | "soft-sim";
export type CallStatus = "connected" | "ringing" | "held" | "failed";
export type AlertSeverity = "critical" | "warning" | "info" | "resolved";
export type TicketStatus = "open" | "in-progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type FraudType = "cloning" | "roaming_abuse" | "premium_rate" | "sim_swap" | "dos" | "bypass";
export type BillingStatus = "paid" | "pending" | "overdue" | "disputed";
export type RoamingStatus = "active" | "inactive" | "restricted";

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  role: "superadmin" | "noc_engineer" | "billing_admin" | "support_agent" | "readonly";
  name: string;
  email: string;
  lastLogin: string | null;
  createdAt: string;
}

export interface AuthPayload {
  userId: string;
  username: string;
  role: AdminUser["role"];
}

// ─── Subscribers / HLR-HSS ──────────────────────────────────────────────────

export interface Subscriber {
  id: string;
  msisdn: string;          // phone number e.g. +27821234567
  imsi: string;            // 15-digit unique SIM identity
  imei: string | null;     // device IMEI
  status: SubscriberStatus;
  plan: string;            // e.g. "Prepaid 5GB", "Postpaid 20GB"
  dataBalanceMB: number;
  smsBalance: number;
  voiceBalanceMin: number;
  homeNetwork: string;     // e.g. "ZA-VINK"
  currentCell: string | null; // cell tower ID currently served
  roaming: boolean;
  roamingNetwork: string | null;
  createdAt: string;
  lastSeen: string;
}

// ─── Cell Towers / RAN ──────────────────────────────────────────────────────

export interface CellTower {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  technology: "2G" | "3G" | "4G" | "5G";
  status: NodeStatus;
  connectedSubscribers: number;
  loadPercent: number;
  uplinkMbps: number;
  downlinkMbps: number;
  lastHeartbeat: string;
}

// ─── Active Calls / MSC ─────────────────────────────────────────────────────

export interface ActiveCall {
  id: string;
  callerMsisdn: string;
  calleeMsisdn: string;
  status: CallStatus;
  startedAt: string;
  durationSec: number;
  cellTowerId: string;
  codec: string;
  encrypted: boolean;
}

// ─── Data Sessions / Packet Core ────────────────────────────────────────────

export interface DataSession {
  id: string;
  imsi: string;
  msisdn: string;
  apn: string;
  ipv4: string;
  uplinkKbps: number;
  downlinkKbps: number;
  startedAt: string;
  bytesUpload: number;
  bytesDownload: number;
  rat: "4G" | "5G" | "3G";    // Radio access technology
}

// ─── SMS / SMSC ─────────────────────────────────────────────────────────────

export interface SmsMessage {
  id: string;
  senderMsisdn: string;
  recipientMsisdn: string;
  status: "queued" | "delivered" | "failed" | "expired";
  submittedAt: string;
  deliveredAt: string | null;
  messageLength: number;
  encoding: "GSM7" | "UCS2";
  retryCount: number;
}

// ─── Billing / OSS-BSS ──────────────────────────────────────────────────────

export interface CallDetailRecord {
  id: string;
  msisdn: string;
  type: "voice" | "data" | "sms" | "roaming" | "international";
  startedAt: string;
  durationSec: number;
  dataBytes: number;
  chargeAmount: number;
  currency: string;
  taxAmount: number;
  planRated: boolean;    // was this covered by plan allowance
}

export interface Invoice {
  id: string;
  msisdn: string;
  subscriberId: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  taxAmount: number;
  currency: string;
  status: BillingStatus;
  lineItems: { description: string; amount: number }[];
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
}

// ─── Fraud / Security ───────────────────────────────────────────────────────

export interface FraudAlert {
  id: string;
  imsi: string;
  msisdn: string;
  type: FraudType;
  severity: AlertSeverity;
  description: string;
  detectedAt: string;
  resolvedAt: string | null;
  blocked: boolean;
  riskScore: number;   // 0-10
}

export interface LawfulInterceptRecord {
  id: string;
  targetMsisdn: string;
  warrantId: string;
  issuingAuthority: string;
  startDate: string;
  endDate: string;
  active: boolean;
  type: "voice" | "data" | "sms" | "all";
}

// ─── SIM Provisioning ───────────────────────────────────────────────────────

export interface SimCard {
  id: string;
  iccid: string;        // 19-20 digit SIM serial
  imsi: string;
  msisdn: string | null;
  type: SimType;
  status: "unallocated" | "allocated" | "active" | "suspended" | "destroyed";
  subscriberId: string | null;
  activatedAt: string | null;
  batchId: string;
  createdAt: string;
}

export interface PortingRequest {
  id: string;
  msisdn: string;
  donorNetwork: string;
  recipientNetwork: string;
  status: "pending" | "in_progress" | "completed" | "rejected";
  requestedAt: string;
  completedAt: string | null;
  rejectionReason: string | null;
}

// ─── Customer Support ────────────────────────────────────────────────────────

export interface SupportTicket {
  id: string;
  subscriberId: string;
  msisdn: string;
  category: "billing" | "technical" | "porting" | "activation" | "roaming" | "fraud" | "general";
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedAgent: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  csatScore: number | null;   // 1-5
}

// ─── Roaming & Interconnects ─────────────────────────────────────────────────

export interface RoamingPartner {
  id: string;
  networkName: string;
  mcc: string;       // Mobile Country Code
  mnc: string;       // Mobile Network Code
  country: string;
  status: RoamingStatus;
  agreementType: "bilateral" | "unilateral" | "hub";
  activeRoamers: number;
  revenue30dUSD: number;
}

export interface CarrierRoute {
  id: string;
  destination: string;  // e.g. "ZA", "US", "GB"
  carrier: string;
  routeType: "on-net" | "off-net" | "international";
  status: NodeStatus;
  asr: number;          // Answer Seizure Ratio %
  acd: number;          // Average Call Duration sec
  pdd: number;          // Post Dial Delay ms
  ratePerMin: number;
  currency: string;
}

// ─── System Alerts ──────────────────────────────────────────────────────────

export interface SystemAlert {
  id: string;
  component: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  acknowledgedBy: string | null;
}

// ─── KPI Snapshot ────────────────────────────────────────────────────────────

export interface KpiSnapshot {
  timestamp: string;
  totalSubscribers: number;
  activeSubscribers: number;
  networkUptimePct: number;
  activeDataSessions: number;
  activeVoiceCalls: number;
  smsQueueDepth: number;
  revenueToday: number;
  fraudAlertsActive: number;
  avgNetworkLoadPct: number;
  totalTowerCount: number;
  towersOnline: number;
  activeSims: number;
  openTickets: number;
  roamingUsers: number;
  dataThroughputGbps: number;
}

// ─── WebSocket Events ────────────────────────────────────────────────────────

export type WsEventType =
  | "kpi_update"
  | "new_alert"
  | "alert_resolved"
  | "subscriber_update"
  | "call_update"
  | "data_session_update"
  | "fraud_detected"
  | "tower_status_change"
  | "sms_stats"
  | "billing_event";

export interface WsEvent<T = unknown> {
  event: WsEventType;
  timestamp: string;
  data: T;
}
