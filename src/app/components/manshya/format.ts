// Money is always integer cents (ZAR). These helpers only format; they never do arithmetic on rands.

/** 12345 -> "R 123.45", negatives as "− R 123.45". */
export const R = (cents: number): string =>
  (cents < 0 ? "− " : "") + "R " + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Short axis label: 250000 -> "R2.5k", 5000 -> "R50". */
export const K = (cents: number): string =>
  cents >= 100000 ? "R" + (cents / 100000).toFixed(cents >= 1e6 ? 0 : 1) + "k" : "R" + Math.round(cents / 100);

export const initials = (s: string | null | undefined): string =>
  (s || "?").split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

export const when = (iso: string): string =>
  new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Like `when`, but a dash for missing dates. */
export const dt = (iso?: string | null): string => (iso ? when(iso) : "—");

export const monthName = (key: string): string => {
  const [y, m] = key.split("-");
  return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

/** "2026-09" shifted by d months. */
export const shiftMonth = (key: string, d: number): string => {
  let [y, m] = key.split("-").map(Number);
  m += d;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
};

export const thisMonth = (): string => new Date().toISOString().slice(0, 7);

/** Running total per day of the month, for the sales chart. */
export function cumulative(series: { day: number; total: number }[], days: number): number[] {
  const byDay = new Map(series.map((r) => [r.day, r.total]));
  let acc = 0;
  const out: number[] = [];
  for (let d = 1; d <= days; d++) {
    acc += byDay.get(d) || 0;
    out.push(acc);
  }
  return out;
}

export const pctOf = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** Rand string typed into a form -> cents, or undefined if blank. */
export const toCents = (rand: string): number | undefined => {
  const v = rand.trim();
  return v === "" ? undefined : Math.round(parseFloat(v) * 100);
};
