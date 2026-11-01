import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { SponsorshipTracker, type Tracked } from "./SponsorshipTracker";
import type { IdentityView } from "./IdentityCard";

const identity = (over: Partial<IdentityView> = {}): IdentityView => ({ enabled: true, status: "not_started", canStart: true, consentRequired: true, message: "Confirm who you are.", attempts: 0, ...over });
const tracked = (id?: IdentityView): Tracked => ({
  ref: "SP-ABC234", status: "under_review", statusLabel: "Under review", project: "Township Entrepreneurs Bootcamp", organisation: "Khayelitsha Youth Hub", submittedAt: "2026-10-09T10:00:00Z", updatedAt: "2026-10-14T09:00:00Z",
  timeline: [{ status: "submitted", label: "Submitted", at: "2026-10-09T10:00:00Z", message: null }], ...(id ? { identity: id } : {}),
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
/** A server that answers the tracking lookup from `next` (which a test can change) and issues identity tokens. */
const server = (next: { track: () => Response }) => vi.fn(async (url: unknown) => (String(url).includes("/api/identity/token") ? json(200, { success: true, data: { token: "_act-1", expiresInSecs: 900, status: "in_progress" } }) : next.track())) as unknown as typeof fetch;
const fill = () => { fireEvent.change(screen.getByLabelText(/Reference number/), { target: { value: "SP-ABC234" } }); fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "thandi@example.com" } }); fireEvent.click(screen.getByRole("button", { name: /Find my application/ })); };
const fakeSdk = () => { const handlers: Record<string, (p?: unknown) => void> = {}; let launched = 0; const b: Record<string, unknown> = {}; b.withConf = () => b; b.withOptions = () => b; b.on = (e: string, cb: () => void) => { handlers[e] = cb; return b; }; b.build = () => ({ launch: () => { launched++; } });
  window.snsWebSdk = { init: () => b as never }; return { handlers, launched: () => launched }; };

const card = () => within(screen.getByRole("region", { name: "Confirm your identity" }));      // the identity card only: the application has its own status badge
let scrolls = 0;
beforeEach(() => { scrolls = 0; Element.prototype.scrollIntoView = (() => { scrolls++; }) as never; delete window.snsWebSdk; });
afterEach(() => { cleanup(); delete window.snsWebSdk; });

describe("the identity check on the tracking page", () => {
  it("is offered when it is switched on, and not shown at all when it is off or the server does not send it", async () => {
    for (const [id, shown] of [[identity(), true], [identity({ enabled: false }), false], [undefined, false]] as const) {
      globalThis.fetch = server({ track: () => json(200, { success: true, data: tracked(id) }) }); render(<SponsorshipTracker email="sponsorships@vink.co.za" />); fill();
      await screen.findByRole("heading", { name: "Township Entrepreneurs Bootcamp" });
      expect(!!screen.queryByRole("heading", { name: "Confirm your identity" })).toBe(shown); cleanup();
    }
  });
  it("checks again quietly when the applicant finishes: the widget stays open, the status updates, the page does not scroll, and a failed re-check shows no error", async () => {
    const next = { track: () => json(200, { success: true, data: tracked(identity()) }) }; globalThis.fetch = server(next); const sdk = fakeSdk();
    render(<SponsorshipTracker email="sponsorships@vink.co.za" />); fill(); await screen.findByRole("heading", { name: "Confirm your identity" });
    expect(scrolls).toBe(1);                                                                                              // arriving at the answer scrolls to it, once
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /Confirm my identity/ })); await waitFor(() => expect(sdk.launched()).toBe(1));
    const box = document.getElementById("sumsub-websdk-container-person")!, calls = vi.mocked(globalThis.fetch).mock.calls.length;

    next.track = () => json(200, { success: true, data: tracked(identity({ status: "pending", canStart: false, message: "Thank you. We have your documents.", attempts: 1 })) });
    act(() => sdk.handlers["idCheck.onApplicantSubmitted"]());
    await waitFor(() => expect(card().getByText("Being checked")).toBeTruthy());
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(calls);                                          // it did ask again
    expect(document.getElementById("sumsub-websdk-container-person")).toBe(box); expect(sdk.launched()).toBe(1);                // the very same widget: nothing was torn down and rebuilt
    expect(scrolls).toBe(1); expect(screen.getByRole("heading", { name: "Township Entrepreneurs Bootcamp" })).toBeTruthy();   // no jump back to the top, the page is still there

    next.track = () => json(500, { success: false, error: "Server trouble" });
    act(() => sdk.handlers["idCheck.onApplicantStatusChanged"]()); await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("Server trouble")).toBeNull(); expect(document.getElementById("sumsub-websdk-container-person")).toBe(box); expect(card().getByText("Being checked")).toBeTruthy();
  });
  it("still clears and rebuilds the page for a normal look-up (looking up another application starts afresh)", async () => {
    globalThis.fetch = server({ track: () => json(200, { success: true, data: tracked(identity()) }) }); render(<SponsorshipTracker email="sponsorships@vink.co.za" />); fill(); await screen.findByRole("heading", { name: "Confirm your identity" });
    globalThis.fetch = server({ track: () => json(404, { success: false, error: "not found" }) }); fireEvent.click(screen.getByRole("button", { name: /Find my application/ }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Confirm your identity" })).toBeNull()); expect(screen.getByRole("alert").textContent).toMatch(/could not find an application/);
  });
});
