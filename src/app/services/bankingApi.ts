import { isDemoMode, setDemoMode, demoLogin, DEMO_TOKEN, bankMock } from "./demoMode";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
let _token: string | null = localStorage.getItem("bank_token");
export const setBankToken = (t: string | null) => { _token = t; if (t) localStorage.setItem("bank_token", t); else localStorage.removeItem("bank_token"); };
export const getBankToken = () => _token;

// ─── Fetch with demo fallback ────────────────────────────────────────────────
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (isDemoMode()) return bankDemoResponse(path, opts) as T;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  try {
    const res = await fetch(`${BASE}${path}`, { ...opts, headers });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    return j;
  } catch (err) {
    if (err instanceof TypeError || (err instanceof Error && err.message.includes("fetch"))) {
      setDemoMode(true);
      return bankDemoResponse(path, opts) as T;
    }
    throw err;
  }
}

// ─── Demo responses ───────────────────────────────────────────────────────────
function bankDemoResponse(path: string, opts: RequestInit = {}): unknown {
  const method = (opts.method ?? "GET").toUpperCase();
  const body   = opts.body ? JSON.parse(opts.body as string) : {};

  if (path.includes("/api/auth/login"))                            return { success: true, token: DEMO_TOKEN, user: { id: "demo-001", username: body.username ?? "superadmin", name: "Super Administrator", role: "superadmin" } };
  if (path.includes("/api/bank/users/stats"))                      return bankMock.userStats();
  if (path.match(/\/api\/bank\/users\/[^/?]+$/) && method === "GET") return bankMock.userById(path.split("/").pop() ?? "");
  if (path.includes("/api/bank/users"))                            return bankMock.users(Object.fromEntries(new URLSearchParams(path.includes("?") ? path.split("?")[1] : "")));
  if (path.match(/\/api\/bank\/accounts\/[^/?]+\/transactions/))  return bankMock.accountTxns(path.split("/")[4] ?? "acct-001");
  if (path.match(/\/api\/bank\/accounts\/[^/?]+\/summary/))       return bankMock.accountSummary(path.split("/")[4] ?? "acct-001");
  if (path.match(/\/api\/bank\/accounts\/[^/?]+$/) && method === "GET") return bankMock.accountById(path.split("/").pop() ?? "");
  if (path.includes("/api/bank/accounts") && method === "PATCH")  return { success: true, data: {} };
  if (path.includes("/api/bank/accounts"))                        return bankMock.accounts(Object.fromEntries(new URLSearchParams(path.includes("?") ? path.split("?")[1] : "")));
  if (path.match(/\/api\/bank\/cards\/[^/?]+\/transactions/))     return bankMock.cardTxns(path.split("/")[4] ?? "");
  if (path.match(/\/api\/bank\/cards\/[^/?]+$/) && method === "GET") return bankMock.cardById(path.split("/").pop() ?? "");
  if (path.includes("/api/bank/cards") && method === "PATCH")     return { success: true, data: {} };
  if (path.includes("/api/bank/cards") && method === "POST")      return { success: true, data: bankMock.cards().data[0] };
  if (path.includes("/api/bank/cards"))                           return bankMock.cards(Object.fromEntries(new URLSearchParams(path.includes("?") ? path.split("?")[1] : "")));
  if (path.includes("/api/bank/payments/instant-payout"))         return bankMock.instantPayout(body.amount ?? 1000);
  if (path.includes("/api/bank/payments") && method === "POST")   return bankMock.sendPayment(body);
  if (path.includes("/api/bank/payments"))                        return bankMock.payments();
  if (path.includes("/api/bank/treasury/kpis"))                   return bankMock.bankingKpi();
  if (path.includes("/api/bank/treasury/revenue-splits"))         return bankMock.revenueSplits();
  if (path.includes("/api/bank/treasury/settlements"))            return bankMock.settlements();
  if (path.includes("/api/bank/treasury/portfolios"))             return bankMock.portfolios();
  if (path.includes("/api/bank/treasury/accounts"))               return bankMock.treasury();
  if (path.includes("/api/bank/compliance/kyc") && method === "PATCH") return method === "PATCH" ? bankMock.approveKyc(path.split("/").at(-2) ?? "") : {};
  if (path.includes("/api/bank/compliance/kyc"))                  return bankMock.kyc(Object.fromEntries(new URLSearchParams(path.includes("?") ? path.split("?")[1] : "")));
  if (path.includes("/api/bank/compliance/fraud-alerts") && method === "PATCH") return bankMock.resolveFraud(path.split("/").at(-2) ?? "");
  if (path.includes("/api/bank/compliance/fraud-alerts"))         return bankMock.fraudAlerts(Object.fromEntries(new URLSearchParams(path.includes("?") ? path.split("?")[1] : "")));
  if (path.includes("/api/bank/compliance/aml"))                  return bankMock.aml();
  if (path.includes("/api/bank/compliance/summary"))              return bankMock.complianceSummary();
  return { success: true, data: {} };
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const bankAuth = {
  login: async (username: string, password: string) => {
    try {
      return await api<{ success: boolean; token: string; user: { id: string; username: string; name: string; role: string } }>(
        "/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }
      );
    } catch {
      setDemoMode(true);
      const res = demoLogin(username);
      setBankToken(res.token);
      return res;
    }
  },
};

// ─── Accounts ────────────────────────────────────────────────────────────────
export const bankAccounts = {
  list:     (p?: Record<string, string>) => api<{ success: boolean; data: unknown[] }>(`/api/bank/accounts?${new URLSearchParams(p)}`),
  get:      (id: string) => api<{ success: boolean; data: unknown }>(`/api/bank/accounts/${id}`),
  txns:     (id: string, p?: Record<string, string>) => api<{ success: boolean; data: unknown[]; meta: Record<string, number> }>(`/api/bank/accounts/${id}/transactions?${new URLSearchParams(p)}`),
  summary:  (id: string) => api<{ success: boolean; data: unknown }>(`/api/bank/accounts/${id}/summary`),
  freeze:   (id: string) => api(`/api/bank/accounts/${id}/freeze`,   { method: "PATCH" }),
  unfreeze: (id: string) => api(`/api/bank/accounts/${id}/unfreeze`, { method: "PATCH" }),
};

// ─── Cards ────────────────────────────────────────────────────────────────────
export const bankCards = {
  list:     (p?: Record<string, string>) => api<{ success: boolean; data: unknown[] }>(`/api/bank/cards?${new URLSearchParams(p)}`),
  get:      (id: string) => api<{ success: boolean; data: unknown }>(`/api/bank/cards/${id}`),
  issue:    (body: unknown) => api("/api/bank/cards", { method: "POST", body: JSON.stringify(body) }),
  freeze:   (id: string) => api(`/api/bank/cards/${id}/freeze`,   { method: "PATCH" }),
  unfreeze: (id: string) => api(`/api/bank/cards/${id}/unfreeze`, { method: "PATCH" }),
  block:    (id: string) => api(`/api/bank/cards/${id}/block`,    { method: "PATCH" }),
  limits:   (id: string, body: unknown) => api(`/api/bank/cards/${id}/limits`, { method: "PATCH", body: JSON.stringify(body) }),
  txns:     (id: string) => api<{ success: boolean; data: unknown[] }>(`/api/bank/cards/${id}/transactions`),
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const bankPayments = {
  list:         (p?: Record<string, string>) => api<{ success: boolean; data: unknown[] }>(`/api/bank/payments?${new URLSearchParams(p)}`),
  send:         (body: unknown) => api<{ success: boolean; data: unknown }>("/api/bank/payments", { method: "POST", body: JSON.stringify(body) }),
  instantPayout:(driverId: string, amount: number) => api<{ success: boolean; data: unknown; message: string }>("/api/bank/payments/instant-payout", { method: "POST", body: JSON.stringify({ driverId, amount }) }),
};

// ─── Treasury ─────────────────────────────────────────────────────────────────
export const bankTreasury = {
  accounts:     () => api<{ success: boolean; data: unknown[]; meta: Record<string, number> }>("/api/bank/treasury/accounts"),
  settlements:  (p?: Record<string, string>) => api<{ success: boolean; data: unknown[] }>(`/api/bank/treasury/settlements?${new URLSearchParams(p)}`),
  revenueSplits:() => api<{ success: boolean; data: unknown[]; meta: Record<string, number> }>("/api/bank/treasury/revenue-splits"),
  kpis:         () => api<{ success: boolean; data: unknown }>("/api/bank/treasury/kpis"),
  portfolios:   () => api<{ success: boolean; data: unknown[] }>("/api/bank/treasury/portfolios"),
};

// ─── Compliance ───────────────────────────────────────────────────────────────
export const bankCompliance = {
  kyc:         (p?: Record<string, string>) => api<{ success: boolean; data: unknown[] }>(`/api/bank/compliance/kyc?${new URLSearchParams(p)}`),
  approveKyc:  (id: string) => api(`/api/bank/compliance/kyc/${id}/approve`, { method: "PATCH" }),
  rejectKyc:   (id: string, reason: string) => api(`/api/bank/compliance/kyc/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) }),
  aml:         (p?: Record<string, string>) => api<{ success: boolean; data: unknown[] }>(`/api/bank/compliance/aml?${new URLSearchParams(p)}`),
  fraudAlerts: (p?: Record<string, string>) => api<{ success: boolean; data: unknown[] }>(`/api/bank/compliance/fraud-alerts?${new URLSearchParams(p)}`),
  resolveFraud:(id: string) => api(`/api/bank/compliance/fraud-alerts/${id}/resolve`, { method: "PATCH" }),
  summary:     () => api<{ success: boolean; data: unknown }>("/api/bank/compliance/summary"),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const bankUsers = {
  list:  (p?: Record<string, string>) => api<{ success: boolean; data: unknown[] }>(`/api/bank/users?${new URLSearchParams(p)}`),
  get:   (id: string) => api<{ success: boolean; data: unknown }>(`/api/bank/users/${id}`),
  stats: () => api<{ success: boolean; data: unknown }>("/api/bank/users/stats/summary"),
};
