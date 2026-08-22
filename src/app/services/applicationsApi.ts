/**
 * VINK Bank — Applications API client
 *
 * Was pointed at an orphaned Supabase Edge Function URL from an earlier
 * prototype iteration that was never migrated when the rest of the
 * platform moved to the real Express/Postgres backend — meaning every
 * application submission, OTP send/verify, and admin call through this
 * file was silently hitting a dead endpoint. Fixed to point at the real
 * backend, same production-safe fallback pattern as every other service
 * file (apiClient.ts, marketplaceApi.ts, etc.).
 */
import { API_BASE as BASE } from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppTier = "personal" | "business" | "corporate";

export type AppStatus =
  | "submitted" | "under_review" | "approved" | "declined" | "more_info_requested";

export interface ApplicationSubmission {
  tier?: AppTier;
  accountTypeRequested?: string;
  currency?: string;
  applicantName: string;
  applicantEmail?: string;
  applicantPhone?: string;
  tierData?: Record<string, unknown>;
  /** Legacy fields from other application forms (loans, credit cards, SIM,
   *  vehicle tracking) that predate the tier-based account-application
   *  system this file now targets. The backend derives a valid `tier` from
   *  `type` when `tier` itself isn't provided (see TYPE_TO_TIER in
   *  applicationsRouter.ts), and stores `subType`/`type` as
   *  accountTypeRequested and `formData` as tierData, so these older forms
   *  now persist real applications rather than getting a validation error. */
  type?: string;
  subType?: string;
  formData?: Record<string, unknown>;
}

export interface Application {
  id: string;
  referenceNumber: string;
  accountNumber: string | null;
  accountNumberStatus: "provisional" | "confirmed" | "expiring" | "expired";
  rejectedAt: string | null;
  tier: AppTier;
  accountTypeRequested?: string;
  currency: string;
  status: AppStatus;
  statusReason?: string;
  applicantName: string;
  applicantEmail?: string;
  applicantPhone?: string;
  tierData: Record<string, unknown>;
  submittedAt: string;
  updatedAt: string;
  statusHistory?: { fromStatus: string | null; toStatus: string; reason: string; changedBy: string | null; changedByName?: string; createdAt: string }[];
}

export interface ApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: { total: number; page: number; limit: number; pages: number };
  demoCode?: string;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

import { getToken } from "./apiClient";

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T> & { demoCode?: string }> {
  // Previously no timeout existed at all -- a slow network or a
  // stalled connection to the backend would leave the caller waiting
  // indefinitely with no way to recover except reloading the page.
  // 20s is generous for a real API call but still bounded.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    });
    const json = await res.json();
    return json as ApiResult<T> & { demoCode?: string };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "The request took too long and timed out — please check your connection and try again." };
    }
    return { success: false, error: "Network error — check your connection" };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Applications ─────────────────────────────────────────────────────────────

export const applicationsApi = {
  /** Submit a new application and receive a reference number. Works
   *  whether or not the applicant is logged in. */
  submit: (data: ApplicationSubmission) =>
    request<{ referenceNumber: string; accountNumber: string; id: string; status: AppStatus }>(
      "/api/applications",
      { method: "POST", body: JSON.stringify(data) }
    ),

  /** List applications with optional status/tier/pagination filters.
   *  Reviewer-only (requires an authenticated, privileged session). */
  list: (params?: { tier?: string; status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.tier)   q.set("tier",   params.tier);
    if (params?.status) q.set("status", params.status);
    if (params?.page)   q.set("page",   String(params.page));
    if (params?.limit)  q.set("limit",  String(params.limit));
    return request<Application[]>(`/api/applications?${q}`);
  },

  /** Get a single application by reference number, including its full
   *  status-change history. Reviewer-only. */
  get: (ref: string) => request<Application>(`/api/applications/${ref}`),

  /** Change an application's status. reason is required — every
   *  transition needs a stated reason for the audit trail. Reviewer-only. */
  updateStatus: (ref: string, status: AppStatus, reason: string) =>
    request<Application>(`/api/applications/${ref}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason }),
    }),

  /** Summary counts by tier and status, computed live from real data.
   *  Reviewer-only. */
  stats: () =>
    request<{
      totalApplications: number;
      byTier: Record<string, number>;
      byStatus: Record<string, number>;
      pendingReview: number;
      lastUpdated: string;
    }>("/api/applications/stats/summary"),
};

// ─── OTP ──────────────────────────────────────────────────────────────────────

export const otpApi = {
  /** Send an OTP to a phone number or email. Returns demoCode until a real
   *  SMS/email provider is configured — see server/src/routes/otpRouter.ts. */
  send: (destination: string, channel: "sms" | "email" = "sms") =>
    request<{ sent: boolean; demoCode?: string }>("/api/otp/send", {
      method: "POST",
      body: JSON.stringify({ destination, channel }),
    }),

  /** Verify an OTP code. */
  verify: (destination: string, code: string) =>
    request("/api/otp/verify", {
      method: "POST",
      body: JSON.stringify({ destination, code }),
    }),
};

// ─── Admin API ────────────────────────────────────────────────────────────────

export const adminApi = {
  /** Full admin dashboard stats + pending/review queues. */
  dashboard: () => request<{
    totalApplications: number; byType: Record<string,number>; byStatus: Record<string,number>;
    pendingCount: number; underReviewCount: number; approvedCount: number; declinedCount: number;
    moreInfoCount: number; totalContacts: number; newsletterSubscribers: number;
    pendingQueue: Application[]; underReviewQueue: Application[]; lastUpdated: string;
  }>("/admin/dashboard"),

  /** List applications with type/status/search/pagination filters. */
  list: (params?: { type?: string; status?: string; search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.type)   q.set("type",   params.type);
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    if (params?.page)   q.set("page",   String(params.page));
    if (params?.limit)  q.set("limit",  String(params.limit));
    return request<Application[]>(`/admin/applications?${q}`);
  },

  /** Get full application detail. */
  get: (ref: string) => request<Application>(`/admin/applications/${ref}`),

  /** Approve an application. */
  approve: (ref: string, reviewNotes?: string, assignedTo?: string) =>
    request<Application>(`/admin/applications/${ref}/approve`, {
      method: "POST", body: JSON.stringify({ reviewNotes, assignedTo }),
    }),

  /** Decline an application with a required reason. */
  decline: (ref: string, reason: string, assignedTo?: string) =>
    request<Application>(`/admin/applications/${ref}/decline`, {
      method: "POST", body: JSON.stringify({ reason, assignedTo }),
    }),

  /** Request additional information from applicant. */
  requestInfo: (ref: string, note: string, assignedTo?: string) =>
    request<Application>(`/admin/applications/${ref}/request-info`, {
      method: "POST", body: JSON.stringify({ note, assignedTo }),
    }),

  /** Assign application to a reviewer (moves to under_review). */
  assign: (ref: string, assignedTo: string) =>
    request<Application>(`/admin/applications/${ref}/assign`, {
      method: "POST", body: JSON.stringify({ assignedTo }),
    }),

  /** Get audit trail / event log for an application. */
  events: (ref: string) => request<unknown[]>(`/admin/applications/${ref}/events`),

  /** List all contact form submissions. */
  contacts: () => request<unknown[]>("/admin/contacts"),

  /** List newsletter subscribers. */
  newsletter: () => request<string[]>("/admin/newsletter"),

  /** Legacy stats endpoint. */
  stats: () => request<{
    totalApplications: number; byType: Record<string,number>; byStatus: Record<string,number>;
    pendingReview: number; totalContacts: number; newsletterSubscribers: number; lastUpdated: string;
  }>("/admin/stats"),
};

// ─── Global Banking API ───────────────────────────────────────────────────────

export const globalBankingApi = {
  /** Get platform KPI snapshot. */
  kpi: () => request("/global/kpi"),

  /** List nostro accounts (all 5 countries). */
  nostro: () => request("/global/nostro"),

  /** Get live FX rates. */
  fxRates: () => request("/global/fx/rates"),

  /** Get FX conversion quote. */
  fxQuote: (fromCurrency: string, toCurrency: string, amount: number) =>
    request("/global/fx/quote", { method: "POST", body: JSON.stringify({ fromCurrency, toCurrency, amount }) }),

  /** Execute FX conversion. */
  fxConvert: (accountId: string, fromCurrency: string, toCurrency: string, fromAmount: number) =>
    request("/global/fx/convert", { method: "POST", body: JSON.stringify({ accountId, fromCurrency, toCurrency, fromAmount }) }),

  /** FX conversion history. */
  fxHistory: () => request("/global/fx/history"),

  /** List unified accounts. */
  listAccounts: () => request("/global/accounts"),

  /** Get single account. */
  getAccount: (id: string) => request(`/global/accounts/${id}`),

  /** Lookup account by reference number. */
  lookupByRef: (referenceNumber: string) =>
    request("/global/accounts/lookup", { method: "POST", body: JSON.stringify({ referenceNumber }) }),

  /** List cards (optionally filtered by accountId). */
  listCards: (accountId?: string) =>
    request(`/global/cards${accountId ? `?accountId=${accountId}` : ""}`),

  /** Freeze / unfreeze a card. */
  toggleFreeze: (cardId: string) =>
    request(`/global/cards/${cardId}/freeze`, { method: "PATCH" }),

  /** Update card limits. */
  updateLimits: (cardId: string, limits: { dailyLimit?: number; monthlyLimit?: number; atmEnabled?: boolean; onlineEnabled?: boolean; internationalEnabled?: boolean }) =>
    request(`/global/cards/${cardId}/limits`, { method: "PATCH", body: JSON.stringify(limits) }),

  /** List transactions (optionally filtered by accountId). */
  listTransactions: (accountId?: string) =>
    request(`/global/transactions${accountId ? `?accountId=${accountId}` : ""}`),

  /** Execute P2P transfer. */
  p2pTransfer: (senderAccountId: string, recipientReferenceNumber: string, amount: number, currency: string, note?: string) =>
    request("/global/p2p", { method: "POST", body: JSON.stringify({ senderAccountId, recipientReferenceNumber, amount, currency, note }) }),

  /** List P2P transfers. */
  listP2P: () => request("/global/p2p"),
};

// ─── Contact & Newsletter ─────────────────────────────────────────────────────

export const publicApi = {
  contact: (data: { name: string; email: string; phone?: string; subject?: string; message: string; type?: string }) =>
    request("/contact", { method: "POST", body: JSON.stringify(data) }),

  newsletter: (email: string) =>
    request("/newsletter", { method: "POST", body: JSON.stringify({ email }) }),

  creditCheck: (data: { idNumber: string; firstName?: string; lastName?: string; income?: string }) =>
    request<{
      score: number;
      rating: string;
      eligible: { product: string; approved: boolean; reason: string }[];
      tips: string[];
    }>("/credit-check", { method: "POST", body: JSON.stringify(data) }),
};

// ─── Municipalities API ───────────────────────────────────────────────────────

export interface Municipality {
  id: string;
  province: string;
  name: string;
  type: "Metropolitan" | "District" | "Local";
}

export interface MunicipalityStats {
  total: number;
  metropolitan: number;
  district: number;
  local: number;
  provinces: number;
}

export const municipalitiesApi = {
  /** List all municipalities with optional filters */
  list: (filters?: { province?: string; type?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (filters?.province) params.set("province", filters.province);
    if (filters?.type)     params.set("type", filters.type);
    if (filters?.q)        params.set("q", filters.q);
    const qs = params.toString();
    return request<{ data: Municipality[]; stats: MunicipalityStats }>(`/municipalities${qs ? "?" + qs : ""}`);
  },

  /** All provinces with municipality summaries */
  provinces: () =>
    request<{
      data: Array<{
        province: string;
        total: number;
        metropolitan: number;
        district: number;
        local: number;
        municipalities: Array<{ name: string; type: string }>;
      }>;
      totals: MunicipalityStats;
    }>("/municipalities/provinces"),

  /** Single municipality by id */
  get: (id: string) =>
    request<Municipality>(`/municipalities/${id}`),

  /** All municipalities in one province */
  byProvince: (province: string) =>
    request<{ data: Municipality[]; stats: MunicipalityStats; province: string }>(
      `/municipalities/province/${encodeURIComponent(province)}`
    ),

  /** Advanced search */
  search: (params: { q?: string; province?: string; type?: string; limit?: number }) =>
    request<{ data: Municipality[]; total: number }>("/municipalities/search", {
      method: "POST",
      body: JSON.stringify(params),
    }),
};
