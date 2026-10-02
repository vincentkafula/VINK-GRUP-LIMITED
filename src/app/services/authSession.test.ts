import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Mod = typeof import("./authSession");
let m: Mod;
const calls: { url: string; init?: RequestInit }[] = [];

/** Queue of canned fetch responses; each call records its URL and options. */
function mockFetch(...replies: (Response | Error | ((url: string, init?: RequestInit) => Response))[]) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = replies.shift();
    if (!r) throw new Error("unexpected fetch " + url);
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(String(url), init) : r;
  }));
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const grant = (n: number) => ({ success: true, token: `access-${n}`, expiresIn: 900, csrfToken: `csrf-${n}`, user: { id: "u1", username: "alice", name: "Alice", email: "a@x.co", role: "customer" } });

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  m = await import("./authSession");
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("storing the session", () => {
  it("legacy mode keeps the token in localStorage, as before", () => {
    m.setAuth({ token: "legacy-token", mode: "legacy" });
    expect(localStorage.getItem("vink_jwt")).toBe("legacy-token");
    expect(m.getToken()).toBe("legacy-token");
    expect(m.isCookieSession()).toBe(false);
  });

  it("cookie mode keeps the token in memory ONLY; storage holds just the CSRF token", () => {
    m.setAuth({ token: "short-lived", expiresIn: 900, csrfToken: "csrf-1", mode: "cookie" });
    expect(m.getToken()).toBe("short-lived");
    expect(localStorage.getItem("vink_jwt")).toBeNull();
    expect(Object.values({ ...localStorage }).join()).not.toContain("short-lived");
    expect(localStorage.getItem("vink_csrf")).toBe("csrf-1");
  });

  it("switching to cookie mode erases an old stored token", () => {
    localStorage.setItem("vink_jwt", "old-long-lived");
    m.setAuth({ token: "t", expiresIn: 900, csrfToken: "c", mode: "cookie" });
    expect(localStorage.getItem("vink_jwt")).toBeNull();
  });

  it("clearAuth forgets everything; after a reload a cookie session has no token until it refreshes", () => {
    m.setAuth({ token: "t", expiresIn: 900, csrfToken: "c", mode: "cookie" });
    m.clearAuth();
    expect(m.getToken()).toBeNull();
    expect(localStorage.getItem("vink_csrf")).toBeNull();
  });
});

describe("refreshSession", () => {
  beforeEach(() => m.setAuth({ token: "access-1", expiresIn: 900, csrfToken: "csrf-1", mode: "cookie" }));

  it("renews with the cookie and CSRF header, and stores the new tokens (not in localStorage)", async () => {
    mockFetch(json(grant(2)));
    expect(await m.refreshSession()).toBe(true);
    expect(calls[0].url).toMatch(/\/api\/auth\/refresh$/);
    expect(calls[0].init).toMatchObject({ method: "POST", credentials: "include" });
    expect((calls[0].init!.headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-1");
    expect(m.getToken()).toBe("access-2");
    expect(localStorage.getItem("vink_csrf")).toBe("csrf-2");
    expect(localStorage.getItem("vink_jwt")).toBeNull();
    expect(JSON.parse(localStorage.getItem("vink_session")!).username).toBe("alice");
  });

  it("many callers at once share ONE request (no refresh storm, no token-rotation race inside the tab)", async () => {
    mockFetch(json(grant(2)));
    const results = await Promise.all(Array.from({ length: 10 }, () => m.refreshSession()));
    expect(results.every(Boolean)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("a second tab racing us (409) is retried and then succeeds", async () => {
    mockFetch(json({ code: "in_progress" }, 409), json(grant(3)));
    expect(await m.refreshSession()).toBe(true);
    expect(calls).toHaveLength(2);
    expect(m.getToken()).toBe("access-3");
  });

  it("gives up after repeated races without signing the user out", async () => {
    mockFetch(json({}, 409), json({}, 409), json({}, 409));
    expect(await m.refreshSession()).toBe(false);
    expect(m.isCookieSession()).toBe(true);
  });

  it("a rejected session (401) signs out locally and tells the app", async () => {
    const seen = vi.fn();
    window.addEventListener("vink:session-expired", seen);
    mockFetch(json({ code: "reuse_detected" }, 401));
    expect(await m.refreshSession()).toBe(false);
    expect(m.getToken()).toBeNull();
    expect(m.isCookieSession()).toBe(false);
    expect(localStorage.getItem("vink_session")).toBeNull();
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener("vink:session-expired", seen);
  });

  it("being offline leaves the session alone", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    expect(await m.refreshSession()).toBe(false);
    expect(m.isCookieSession()).toBe(true);
    expect(m.getToken()).toBe("access-1");
  });

  it("does nothing for a legacy session", async () => {
    localStorage.clear(); vi.resetModules(); m = await import("./authSession");
    m.setAuth({ token: "legacy", mode: "legacy" });
    mockFetch();
    expect(await m.refreshSession()).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("renewing before expiry", () => {
  it("renews a minute before the token expires", async () => {
    vi.useFakeTimers();
    mockFetch(json(grant(2)));
    m.setAuth({ token: "access-1", expiresIn: 900, csrfToken: "csrf-1", mode: "cookie" });
    await vi.advanceTimersByTimeAsync(839_000);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toHaveLength(1);
    expect(m.getToken()).toBe("access-2");
  });

  it("getValidToken renews first when the token is about to expire, and returns the fresh one", async () => {
    vi.useFakeTimers();
    m.setAuth({ token: "access-1", expiresIn: 30, csrfToken: "csrf-1", mode: "cookie" });
    vi.setSystemTime(Date.now() + 15_000);           // 15 s left: inside the 20 s safety margin
    mockFetch(json(grant(2)));
    expect(await m.getValidToken()).toBe("access-2");
    expect(calls).toHaveLength(1);
  });

  it("getValidToken does not call the server while the token is fresh", async () => {
    m.setAuth({ token: "access-1", expiresIn: 900, csrfToken: "csrf-1", mode: "cookie" });
    mockFetch();
    expect(await m.getValidToken()).toBe("access-1");
    expect(calls).toHaveLength(0);
  });
});

describe("authFetch", () => {
  beforeEach(() => m.setAuth({ token: "access-1", expiresIn: 900, csrfToken: "csrf-1", mode: "cookie" }));
  const authHeader = (i: number) => (calls[i].init!.headers as Record<string, string>).Authorization;

  it("sends the bearer token", async () => {
    mockFetch(json({ ok: true }));
    expect((await m.authFetch("https://api.test/x")).status).toBe(200);
    expect(authHeader(0)).toBe("Bearer access-1");
  });

  it("after a 401 it refreshes ONCE and repeats the request with the new token", async () => {
    mockFetch(json({}, 401), json(grant(2)), json({ ok: true }));
    const res = await m.authFetch("https://api.test/x");
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.url.replace("https://api.test", "").replace(/^.*\/api\/auth/, "/auth"))).toEqual(["/x", "/auth/refresh", "/x"]);
    expect(authHeader(2)).toBe("Bearer access-2");
  });

  it("never loops: a second 401 is returned to the caller", async () => {
    mockFetch(json({}, 401), json(grant(2)), json({}, 401));
    expect((await m.authFetch("https://api.test/x")).status).toBe(401);
    expect(calls).toHaveLength(3);
  });

  it("when the refresh is refused, the 401 is returned and no retry is made", async () => {
    mockFetch(json({}, 401), json({ code: "expired" }, 401));
    expect((await m.authFetch("https://api.test/x")).status).toBe(401);
    expect(calls).toHaveLength(2);
  });
});

describe("start-up and sign-out", () => {
  it("bootstrap restores a cookie session after a reload, silently", async () => {
    localStorage.setItem("vink_csrf", "csrf-1");
    mockFetch(json(grant(2)));
    await m.bootstrapSession();
    expect(m.getToken()).toBe("access-2");
  });

  it("bootstrap does nothing for visitors who were never signed in (no request, no noise)", async () => {
    mockFetch();
    await m.bootstrapSession();
    expect(calls).toHaveLength(0);
  });

  it("endSession tells the server to revoke the session (with the CSRF token), then clears everything", async () => {
    m.setAuth({ token: "access-1", expiresIn: 900, csrfToken: "csrf-1", mode: "cookie" });
    localStorage.setItem("vink_session", "{}");
    mockFetch(json({ success: true }));
    await m.endSession();
    expect(calls[0].url).toMatch(/\/api\/auth\/logout$/);
    expect((calls[0].init!.headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-1");
    expect(calls[0].init).toMatchObject({ credentials: "include" });
    expect(m.getToken()).toBeNull();
    expect(localStorage.getItem("vink_session")).toBeNull();
  });

  it("endSession forgets locally FIRST (before the network call finishes)", async () => {
    m.setAuth({ token: "access-1", expiresIn: 900, csrfToken: "csrf-1", mode: "cookie" });
    let release!: () => void;
    mockFetch(() => { throw new Error("replaced below"); });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((ok) => { release = () => ok(json({ success: true })); })));
    const done = m.endSession();
    expect(m.getToken()).toBeNull();               // already signed out locally while the request is still pending
    release();
    await done;
  });

  it("a legacy session makes no server call on sign-out", async () => {
    m.setAuth({ token: "legacy", mode: "legacy" });
    mockFetch();
    await m.endSession();
    expect(calls).toHaveLength(0);
    expect(m.getToken()).toBeNull();
  });

  it("endSession still signs out locally when the server cannot be reached", async () => {
    m.setAuth({ token: "access-1", expiresIn: 900, csrfToken: "csrf-1", mode: "cookie" });
    mockFetch(new TypeError("offline"));
    await expect(m.endSession()).resolves.toBeUndefined();
    expect(m.getToken()).toBeNull();
  });
});

describe("WebSocket authentication", () => {
  it("sends the token as the first message (not in the URL) and only when signed in", () => {
    const sent: string[] = [];
    const ws = { send: (s: string) => sent.push(s) } as unknown as WebSocket;
    expect(m.sendSocketAuth(ws)).toBe(false);
    m.setAuth({ token: "access-1", expiresIn: 900, csrfToken: "c", mode: "cookie" });
    expect(m.sendSocketAuth(ws)).toBe(true);
    expect(JSON.parse(sent[0])).toEqual({ type: "auth", token: "access-1" });
    expect(m.SOCKET_AUTH_CLOSE).toBe(4401);
  });
});
