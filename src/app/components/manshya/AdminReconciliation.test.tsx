import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ManshyaAdmin } from "./ManshyaAdmin";
import { setSession, setToken, clearSession } from "../../services/apiClient";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let calls: { method: string; url: string; body: Record<string, unknown> }[] = [];

const RUN = { id: "rec_1", ran_at: "2026-10-14T02:00:00.000Z", ran_by: "schedule", ok: false, exceptions: 2 };

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  calls = []; clearSession();
  setToken("t"); setSession({ id: "u1", username: "admin1", name: "Ops", email: "o@x.co", role: "superadmin" });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url).replace(/^.*\/api\/vink\/admin/, ""), method = init?.method ?? "GET";
    calls.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (u.startsWith("/reconciliation/runs/rec_1")) return json({ ...RUN, items: [
      { check: "refund_mismatch", ref: "pay_9", detail: "Marked refunded 500 cents, refund postings total 0 cents", merchant_id: "m_1" },
      { check: "webhook_dead_letters", ref: null, detail: "1 webhook event(s) gave up", merchant_id: null }] });
    if (u.startsWith("/reconciliation/runs")) return json({ data: [RUN] });
    if (u === "/reconciliation/run" && method === "POST") return json({ id: "rec_2", ok: true, exceptions: 0, by: "admin1" }, 201);
    if (u.startsWith("/reconciliation/settlements")) return json({ data: [{ id: "stl_1", imported_at: "2026-10-13T08:00:00.000Z", kind: "acquirer", source: "Test PSP", problems: 1, ok: false, summary: { rows: 10, matched: 9 } }] });
    if (u.startsWith("/webhooks/dead")) return json({ data: [{ id: "evt_d", merchant_id: "m_1", merchant: "Hook Co", type: "payment.paid", created_at: "2026-10-13T08:00:00.000Z", attempts: 8, last_error: "HTTP 503" }] });
    if (u === "/webhooks/evt_d/replay") return json({ id: "evt_d", outcome: "delivered" });
    return json({ data: [] });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); clearSession(); });

describe("back office: Reconciliation", () => {
  const open = async () => {
    render(<ManshyaAdmin isOpen onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reconciliation" }));
    await screen.findByText("Check the books now");
  };

  it("shows the latest check, its exceptions, the settlement imports and the webhooks that gave up", async () => {
    await open();
    expect(await screen.findByText("refund mismatch")).toBeInTheDocument();
    expect(screen.getByText(/Marked refunded 500 cents/)).toBeInTheDocument();
    expect(screen.getByText("2 exception(s)")).toBeInTheDocument();
    expect(screen.getByText("Test PSP")).toBeInTheDocument();
    expect(screen.getByText("Hook Co")).toBeInTheDocument(); expect(screen.getByText("HTTP 503")).toBeInTheDocument();
    expect(screen.getByText(/RECON_ALERT_EMAIL/)).toBeInTheDocument();
  });

  it("'Check the books now' starts a run and tells staff the result", async () => {
    await open();
    fireEvent.click(screen.getByText("Check the books now"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/reconciliation/run")).toBe(true));
    expect(await screen.findByText("The books reconcile.")).toBeInTheDocument();
  });

  it("'Replay' sends a dead webhook again", async () => {
    await open();
    fireEvent.click(await screen.findByText("Replay"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/webhooks/evt_d/replay")).toBe(true));
    expect(await screen.findByText("Replay: delivered")).toBeInTheDocument();
  });

  it("opens the settlement import form", async () => {
    await open();
    fireEvent.click(screen.getByText("Import a settlement file"));
    expect(await screen.findByText(/Paste the file/)).toBeInTheDocument();
    expect(screen.getByText(/Whose file is it/)).toBeInTheDocument();
  });
});
