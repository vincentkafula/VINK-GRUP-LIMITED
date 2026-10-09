// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { OpsPanel } from "./OpsPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLElement, calls: { url: string; init?: RequestInit }[];
const GATE = { ready: false, mode: "sandbox", missing: 2, items: [
  { key: "legal_structure", title: "Legal structure for holding customer funds", kind: "manual", help: "Written advice.", ok: false, detail: "Not confirmed" },
  { key: "licence_za", title: "South Africa licences", kind: "manual", help: "Licence references.", ok: true, detail: "Confirmed", confirmedBy: "vincent", confirmedAt: "2026-10-08T10:00:00Z", note: "Letter 12, folder Legal" },
  { key: "alerts_configured", title: "Alerts reach a person", kind: "auto", help: "Set ALERT_WEBHOOK_URL.", ok: false, detail: "0 destination(s)" },
] };
function mockApi(opts: { destinations?: string[] } = {}) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = String(url); let status = 200; let body: unknown = { success: true };
    if (u.endsWith("/go-live")) body = { success: true, ...GATE };
    else if (u.endsWith("/health")) body = { success: true, ok: false, checkedAt: "2026-10-09T10:00:00Z", issues: [{ severity: "problem", code: "card_settlement_exceptions", message: "Settlement lines do not match.", count: 1 }], alerts: [], destinations: opts.destinations ?? [] };
    else if (u.endsWith("/settlement/files")) body = { success: true, files: [{ id: "f1", provider: "paymentology", filename: "day1.csv", lines: 9, matched: 3, exceptions: 5, importedAt: "2026-10-08T10:00:00Z" }] };
    else if (u.endsWith("/settlement/exceptions")) body = { success: true, exceptions: [{ id: "x1", provider: "paymentology", authorisationId: "GHOST:R1", type: "purchase", amountCents: 1000, currency: "ZAR", settledOn: "2026-10-07", reference: "S4", result: "unknown_purchase" }] };
    else if (u.endsWith("/settlement/import")) { status = 201; body = { success: true, fileId: "f2", lines: 2, matched: 1, duplicates: 0, exceptions: 1 }; }
    return new Response(JSON.stringify(body), { status });
  }));
}
beforeEach(() => { localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const render = async () => { await act(async () => { root.render(<OpsPanel />); }); await settle(); await settle(); };
const btn = (t: string, i = 0) => [...document.querySelectorAll("button")].filter((b) => b.textContent?.includes(t))[i] as HTMLButtonElement | undefined;
const type = async (el: Element | null, v: string) => { await act(async () => { const e = el as HTMLInputElement | HTMLTextAreaElement; Object.getOwnPropertyDescriptor(e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); }); };

describe("OpsPanel", () => {
  it("shows the go-live gate with what is satisfied, who confirmed it, and what is left", async () => {
    mockApi(); await render();
    expect(host.textContent).toContain("2 items still to satisfy"); expect(host.textContent).toContain("The system is in sandbox mode");
    expect(host.textContent).toContain("Confirmed by vincent"); expect(host.textContent).toContain("Letter 12, folder Legal");
    expect(host.textContent).toContain("checked by the system"); expect(host.textContent).toContain("confirmed by a person");
    expect(host.querySelectorAll('input[aria-label^="Evidence for"]')).toHaveLength(1);              // only the unconfirmed manual item can be confirmed, never an automatic one
  });

  it("confirms a manual item with its evidence note, and withdraws a confirmation", async () => {
    mockApi(); await render();
    await type(host.querySelector('input[aria-label^="Evidence for Legal"]'), "Opinion letter 2026-10-01, folder Legal/2");
    await act(async () => { btn("Confirm")!.click(); }); await settle();
    const post = calls.find((c) => c.url.endsWith("/go-live/legal_structure/confirm"))!;
    expect(post.init!.method).toBe("POST"); expect(JSON.parse(String(post.init!.body))).toEqual({ note: "Opinion letter 2026-10-01, folder Legal/2" });
    await act(async () => { btn("Withdraw")!.click(); }); await settle();
    expect(calls.some((c) => c.url.endsWith("/go-live/licence_za") && c.init?.method === "DELETE")).toBe(true);
  });

  it("shows health and where alerts go, and says so when there is nowhere to send them", async () => {
    mockApi(); await render();
    expect(host.textContent).toContain("There are problems to look at"); expect(host.textContent).toContain("Settlement lines do not match.");
    expect(host.textContent).toContain("No alert destination is set up");
    act(() => root.unmount()); host.remove(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    mockApi({ destinations: ["webhook", "email"] }); await render();
    expect(host.textContent).toContain("Alerts are sent to: webhook, email.");
    await act(async () => { btn("Check now")!.click(); }); await settle();
    expect(calls.some((c) => c.url.endsWith("/check") && c.init?.method === "POST")).toBe(true);
  });

  it("imports a settlement file, lists the lines that need a person, and closes one with a note", async () => {
    mockApi(); await render();
    expect(host.textContent).toContain("VINK has no such purchase"); expect(host.textContent).toContain("GHOST:R1"); expect(host.textContent).toContain("day1.csv");
    await type(host.querySelector('textarea[aria-label="Settlement lines"]'), "authorisation_id,type,amount,currency,settled_on,reference\nA1,purchase,10.00,ZAR,2026-10-07,S1");
    await act(async () => { btn("Import settlement file")!.click(); }); await settle();
    const imp = calls.find((c) => c.url.endsWith("/settlement/import"))!;
    expect(JSON.parse(String(imp.init!.body))).toEqual({ provider: "paymentology", filename: "pasted.csv", csv: "authorisation_id,type,amount,currency,settled_on,reference\nA1,purchase,10.00,ZAR,2026-10-07,S1" });
    await type(host.querySelector('input[aria-label="Note for GHOST:R1"]'), "Test card, bank ticket 4411");
    await act(async () => { btn("Close")!.click(); }); await settle();
    const res = calls.find((c) => c.url.endsWith("/settlement/exceptions/x1/resolve"))!;
    expect(JSON.parse(String(res.init!.body))).toEqual({ note: "Test card, bank ticket 4411" });
  });
});
