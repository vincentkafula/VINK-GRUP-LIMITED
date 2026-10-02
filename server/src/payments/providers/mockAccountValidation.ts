import type { AccountValidationProvider, AccountValidationRequest, AccountValidationResult } from "./types.js";

const luhn = (n: string) => {
  let sum = 0, alt = false;
  for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; }
  return sum % 10 === 0;
};

/** Sandbox validation with no network. Valid = passes the Luhn check and is not expired; CVV2 "000" fails. Never keeps the card number. */
export class MockAccountValidation implements AccountValidationProvider {
  readonly name = "mock";
  async validate(i: AccountValidationRequest): Promise<AccountValidationResult> {
    if (!/^[0-9]{13,19}$/.test(i.primaryAccountNumber)) throw new Error("primaryAccountNumber must be 13 to 19 digits");
    if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(i.expiry)) throw new Error("expiry must be YYYY-MM");
    const [y, m] = i.expiry.split("-").map(Number), now = new Date();
    const expired = y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth() + 1);
    const cvvBad = i.cvv2 === "000";
    const valid = luhn(i.primaryAccountNumber) && !expired && !cvvBad;
    return { valid, actionCode: valid ? "00" : expired ? "54" : "14", reference: "mock-" + Date.now(), ...(i.cvv2 ? { cvv2Result: cvvBad ? "N" : "M" } : {}) };
  }
}
