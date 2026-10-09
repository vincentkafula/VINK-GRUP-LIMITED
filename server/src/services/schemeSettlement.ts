import crypto from "crypto";
import type { Db } from "../portal/driverRoutes.js";

/**
 * Matches the sponsor bank's settlement file to the card purchases VINK approved.
 *
 * VINK approves a purchase in real time and holds the tokens in the card settlement account. Days later the sponsor bank settles with the scheme and
 * reports what it settled. This module reads that report and checks it line by line against token_card_spend, so a purchase the bank never settled, or one it
 * settled for a different amount, or one VINK never approved, is found by a person instead of by an audit.
 *
 * It only compares and records: it never moves money, and the card settlement account keeps equalling the approved purchases (reconciliation.ts).
 *
 * The file layout below is VINK's own and is meant to be mapped from whatever the bank actually sends once its format is known (see columnMap):
 *   authorisation_id, type (purchase | refund), amount (decimal, e.g. 125.50), currency, settled_on (YYYY-MM-DD), reference
 * A purchase line carries the original amount; a refund line carries the amount returned. Several refund lines may follow one purchase.
 */
export type LineResult = "matched" | "unknown_purchase" | "amount_mismatch" | "declined_purchase" | "refund_exceeds" | "duplicate" | "currency_mismatch";
export interface ParsedLine { authorisationId: string; type: "purchase" | "refund"; amountCents: number; currency: string; settledOn: string; reference: string }
export interface ImportSummary { fileId: string; lines: number; matched: number; duplicates: number; exceptions: number }

export type ColumnMap = Partial<Record<"authorisation_id" | "type" | "amount" | "currency" | "settled_on" | "reference", string>>;

/** Small CSV reader: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export function toCents(v: string): number | null {
  const t = v.trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) return null;
  const [r, c = ""] = t.split(".");
  return Number(r) * 100 + Number(c.padEnd(2, "0"));
}

/** Reads the file into lines, or says exactly which row is wrong. Nothing is imported unless every row reads. */
export function readSettlementFile(csv: string, map: ColumnMap = {}): { lines: ParsedLine[] } | { error: string } {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { error: "The file has no lines" };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (k: keyof ColumnMap) => head.indexOf((map[k] ?? k).toLowerCase());
  const idx = { authorisation_id: col("authorisation_id"), type: col("type"), amount: col("amount"), currency: col("currency"), settled_on: col("settled_on"), reference: col("reference") };
  const lacking = Object.entries(idx).filter(([k, v]) => v < 0 && k !== "reference").map(([k]) => k);
  if (lacking.length) return { error: `The file is missing the column(s): ${lacking.join(", ")}` };
  if (rows.length > 50_001) return { error: "A file can hold at most 50 000 lines" };
  const lines: ParsedLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], at = `Line ${i + 1}`;
    const authorisationId = (r[idx.authorisation_id] ?? "").trim(), type = (r[idx.type] ?? "").trim().toLowerCase(), currency = (r[idx.currency] ?? "").trim().toUpperCase();
    const amountCents = toCents(r[idx.amount] ?? ""), settledOn = (r[idx.settled_on] ?? "").trim(), reference = idx.reference >= 0 ? (r[idx.reference] ?? "").trim() : "";
    if (!authorisationId || authorisationId.length > 120) return { error: `${at}: the authorisation id is missing or too long` };
    if (type !== "purchase" && type !== "refund") return { error: `${at}: the type must be purchase or refund` };
    if (amountCents === null || amountCents <= 0) return { error: `${at}: the amount must be a positive number with at most two decimals` };
    if (!/^[A-Z]{3}$/.test(currency)) return { error: `${at}: the currency must be a three-letter code` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settledOn) || Number.isNaN(Date.parse(settledOn))) return { error: `${at}: the settlement date must be YYYY-MM-DD` };
    lines.push({ authorisationId, type, amountCents, currency, settledOn, reference: reference.slice(0, 120) });
  }
  return { lines };
}

export function createSchemeSettlement(db: Db, now: () => Date = () => new Date()) {
  async function importFile(a: { provider: string; filename: string; csv: string; by: string | null; map?: ColumnMap }): Promise<{ ok: true; summary: ImportSummary } | { ok: false; status: number; error: string }> {
    if (!/^[a-z0-9_]{2,40}$/.test(a.provider)) return { ok: false, status: 400, error: "Unknown provider name" };
    const read = readSettlementFile(a.csv, a.map);
    if ("error" in read) return { ok: false, status: 400, error: read.error };
    const sha = crypto.createHash("sha256").update(a.csv).digest("hex");
    if ((await db.query(`SELECT 1 AS x FROM card_settlement_files WHERE sha256 = $1`, [sha])).rows.length) return { ok: false, status: 409, error: "This exact file was imported before" };
    const fileId = crypto.randomUUID();
    await db.query(`INSERT INTO card_settlement_files (id, provider, filename, sha256, line_count, imported_by, imported_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [fileId, a.provider, a.filename.slice(0, 200), sha, read.lines.length, a.by, now()]);
    let matched = 0, duplicates = 0, exceptions = 0;
    for (const l of read.lines) {
      const result = await judge(a.provider, l);
      if (result === "matched") matched++; else if (result === "duplicate") duplicates++; else exceptions++;
      if (result === "duplicate") continue;                                                // an old line again: nothing to record, nothing to count twice
      await db.query(`INSERT INTO card_settlement_lines (id, file_id, provider, authorisation_id, line_type, amount_cents, currency, settled_on, reference, result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [crypto.randomUUID(), fileId, a.provider, l.authorisationId, l.type, l.amountCents, l.currency, l.settledOn, l.reference, result]);
      if (result === "matched" && l.type === "purchase") await db.query(`UPDATE token_card_spend SET settled_at = $3 WHERE provider = $1 AND authorisation_id = $2 AND settled_at IS NULL`, [a.provider, l.authorisationId, now()]);
    }
    await db.query(`UPDATE card_settlement_files SET matched = $2, exceptions = $3 WHERE id = $1`, [fileId, matched, exceptions]);
    return { ok: true, summary: { fileId, lines: read.lines.length, matched, duplicates, exceptions } };
  }

  async function judge(provider: string, l: ParsedLine): Promise<LineResult> {
    if ((await db.query(`SELECT 1 AS x FROM card_settlement_lines WHERE provider = $1 AND authorisation_id = $2 AND line_type = $3 AND reference = $4`, [provider, l.authorisationId, l.type, l.reference])).rows.length) return "duplicate";
    const sp = (await db.query(`SELECT * FROM token_card_spend WHERE provider = $1 AND authorisation_id = $2`, [provider, l.authorisationId])).rows[0] as Record<string, unknown> | undefined;
    if (!sp) return "unknown_purchase";
    if (sp.status === "declined") return "declined_purchase";
    if (String(sp.currency) !== l.currency) return "currency_mismatch";
    if (l.type === "purchase") return Number(sp.amount_cents) === l.amountCents ? "matched" : "amount_mismatch";
    const already = Number((await db.query(`SELECT COALESCE(SUM(amount_cents),0) AS s FROM card_settlement_lines WHERE provider = $1 AND authorisation_id = $2 AND line_type = 'refund' AND result = 'matched'`, [provider, l.authorisationId])).rows[0]?.s ?? 0);
    return already + l.amountCents <= Number(sp.reversed_cents) ? "matched" : "refund_exceeds";
  }

  async function files() {
    return (await db.query(`SELECT id, provider, filename, line_count, matched, exceptions, imported_at FROM card_settlement_files ORDER BY imported_at DESC LIMIT 100`)).rows
      .map((r: Record<string, unknown>) => ({ id: String(r.id), provider: String(r.provider), filename: String(r.filename), lines: Number(r.line_count), matched: Number(r.matched ?? 0), exceptions: Number(r.exceptions ?? 0), importedAt: new Date(String(r.imported_at)).toISOString() }));
  }
  async function exceptions() {
    return (await db.query(`SELECT id, provider, authorisation_id, line_type, amount_cents, currency, settled_on, reference, result FROM card_settlement_lines WHERE result <> 'matched' AND resolved_at IS NULL ORDER BY settled_on DESC LIMIT 500`)).rows
      .map((r: Record<string, unknown>) => ({ id: String(r.id), provider: String(r.provider), authorisationId: String(r.authorisation_id), type: String(r.line_type), amountCents: Number(r.amount_cents), currency: String(r.currency), settledOn: String(r.settled_on).slice(0, 10), reference: String(r.reference ?? ""), result: String(r.result) }));
  }
  async function resolveException(id: string, by: string | null, note: string): Promise<boolean> {
    if (note.trim().length < 10) return false;
    return (await db.query(`UPDATE card_settlement_lines SET resolved_at = $2, resolved_by = $3, resolved_note = $4 WHERE id = $1 AND result <> 'matched' AND resolved_at IS NULL RETURNING id`, [id, now(), by, note.trim().slice(0, 500)])).rows.length > 0;
  }
  return { importFile, files, exceptions, resolveException };
}
export type SchemeSettlement = ReturnType<typeof createSchemeSettlement>;
