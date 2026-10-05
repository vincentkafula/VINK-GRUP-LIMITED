/**
 * Bank statement import: turns a CSV statement from any bank into credit lines for the pooled accounts, without needing the bank's API.
 * Pure parsing and validation here; the caller records each line (which is exactly-once on the bank's own reference, so importing the same file
 * twice, or overlapping files, never credits twice).
 *
 * The staff member says which column is which (banks differ), so nothing about a particular bank is built in.
 */
export interface Mapping { bankRef: string; reference: string; amount: string; currency?: string; direction?: string }
export interface ImportLine { row: number; bankRef: string; reference: string; amountCents: number; currency: string }
export interface ImportProblem { row: number; error: string }
export const MAX_ROWS = 2000, MAX_BYTES = 1_000_000;

/** A small CSV reader: quoted fields, doubled quotes, commas or semicolons, CRLF. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** "1 234,56", "1,234.56", "R1234.50", "-50.00", "(50.00)" -> cents (negative for debits). null if it is not an amount. */
export function parseAmountCents(raw: string): number | null {
  let s = raw.trim().replace(/[A-Za-z$€£\s ]/g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (s.endsWith("-")) { neg = !neg; s = s.slice(0, -1); }
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  const dec = Math.max(lastDot, lastComma);
  let intPart = s, frac = "";
  if (dec >= 0 && s.length - dec - 1 <= 2 && s.length - dec - 1 >= 1) {
    // the last separator is a decimal point only when 1 or 2 digits follow it; otherwise it groups thousands ("1,234")
    if (s.split(s[dec]).length > 2) return null;                                  // the same mark cannot be both the thousands and the decimal separator
    intPart = s.slice(0, dec); frac = s.slice(dec + 1);
  }
  if (/[.,]/.test(intPart) && !/^\d{1,3}([.,]\d{3})+$/.test(intPart)) return null;      // grouping must be 1-3 digits then groups of exactly 3
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(intPart) || (frac !== "" && !/^\d{1,2}$/.test(frac))) return null;
  const cents = Number(intPart) * 100 + Number(frac.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

export function readStatement(csv: string, m: Mapping, defaultCurrency: "ZAR" | "ZMW"): { headers: string[]; lines: ImportLine[]; skipped: number; problems: ImportProblem[] } | { error: string } {
  if (csv.length > MAX_BYTES) return { error: "The file is too large (limit 1 MB). Split it into smaller files." };
  const rows = parseCsv(csv);
  if (rows.length < 2) return { error: "The file has no data rows." };
  if (rows.length - 1 > MAX_ROWS) return { error: `The file has more than ${MAX_ROWS} rows. Split it into smaller files.` };
  const headers = rows[0].map((h) => h.trim());
  const col = (name: string | undefined, required: boolean): number | { error: string } => {
    if (!name) return required ? { error: "Choose the column for every required field." } : -1;
    const i = headers.indexOf(name);
    return i < 0 ? { error: `There is no column called "${name}".` } : i;
  };
  const ci = { bankRef: col(m.bankRef, true), reference: col(m.reference, true), amount: col(m.amount, true), currency: col(m.currency, false), direction: col(m.direction, false) };
  for (const v of Object.values(ci)) if (typeof v === "object") return v;
  const idx = ci as Record<keyof typeof ci, number>;
  const lines: ImportLine[] = [], problems: ImportProblem[] = []; let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r], n = r + 1;
    let cents = parseAmountCents(cells[idx.amount] ?? "");
    if (cents === null) { problems.push({ row: n, error: "The amount is not a number" }); continue; }
    if (idx.direction >= 0) { const d = (cells[idx.direction] ?? "").trim().toLowerCase(); if (/^(d|dr|debit|out)/.test(d)) cents = -Math.abs(cents); else if (/^(c|cr|credit|in)/.test(d)) cents = Math.abs(cents); }
    if (cents <= 0) { skipped++; continue; }                                               // debits and zero lines are not credits
    const bankRef = (cells[idx.bankRef] ?? "").trim();
    if (!/^[A-Za-z0-9._\-/]{4,64}$/.test(bankRef)) { problems.push({ row: n, error: "The bank reference must be 4 to 64 letters, numbers or . _ - /" }); continue; }
    const currency = idx.currency >= 0 ? (cells[idx.currency] ?? "").trim().toUpperCase() || defaultCurrency : defaultCurrency;
    if (currency !== "ZAR" && currency !== "ZMW") { problems.push({ row: n, error: `The currency ${currency} is not supported` }); continue; }
    lines.push({ row: n, bankRef, reference: (cells[idx.reference] ?? "").trim(), amountCents: cents, currency });
  }
  return { headers, lines, skipped, problems };
}
