import { createHmac } from "crypto";

/**
 * A stand-in for Sumsub's REST API, for tests only. It answers the four calls the client makes and, like the real service, REFUSES any request whose
 * signature does not verify. It recomputes the signature with its own HMAC code (not the client's), so if the client signs the wrong thing, tests fail.
 * It does not claim to be the real Sumsub: the shapes below follow Sumsub's public documentation and need confirming against a Sumsub sandbox account.
 */
export interface MockApplicant { id: string; externalUserId: string; email?: string; phone?: string; type?: string; info?: unknown; levelName: string; reviewStatus: string; reviewResult?: Record<string, unknown>; attemptCnt: number }
export interface MockCall { method: string; path: string; body: Record<string, unknown> | null; headers: Record<string, string> }

export function mockSumsub(d: { appToken: string; secretKey: string; levelName: string; moreLevels?: string[]; companyLevels?: string[]; now?: () => Date }) {
  const companyLevels = new Set(d.companyLevels ?? []);                          // like Sumsub, a level is made for COMPANIES or for PEOPLE, and the wrong kind is refused
  const levels = new Set([d.levelName, ...(d.moreLevels ?? []), ...companyLevels]);
  const now = d.now ?? (() => new Date());
  const applicants = new Map<string, MockApplicant>();                  // by external user id
  const calls: MockCall[] = []; let n = 0; let failNext: number | null = null; let hang = false;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)); const method = String(init?.method ?? "GET").toUpperCase(); const path = url.pathname + url.search;
    const body = typeof init?.body === "string" && init.body ? init.body : "";
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), String(v)]));
    calls.push({ method, path, body: body ? (JSON.parse(body) as Record<string, unknown>) : null, headers });
    if (hang) return new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    if (failNext) { const s = failNext; failNext = null; return json(s, { description: "Injected failure", code: s }); }
    // the signature, checked with this file's own HMAC
    const ts = Number(headers["x-app-access-ts"]);
    const want = createHmac("sha256", d.secretKey).update(String(ts) + method + path + body).digest("hex");
    if (headers["x-app-token"] !== d.appToken) return json(401, { description: "Unknown app token", code: 401 });
    if (!Number.isInteger(ts) || Math.abs(ts - now().getTime() / 1000) > 300) return json(401, { description: "Timestamp is too old or in the future", code: 401 });
    if (headers["x-app-access-sig"] !== want) return json(401, { description: "Signature is invalid", code: 401 });
    if (body && headers["content-type"] !== "application/json") return json(400, { description: "Content-Type must be application/json", code: 400 });

    const path0 = url.pathname;
    if (method === "POST" && path0 === "/resources/applicants") {
      const level = url.searchParams.get("levelName") ?? ""; if (!levels.has(level)) return json(400, { description: `Level '${level}' not found`, code: 400 });
      const b = JSON.parse(body || "{}") as { externalUserId?: string; email?: string; phone?: string; type?: string; info?: unknown };
      if ((b.type === "company") !== companyLevels.has(level)) return json(400, { description: b.type === "company" ? `Level '${level}' is not a company level` : `Level '${level}' is for companies, not for individuals`, code: 400 });
      if (!b.externalUserId) return json(400, { description: "externalUserId is required", code: 400 });
      const dup = applicants.get(b.externalUserId); if (dup) return json(409, { description: `Applicant with external user id '${b.externalUserId}' already exists: ${dup.id}`, code: 409 });
      const a: MockApplicant = { id: `app${++n}`, externalUserId: b.externalUserId, email: b.email, phone: b.phone, type: b.type, info: b.info, levelName: level, reviewStatus: "init", attemptCnt: 0 };
      applicants.set(b.externalUserId, a); return json(201, applicantJson(a));
    }
    const one = path0.match(/^\/resources\/applicants\/-;externalUserId=([^/]+)\/one$/);
    if (method === "GET" && one) { const a = applicants.get(decodeURIComponent(one[1])); return a ? json(200, applicantJson(a)) : json(404, { description: "Applicant not found", code: 404 }); }
    if (method === "POST" && path0 === "/resources/accessTokens/sdk") {
      const b = JSON.parse(body || "{}") as { userId?: string; levelName?: string; ttlInSecs?: number };
      if (!b.userId || !applicants.has(b.userId)) return json(404, { description: "Applicant not found", code: 404 });
      return json(200, { token: `_act-sbx-${++n}`, userId: b.userId, ttl: b.ttlInSecs });
    }
    const st = path0.match(/^\/resources\/applicants\/([^/]+)\/status$/);
    if (method === "GET" && st) {
      const a = [...applicants.values()].find((x) => x.id === decodeURIComponent(st[1])); if (!a) return json(404, { description: "Applicant not found", code: 404 });
      return json(200, { id: `rev${a.id}`, applicantId: a.id, reviewStatus: a.reviewStatus, attemptCnt: a.attemptCnt, levelName: a.levelName, ...(a.reviewResult ? { reviewResult: a.reviewResult } : {}) });
    }
    return json(404, { description: "No such endpoint", code: 404 });
  }) as typeof fetch;

  const applicantJson = (a: MockApplicant) => ({ id: a.id, externalUserId: a.externalUserId, email: a.email, type: "individual", review: { reviewStatus: a.reviewStatus, levelName: a.levelName, ...(a.reviewResult ? { reviewResult: a.reviewResult } : {}) } });
  return {
    fetch: mockFetch, applicants, calls,
    /** Puts an applicant into a review state, as if Sumsub's reviewers (or its automatic checks) had acted. */
    setReview(externalUserId: string, reviewStatus: string, reviewResult?: Record<string, unknown>) { const a = applicants.get(externalUserId)!; a.reviewStatus = reviewStatus; a.reviewResult = reviewResult; if (reviewStatus === "pending") a.attemptCnt += 1; },
    failNext(status: number) { failNext = status; },
    hang(on = true) { hang = on; },
  };
}
export type MockSumsub = ReturnType<typeof mockSumsub>;
