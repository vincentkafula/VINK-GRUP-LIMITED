export type AssociationLevel = "National" | "Provincial" | "Regional" | "Local";

export interface TaxiAssociation {
  province: string;
  name: string;
  level: AssociationLevel;
  notes: string;
}

export const TAXI_ASSOCIATIONS: TaxiAssociation[] = [
  // ── National ───────────────────────────────────────────────────────────────
  { province: "National", name: "SANTACO (South African National Taxi Council)",  level: "National",   notes: "Unified voice; +27 12 321 1043; 937 Francis Baard St, Arcadia, Pretoria" },
  { province: "National", name: "National Taxi Alliance (NTA)",                   level: "National",   notes: "~200 000 taxis; 600 000+ members; 7 regions" },

  // ── Gauteng ────────────────────────────────────────────────────────────────
  { province: "Gauteng",  name: "Gauteng Johannesburg Region (GJR)",              level: "Provincial", notes: "40+ local associations; serves ~70% of Gauteng population" },
  { province: "Gauteng",  name: "Central Johannesburg Taxi Association",           level: "Local",      notes: "Johannesburg CBD routes" },
  { province: "Gauteng",  name: "East Rand Taxi Association",                      level: "Local",      notes: "East Rand / Ekurhuleni area" },
  { province: "Gauteng",  name: "Soweto Taxi Association",                         level: "Local",      notes: "Soweto routes" },
  { province: "Gauteng",  name: "Tshwane Taxi Association",                        level: "Local",      notes: "Pretoria / Tshwane area" },
  { province: "Gauteng",  name: "Midvaal Taxi Association",                        level: "Local",      notes: "Midvaal area" },
  { province: "Gauteng",  name: "Vaal Taxi Association",                           level: "Local",      notes: "Vaal Triangle area" },

  // ── KwaZulu-Natal ──────────────────────────────────────────────────────────
  { province: "KwaZulu-Natal", name: "KwaZulu-Natal Provincial Taxi Council (KZNTPC)", level: "Provincial", notes: "252 associations; 16 regional councils" },
  { province: "KwaZulu-Natal", name: "Durban Metro Taxi Association",              level: "Regional",   notes: "Durban metro area" },
  { province: "KwaZulu-Natal", name: "Ethekwini Taxi Association",                 level: "Regional",   notes: "eThekwini municipality" },
  { province: "KwaZulu-Natal", name: "Pietermaritzburg Taxi Association",          level: "Local",      notes: "Msunduzi / PMB area" },
  { province: "KwaZulu-Natal", name: "North Coast Taxi Association",               level: "Regional",   notes: "North Coast routes" },
  { province: "KwaZulu-Natal", name: "South Coast Taxi Association",               level: "Regional",   notes: "South Coast routes" },
  { province: "KwaZulu-Natal", name: "Zululand Taxi Association",                  level: "Regional",   notes: "Northern KZN" },

  // ── Western Cape ───────────────────────────────────────────────────────────
  { province: "Western Cape", name: "Western Cape Taxi Association (WCTA)",        level: "Provincial", notes: "Cape Town and surrounds" },
  { province: "Western Cape", name: "Cape Amalgamated Taxi Association (CATA)",    level: "Regional",   notes: "Largest in Cape Town metro" },
  { province: "Western Cape", name: "Congress of Democratic Taxi Associations (CODETA)", level: "Regional", notes: "Cape Town metro" },
  { province: "Western Cape", name: "Bellville Taxi Association",                  level: "Local",      notes: "Northern Suburbs" },
  { province: "Western Cape", name: "Mitchell's Plain Taxi Association",           level: "Local",      notes: "Cape Flats routes" },
  { province: "Western Cape", name: "Khayelitsha Taxi Association",                level: "Local",      notes: "Khayelitsha routes" },
  { province: "Western Cape", name: "Garden Route Taxi Association",               level: "Regional",   notes: "George / Mossel Bay area" },

  // ── Eastern Cape ───────────────────────────────────────────────────────────
  { province: "Eastern Cape", name: "Eastern Cape Taxi Council",                   level: "Provincial", notes: "Provincial body" },
  { province: "Eastern Cape", name: "Port Elizabeth / Gqeberha Taxi Association",  level: "Regional",   notes: "Nelson Mandela Bay" },
  { province: "Eastern Cape", name: "East London Taxi Association",                level: "Regional",   notes: "Buffalo City metro" },
  { province: "Eastern Cape", name: "King William's Town Taxi Association",        level: "Local",      notes: "KWT area" },
  { province: "Eastern Cape", name: "Mthatha Taxi Association",                    level: "Local",      notes: "OR Tambo district" },

  // ── Limpopo ────────────────────────────────────────────────────────────────
  { province: "Limpopo",      name: "Limpopo Taxi Council",                        level: "Provincial", notes: "Provincial body" },
  { province: "Limpopo",      name: "Polokwane Taxi Association",                  level: "Regional",   notes: "Polokwane city routes" },
  { province: "Limpopo",      name: "Tzaneen Taxi Association",                    level: "Local",      notes: "Tzaneen area" },
  { province: "Limpopo",      name: "Thohoyandou Taxi Association",                level: "Local",      notes: "Vhembe district" },
  { province: "Limpopo",      name: "Phalaborwa Taxi Association",                 level: "Local",      notes: "Phalaborwa area" },

  // ── Mpumalanga ─────────────────────────────────────────────────────────────
  { province: "Mpumalanga",   name: "Mpumalanga Taxi Council",                     level: "Provincial", notes: "Provincial body" },
  { province: "Mpumalanga",   name: "Nelspruit / Mbombela Taxi Association",       level: "Regional",   notes: "Mbombela city area" },
  { province: "Mpumalanga",   name: "Witbank / Emalahleni Taxi Association",       level: "Regional",   notes: "Emalahleni area" },
  { province: "Mpumalanga",   name: "Secunda Taxi Association",                    level: "Local",      notes: "Govan Mbeki area" },

  // ── North West ─────────────────────────────────────────────────────────────
  { province: "North West",   name: "North West Taxi Council",                     level: "Provincial", notes: "Provincial body" },
  { province: "North West",   name: "Rustenburg Taxi Association",                 level: "Regional",   notes: "Rustenburg city area" },
  { province: "North West",   name: "Mafikeng Taxi Association",                   level: "Regional",   notes: "Mahikeng / capital area" },
  { province: "North West",   name: "Potchefstroom Taxi Association",              level: "Local",      notes: "JB Marks municipality" },

  // ── Free State ─────────────────────────────────────────────────────────────
  { province: "Free State",   name: "Free State Taxi Council",                     level: "Provincial", notes: "Provincial body" },
  { province: "Free State",   name: "Bloemfontein Taxi Association",               level: "Regional",   notes: "Mangaung metro" },
  { province: "Free State",   name: "Welkom Taxi Association",                     level: "Regional",   notes: "Matjhabeng area" },
  { province: "Free State",   name: "Sasolburg Taxi Association",                  level: "Local",      notes: "Metsimaholo area" },

  // ── Northern Cape ──────────────────────────────────────────────────────────
  { province: "Northern Cape", name: "Northern Cape Taxi Council",                 level: "Provincial", notes: "Provincial body" },
  { province: "Northern Cape", name: "Kimberley Taxi Association",                 level: "Regional",   notes: "Sol Plaatje municipality" },
  { province: "Northern Cape", name: "Upington Taxi Association",                  level: "Local",      notes: "!Kheis / Upington area" },
];

export const PROVINCES = [
  "National",
  "Gauteng",
  "KwaZulu-Natal",
  "Western Cape",
  "Eastern Cape",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Free State",
  "Northern Cape",
] as const;

export const LEVELS: AssociationLevel[] = ["National", "Provincial", "Regional", "Local"];

export const LEVEL_COLORS: Record<AssociationLevel, { bg: string; text: string }> = {
  National:   { bg: "#FEF3C7", text: "#92400E" },
  Provincial: { bg: "#DBEAFE", text: "#1E40AF" },
  Regional:   { bg: "#D1FAE5", text: "#065F46" },
  Local:      { bg: "#F3F4F6", text: "#374151" },
};

export const PROVINCE_EMOJIS: Record<string, string> = {
  National:       "🇿🇦",
  Gauteng:        "🏙️",
  "KwaZulu-Natal":"🌊",
  "Western Cape": "🏔️",
  "Eastern Cape": "🌿",
  Limpopo:        "🦁",
  Mpumalanga:     "🌅",
  "North West":   "💎",
  "Free State":   "🌾",
  "Northern Cape":"🏜️",
};
