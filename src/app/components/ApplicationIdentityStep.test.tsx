import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("../services/apiClient", () => ({ getToken: vi.fn(() => null) }));
import { getToken } from "../services/apiClient";
import { ApplicationIdentityStep } from "./ApplicationIdentityStep";

const view = (over: Record<string, unknown> = {}) => ({ enabled: true, status: "not_started", canStart: true, consentRequired: true, required: true, message: "Confirm who you are.", attempts: 0, ...over });
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
beforeEach(() => { vi.mocked(getToken).mockReturnValue(null); });
afterEach(() => cleanup());

describe("the identity step on an application's confirmation screen", () => {
  it("asks the server where this application's check stands, with the reference and the email address, and shows the card", async () => {
    const f = reply(200, { success: true, data: view() }); globalThis.fetch = f; render(<ApplicationIdentityStep refNo="VNK-PA-ABC123456" email="thandi@example.com" />);
    expect(await screen.findByRole("heading", { name: "Confirm your identity" })).toBeTruthy();
    const [url, init] = vi.mocked(f).mock.calls[0]; expect(String(url)).toMatch(/\/api\/identity\/status$/); expect(JSON.parse(String(init?.body))).toEqual({ kind: "application", ref: "VNK-PA-ABC123456", email: "thandi@example.com" });
    expect(screen.getByText(/cannot approve your application until your identity is confirmed/)).toBeTruthy();
  });
  it("shows nothing at all when identity checks are not switched on", async () => {
    const f = reply(200, { success: true, data: view({ enabled: false, canStart: false }) }); globalThis.fetch = f; const { container } = render(<ApplicationIdentityStep refNo="VNK-PA-ABC123456" email="a@b.co" />);
    await waitFor(() => expect(f).toHaveBeenCalled()); await new Promise((r) => setTimeout(r, 20)); expect(container.textContent).toBe("");
  });
  it("shows nothing, and does not throw, when the lookup fails, the server errs or the network is down: a confirmation screen must never fail because of it", async () => {
    for (const f of [reply(404, { success: false, error: "not found" }), reply(500, { success: false, error: "x" }), vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch, vi.fn(async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch]) {
      globalThis.fetch = f; const { container, unmount } = render(<ApplicationIdentityStep refNo="VNK-PA-ABC123456" email="a@b.co" />); await waitFor(() => expect(f).toHaveBeenCalled()); await new Promise((r) => setTimeout(r, 20)); expect(container.textContent).toBe(""); unmount();
    }
  });
  it("does not ask at all without a reference, and for a signed-in customer sends the login and no email", async () => {
    const f = reply(200, { success: true, data: view() }); globalThis.fetch = f; const { unmount } = render(<ApplicationIdentityStep refNo="" />); await new Promise((r) => setTimeout(r, 20)); expect(f).not.toHaveBeenCalled(); unmount();
    vi.mocked(getToken).mockReturnValue("jwt-abc"); render(<ApplicationIdentityStep refNo="VNK-PA-ABC123456" />); await screen.findByRole("heading", { name: "Confirm your identity" });
    const init = vi.mocked(f).mock.calls[0][1]!; expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-abc"); expect(JSON.parse(String(init.body))).toEqual({ kind: "application", ref: "VNK-PA-ABC123456" });
  });
  it("asks again, without rebuilding the page, when the card says the check has changed", async () => {
    let calls = 0; globalThis.fetch = vi.fn(async () => { calls++; return new Response(JSON.stringify({ success: true, data: view({ status: calls > 1 ? "pending" : "not_started", canStart: calls === 1, message: calls > 1 ? "Being checked msg" : "Confirm who you are." }) }), { status: 200 }); }) as unknown as typeof fetch;
    const sdk = { handlers: {} as Record<string, () => void> }; const b: Record<string, unknown> = {}; b.withConf = () => b; b.withOptions = () => b; b.on = (e: string, cb: () => void) => { sdk.handlers[e] = cb; return b; }; b.build = () => ({ launch: () => undefined });
    window.snsWebSdk = { init: () => b as never }; globalThis.fetch = ((orig) => vi.fn(async (u: unknown, i?: RequestInit) => (String(u).endsWith("/identity/token") ? new Response(JSON.stringify({ success: true, data: { token: "t", expiresInSecs: 900, status: "in_progress" } }), { status: 200 }) : (orig as typeof fetch)(u as string, i))) as unknown as typeof fetch)(globalThis.fetch);
    render(<ApplicationIdentityStep refNo="VNK-PA-ABC123456" email="a@b.co" />); await screen.findByRole("heading", { name: "Confirm your identity" });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /Confirm my identity/ })); await waitFor(() => expect(sdk.handlers["idCheck.onApplicantSubmitted"]).toBeTruthy());
    sdk.handlers["idCheck.onApplicantSubmitted"](); await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Being checked msg")); delete window.snsWebSdk;
  });
});
