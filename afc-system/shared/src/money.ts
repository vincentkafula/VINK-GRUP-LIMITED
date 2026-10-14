/** Money is whole cents everywhere (integers). Never floats. */
export const isCents = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

export function formatRand(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}R${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parses "12.50" or "12" (rand) into cents; throws on anything else. */
export function randToCents(s: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s.trim())) throw new Error("Amount must look like 12 or 12.50");
  const [r, c = ""] = s.trim().split(".");
  return Number(r) * 100 + Number(c.padEnd(2, "0"));
}

/** amount x basisPoints / 10 000, rounded half up, in integers. 10 000 bp = 100%. */
export const applyBp = (amount: number, bp: number): number => Math.floor((amount * bp + 5000) / 10000);
