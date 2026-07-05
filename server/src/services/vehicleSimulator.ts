import { vehicleDb, getFleetSnapshot } from "../data/vehicleStore.js";
import { v4 as uuid } from "uuid";
import type { VehicleAlert, VehicleWsMessage } from "../types/vehicles.js";

type BroadcastFn = (msg: VehicleWsMessage) => void;

const randF = (min: number, max: number) => +(Math.random() * (max - min) + min).toFixed(6);
const rand  = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export function startVehicleSimulator(broadcast: BroadcastFn): () => void {
  const intervals: NodeJS.Timeout[] = [];

  // ── Move vehicles every 3 seconds ────────────────────────────────────────
  intervals.push(setInterval(() => {
    const moving = vehicleDb.vehicles.filter(v => v.status === "moving");

    moving.forEach(v => {
      // Drift position in direction of heading
      const headingRad = (v.position.heading * Math.PI) / 180;
      const stepDeg    = 0.0005 + Math.random() * 0.001;
      v.position.lat   = +(v.position.lat + Math.cos(headingRad) * stepDeg).toFixed(6);
      v.position.lng   = +(v.position.lng + Math.sin(headingRad) * stepDeg).toFixed(6);

      // Keep within SA bounds
      v.position.lat = Math.max(-34.0, Math.min(-22.0, v.position.lat));
      v.position.lng = Math.max(16.0,  Math.min(33.0,  v.position.lng));

      // Randomly adjust heading
      v.position.heading = (v.position.heading + rand(-15, 15) + 360) % 360;
      v.position.timestamp = new Date().toISOString();

      // Drift sensors
      v.sensors.speedKph    = Math.max(0, Math.min(140, v.sensors.speedKph + rand(-8, 8)));
      v.sensors.fuelPercent = Math.max(0, v.sensors.fuelPercent - randF(0, 0.03));
      v.sensors.engineTempC = Math.max(70, Math.min(115, v.sensors.engineTempC + rand(-1, 1)));
      v.sensors.rpm         = Math.max(800, Math.min(4500, v.sensors.rpm + rand(-150, 150)));
      v.lastSeen            = new Date().toISOString();

      broadcast({
        event: "vehicle_position",
        timestamp: new Date().toISOString(),
        data: { vehicleId: v.id, plateNumber: v.plateNumber, position: v.position, sensors: v.sensors, status: v.status },
      });
    });
  }, 3000));

  // ── Status transitions every 20 seconds ──────────────────────────────────
  intervals.push(setInterval(() => {
    if (Math.random() > 0.4) return;
    const v = vehicleDb.vehicles[rand(0, vehicleDb.vehicles.length - 1)];
    if (v.status === "maintenance") return;

    const transitions: Record<string, string[]> = {
      moving: ["idle", "stopped"],
      idle:   ["moving", "stopped"],
      stopped:["moving", "idle"],
      offline:["stopped"],
    };
    const opts = transitions[v.status];
    if (!opts) return;
    const prev  = v.status;
    v.status    = opts[rand(0, opts.length - 1)] as typeof v.status;

    if (v.status === "moving") {
      v.sensors.engineOn    = true;
      v.sensors.ignitionOn  = true;
      v.sensors.speedKph    = rand(20, 80);
      v.sensors.rpm         = rand(1200, 2500);
    } else if (v.status === "stopped" || v.status === "idle") {
      v.sensors.speedKph = 0;
      v.sensors.rpm      = v.status === "idle" ? rand(600, 900) : 0;
    }

    broadcast({
      event: "vehicle_status_change",
      timestamp: new Date().toISOString(),
      data: { vehicleId: v.id, plateNumber: v.plateNumber, from: prev, to: v.status },
    });
  }, 20000));

  // ── Random alerts every 25 seconds ───────────────────────────────────────
  intervals.push(setInterval(() => {
    if (Math.random() > 0.45) return;

    const v    = vehicleDb.vehicles.filter(x => x.status === "moving")[rand(0, 20)];
    if (!v) return;

    const alertTypes: VehicleAlert["type"][] = ["speeding", "harsh_braking", "low_fuel", "geofence_breach"];
    const type = alertTypes[rand(0, alertTypes.length - 1)];
    const sev: VehicleAlert["severity"]  = type === "speeding" ? "warning" : type === "low_fuel" ? "warning" : "info";

    const messages: Record<string, string> = {
      speeding:        `Speed alert — ${v.sensors.speedKph} km/h exceeds limit`,
      harsh_braking:   `Harsh braking event detected`,
      low_fuel:        `Low fuel — ${v.sensors.fuelPercent.toFixed(0)}% remaining`,
      geofence_breach: `Vehicle exited authorised zone`,
    };

    const alert: VehicleAlert = {
      id:           uuid(),
      vehicleId:    v.id,
      plateNumber:  v.plateNumber,
      driverId:     v.driverId,
      type,
      severity:     sev,
      message:      messages[type] ?? "Alert detected",
      position:     { ...v.position },
      detectedAt:   new Date().toISOString(),
      resolvedAt:   null,
      acknowledged: false,
      value:        type === "speeding" ? v.sensors.speedKph : type === "low_fuel" ? v.sensors.fuelPercent : null,
    };

    vehicleDb.alerts.unshift(alert);
    if (vehicleDb.alerts.length > 200) vehicleDb.alerts.pop();

    broadcast({ event: "vehicle_alert", timestamp: new Date().toISOString(), data: alert });
  }, 25000));

  // ── Fleet snapshot every 10 seconds ──────────────────────────────────────
  intervals.push(setInterval(() => {
    broadcast({ event: "fleet_snapshot", timestamp: new Date().toISOString(), data: getFleetSnapshot() });
  }, 10000));

  return () => intervals.forEach(clearInterval);
}
