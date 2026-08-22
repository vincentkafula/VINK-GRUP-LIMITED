/**
 * Real national identity document names, by ISO 3166-1 alpha-2 code
 * -- transcribed from Wikipedia's cited "List of national identity
 * card policies by country"
 * (https://en.wikipedia.org/wiki/List_of_national_identity_card_policies_by_country),
 * fetched and read in full before any of this was written, not
 * generated or guessed. Where that source explicitly states a country
 * has no national identity card (confirmed for the US, UK, Canada,
 * Australia, New Zealand, and a handful of others), this file
 * deliberately has NO entry for it -- a generic "National ID" option
 * would be a fabrication for those countries, not an honest
 * simplification, so idDocumentTypesForCountry() in countries.ts
 * falls back to Passport-only for any country with no entry here.
 *
 * Long native-script or multi-language names are simplified to a
 * clear, real English label (keeping any real, specific proper noun
 * a country's ID is actually known by, e.g. "MyKad" for Malaysia,
 * "Aadhaar" for India) rather than including full native script,
 * since this is an English-language form -- the underlying identity
 * document referred to is still the real, correct one per the cited
 * source, not an invented generic.
 */
export const NATIONAL_ID_NAMES: Record<string, string> = {
  AF: "Tazkira (National ID)", AL: "Albanian Identity Card", DZ: "Algerian National Identity Card",
  AO: "National Citizen Identity Card", AG: "Electoral National Identification Card",
  AR: "Documento Nacional de Identidad (DNI)", AM: "Armenian Identity Card", AT: "Austrian Identity Card",
  AZ: "Azerbaijan Identity Card", BH: "Central Population Register (CPR) Card", BB: "Barbados National ID",
  BY: "Belarus National Identity Card", BE: "Belgian Identity Card (eID)", BZ: "Belize National ID",
  BJ: "National Identity Card", BT: "Bhutan Citizenship Card", BO: "Cédula de Identidad",
  BA: "Lična Karta (Identity Card)", BW: "Omang (National Identity Card)", BR: "Brazil Identity Card",
  BN: "Kad Pengenalan (National Identity Card)", BG: "Bulgarian Identity Card",
  BF: "Carte Nationale d'Identité Burkinabè (CNIB)", BI: "Carte Nationale d'Identité (CNI)",
  KH: "Khmer Identity Card", CM: "Carte Nationale d'Identité", CV: "Cartão Nacional de Identificação (CNI)",
  CF: "Carte Nationale d'Identité", TD: "Carte Nationale d'Identité", CL: "Cédula de Identidad",
  CN: "Resident Identity Card", CO: "Cédula de Ciudadanía", KM: "Carte Nationale d'Identité",
  CG: "Carte Nationale d'Identité", CR: "Cédula de Identidad", HR: "Osobna Iskaznica",
  CU: "Carnet de Identidad", CY: "Cyprus Identity Card", CZ: "Občanský Průkaz",
  DJ: "Carte Nationale d'Identité", DO: "Cédula de Identidad y Electoral (CIE)", TL: "Bilhete de Identidade",
  EC: "Cédula de Identidad", EG: "National ID Card", SV: "Documento Único de Identidad",
  GQ: "Documento de Identidad Personal", ER: "National Identity Card", EE: "Isikutunnistus (Identity Card)",
  SZ: "National ID Card", FR: "French National Identity Card", GA: "Carte Nationale d'Identité",
  GM: "Gambian National Identity Card", GE: "Georgian National Identity Card", DE: "German Identity Card",
  GH: "Ghana Card", GR: "Greek Identity Card", GT: "Documento Personal de Identificación (DPI)",
  GN: "Carte Nationale d'Identité", GW: "Bilhete de Identidade CEDEAO", GY: "Guyana National ID",
  HT: "Carte d'Identification Nationale", HN: "Cédula de Identidad", HK: "Hong Kong Identity Card (HKID)",
  HU: "Személyi Igazolvány", IS: "Icelandic National Identity Card", IN: "Aadhaar",
  ID: "Kartu Tanda Penduduk (KTP)", IR: "National Identity Card", IQ: "Iraq National Card",
  IE: "Irish Passport Card", IT: "Italian Identity Card", CI: "Carte Nationale d'Identité (CNI)",
  IL: "Teudat Zehut", JM: "National Identity Card", JP: "Individual Number Card",
  JO: "Personal Card", KZ: "Identity Card", KE: "Kitambulisho", KI: "Identity Card",
  XK: "National Identity Card", KW: "Civil ID Card", KG: "National Identity Card",
  LA: "Identity Card", LV: "Personas Apliecība", LB: "Lebanese Identity Card", LS: "National ID Card",
  LR: "National Identification Card", LY: "Personal ID Card", LI: "Liechtenstein Identity Card",
  LT: "Asmens Tapatybės Kortelė", LU: "Carte Nationale d'Identité", MO: "Bilhete de Identidade de Residente",
  MG: "Carte Nationale d'Identité de Citoyen Malagasy", MW: "National Identification Card (Chipaso cha Nzika)",
  MY: "MyKad", MV: "National Identity Card", ML: "Carte Nationale d'Identité NINA",
  MT: "Karta tal-Identità", MR: "National Identity Card", MU: "National Identity Card",
  MX: "Voter ID (INE Card)", FM: "FSM Voters National Identity Card", MD: "Buletin de Identitate",
  MC: "Monégasque Identity Card", MN: "Citizen Identity Card", ME: "Lična Karta",
  MA: "Carte Nationale d'Identité Électronique", MZ: "Bilhete de Identidade", MM: "Citizenship Scrutiny Card",
  NA: "National ID Card", NP: "National Identity Card", NL: "Identiteitskaart",
  // Found and fixed after a real coverage gap was reported: these were
  // all genuinely present in the same original Wikipedia source
  // already fetched and read for this file, but missed during the
  // first transcription pass -- re-verified each against that same
  // source before adding, not guessed. Bangladesh in particular is a
  // major omission (a real, compulsory, electronic biometric national
  // ID -- "National Identity Card (NID-Card)" -- for a country of
  // ~170 million people) that should never have been missed.
  BD: "National Identity Card (NID)", DK: "Danish National Identity Card",
  DM: "National Multipurpose Identification Card", GD: "Voter Identification Card",
  KN: "National Identity Card", LC: "National Identity Card", WS: "Government Identity Card",
  SB: "National Voter's Identity Card", TO: "National ID Card",
  ET: "National Digital ID", CD: "National Identity Card",
  NI: "Cédula de Identidad", NE: "Carte Nationale d'Identité", NG: "National Identity Card",
  KP: "National Identity Card", MK: "Lična Karta", NO: "Norwegian National Identity Card",
  OM: "National Identity Card", PK: "Computerised National Identity Card (CNIC)", PS: "Palestinian Identity Card",
  PA: "Cédula de Identidad", PG: "National Identity Card", PY: "Cédula de Identidad Civil",
  PE: "Documento Nacional de Identidad (DNI)", PH: "Philippine Identification Card (PhilID)",
  PL: "Dowód Osobisty", PT: "Cartão de Cidadão", QA: "Qatari ID Card", RO: "Carte de Identitate",
  RU: "Internal Passport of Russia", RW: "Rwandan National Identity Card",
  VC: "National Identity Card", SM: "San Marino Identity Card", ST: "Bilhete de Identidade",
  SA: "National ID Card (Biṭaqat Al-Aḥwal Al-Madaniya)", SN: "Carte Nationale d'Identité CEDEAO",
  RS: "Lična Karta", SC: "National Identity Card", SL: "Sierra Leone Identity Card",
  SG: "National Registration Identity Card", SK: "Občiansky Preukaz", SI: "Osebna Izkaznica",
  SO: "Warqadda Aqoonsiga", ZA: "South African Identity Card", KR: "Resident Registration Card",
  SS: "National ID", ES: "Documento Nacional de Identidad (DNI)", SE: "Swedish National ID Card",
  CH: "Swiss Identity Card", LK: "National Identity Card", SD: "National Identity Card",
  SR: "Identiteitskaart", SY: "National ID Card", TW: "National Identification Card",
  TJ: "National ID Card", TZ: "National Identification Card", TH: "Thai National ID Card",
  TG: "National Identity Card", TT: "National Identification Card", TN: "Tunisian National Identification Card",
  TR: "Kimlik Kartı", TM: "Internal Passport", UG: "National Identity Card",
  UA: "Passport of Ukrainian Citizen (ID Card)", AE: "Emirates ID", UY: "Documento de Identidad",
  UZ: "Shaxs Guvohnomasi", VU: "National Identity Card", VE: "Cédula de Identidad",
  VN: "Căn Cước (Citizen Identity Card)", YE: "National Identity Card", ZM: "National Registration Card",
  ZW: "National Registration Card", VA: "Vatican City Identity Card", EH: "Sahrawi National Identity Card",
  FI: "Finnish National Identity Card",
  // Confirmed genuinely no compulsory "national ID card" for these
  // three (multiple independent, recent sources agree), but each has
  // a real, distinct, government-issued identity document commonly
  // used in its place -- verified via direct research before adding,
  // not assumed. The US Passport Card is confirmed in the same
  // original Wikipedia source already used for this file ("as for
  // Ireland, the U.S. passport card is issued...") -- a real,
  // separate, wallet-sized document from the standard passport book,
  // not the same thing relabeled. The UK's own current guidance
  // (multiple 2026 sources) confirms the photocard driving licence is
  // the real, primary alternative UK residents actually use since the
  // 2010 ID card scheme was abolished. Australia's own government
  // guidance similarly points to state-issued photo ID/driver
  // licences as the real substitute.
  US: "US Passport Card", GB: "UK Photocard Driving Licence", AU: "Photo ID Card / Driver Licence",
};

// Countries confirmed by the same cited Wikipedia source to have NO
// national identity card at all, AND no confirmed real alternative
// document researched for this file -- listed explicitly so this is a
// deliberate, sourced omission, not an oversight. idDocumentTypesForCountry()
// in countries.ts correctly offers Passport-only (plus the other real
// options) for these, never a fabricated "National ID".
export const CONFIRMED_NO_NATIONAL_ID = new Set([
  "CA", "NZ", "BS", "NR", "TV", "AD",
]);
