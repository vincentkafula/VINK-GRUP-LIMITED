// ─── Enums ───────────────────────────────────────────────────────────────────

export type VehicleStatus   = "moving" | "idle" | "stopped" | "offline" | "maintenance";
export type AlertType       = "speeding" | "geofence_breach" | "low_fuel" | "harsh_braking" | "engine_off" | "sos" | "tampering" | "accident";
export type AlertSeverity   = "critical" | "warning" | "info";
export type CommChannel     = "cellular_4g" | "cellular_3g" | "satellite" | "offline";
export type DriverStatus    = "active" | "inactive" | "suspended";
export type GeofenceShape   = "circle" | "polygon";
export type GeofenceAction  = "enter" | "exit" | "both";

// ─── Vehicle ─────────────────────────────────────────────────────────────────

export interface GpsPosition {
  lat:       number;
  lng:       number;
  altitude:  number;
  accuracy:  number;         // metres
  heading:   number;         // degrees 0-360
  timestamp: string;
}

export interface SensorData {
  speedKph:       number;
  fuelPercent:    number;
  engineTempC:    number;
  engineOn:       boolean;
  odometreKm:     number;
  rpm:            number;
  batteryV:       number;
  doorOpen:       boolean;
  ignitionOn:     boolean;
}

export interface Vehicle {
  id:              string;
  plateNumber:     string;
  make:            string;
  model:           string;
  year:            number;
  colour:          string;
  vin:             string;
  fleetGroup:      string;       // e.g. "Delivery", "Executive", "Field"
  driverId:        string | null;
  status:          VehicleStatus;
  commChannel:     CommChannel;
  position:        GpsPosition;
  sensors:         SensorData;
  lastSeen:        string;
  registeredAt:    string;
  simIccid:        string;
  deviceId:        string;       // GPS unit serial
  insuranceExpiry: string;
  licenceExpiry:   string;
  nextServiceKm:   number;
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export interface Driver {
  id:           string;
  name:         string;
  licenceNo:    string;
  phone:        string;
  email:        string;
  status:       DriverStatus;
  assignedVehicleId: string | null;
  totalTrips:   number;
  totalKm:      number;
  safetyScore:  number;         // 0-100
  joinedAt:     string;
  avatarInitials: string;
}

// ─── Trip / Route History ─────────────────────────────────────────────────────

export interface TripPoint {
  lat:       number;
  lng:       number;
  speedKph:  number;
  timestamp: string;
}

export interface Trip {
  id:          string;
  vehicleId:   string;
  driverId:    string | null;
  startPos:    GpsPosition;
  endPos:      GpsPosition | null;
  startTime:   string;
  endTime:     string | null;
  distanceKm:  number;
  avgSpeedKph: number;
  maxSpeedKph: number;
  fuelUsedL:   number;
  points:      TripPoint[];
  ongoing:     boolean;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export interface VehicleAlert {
  id:          string;
  vehicleId:   string;
  plateNumber: string;
  driverId:    string | null;
  type:        AlertType;
  severity:    AlertSeverity;
  message:     string;
  position:    GpsPosition;
  detectedAt:  string;
  resolvedAt:  string | null;
  acknowledged: boolean;
  value:       number | null;   // e.g. speed value for speeding alert
}

// ─── Geofence ────────────────────────────────────────────────────────────────

export interface Geofence {
  id:          string;
  name:        string;
  description: string;
  shape:       GeofenceShape;
  centerLat:   number;
  centerLng:   number;
  radiusM:     number;          // for circle
  active:      boolean;
  triggerOn:   GeofenceAction;
  alertVehicleGroups: string[];
  createdAt:   string;
  breachCount: number;
}

// ─── Fleet Stats ─────────────────────────────────────────────────────────────

export interface FleetSnapshot {
  timestamp:       string;
  totalVehicles:   number;
  movingNow:       number;
  idleNow:         number;
  offlineNow:      number;
  maintenanceNow:  number;
  activeAlerts:    number;
  avgSpeedKph:     number;
  avgFuelPercent:  number;
  totalKmToday:    number;
  activeDrivers:   number;
  geofenceBreaches: number;
}

// ─── WebSocket Events ────────────────────────────────────────────────────────

export type VehicleWsEvent =
  | "vehicle_position"
  | "vehicle_alert"
  | "vehicle_status_change"
  | "geofence_breach"
  | "fleet_snapshot"
  | "trip_started"
  | "trip_ended";

export interface VehicleWsMessage<T = unknown> {
  event:     VehicleWsEvent;
  timestamp: string;
  data:      T;
}
