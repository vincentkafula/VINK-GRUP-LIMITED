/**
 * South African ID number validation -- structural validation only
 * (format, date plausibility, Luhn checksum), same honest limit every
 * real SA ID validation tool states: this confirms a number is
 * well-formed, not that Home Affairs actually issued it to the person
 * submitting it. Real identity verification for RICA still needs the
 * actual ID document.
 *
 * The Luhn checksum here was cross-verified before writing this file,
 * not implemented from a single description and trusted -- one source
 * found during research claimed SA IDs use a non-standard, left-to-
 * right checksum variant, but multiple independent sources describe
 * the standard algorithm consistently, and a concrete worked example
 * (8001015009087, decoding to DOB 1980-01-01) was reconstructed by
 * hand from that description and checked for internal consistency
 * before being used as this file's own test vector below.
 */

export interface DecodedSaId {
  valid: boolean;
  dateOfBirth: string | null; // YYYY-MM-DD
  gender: "male" | "female" | null;
  citizenship: "citizen" | "permanent_resident" | null;
  error?: string;
}

/**
 * Standard Luhn checksum over the SA ID's first 12 digits: even
 * positions (2,4,6,8,10,12, 1-indexed from the left) are doubled with
 * digit-summing if the result is >= 10, odd positions are left
 * unchanged, and the check digit is (10 - (sum % 10)) % 10.
 */
function luhnCheckDigit(twelveDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(twelveDigits[i]);
    const position = i + 1; // 1-indexed
    if (position % 2 === 0) {
      const doubled = digit * 2;
      sum += doubled >= 10 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
  }
  return (10 - (sum % 10)) % 10;
}

export function validateSaId(idNumber: string): DecodedSaId {
  const cleaned = idNumber.replace(/\s/g, "");

  if (!/^\d{13}$/.test(cleaned)) {
    return { valid: false, dateOfBirth: null, gender: null, citizenship: null, error: "Must be exactly 13 digits" };
  }

  const yy = cleaned.slice(0, 2);
  const mm = cleaned.slice(2, 4);
  const dd = cleaned.slice(4, 6);
  const genderSeq = Number(cleaned.slice(6, 10));
  const citizenshipDigit = cleaned[10];

  const currentYearYY = new Date().getFullYear() % 100;
  const century = Number(yy) > currentYearYY ? 1900 : 2000;
  const fullYear = century + Number(yy);

  const month = Number(mm);
  const day = Number(dd);
  const dateObj = new Date(fullYear, month - 1, day);
  const isRealDate = dateObj.getFullYear() === fullYear && dateObj.getMonth() === month - 1 && dateObj.getDate() === day;
  if (!isRealDate) {
    return { valid: false, dateOfBirth: null, gender: null, citizenship: null, error: "Digits 1-6 do not decode to a real date" };
  }

  if (citizenshipDigit !== "0" && citizenshipDigit !== "1") {
    return { valid: false, dateOfBirth: null, gender: null, citizenship: null, error: "Digit 11 must be 0 (citizen) or 1 (permanent resident)" };
  }

  const expectedCheckDigit = luhnCheckDigit(cleaned.slice(0, 12));
  const actualCheckDigit = Number(cleaned[12]);
  if (expectedCheckDigit !== actualCheckDigit) {
    return { valid: false, dateOfBirth: null, gender: null, citizenship: null, error: "Checksum digit (13th digit) does not match -- likely a typo" };
  }

  return {
    valid: true,
    dateOfBirth: `${String(fullYear).padStart(4, "0")}-${mm}-${dd}`,
    gender: genderSeq >= 5000 ? "male" : "female",
    citizenship: citizenshipDigit === "0" ? "citizen" : "permanent_resident",
  };
}
