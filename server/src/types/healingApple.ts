// ─── Enums ────────────────────────────────────────────────────────────────────

export type VehicleType   = "standard" | "wheelchair" | "stretcher";
export type RideStatus    = "searching" | "accepted" | "driver_arriving" | "in_progress" | "completed" | "cancelled";
export type PaymentMethod = "card" | "mobile_money" | "wallet" | "cash";
export type PaymentStatus = "pending" | "processing" | "paid" | "failed" | "refunded";
export type DriverOnlineStatus = "online" | "offline" | "on_trip" | "suspended";
export type DocStatus     = "pending" | "approved" | "expired" | "rejected";
export type SosStatus     = "active" | "responded" | "resolved" | "false_alarm";
export type UserRole      = "passenger" | "driver" | "caregiver" | "admin";
export type TripRecurrence = "once" | "daily" | "weekly" | "custom";
export type RatingStars   = 1 | 2 | 3 | 4 | 5;

// ─── Location ─────────────────────────────────────────────────────────────────

export interface LatLng { lat: number; lng: number }
export interface Address {
  label: string;      // human-readable e.g. "Groote Schuur Hospital"
  lat: number;
  lng: number;
  placeId?: string;
}

// ─── Passengers ───────────────────────────────────────────────────────────────

export interface Passenger {
  id: string;
  phone: string;
  name: string;
  avatarInitials: string;
  walletBalance: number;
  currency: string;
  preferredVehicleType: VehicleType;
  emergencyContacts: EmergencyContact[];
  linkedCaregiverId: string | null;
  medicalProfile: string;   // free-text, visible only to matched driver
  totalTrips: number;
  avgRating: number;
  createdAt: string;
  lastActiveAt: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

// ─── Drivers ──────────────────────────────────────────────────────────────────

export interface HealingDriver {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatarInitials: string;
  licenceNo: string;
  vehicleType: VehicleType;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;
  vehicleColour: string;
  onlineStatus: DriverOnlineStatus;
  position: LatLng | null;
  heading: number;                    // degrees 0-360
  totalTrips: number;
  totalEarningsZAR: number;
  earningsToday: number;
  earningsThisWeek: number;
  avgRating: number;
  acceptanceRate: number;             // 0-100
  completionRate: number;
  firstAidCertified: boolean;
  backgroundCheckStatus: DocStatus;
  vehicleInspectionStatus: DocStatus;
  accessibilityTrainingStatus: DocStatus;
  joinedAt: string;
  lastActiveAt: string;
}

// ─── Rides ────────────────────────────────────────────────────────────────────

export interface RideRequest {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  vehicleType: VehicleType;
  pickupAddress: Address;
  dropoffAddress: Address;
  medicalNote: string;
  scheduledFor: string | null;       // ISO — null means ASAP
  recurrence: TripRecurrence;
  paymentMethod: PaymentMethod;
  status: RideStatus;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverPlate: string | null;
  driverVehicle: string | null;
  driverRating: number | null;
  estimatedFareZAR: number;
  finalFareZAR: number | null;
  paymentStatus: PaymentStatus;
  etaMinutes: number | null;
  distanceKm: number | null;
  createdAt: string;
  acceptedAt: string | null;
  pickupAt: string | null;
  dropoffAt: string | null;
  dropoffProofUrl: string | null;
  passengerRating: RatingStars | null;
  driverRatingGiven: RatingStars | null;
  passengerReview: string | null;
  sosTriggered: boolean;
}

// ─── Earnings ─────────────────────────────────────────────────────────────────

export interface EarningRecord {
  id: string;
  driverId: string;
  rideId: string;
  amount: number;
  currency: string;
  type: "trip" | "bonus" | "tip" | "deduction";
  description: string;
  createdAt: string;
  paid: boolean;
  paidAt: string | null;
}

export interface PayoutSummary {
  driverId: string;
  today: number;
  thisWeek: number;
  thisMonth: number;
  pending: number;
  nextPayoutDate: string;
  lastPayout: { amount: number; paidAt: string } | null;
}

// ─── Driver Documents ─────────────────────────────────────────────────────────

export interface DriverDocument {
  id: string;
  driverId: string;
  type: "licence" | "id_document" | "vehicle_registration" | "insurance" | "roadworthy" | "first_aid_cert" | "background_check" | "accessibility_training" | "profile_photo";
  filename: string;
  status: DocStatus;
  expiresAt: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

// ─── SOS Events ───────────────────────────────────────────────────────────────

export interface SosEvent {
  id: string;
  triggeredBy: "passenger" | "driver";
  userId: string;
  rideId: string | null;
  position: LatLng;
  status: SosStatus;
  message: string;
  contactsNotified: string[];    // phone numbers
  emergencyServicesAlerted: boolean;
  triggeredAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  notes: string;
}

// ─── Caregiver ────────────────────────────────────────────────────────────────

export interface Caregiver {
  id: string;
  name: string;
  phone: string;
  linkedPatientIds: string[];
  createdAt: string;
}

// ─── Scheduled / Recurring Rides ─────────────────────────────────────────────

export interface ScheduledRide {
  id: string;
  passengerId: string;
  vehicleType: VehicleType;
  pickupAddress: Address;
  dropoffAddress: Address;
  medicalNote: string;
  scheduledTime: string;         // next occurrence ISO
  recurrence: TripRecurrence;
  daysOfWeek: number[];          // 0=Sun … 6=Sat
  paymentMethod: PaymentMethod;
  active: boolean;
  lastRideId: string | null;
  createdAt: string;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface HaNotification {
  id: string;
  userId: string;
  role: UserRole;
  title: string;
  body: string;
  type: "ride_update" | "payment" | "sos" | "promo" | "doc_status";
  read: boolean;
  createdAt: string;
}

// ─── Platform Stats ───────────────────────────────────────────────────────────

export interface PlatformStats {
  timestamp: string;
  activeRides: number;
  onlineDrivers: number;
  ridesCompletedToday: number;
  totalPassengers: number;
  totalDrivers: number;
  activeSosEvents: number;
  avgEtaMinutes: number;
  revenueToday: number;
  acceptanceRatePct: number;
  cancellationRatePct: number;
}

// ─── WS Events ────────────────────────────────────────────────────────────────

export type HaWsEvent =
  | "ride_request"
  | "ride_accepted"
  | "driver_location"
  | "ride_status_change"
  | "sos_triggered"
  | "sos_resolved"
  | "platform_stats";

export interface HaWsMessage<T = unknown> {
  event: HaWsEvent;
  timestamp: string;
  data: T;
}
