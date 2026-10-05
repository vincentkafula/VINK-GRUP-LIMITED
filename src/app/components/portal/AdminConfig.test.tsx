// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { AdminConfig } from "./AdminConfig";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
const CONFIG = { mode: "sandbox", currency: { code: "ZAR" }, marshalFee: { amountCents: 2000 }, trip: { tapsPerTrip: 16 }, afc: { noPinBelowCents: 4000 } };
function mockApi(profile: Record<string, unknown>, approvals: unknown[] = []) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    let body: unknown = { success: true };
    if (u.endsWith("/api/admin/config/") || u.endsWith("/api/admin/config")) body = { success: true, approvalsRequired: 2, countries: [{ country: "ZA", active: { id: "p1", version: 1, mode: "sandbox" }, inProgress: { id: "p2", version: 2, status: profile.status }, versions: 2 }, { country: "ZM", active: null, inProgress: null, versions: 0 }] };
    else if (u.includes("/readiness")) body = { success: true, readiness: { mode: "sandbox", ready: false, blockers: 2, items: [{ id: "licence", label: "Bank of Zambia licence or approval reference", ok: false, blocking: true, hint: "Set regulator.licenceRef." }, { id: "partner_bank", label: "Partner bank named", ok: true, blocking: true, hint: "" }] } };
    else if (u.includes("/api/admin/money/pooled-accounts")) body = { success: true, accounts: [{ pool: "online", currency: "ZMW", accountNumber: "9876543210", holder: "Vink Zambia", bank: "Absa Bank Zambia", type: "Business" }] };
    else if (u.includes("/profiles/")) body = { success: true, profile: { id: "p2", version: 2, createdBy: "me", note: null, config: CONFIG, ...profile }, approvals, approvalsRequired: 2, changesFromActive: [{ path: "marshalFee.amountCents", before: 2000, after: 2500 }] };
    else if (u.includes("/versions")) body = { success: true, versions: [{ id: "p2", version: 2, status: profile.status, note: null, activatedAt: null }, { id: "p1", version: 1, status: "active", note: null, activatedAt: "2026-10-01T00:00:00Z" }] };
    else if (u.includes("/api/admin/money/fx")) body = { success: true, rates: [{ pair: "ZAR-ZMW", rate: 1.5, setAt: new Date().toISOString(), source: "exchangerate-api.com", sourceAt: new Date().toISOString(), auto: true }] };
    else if (u.includes("/api/admin/money/pool")) body = { success: true, channels: { in_person: { accountNumber: "1234567890", holder: "Vink Pool" } }, virtualAccounts: [{ pool: "in_person", currency: "ZAR", count: 2 }], credits: [], reserve: [{ currency: "ZAR", balanceCents: 500000, outstandingCents: 0 }], pending: [{ id: "p9", bankRef: "B9", reference: "VKR1", amountCents: 7000, currency: "ZAR", status: "credited", instant: true }], unmatched: [{ id: "c1", bankRef: "B1", reference: "VKR000", amountCents: 900, currency: "ZAR", reason: "No account has this reference." }] };
    else if (u.includes("/api/admin/money/reconciliation")) body = { success: true, ok: true, checkedAt: "2026-10-05T10:00:00Z", figures: { settledTaps: 3, unsettledConfirmedTaps: 0, trips: 0, paidItems: 0, waitingCents: 0, arrearsCents: 0 }, issues: [] };
    else if (u.includes("/validate")) body = { success: true, errors: [] };
    else if (u.includes("/audit")) body = { success: true, entries: [] };
    return new Response(JSON.stringify(body), { status: 200 });
  }));
}
beforeEach(() => { localStorage.clear(); localStorage.setItem("vink_session", JSON.stringify({ id: "me", name: "Maker", role: "superadmin" })); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 450)); });
const render = async () => { await act(async () => { root.render(<AdminConfig isOpen onClose={() => {}} />); }); await settle(); };
const btn = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement | undefined;

describe("AdminConfig", () => {
  it("is for staff: without a staff session it says so and calls nothing", async () => {
    localStorage.clear(); mockApi({ status: "draft" });
    await render();
    expect(host.textContent).toContain("for administrators"); expect(calls).toHaveLength(0);
  });
  it("shows the draft, what changes against the live version, and offers save and submit to its creator", async () => {
    mockApi({ status: "draft" });
    await render();
    expect(host.textContent).toContain("Records and ledger agree"); expect(host.textContent).toContain("No account has this reference."); expect(host.textContent).toContain("2 ZAR in-person"); expect(host.textContent).toContain("Instant-credit reserve: ZAR 5000.00"); expect(host.textContent).toContain("credited early from the reserve"); expect(host.textContent).toContain("ZAR-ZMW: 1.5"); expect(host.textContent).toContain("2 things still to fill in"); expect(host.textContent).toContain("Bank of Zambia licence or approval reference"); expect(host.textContent).toContain("account 9876543210"); expect(document.querySelector("input[type=file]")).toBeTruthy(); expect(host.textContent).toContain("automatic from exchangerate-api.com"); expect(btn("Refresh automatically now")).toBeTruthy(); expect(host.textContent).toContain("Version 2"); expect(host.textContent).toContain("marshalFee.amountCents"); expect(host.textContent).toContain("The configuration is valid");
    expect(btn("Save draft")).toBeTruthy(); expect(btn("Submit for approval")).toBeTruthy(); expect(btn("Approve")).toBeUndefined();
  });
  it("the creator cannot approve their own change; the screen says why", async () => {
    mockApi({ status: "pending_approval" });
    await render();
    expect(btn("Approve")).toBeUndefined(); expect(host.textContent).toContain("you cannot approve it");
  });
  it("another administrator sees Approve and Reject on a pending change", async () => {
    mockApi({ status: "pending_approval", createdBy: "someone-else" });
    await render();
    expect(btn("Approve")).toBeTruthy(); expect(btn("Reject")).toBeTruthy();
  });
  it("going live needs the confirmation phrase", async () => {
    mockApi({ status: "approved", config: { ...CONFIG, mode: "live" } });
    await render();
    expect(host.textContent).toContain("LIVE MODE"); expect(document.querySelector("input[placeholder*='I_UNDERSTAND_THIS_MOVES_REAL_MONEY']")).toBeTruthy(); expect(btn("Activate (LIVE)")).toBeTruthy();
  });
});
