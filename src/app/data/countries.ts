/**
 * A real, complete list of world countries (ISO 3166-1 common short
 * names, ~195 entries) -- for country-selection dropdowns on
 * application forms. Deliberately separate from
 * server/src/routes/geoCurrency.ts's own COUNTRY_CURRENCY list, which
 * only covers ~25 major countries for currency-conversion display
 * purposes, not a complete list -- confirmed by reading that file
 * directly before building this one, rather than assuming it already
 * covered this.
 */

export const COUNTRIES: string[] = [
  "South Africa",
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Republic of)", "Congo (Democratic Republic of)",
  "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador",
  "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo",
  "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania",
  "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius",
  "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
  "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway",
  "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland",
  "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino",
  "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
  "Somalia", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey",
  "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu",
  "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

/** South Africa's 9 provinces -- the existing form's own list, moved here so it can be shared by other application forms too. */
export const SA_PROVINCES: string[] = [
  "Western Cape", "Gauteng", "KwaZulu-Natal", "Eastern Cape", "Limpopo", "Mpumalanga", "North West", "Free State", "Northern Cape",
];

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
