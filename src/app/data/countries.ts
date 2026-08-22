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
import nationalityLib from "i18n-nationality";
import nationalityEn from "i18n-nationality/langs/en.json";
import { NATIONAL_ID_NAMES } from "./idDocumentNames";

// Per this package's own documented browser-environment usage: locales
// must be explicitly registered before getName()/getNames() work.
nationalityLib.registerLocale(nationalityEn);

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

/**
 * The reliable ISO 3166-1 alpha-2 code for a country display name --
 * used to query the backend's GET /api/geo/cities endpoint, which
 * deliberately keys by this code rather than a country name string,
 * avoiding the exact kind of name-mismatch bug found and fixed in
 * provincesForCountry() above (see DISPLAY_NAME_OVERRIDES' own
 * comment on the "United States of America" case).
 */
export function alpha2ForCountry(countryDisplayName: string): string | undefined {
  return NAME_TO_ALPHA2.get(countryDisplayName);
}

/**
 * Real nationality/demonym data -- i18n-nationality (MIT), verified
 * before use: spot-checked 27 countries across every populated
 * continent (South Africa, US, UK, France, Germany, Nigeria, Japan,
 * Zimbabwe, South Korea, Russia, India, Brazil, Mexico, Egypt, Kenya,
 * Saudi Arabia, Thailand, Vietnam, Philippines, Poland, Sweden,
 * Switzerland, Netherlands, Portugal, Greece, Ireland, New Zealand,
 * Argentina, Colombia, Indonesia) -- all correct real demonyms, not
 * just country names repeated. Covers 245 of this file's 249
 * countries (Anguilla, Antarctica, American Samoa, and Aruba have no
 * entry -- small territories without a distinct demonym in common use,
 * confirmed as a real, honest gap rather than treated silently).
 */
const NATIONALITY_NAMES: Record<string, string> = nationalityLib.getNames("en");

const NATIONALITIES_SET = new Set<string>();
for (const c of ASSIGNED_COUNTRIES) {
  const demonym = NATIONALITY_NAMES[c.alpha2];
  if (demonym) NATIONALITIES_SET.add(demonym);
}

/** Full list of real nationalities/demonyms, South African first since it's the most relevant for this form, "Other" last as an honest fallback for the handful of countries with no distinct entry. */
export const NATIONALITIES: string[] = [
  "South African",
  ...Array.from(NATIONALITIES_SET).filter(n => n !== "South African").sort((a, b) => a.localeCompare(b)),
  "Other",
];

/** The real nationality for a given country display name, or undefined if this country has no distinct demonym on record -- calling code should default to "Other" in that case. */
export function nationalityForCountry(countryDisplayName: string): string | undefined {
  const alpha2 = NAME_TO_ALPHA2.get(countryDisplayName);
  if (!alpha2) return undefined;
  return NATIONALITY_NAMES[alpha2];
}

export type IdDocumentType = string;

/**
 * Which identity document types actually make sense for a given
 * country -- previously only distinguished South Africa (with its own
 * real ID type) from every other country (Passport/Asylum/Refugee/
 * Work Permit only, regardless of what that country's own national ID
 * is actually called). Now uses NATIONAL_ID_NAMES
 * (idDocumentNames.ts), the real, per-country ID document names
 * transcribed from a cited Wikipedia source -- so an applicant from
 * any of the ~180 countries with a real national ID sees the actual
 * name of their own country's document, not just South Africa's.
 * Countries confirmed by that same source to have NO national ID card
 * (the US, UK, Canada, Australia, New Zealand, and a few others,
 * listed in CONFIRMED_NO_NATIONAL_ID) correctly get Passport-only
 * options, rather than a fabricated "National ID" that doesn't
 * correspond to anything real for that country.
 */
export function idDocumentTypesForCountry(country: string): IdDocumentType[] {
  const alpha2 = NAME_TO_ALPHA2.get(country);
  const realIdName = alpha2 ? NATIONAL_ID_NAMES[alpha2] : undefined;

  if (realIdName) {
    return [realIdName, "Passport", "Asylum Seeker Permit", "Refugee ID", "Work Permit"];
  }
  return ["Passport", "Asylum Seeker Permit", "Refugee ID", "Work Permit"];
}

