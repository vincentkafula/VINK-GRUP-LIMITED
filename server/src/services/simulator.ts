import { db, getCurrentKpi } from "../data/store.js";
import { v4 as uuid } from "uuid";
import type { WsEvent, SystemAlert } from "../types/mvno.js";

type BroadcastFn = (event: WsEvent) => void;

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randF = (min: number, max: number) => +(Math.random() * (max - min) + min).toFixed(2);

export function startSimulator(broadcast: BroadcastFn): () => void {
  const intervals: NodeJS.Timeout[] = [];

  // ── KPI pulse every 5 seconds ─────────────────────────────────────────────
  intervals.push(setInterval(() => {
    // Drift tower loads
    db.towers.forEach(t => {
      t.loadPercent = Math.max(5, Math.min(99, t.loadPercent + rand(-3, 3)));
      t.uplinkMbps = Math.max(10, t.uplinkMbps + randF(-20, 20));
      t.downlinkMbps = Math.max(50, t.downlinkMbps + randF(-50, 50));
      t.lastHeartbeat = new Date().toISOString();
    });

    // Drift data session throughput
    db.dataSessions.forEach(s => {
      s.uplinkKbps = Math.max(10, s.uplinkKbps + rand(-500, 500));
      s.downlinkKbps = Math.max(50, s.downlinkKbps + rand(-2000, 2000));
      s.bytesUpload += rand(0, 51200);
      s.bytesDownload += rand(0, 204800);
    });

    // Drift call durations
    db.calls.filter(c => c.status === "connected").forEach(c => {
      c.durationSec += 5;
    });

    broadcast({ event: "kpi_update", timestamp: new Date().toISOString(), data: getCurrentKpi() });
  }, 5000));

  // ── New subscriber activations every 20 seconds ──────────────────────────
  intervals.push(setInterval(() => {
    const base = db.subscribers.length + 1000000;
    db.subscribers.push({
      id: uuid(),
      msisdn: `+2782${String(base).padStart(7, "0")}`,
      imsi: `65501${String(base).padStart(10, "0")}`,
      imei: `35${rand(100000000, 999999999)}${rand(0, 9)}`,
      status: "active",
      plan: ["Prepaid 5GB", "Postpaid 20GB"][rand(0, 1)],
      dataBalanceMB: rand(1024, 10240),
      smsBalance: rand(50, 200),
      voiceBalanceMin: rand(100, 500),
      homeNetwork: "ZA-VINK",
      currentCell: `TOWER-${String(rand(1, 120)).padStart(4, "0")}`,
      roaming: false,
      roamingNetwork: null,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });

    broadcast({
      event: "subscriber_update",
      timestamp: new Date().toISOString(),
      data: { action: "new_activation", total: db.subscribers.length },
    });
  }, 20000));

  // ── Fraud detection events every 30 seconds ──────────────────────────────
  intervals.push(setInterval(() => {
    if (Math.random() > 0.6) return; // 40% chance per tick

    const fraudTypes = ["cloning", "roaming_abuse", "premium_rate", "sim_swap", "dos", "bypass"] as const;
    const descriptions = [
      "Duplicate IMSI detected on multiple cells simultaneously",
      "Abnormal roaming data spike — 50× baseline volume",
      "Premium-rate call pattern outside subscriber profile",
      "SIM swap without two-factor verification",
      "Registration flood attack from single device",
      "CLI spoofing detected on international leg",
    ];
    const idx = rand(0, 5);
    const alert = {
      id: uuid(),
      imsi: `65501${String(rand(0, 9999999999)).padStart(10, "0")}`,
      msisdn: `+2782${String(rand(1000000, 9999999)).padStart(7, "0")}`,
      type: fraudTypes[idx],
      severity: (rand(0, 3) === 0 ? "critical" : "warning") as "critical" | "warning",
      description: descriptions[idx],
      detectedAt: new Date().toISOString(),
      resolvedAt: null,
      blocked: Math.random() > 0.4,
      riskScore: randF(4.5, 9.8),
    };
    db.fraudAlerts.push(alert);
    broadcast({ event: "fraud_detected", timestamp: new Date().toISOString(), data: alert });
  }, 30000));

  // ── System alert mutations every 45 seconds ──────────────────────────────
  intervals.push(setInterval(() => {
    const r = Math.random();

    if (r < 0.3) {
      // New alert
      const components = ["Packet Core", "HLR/HSS", "SMSC", "MSC", "Cell Tower", "Billing", "Roaming GW"];
      const messages = [
        "CPU usage exceeded 80% threshold",
        "Memory utilisation at 78%",
        "Increased signalling latency detected",
        "Database sync lag > 2 seconds",
        "Interface TX errors above threshold",
      ];
      const newAlert: SystemAlert = {
        id: uuid(),
        component: components[rand(0, components.length - 1)],
        title: "Threshold Exceeded",
        message: messages[rand(0, messages.length - 1)],
        severity: (["info", "warning", "critical"][rand(0, 2)]) as SystemAlert["severity"],
        createdAt: new Date().toISOString(),
        acknowledgedAt: null,
        resolvedAt: null,
        acknowledgedBy: null,
      };
      db.alerts.unshift(newAlert);
      if (db.alerts.length > 100) db.alerts.pop();
      broadcast({ event: "new_alert", timestamp: new Date().toISOString(), data: newAlert });

    } else if (r < 0.55) {
      // Resolve an existing alert
      const unresolved = db.alerts.filter(a => !a.resolvedAt);
      if (unresolved.length > 0) {
        const target = unresolved[rand(0, unresolved.length - 1)];
        target.resolvedAt = new Date().toISOString();
        target.severity = "resolved";
        broadcast({ event: "alert_resolved", timestamp: new Date().toISOString(), data: target });
      }
    }

    // Occasionally flip a tower status
    if (Math.random() < 0.15) {
      const tower = db.towers[rand(0, db.towers.length - 1)];
      const prev = tower.status;
      tower.status = (["online", "online", "online", "warning", "offline"][rand(0, 4)]) as typeof tower.status;
      if (tower.status !== prev) {
        broadcast({
          event: "tower_status_change",
          timestamp: new Date().toISOString(),
          data: { towerId: tower.id, name: tower.name, from: prev, to: tower.status },
        });
      }
    }
  }, 45000));

  // ── SMS stats broadcast every 15 seconds ─────────────────────────────────
  intervals.push(setInterval(() => {
    const delivered = db.smsMessages.filter(s => s.status === "delivered").length;
    const queued = db.smsMessages.filter(s => s.status === "queued").length;
    const failed = db.smsMessages.filter(s => s.status === "failed").length;
    broadcast({
      event: "sms_stats",
      timestamp: new Date().toISOString(),
      data: { total: db.smsMessages.length, delivered, queued, failed, deliveryRate: +((delivered / db.smsMessages.length) * 100).toFixed(2) },
    });
  }, 15000));

  // ── Billing event every 10 seconds ───────────────────────────────────────
  intervals.push(setInterval(() => {
    const cdr = {
      id: uuid(),
      msisdn: `+2782${String(rand(1000000, 9999999)).padStart(7, "0")}`,
      type: (["voice", "data", "sms", "roaming"][rand(0, 3)]) as "voice" | "data" | "sms" | "roaming",
      startedAt: new Date().toISOString(),
      durationSec: rand(30, 600),
      dataBytes: rand(0, 10485760),
      chargeAmount: randF(0.5, 25),
      currency: "ZAR",
      taxAmount: randF(0.07, 3.75),
      planRated: Math.random() > 0.3,
    };
    db.cdrs.unshift(cdr);
    if (db.cdrs.length > 1000) db.cdrs.pop();
    broadcast({ event: "billing_event", timestamp: new Date().toISOString(), data: cdr });
  }, 10000));

  return () => intervals.forEach(clearInterval);
}
