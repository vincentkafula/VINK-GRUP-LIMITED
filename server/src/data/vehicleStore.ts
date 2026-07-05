import { v4 as uuid } from "uuid";
import type {
  Vehicle, Driver, Trip, VehicleAlert, Geofence, FleetSnapshot,
  GpsPosition, SensorData,
} from "../types/vehicles.js";

const rand  = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randF = (min: number, max: number) => +(Math.random() * (max - min) + min).toFixed(4);
const ago   = (min: number)              => new Date(Date.now() - min * 60_000).toISOString();

// South Africa bounding box
const SA_BOUNDS = { latMin: -34.0, latMax: -22.0, lngMin: 16.0, lngMax: 33.0 };

// City clusters for realistic positioning
const CITIES = [
  { name: "Johannesburg", lat: -26.2041, lng: 28.0473 },
  { name: "Cape Town",    lat: -33.9249, lng: 18.4241 },
  { name: "Durban",       lat: -29.8587, lng: 31.0218 },
  { name: "Pretoria",     lat: -25.7479, lng: 28.2293 },
  { name: "Port Elizabeth", lat: -33.9608, lng: 25.6022 },
  { name: "Bloemfontein", lat: -29.0852, lng: 26.1596 },
  { name: "East London",  lat: -33.0153, lng: 27.9116 },
  { name: "Polokwane",    lat: -23.9045, lng: 29.4689 },
];

function nearCity(i: number): { lat: number; lng: number } {
  const city = CITIES[i % CITIES.length];
  return {
    lat: +(city.lat + randF(-0.15, 0.15)).toFixed(6),
    lng: +(city.lng + randF(-0.15, 0.15)).toFixed(6),
  };
}

function makePosition(i: number): GpsPosition {
  const pos = nearCity(i);
  return {
    lat: pos.lat, lng: pos.lng,
    altitude: rand(10, 1800),
    accuracy: rand(3, 15),
    heading: rand(0, 359),
    timestamp: ago(rand(0, 5)),
  };
}

function makeSensors(status: Vehicle["status"]): SensorData {
  const moving = status === "moving";
  return {
    speedKph:    moving ? rand(20, 120) : 0,
    fuelPercent: rand(8, 98),
    engineTempC: moving ? rand(82, 105) : rand(20, 50),
    engineOn:    status !== "offline" && status !== "stopped",
    odometreKm:  rand(5000, 250000),
    rpm:         moving ? rand(1200, 3800) : rand(0, 900),
    batteryV:    randF(11.8, 14.4),
    doorOpen:    Math.random() < 0.05,
    ignitionOn:  status === "moving" || status === "idle",
  };
}

const MAKES = [
  { make: "Toyota",  models: ["Hilux", "Land Cruiser", "Fortuner", "Quantum"] },
  { make: "Ford",    models: ["Ranger", "Transit", "Everest"] },
  { make: "Isuzu",   models: ["D-Max", "NLR 150", "NPR"] },
  { make: "VW",      models: ["Transporter", "Amarok", "Crafter"] },
  { make: "Mercedes",models: ["Sprinter", "Vito", "Actros"] },
  { make: "Hino",    models: ["300", "500", "700"] },
];

const FLEETS = ["Delivery", "Executive", "Field Ops", "Security", "Maintenance"];
const COLOURS = ["White", "Silver", "Black", "Blue", "Red", "Orange"];

const STATUSES: Vehicle["status"][] = ["moving", "moving", "moving", "idle", "idle", "stopped", "offline", "maintenance"];

// ─── Seed Data ────────────────────────────────────────────────────────────────

export const vehicleDb = {
  vehicles: Array.from({ length: 50 }, (_, i) => {
    const mk      = MAKES[i % MAKES.length];
    const model   = mk.models[i % mk.models.length];
    const status  = STATUSES[i % STATUSES.length];
    const pos     = makePosition(i);
    return {
      id:              uuid(),
      plateNumber:     `${["GP","WC","KZN","EC","FS","LP"][i % 6]} ${String(rand(100, 999))} ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i + 3) % 26))}`,
      make:            mk.make,
      model,
      year:            rand(2016, 2024),
      colour:          COLOURS[i % COLOURS.length],
      vin:             `VIN${String(i).padStart(14, "0")}`,
      fleetGroup:      FLEETS[i % FLEETS.length],
      driverId:        status !== "offline" ? `DRV-${String(i).padStart(3, "0")}` : null,
      status,
      commChannel:     (["cellular_4g","cellular_4g","cellular_4g","cellular_3g","satellite"][i % 5]) as Vehicle["commChannel"],
      position:        pos,
      sensors:         makeSensors(status),
      lastSeen:        ago(status === "offline" ? rand(30, 480) : rand(0, 3)),
      registeredAt:    ago(rand(1440, 525600)),
      simIccid:        `8927${String(i).padStart(15, "0")}`,
      deviceId:        `GT06N-${String(i).padStart(6, "0")}`,
      insuranceExpiry: new Date(Date.now() + rand(30, 365) * 86400000).toISOString(),
      licenceExpiry:   new Date(Date.now() + rand(60, 730) * 86400000).toISOString(),
      nextServiceKm:   rand(1000, 10000),
    } as Vehicle;
  }),

  drivers: Array.from({ length: 40 }, (_, i) => ({
    id:              `DRV-${String(i).padStart(3, "0")}`,
    name:            [
      "Sipho Nkosi","Thabo Dlamini","Lerato Mokoena","Nomsa Khumalo","David van der Berg",
      "Fatima Essop","Johan Botha","Priya Naidoo","Bongani Zulu","Elaine Mostert",
      "Khulekani Mthembu","Ayanda Cele","Pieter du Plessis","Zanele Mahlangu","Ravi Pillay",
      "Amina Mohamed","Chris Steyn","Nolwazi Dube","Stefan Kruger","Mmaphuti Mokgopa",
      "Lungelo Buthelezi","Sonia Ferreira","Thandeka Ntuli","Wayne Jacobs","Keabetswe Sithole",
      "Lebo Masondo","Mark Thompson","Zinhle Ndlovu","André Fourie","Busisiwe Mkhize",
      "Sanele Gumbi","Rebecca Jooste","Mthokozisi Ndaba","Charlene van Wyk","Nkosinathi Mhlanga",
      "Desiré Bosman","Vusi Shabalala","Lindi Pietersen","Siyanda Majola","Henk Swanepoel",
    ][i],
    licenceNo:       `SA${String(rand(1000000, 9999999))}`,
    phone:           `+2760${String(rand(1000000, 9999999))}`,
    email:           `driver${i}@vink-fleet.co.za`,
    status:          (i % 8 === 0 ? "suspended" : "active") as Driver["status"],
    assignedVehicleId: i < 35 ? null : null,
    totalTrips:      rand(50, 1200),
    totalKm:         rand(5000, 180000),
    safetyScore:     rand(55, 100),
    joinedAt:        ago(rand(1440, 525600)),
    avatarInitials:  "",
  } as Driver)).map(d => ({ ...d, avatarInitials: d.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase() })),

  trips: Array.from({ length: 80 }, (_, i) => {
    const vehicleIdx = i % 50;
    const cityA = CITIES[i % CITIES.length];
    const cityB = CITIES[(i + 1) % CITIES.length];
    const start = ago(rand(30, 1440));
    const ended = i % 6 !== 0;
    const dist  = randF(5, 420);
    const avgSpd = rand(35, 95);
    const pts: import("../types/vehicles.js").TripPoint[] = Array.from({ length: 8 }, (_, p) => ({
      lat: +(cityA.lat + (cityB.lat - cityA.lat) * (p / 7) + randF(-0.02, 0.02)).toFixed(6),
      lng: +(cityA.lng + (cityB.lng - cityA.lng) * (p / 7) + randF(-0.02, 0.02)).toFixed(6),
      speedKph: rand(0, 130),
      timestamp: new Date(new Date(start).getTime() + p * rand(180000, 600000)).toISOString(),
    }));
    return {
      id:          uuid(),
      vehicleId:   `VEH-PLACEHOLDER-${vehicleIdx}`,
      driverId:    `DRV-${String(vehicleIdx % 40).padStart(3, "0")}`,
      startPos:    { lat: cityA.lat, lng: cityA.lng, altitude: 1200, accuracy: 5, heading: rand(0, 359), timestamp: start },
      endPos:      ended ? { lat: cityB.lat, lng: cityB.lng, altitude: 1100, accuracy: 5, heading: rand(0, 359), timestamp: ago(rand(0, 120)) } : null,
      startTime:   start,
      endTime:     ended ? ago(rand(0, 120)) : null,
      distanceKm:  dist,
      avgSpeedKph: avgSpd,
      maxSpeedKph: Math.min(rand(avgSpd + 10, 160), 160),
      fuelUsedL:   +(dist * randF(0.06, 0.12)).toFixed(2),
      points:      pts,
      ongoing:     !ended,
    } as Trip;
  }),

  alerts: Array.from({ length: 30 }, (_, i) => {
    const types: VehicleAlert["type"][] = ["speeding","geofence_breach","low_fuel","harsh_braking","engine_off","sos","tampering","accident"];
    const type = types[i % types.length];
    const sev: VehicleAlert["severity"] = type === "sos" || type === "accident" ? "critical" : type === "speeding" || type === "tampering" ? "warning" : "info";
    const pos = makePosition(i);
    return {
      id:           uuid(),
      vehicleId:    `VEH-PLACEHOLDER-${i % 50}`,
      plateNumber:  `GP ${rand(100,999)} AB`,
      driverId:     `DRV-${String(i % 40).padStart(3, "0")}`,
      type,
      severity:     sev,
      message: {
        speeding:        `Vehicle exceeded speed limit — ${rand(80,160)} km/h in 60 zone`,
        geofence_breach: `Vehicle exited authorised geofence boundary`,
        low_fuel:        `Fuel level critically low — ${rand(5,15)}% remaining`,
        harsh_braking:   `Harsh braking event detected at ${rand(60,110)} km/h`,
        engine_off:      `Engine switched off outside designated area`,
        sos:             `SOS panic button activated by driver`,
        tampering:       `GPS device tampering detected`,
        accident:        `Possible accident — sudden deceleration to 0 km/h`,
      }[type],
      position:     pos,
      detectedAt:   ago(rand(0, 480)),
      resolvedAt:   i % 4 === 0 ? ago(rand(0, 60)) : null,
      acknowledged: i % 3 === 0,
      value:        type === "speeding" ? rand(80, 160) : type === "low_fuel" ? rand(5, 15) : null,
    } as VehicleAlert;
  }),

  geofences: [
    { id: uuid(), name: "Johannesburg HQ",     description: "Head office compound",  shape: "circle", centerLat: -26.2041, centerLng: 28.0473, radiusM: 500,  active: true,  triggerOn: "exit",  alertVehicleGroups: ["Delivery","Executive"], createdAt: ago(43800), breachCount: 12 },
    { id: uuid(), name: "Cape Town Depot",      description: "Western Cape warehouse", shape: "circle", centerLat: -33.9249, centerLng: 18.4241, radiusM: 800,  active: true,  triggerOn: "both",  alertVehicleGroups: ["Delivery"],             createdAt: ago(20160), breachCount: 7  },
    { id: uuid(), name: "Durban Port Zone",     description: "Port operations area",  shape: "circle", centerLat: -29.8587, centerLng: 31.0218, radiusM: 1200, active: true,  triggerOn: "enter", alertVehicleGroups: ["Field Ops","Delivery"],  createdAt: ago(10080), breachCount: 3  },
    { id: uuid(), name: "Pretoria Admin Zone",  description: "Government precinct",   shape: "circle", centerLat: -25.7479, centerLng: 28.2293, radiusM: 600,  active: true,  triggerOn: "exit",  alertVehicleGroups: ["Executive"],            createdAt: ago(5040),  breachCount: 2  },
    { id: uuid(), name: "Night Curfew Area",    description: "After-hours restricted",shape: "circle", centerLat: -26.1052, centerLng: 28.0560, radiusM: 3000, active: false, triggerOn: "enter", alertVehicleGroups: ["Delivery","Field Ops"],  createdAt: ago(2880),  breachCount: 0  },
  ] as Geofence[],

  fleetHistory: Array.from({ length: 24 }, (_, i) => ({
    timestamp:       ago((23 - i) * 60),
    totalVehicles:   50,
    movingNow:       rand(18, 32),
    idleNow:         rand(5, 12),
    offlineNow:      rand(2, 6),
    maintenanceNow:  rand(1, 4),
    activeAlerts:    rand(3, 18),
    avgSpeedKph:     rand(45, 78),
    avgFuelPercent:  rand(52, 72),
    totalKmToday:    rand(800, 4200),
    activeDrivers:   rand(20, 35),
    geofenceBreaches: rand(0, 5),
  })) as FleetSnapshot[],
};

// Assign vehicle ids to trips
vehicleDb.trips.forEach((trip, i) => {
  trip.vehicleId = vehicleDb.vehicles[i % vehicleDb.vehicles.length].id;
});

// Assign alerts to real vehicle ids
vehicleDb.alerts.forEach((alert, i) => {
  const v = vehicleDb.vehicles[i % vehicleDb.vehicles.length];
  alert.vehicleId    = v.id;
  alert.plateNumber  = v.plateNumber;
  alert.driverId     = v.driverId;
});

export function getFleetSnapshot(): FleetSnapshot {
  const vv = vehicleDb.vehicles;
  return {
    timestamp:        new Date().toISOString(),
    totalVehicles:    vv.length,
    movingNow:        vv.filter(v => v.status === "moving").length,
    idleNow:          vv.filter(v => v.status === "idle").length,
    offlineNow:       vv.filter(v => v.status === "offline").length,
    maintenanceNow:   vv.filter(v => v.status === "maintenance").length,
    activeAlerts:     vehicleDb.alerts.filter(a => !a.resolvedAt).length,
    avgSpeedKph:      +( vv.filter(v => v.status === "moving").reduce((s, v) => s + v.sensors.speedKph, 0) / Math.max(1, vv.filter(v => v.status === "moving").length) ).toFixed(1),
    avgFuelPercent:   +( vv.reduce((s, v) => s + v.sensors.fuelPercent, 0) / vv.length ).toFixed(1),
    totalKmToday:     +( vehicleDb.trips.filter(t => t.startTime > ago(1440)).reduce((s, t) => s + t.distanceKm, 0) ).toFixed(1),
    activeDrivers:    vehicleDb.drivers.filter(d => d.status === "active" && vv.find(v => v.driverId === d.id && v.status === "moving")).length,
    geofenceBreaches: vehicleDb.alerts.filter(a => a.type === "geofence_breach" && !a.resolvedAt).length,
  };
}
