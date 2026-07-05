/**
 * VMS Bank — Applications API client
 * Connects to the Supabase Edge Function backend.
 */
import { projectId } from "../../../utils/supabase/info";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-3f39932e`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppType =
  | "account" | "creditCard" | "loan" | "invest"
  | "insure"  | "rewards"   | "sim"  | "businessLoan" | "corporateLoan";

export type AppStatus =
  | "pending" | "under_review" | "approved" | "declined" | "more_info_required";

export interface ApplicationSubmission {
  type: AppType;
  subType?: string;
  applicantName: string;
  applicantEmail?: string;
  applicantPhone?: string;
  formData?: Record<string, unknown>;
}

export interface Application {
  id: string;
  referenceNumber: string;
  type: AppType;
  subType: string;
  status: AppStatus;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  formData: Record<string, unknown>;
  submittedAt: string;
  updatedAt: string;
  reviewNotes?: string;
  assignedTo?: string;
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

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
    const json = await res.json();
    return json as ApiResult<T>;
  } catch (err) {
    return { success: false, error: "Network error — check your connection" };
  }
}

// ─── Applications ─────────────────────────────────────────────────────────────

export const applicationsApi = {
  /** Submit a new application and receive a reference number. */
  submit: (data: ApplicationSubmission) =>
    request<{ referenceNumber: string; id: string; status: AppStatus }>(
      "/applications",
      { method: "POST", body: JSON.stringify(data) }
    ),

  /** List applications with optional type/status/pagination filters. */
  list: (params?: { type?: string; status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.type)   q.set("type",   params.type);
    if (params?.status) q.set("status", params.status);
    if (params?.page)   q.set("page",   String(params.page));
    if (params?.limit)  q.set("limit",  String(params.limit));
    return request<Application[]>(`/applications?${q}`);
  },

  /** Get a single application by reference number. */
  get: (ref: string) => request<Application>(`/applications/${ref}`),

  /** Update the status of an application. */
  updateStatus: (ref: string, status: AppStatus, reviewNotes?: string, assignedTo?: string) =>
    request<Application>(`/applications/${ref}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reviewNotes, assignedTo }),
    }),

  /** Delete an application. */
  delete: (ref: string) => request(`/applications/${ref}`, { method: "DELETE" }),

  /** Get admin stats. */
  stats: () =>
    request<{
      totalApplications: number;
      byType: Record<string, number>;
      byStatus: Record<string, number>;
      pendingReview: number;
      totalContacts: number;
      newsletterSubscribers: number;
      lastUpdated: string;
    }>("/admin/stats"),
};

// ─── OTP ──────────────────────────────────────────────────────────────────────

export const otpApi = {
  /** Send an OTP to a phone number or email. Returns demoCode in dev. */
  send: (destination: string, channel: "sms" | "email" = "sms") =>
    request<{ demoCode?: string }>("/otp/send", {
      method: "POST",
      body: JSON.stringify({ destination, channel }),
    }),

  /** Verify an OTP code. */
  verify: (destination: string, code: string) =>
    request("/otp/verify", {
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
