// ─── Vehicle & Device Registration Types ─────────────────────────────────────

export interface VehicleProfile {
  // Step 1 — Association
  associationName: string;
  associationProvince: string;
  associationLevel: string;

  // Step 2 — Vehicle Details
  registrationNumber: string;   // e.g. CA 123-456
  make: string;                 // e.g. Toyota
  model: string;                // e.g. HiAce
  year: string;
  colour: string;
  vehicleType: "minibus" | "bus" | "sedan" | "suv" | "other";
  seatingCapacity: string;

  // Step 3 — Vehicle Documents
  registrationCertNumber: string;
  registrationCertExpiry: string;
  operatingLicenceNumber: string;
  operatingLicenceExpiry: string;
  insurancePolicyNumber: string;
  insuranceExpiry: string;

  // Step 4 — Roadworthy
  roadworthyCertNumber: string;
  roadworthyExpiry: string;
  roadworthyStation: string;
  lastInspectionDate: string;

  // Step 5 — Owner Identification
  ownerFullName: string;
  ownerIdNumber: string;         // SA 13-digit ID
  ownerPhone: string;
  ownerEmail: string;
  ownerAddress: string;
  driverName: string;            // if different from owner
  driverIdNumber: string;
  driverLicenceNumber: string;
  driverLicenceExpiry: string;
  pdpNumber: string;             // Professional Driving Permit
  pdpExpiry: string;
}

export const EMPTY_PROFILE: VehicleProfile = {
  associationName: "", associationProvince: "", associationLevel: "",
  registrationNumber: "", make: "", model: "", year: "", colour: "", vehicleType: "minibus", seatingCapacity: "14",
  registrationCertNumber: "", registrationCertExpiry: "", operatingLicenceNumber: "", operatingLicenceExpiry: "",
  insurancePolicyNumber: "", insuranceExpiry: "",
  roadworthyCertNumber: "", roadworthyExpiry: "", roadworthyStation: "", lastInspectionDate: "",
  ownerFullName: "", ownerIdNumber: "", ownerPhone: "", ownerEmail: "", ownerAddress: "",
  driverName: "", driverIdNumber: "", driverLicenceNumber: "", driverLicenceExpiry: "", pdpNumber: "", pdpExpiry: "",
};

export function docStatus(expiryStr: string): "valid" | "expiring" | "expired" | "missing" {
  if (!expiryStr) return "missing";
  const exp = new Date(expiryStr);
  const now = new Date();
  const daysLeft = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)   return "expired";
  if (daysLeft < 30)  return "expiring";
  return "valid";
}

export const DOC_STATUS_COLORS = {
  valid:    { bg: "#10B981", label: "Valid" },
  expiring: { bg: "#F59E0B", label: "Expiring" },
  expired:  { bg: "#EF4444", label: "Expired" },
  missing:  { bg: "#6B7280", label: "Missing" },
};

// ─── Association → allowed route origins mapping ──────────────────────────────
// Each entry is a list of origin keyword substrings. A route is allowed if its
// origin contains ANY of the keywords (case-insensitive).
// Provincial/National bodies see ALL routes in their area.

export const ASSOCIATION_ROUTE_ORIGINS: Record<string, string[]> = {
  // ── National (all routes) ──────────────────────────────────────────────────
  "SANTACO (South African National Taxi Council)": [],   // empty = all routes
  "National Taxi Alliance (NTA)":                  [],

  // ── Gauteng ────────────────────────────────────────────────────────────────
  "Gauteng Johannesburg Region (GJR)":   ["JOHANNESBURG","SOWETO","SANDTON","MIDRAND","EKURHULENI","TSHWANE","PRETORIA","VAAL"],
  "Central Johannesburg Taxi Association": ["JOHANNESBURG"],
  "East Rand Taxi Association":            ["EAST RAND","EKURHULENI","BOKSBURG","BENONI","GERMISTON"],
  "Soweto Taxi Association":               ["SOWETO"],
  "Tshwane Taxi Association":              ["PRETORIA","TSHWANE"],
  "Midvaal Taxi Association":              ["MIDVAAL","VEREENIGING"],
  "Vaal Taxi Association":                 ["VAAL","SASOLBURG","VANDERBIJLPARK"],

  // ── KwaZulu-Natal ──────────────────────────────────────────────────────────
  "KwaZulu-Natal Provincial Taxi Council (KZNTPC)": ["DURBAN","ETHEKWINI","PIETERMARITZBURG","MSUNDUZI","ZULULAND","KWAZULU"],
  "Durban Metro Taxi Association":         ["DURBAN"],
  "Ethekwini Taxi Association":            ["ETHEKWINI","DURBAN"],
  "Pietermaritzburg Taxi Association":     ["PIETERMARITZBURG","MSUNDUZI","PMB"],
  "North Coast Taxi Association":          ["BALLITO","UMHLANGA","STANGER"],
  "South Coast Taxi Association":          ["AMANZIMTOTI","SCOTTBURGH","UMKOMAAS"],
  "Zululand Taxi Association":             ["EMPANGENI","RICHARDS BAY","ESHOWE","ULUNDI"],

  // ── Western Cape ───────────────────────────────────────────────────────────
  "Western Cape Taxi Association (WCTA)":  [],   // all WC routes
  "Cape Amalgamated Taxi Association (CATA)": [
    "CAPE TOWN","KHAYELITSHA","MITCHELLS PLAIN","BELLVILLE","LANGA","NYANGA",
    "GUGULETU","WYNBERG","CLAREMONT","MOWBRAY","PAROW","ELSIES RIVER",
    "HANOVER PARK","ATHLONE","MANENBERG","PHILIPPI","BONTEHEUWEL","HEIDEVELD",
    "GRASSY PARK","LOTUS RIVER","RETREAT","STEENBERG","DELFT","MITCHELLS PLAIN",
  ],
  "Congress of Democratic Taxi Associations (CODETA)": [
    "CAPE TOWN","KHAYELITSHA","MITCHELLS PLAIN","LANGA","NYANGA","GUGULETU",
    "BELLVILLE","MOWBRAY","WYNBERG","CLAREMONT","PAROW",
  ],
  "Bellville Taxi Association":            ["BELLVILLE"],
  "Mitchell's Plain Taxi Association":     ["MITCHELLS PLAIN","MITCHELLS PLAIN"],
  "Khayelitsha Taxi Association":          ["KHAYELITSHA"],
  "Garden Route Taxi Association":         ["GEORGE","MOSSEL BAY","OUDTSHOORN","KNYSNA","WILDERNESS"],

  // ── Eastern Cape ───────────────────────────────────────────────────────────
  "Eastern Cape Taxi Council":             ["PORT ELIZABETH","GQEBERHA","EAST LONDON","MTHATHA","KING WILLIAM"],
  "Port Elizabeth / Gqeberha Taxi Association": ["PORT ELIZABETH","GQEBERHA","UITENHAGE"],
  "East London Taxi Association":          ["EAST LONDON","BUFFALO CITY","MDANTSANE"],
  "King William's Town Taxi Association":  ["KING WILLIAM","KWT"],
  "Mthatha Taxi Association":              ["MTHATHA","OR TAMBO","UMTATA"],

  // ── Limpopo ────────────────────────────────────────────────────────────────
  "Limpopo Taxi Council":                  ["POLOKWANE","TZANEEN","THOHOYANDOU","PHALABORWA","MOKOPANE"],
  "Polokwane Taxi Association":            ["POLOKWANE"],
  "Tzaneen Taxi Association":              ["TZANEEN","LEPHALALE"],
  "Thohoyandou Taxi Association":          ["THOHOYANDOU","VHEMBE","SIBASA"],
  "Phalaborwa Taxi Association":           ["PHALABORWA"],

  // ── Mpumalanga ─────────────────────────────────────────────────────────────
  "Mpumalanga Taxi Council":               ["NELSPRUIT","MBOMBELA","WITBANK","EMALAHLENI","SECUNDA"],
  "Nelspruit / Mbombela Taxi Association": ["NELSPRUIT","MBOMBELA"],
  "Witbank / Emalahleni Taxi Association": ["WITBANK","EMALAHLENI"],
  "Secunda Taxi Association":              ["SECUNDA","GOVAN MBEKI"],

  // ── North West ─────────────────────────────────────────────────────────────
  "North West Taxi Council":               ["RUSTENBURG","MAFIKENG","MAHIKENG","POTCHEFSTROOM"],
  "Rustenburg Taxi Association":           ["RUSTENBURG"],
  "Mafikeng Taxi Association":             ["MAFIKENG","MAHIKENG"],
  "Potchefstroom Taxi Association":        ["POTCHEFSTROOM"],

  // ── Free State ─────────────────────────────────────────────────────────────
  "Free State Taxi Council":               ["BLOEMFONTEIN","MANGAUNG","WELKOM","SASOLBURG"],
  "Bloemfontein Taxi Association":         ["BLOEMFONTEIN","MANGAUNG"],
  "Welkom Taxi Association":               ["WELKOM","MATJHABENG"],
  "Sasolburg Taxi Association":            ["SASOLBURG","METSIMAHOLO"],

  // ── Northern Cape ──────────────────────────────────────────────────────────
  "Northern Cape Taxi Council":            ["KIMBERLEY","UPINGTON"],
  "Kimberley Taxi Association":            ["KIMBERLEY"],
  "Upington Taxi Association":             ["UPINGTON"],
};
