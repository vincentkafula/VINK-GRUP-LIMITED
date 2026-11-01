import { sumsubHeaders } from "./signing.js";
import type { SumsubConfig } from "./config.js";
import type { SumsubReviewResult } from "./status.js";

/**
 * The calls we make to Sumsub's REST API (https://docs.sumsub.com). Each returns { ok: true, ... } or { ok: false, status, error, detail? }, never throws:
 *   error   a plain sentence safe to log; never contains a token or secret.
 *   detail  Sumsub's own description of the problem, for the log only: it is not for an applicant to read.
 * `fetchImpl` is injectable so tests never touch the network.
 */
export type SumsubFail = { ok: false; status: number; error: string; detail?: string };
export interface SumsubApplicant { applicantId: string; externalUserId: string; reviewStatus: string | null; result: SumsubReviewResult | null }
export interface SumsubStatus { reviewStatus: string | null; result: SumsubReviewResult | null; attempts: number | null }

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Sumsub wants a phone number in international format; anything else is left out rather than risk the whole request being refused. */
const e164 = (p: unknown): string | undefined => { const s = typeof p === "string" ? p.replace(/[\s()-]/g, "") : ""; return /^\+[1-9]\d{7,14}$/.test(s) ? s : undefined; };

export function createSumsubClient(d: { config: SumsubConfig; fetchImpl?: typeof fetch; now?: () => Date }) {
  const { config } = d;
  const doFetch = d.fetchImpl ?? fetch;
  const now = d.now ?? (() => new Date());

  async function call(method: "GET" | "POST", pathAndQuery: string, body?: Json): Promise<{ ok: true; json: Json | null } | SumsubFail> {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const headers = sumsubHeaders(config, Math.floor(now().getTime() / 1000), method, pathAndQuery, raw);   // the path and body signed are the very ones sent
    if (raw) headers["Content-Type"] = "application/json";
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
    try {
      const res = await doFetch(config.baseUrl + pathAndQuery, { method, headers, body: raw || undefined, signal: ctrl.signal });
      const text = await res.text(); let json: Json | null = null; try { json = text ? asObj(JSON.parse(text)) : null; } catch { json = null; }
      if (!res.ok) return { ok: false, status: res.status, error: `Sumsub answered ${res.status}`, detail: str(json?.description) ?? undefined };
      return { ok: true, json };
    } catch (e) {
      return { ok: false, status: 0, error: (e as { name?: string })?.name === "AbortError" ? "Sumsub did not answer in time" : "Sumsub could not be reached" };
    } finally { clearTimeout(timer); }
  }

  const applicantOf = (j: Json | null): SumsubApplicant | null => {
    const id = str(j?.id); if (!id || !j) return null;
    const review = asObj(j.review);
    return { applicantId: id, externalUserId: str(j.externalUserId) ?? "", reviewStatus: str(review?.reviewStatus), result: (asObj(review?.reviewResult) as SumsubReviewResult | null) };
  };

  /** The applicant we created earlier for this external id. */
  async function getByExternalUserId(externalUserId: string): Promise<({ ok: true } & SumsubApplicant) | SumsubFail> {
    const r = await call("GET", `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`);
    if (!r.ok) return r;
    const a = applicantOf(r.json); return a ? { ok: true, ...a } : { ok: false, status: 502, error: "Sumsub's answer did not name the applicant" };
  }

  /** Creates the person in Sumsub under our opaque external id. If one already exists for that id (an earlier attempt that we did not get to save), that one is used. */
  async function createApplicant(i: { externalUserId: string; email?: string; phone?: string; levelName?: string }): Promise<({ ok: true } & SumsubApplicant) | SumsubFail> {
    const level = i.levelName || config.levelName;
    const body: Json = { externalUserId: i.externalUserId }; if (i.email) body.email = i.email; const phone = e164(i.phone); if (phone) body.phone = phone;
    const r = await call("POST", `/resources/applicants?levelName=${encodeURIComponent(level)}`, body);
    if (!r.ok) return r.status === 409 ? getByExternalUserId(i.externalUserId) : r;
    const a = applicantOf(r.json); return a ? { ok: true, ...a } : { ok: false, status: 502, error: "Sumsub's answer did not name the applicant" };
  }

  /** A short-lived token for the applicant's browser: it lets the Sumsub widget on our page work with this one person's check, and nothing else. */
  async function accessToken(i: { externalUserId: string; levelName?: string; ttlInSecs?: number }): Promise<{ ok: true; token: string; expiresInSecs: number } | SumsubFail> {
    const ttl = i.ttlInSecs ?? config.tokenTtlSecs;
    const r = await call("POST", "/resources/accessTokens/sdk", { userId: i.externalUserId, levelName: i.levelName || config.levelName, ttlInSecs: ttl });
    if (!r.ok) return r;
    const token = str(r.json?.token); return token ? { ok: true, token, expiresInSecs: ttl } : { ok: false, status: 502, error: "Sumsub's answer did not include a token" };
  }

  /** Where the check stands, straight from Sumsub (used to catch up when an event was missed). */
  async function status(applicantId: string): Promise<({ ok: true } & SumsubStatus) | SumsubFail> {
    const r = await call("GET", `/resources/applicants/${encodeURIComponent(applicantId)}/status`);
    if (!r.ok) return r;
    const attempts = Number(r.json?.attemptCnt);
    return { ok: true, reviewStatus: str(r.json?.reviewStatus), result: asObj(r.json?.reviewResult) as SumsubReviewResult | null, attempts: Number.isFinite(attempts) ? attempts : null };
  }

  return { createApplicant, getByExternalUserId, accessToken, status };
}
export type SumsubClient = ReturnType<typeof createSumsubClient>;
