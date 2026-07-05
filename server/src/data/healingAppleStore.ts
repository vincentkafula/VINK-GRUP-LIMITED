import { v4 as uuid } from "uuid";
import type {
  Passenger, HealingDriver, RideRequest, EarningRecord,
  DriverDocument, SosEvent, ScheduledRide, HaNotification, PlatformStats,
} from "../types/healingApple.js";

const rand   = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randF  = (min: number, max: number) => +(Math.random() * (max - min) + min).toFixed(2);
const ago    = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const future = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

// Cape Town area coords
const PICKUP_LOCATIONS = [
  { label: "Groote Schuur Hospital",        lat: -33.9420, lng: 18.4609 },
  { label: "Mediclinic Cape Gate",          lat: -33.8775, lng: 18.6940 },
  { label: "Netcare Christiaan Barnard",    lat: -33.9252, lng: 18.4178 },
  { label: "Red Cross War Memorial",        lat: -33.9658, lng: 18.4636 },
  { label: "Tygerberg Hospital",            lat: -33.9102, lng: 18.6308 },
  { label: "Somerset Hospital",             lat: -33.9071, lng: 18.4097 },
  { label: "City Park Pharmacy",            lat: -33.9286, lng: 18.4239 },
  { label: "Clicks Pharmacy Cavendish",     lat: -33.9955, lng: 18.4682 },
];

const DRIVER_NAMES = [
  "Themba Dlamini", "Sipho Ndlovu", "Farai Moyo", "Abebe Bekele",
  "Kagiso Sithole", "Lwazi Mokoena", "Nomsa Khumalo", "Thandi Zulu",
];

const PASSENGER_NAMES = [
  "Margaret Botha", "Johannes van der Berg", "Amahle Ngcobo",
  "Patrick Osei", "Fatima Ismail", "David Nkosi", "Grace Mthembu",
  "Samuel Petersen",
];

const MEDICAL_NOTES = [
  "I use a rollator walker — please allow extra boarding time.",
  "Post-knee surgery — cannot bend knee fully. Front seat preferred.",
  "Oxygen concentrator in tow. Needs boot space.",
  "Hard of hearing. Please speak clearly and face me.",
  "Dialysis patient — weekly trip, usually tired on return journey.",
  "Visually impaired. Please guide me to and from the vehicle.",
  "Anxiety disorder — please keep the radio low and drive calmly.",
  "",  // no note
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

export const haDb = {

  passengers: PASSENGER_NAMES.map((name, i) => ({
    id: uuid(),
    phone: `+2782${String(7000000 + i).padStart(7, "0")}`,
    name,
    avatarInitials: name.split(" ").map(w => w[0]).join(""),
    walletBalance: randF(50, 500),
    currency: "ZAR",
    preferredVehicleType: (["standard","standard","wheelchair","standard","standard","stretcher","standard","standard"][i]) as Passenger["preferredVehicleType"],
    emergencyContacts: [
      { name: "Family Member", phone: `+2783${String(7000000 + i).padStart(7, "0")}`, relationship: "Spouse" },
    ],
    linkedCaregiverId: null,
    medicalProfile: MEDICAL_NOTES[i % MEDICAL_NOTES.length],
    totalTrips: rand(2, 120),
    avgRating: randF(4.1, 5.0),
    createdAt: ago(rand(1440, 43800)),
    lastActiveAt: ago(rand(0, 180)),
  })) as Passenger[],

  drivers: DRIVER_NAMES.map((name, i) => ({
    id: uuid(),
    name,
    phone: `+2781${String(8000000 + i).padStart(7, "0")}`,
    email: `${name.split(" ")[0].toLowerCase()}@healingapple.co.za`,
    avatarInitials: name.split(" ").map(w => w[0]).join(""),
    licenceNo: `ZA${rand(10000000, 99999999)}`,
    vehicleType: (["standard","wheelchair","standard","stretcher","standard","wheelchair","standard","standard"][i]) as HealingDriver["vehicleType"],
    vehicleMake: ["Toyota","Ford","Volkswagen","Hyundai","Renault","Toyota","Kia","Suzuki"][i],
    vehicleModel: ["Corolla Quest","Tourneo","Caddy","H1 Ambulance","Kangoo","HiAce","Carnival","Vitara"][i],
    vehicleYear: 2018 + (i % 6),
    vehiclePlate: `CA${rand(100000,999999)}`,
    vehicleColour: ["White","Silver","White","White","Blue","White","Grey","White"][i],
    onlineStatus: (["online","online","online","on_trip","online","offline","online","online"][i]) as HealingDriver["onlineStatus"],
    position: { lat: -33.92 + (Math.random() * 0.1 - 0.05), lng: 18.42 + (Math.random() * 0.1 - 0.05) },
    heading: rand(0, 359),
    totalTrips: rand(50, 800),
    totalEarningsZAR: rand(8000, 80000),
    earningsToday: randF(200, 1200),
    earningsThisWeek: randF(1500, 6000),
    avgRating: randF(4.2, 4.9),
    acceptanceRate: rand(72, 98),
    completionRate: rand(88, 99),
    firstAidCertified: i !== 5,
    backgroundCheckStatus: (i === 5 ? "expired" : "approved") as DocStatus,
    vehicleInspectionStatus: "approved" as DocStatus,
    accessibilityTrainingStatus: (["approved","approved","pending","approved","approved","expired","approved","approved"][i]) as DocStatus,
    joinedAt: ago(rand(4380, 43800)),
    lastActiveAt: ago(rand(0, 120)),
  })) as HealingDriver[],

  rides: [] as RideRequest[],
  earnings: [] as EarningRecord[],
  documents: [] as DriverDocument[],
  sosEvents: [] as SosEvent[],
  scheduledRides: [] as ScheduledRide[],
  notifications: [] as HaNotification[],
};

// Seed some past rides
function seedRides() {
  const statuses: RideRequest["status"][] = ["completed","completed","completed","cancelled","completed"];
  for (let i = 0; i < 25; i++) {
    const passenger = haDb.passengers[i % haDb.passengers.length];
    const driver    = haDb.drivers[i % haDb.drivers.length];
    const pickup    = PICKUP_LOCATIONS[i % PICKUP_LOCATIONS.length];
    const dropoff   = PICKUP_LOCATIONS[(i + 2) % PICKUP_LOCATIONS.length];
    const status    = statuses[i % statuses.length];
    const fare      = randF(45, 280);
    const ride: RideRequest = {
      id: uuid(),
      passengerId: passenger.id,
      passengerName: passenger.name,
      passengerPhone: passenger.phone,
      vehicleType: passenger.preferredVehicleType,
      pickupAddress: { label: pickup.label, lat: pickup.lat, lng: pickup.lng },
      dropoffAddress: { label: dropoff.label, lat: dropoff.lat, lng: dropoff.lng },
      medicalNote: passenger.medicalProfile,
      scheduledFor: null,
      recurrence: "once",
      paymentMethod: (["card","mobile_money","cash","wallet","card"][i % 5]) as RideRequest["paymentMethod"],
      status,
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: driver.phone,
      driverPlate: driver.vehiclePlate,
      driverVehicle: `${driver.vehicleMake} ${driver.vehicleModel}`,
      driverRating: driver.avgRating,
      estimatedFareZAR: fare,
      finalFareZAR: status === "completed" ? fare : null,
      paymentStatus: status === "completed" ? "paid" : "pending",
      etaMinutes: rand(3, 15),
      distanceKm: randF(2, 18),
      createdAt: ago(rand(60, 10080)),
      acceptedAt: ago(rand(50, 10070)),
      pickupAt: status !== "cancelled" ? ago(rand(30, 10050)) : null,
      dropoffAt: status === "completed" ? ago(rand(5, 10000)) : null,
      dropoffProofUrl: status === "completed" ? "proof_placeholder.jpg" : null,
      passengerRating: status === "completed" ? (rand(4, 5) as RideRequest["passengerRating"]) : null,
      driverRatingGiven: status === "completed" ? (rand(4, 5) as RideRequest["driverRatingGiven"]) : null,
      passengerReview: status === "completed" && i % 3 === 0 ? "Driver was very patient and helpful." : null,
      sosTriggered: false,
    };
    haDb.rides.push(ride);

    // Earnings record for completed rides
    if (status === "completed") {
      haDb.earnings.push({
        id: uuid(),
        driverId: driver.id,
        rideId: ride.id,
        amount: +(fare * 0.75).toFixed(2),
        currency: "ZAR",
        type: "trip",
        description: `Trip: ${pickup.label} → ${dropoff.label}`,
        createdAt: ride.dropoffAt!,
        paid: i < 20,
        paidAt: i < 20 ? ago(rand(0, 4320)) : null,
      });
    }
  }

  // Seed one active ride (driver_arriving)
  const activePassenger = haDb.passengers[0];
  const activeDriver    = haDb.drivers[0];
  const activePickup    = PICKUP_LOCATIONS[0];
  const activeDrop      = PICKUP_LOCATIONS[3];
  haDb.rides.push({
    id: uuid(),
    passengerId: activePassenger.id,
    passengerName: activePassenger.name,
    passengerPhone: activePassenger.phone,
    vehicleType: "standard",
    pickupAddress: { label: activePickup.label, lat: activePickup.lat, lng: activePickup.lng },
    dropoffAddress: { label: activeDrop.label, lat: activeDrop.lat, lng: activeDrop.lng },
    medicalNote: activePassenger.medicalProfile,
    scheduledFor: null,
    recurrence: "once",
    paymentMethod: "card",
    status: "driver_arriving",
    driverId: activeDriver.id,
    driverName: activeDriver.name,
    driverPhone: activeDriver.phone,
    driverPlate: activeDriver.vehiclePlate,
    driverVehicle: `${activeDriver.vehicleMake} ${activeDriver.vehicleModel}`,
    driverRating: activeDriver.avgRating,
    estimatedFareZAR: 85,
    finalFareZAR: null,
    paymentStatus: "pending",
    etaMinutes: 4,
    distanceKm: 6.2,
    createdAt: ago(8),
    acceptedAt: ago(7),
    pickupAt: null,
    dropoffAt: null,
    dropoffProofUrl: null,
    passengerRating: null,
    driverRatingGiven: null,
    passengerReview: null,
    sosTriggered: false,
  });

  // Seed a pending incoming request for driver[1]
  const pendingPassenger = haDb.passengers[2];
  haDb.rides.push({
    id: uuid(),
    passengerId: pendingPassenger.id,
    passengerName: pendingPassenger.name,
    passengerPhone: pendingPassenger.phone,
    vehicleType: "wheelchair",
    pickupAddress: { label: PICKUP_LOCATIONS[4].label, lat: PICKUP_LOCATIONS[4].lat, lng: PICKUP_LOCATIONS[4].lng },
    dropoffAddress: { label: PICKUP_LOCATIONS[6].label, lat: PICKUP_LOCATIONS[6].lat, lng: PICKUP_LOCATIONS[6].lng },
    medicalNote: MEDICAL_NOTES[0],
    scheduledFor: null,
    recurrence: "once",
    paymentMethod: "mobile_money",
    status: "searching",
    driverId: null,
    driverName: null,
    driverPhone: null,
    driverPlate: null,
    driverVehicle: null,
    driverRating: null,
    estimatedFareZAR: 120,
    finalFareZAR: null,
    paymentStatus: "pending",
    etaMinutes: null,
    distanceKm: 9.4,
    createdAt: ago(1),
    acceptedAt: null,
    pickupAt: null,
    dropoffAt: null,
    dropoffProofUrl: null,
    passengerRating: null,
    driverRatingGiven: null,
    passengerReview: null,
    sosTriggered: false,
  });

  // Seed documents for driver[0]
  const docDriver = haDb.drivers[0];
  (["licence","id_document","vehicle_registration","insurance","first_aid_cert","background_check","accessibility_training"] as DriverDocument["type"][]).forEach(type => {
    haDb.documents.push({
      id: uuid(),
      driverId: docDriver.id,
      type,
      filename: `${type}.pdf`,
      status: "approved",
      expiresAt: future(60 * 24 * 365),
      uploadedAt: ago(rand(1440, 8760)),
      reviewedAt: ago(rand(720, 4320)),
      reviewNote: null,
    });
  });

  // Seed scheduled rides
  haDb.scheduledRides.push({
    id: uuid(),
    passengerId: haDb.passengers[4].id,
    vehicleType: "standard",
    pickupAddress: PICKUP_LOCATIONS[7],
    dropoffAddress: PICKUP_LOCATIONS[1],
    medicalNote: MEDICAL_NOTES[4],
    scheduledTime: future(60 * 18),
    recurrence: "weekly",
    daysOfWeek: [2], // Tuesday
    paymentMethod: "wallet",
    active: true,
    lastRideId: null,
    createdAt: ago(1440 * 7),
  });

  // Seed notifications
  haDb.notifications.push(
    { id: uuid(), userId: haDb.passengers[0].id, role: "passenger", title: "Driver arriving", body: "Themba Dlamini is 4 min away", type: "ride_update", read: false, createdAt: ago(5) },
    { id: uuid(), userId: haDb.passengers[0].id, role: "passenger", title: "Payment received", body: "R85.00 charged via card", type: "payment", read: false, createdAt: ago(3) },
    { id: uuid(), userId: haDb.drivers[0].id, role: "driver", title: "New trip request", body: "Wheelchair ride — Tygerberg Hospital", type: "ride_update", read: false, createdAt: ago(1) },
    { id: uuid(), userId: haDb.drivers[0].id, role: "driver", title: "Payout processed", body: "R1,240 paid to your account", type: "payment", read: true, createdAt: ago(120) },
  );
}

seedRides();

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPlatformStats(): PlatformStats {
  return {
    timestamp: new Date().toISOString(),
    activeRides: haDb.rides.filter(r => ["searching","accepted","driver_arriving","in_progress"].includes(r.status)).length,
    onlineDrivers: haDb.drivers.filter(d => d.onlineStatus === "online" || d.onlineStatus === "on_trip").length,
    ridesCompletedToday: haDb.rides.filter(r => r.status === "completed").length,
    totalPassengers: haDb.passengers.length,
    totalDrivers: haDb.drivers.length,
    activeSosEvents: haDb.sosEvents.filter(s => s.status === "active").length,
    avgEtaMinutes: 7,
    revenueToday: +haDb.rides.filter(r => r.status === "completed").reduce((s, r) => s + (r.finalFareZAR ?? 0), 0).toFixed(2),
    acceptanceRatePct: Math.round(haDb.drivers.reduce((s, d) => s + d.acceptanceRate, 0) / haDb.drivers.length),
    cancellationRatePct: Math.round((haDb.rides.filter(r => r.status === "cancelled").length / Math.max(haDb.rides.length, 1)) * 100),
  };
}

// Re-export type alias so routes can import without the "type" keyword clash
type DocStatus = DriverDocument["status"];
export type { DocStatus };
