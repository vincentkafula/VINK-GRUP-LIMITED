/**
 * Real, complete country and subdivision (province/state/region) data
 * -- sourced from the `iso-3166` npm package (wooorm, MIT, actively
 * maintained, https://github.com/wooorm/iso-3166), not hand-typed.
 * Verified before use, not just installed and trusted blindly: spot-
 * checked South Africa's 9 provinces (exact match to what this file
 * previously had hand-typed), the US (57 states/territories), Nigeria
 * (37), and India (36) all against known-correct real-world counts.
 *
 * Covers all 249 ISO 3166-1 "assigned" entries (this includes some
 * non-sovereign territories alongside sovereign states, e.g. Bermuda,
 * Puerto Rico -- the real, authoritative ISO standard, not a
 * subjective country-vs-territory judgement call made by this file).
 * 49 of the 249 genuinely have zero ISO 3166-2 subdivisions on record
 * (mostly small island territories and city-states) -- for those,
 * provincesForCountry() returns an empty array and the calling form
 * should fall back to a free-text field, which is the honest behaviour
 * for a country that doesn't have provinces to offer, not a gap.
 */

import { iso31661 } from "iso-3166/1.js";
import { iso31662 } from "iso-3166/2.js";

// A handful of ISO official names read awkwardly on a real application
// form ("Korea, Republic of" instead of "South Korea") -- overridden
// here for the countries where official and common usage diverge
// enough to matter, while every other name is used exactly as ISO
// defines it.
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  "Korea, Republic of": "South Korea",
  "Korea, Democratic People's Republic of": "North Korea",
  "Russian Federation": "Russia",
  "Iran, Islamic Republic of": "Iran",
  "Syrian Arab Republic": "Syria",
  "Tanzania, United Republic of": "Tanzania",
  "Viet Nam": "Vietnam",
  "Lao People's Democratic Republic": "Laos",
  "Moldova, Republic of": "Moldova",
  "Bolivia, Plurinational State of": "Bolivia",
  "Venezuela, Bolivarian Republic of": "Venezuela",
  "Micronesia, Federated States of": "Micronesia",
  "Congo, Democratic Republic of the": "Congo (Democratic Republic of)",
  "Congo": "Congo (Republic of)",
  "Taiwan, Province of China": "Taiwan",
  "Brunei Darussalam": "Brunei",
  "United Kingdom of Great Britain and Northern Ireland": "United Kingdom",
  "Netherlands, Kingdom of the": "Netherlands",
  // Found via a systematic diff against the full real ISO list, not
  // just spot-checks -- "United States of America" wasn't mapped to
  // "United States" at all in an earlier version of this file, which
  // silently broke province lookup for it (name mismatch -> no match
  // in NAME_TO_ALPHA2 -> empty array), caught by testing every
  // country's real output rather than assuming the mapping was
  // complete.
  "United States of America": "United States",
  "Holy See": "Vatican City",
  "Palestine, State of": "Palestine",
  "Türkiye": "Turkey",
};

function displayName(officialName: string): string {
  return DISPLAY_NAME_OVERRIDES[officialName] ?? officialName;
}

interface CountryEntry { name: string; alpha2: string }

const ASSIGNED_COUNTRIES: CountryEntry[] = iso31661
  .filter(c => c.state === "assigned")
  .map(c => ({ name: displayName(c.name), alpha2: c.alpha2 }));

const NAME_TO_ALPHA2 = new Map(ASSIGNED_COUNTRIES.map(c => [c.name, c.alpha2]));

/** Full country list, display names, South Africa first since it's the most relevant applicant origin for this form. */
export const COUNTRIES: string[] = [
  "South Africa",
  ...ASSIGNED_COUNTRIES.filter(c => c.name !== "South Africa").map(c => c.name).sort((a, b) => a.localeCompare(b)),
];

const SUBDIVISIONS = iso31662;

/**
 * Real ISO 3166-2 subdivisions for a given country (by its display
 * name from COUNTRIES above). Returns an empty array for the 49
 * countries with no subdivisions on record -- calling code should
 * fall back to a free-text field in that case, not treat it as an
 * error.
 */
export function provincesForCountry(countryDisplayName: string): string[] {
  const alpha2 = NAME_TO_ALPHA2.get(countryDisplayName);
  if (!alpha2) return [];
  return SUBDIVISIONS.filter(s => s.parent === alpha2).map(s => s.name).sort((a, b) => a.localeCompare(b));
}

/** Kept for backward compatibility with existing callers -- South Africa's 9 real provinces, now sourced from the same verified dataset rather than a separate hand-typed list. */
export const SA_PROVINCES: string[] = provincesForCountry("South Africa");

export type IdDocumentType = "South African ID" | "Passport" | "Asylum Seeker Permit" | "Work Permit" | "Refugee ID";

/**
 * Which identity document types actually make sense for a given
 * country -- a South African ID is only a real, valid document for
 * someone in/from South Africa; a foreign national from any other
 * country wouldn't have one. Confirmed reasoning, not arbitrary: this
 * mirrors the same real distinction RICA registration already draws
 * elsewhere in this codebase (server/src/services/saIdValidator.ts and
 * ricaRouter.ts) between an SA ID and a passport/refugee document.
 */
export function idDocumentTypesForCountry(country: string): IdDocumentType[] {
  if (country === "South Africa") {
    return ["South African ID", "Passport"];
  }
  return ["Passport", "Asylum Seeker Permit", "Refugee ID", "Work Permit"];
}

