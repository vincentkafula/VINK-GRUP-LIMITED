import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ManshyaAdmin } from "./ManshyaAdmin";
import { setSession, setToken, clearSession } from "../../services/apiClient";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
const GOOD = { name: "manshya-sandbox-20261014T020000Z.db", created_at: "2026-10-14T02:00:00.000Z", by: "schedule", bytes: 5_242_880, journals: 412, entries: 824, ok: true, problems: [], uploads: { files: 12, copied: 2, changed: [], missing: [], documents_without_file: 0 }, offsite: null };
const BAD = { ...GOOD, name: "manshya-sandbox-20261013T020000Z.db", created_at: "2026-10-13T02:00:00.000Z", ok: false, problems: ["1 journal(s) do not balance"], uploads: { files: 12, copied: 0, changed: ["docs/m/d1"], missing: [], documents_without_file: 0 }, offsite: "failed: bucket unreachable" };
let backupsReply: { status: number; body: unknown } = { status: 200, body: { enabled: true, data: [GOOD, BAD] } };
let restoreReply: Record<string, unknown> = { restored: true, ok: true, exceptions: 0, items: [], journals: 412, entries: 824 };

const RUN = { id: "rec_1", ran_at: "2026-10-14T02:00:00.000Z", ran_by: "schedule", ok: false, exceptions: 2 };

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  calls = []; clearSession(); backupsReply = { status: 200, body: { enabled: true, data: [GOOD, BAD] } }; restoreReply = { restored: true, ok: true, exceptions: 0, items: [], journals: 412, entries: 824 };
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
    if (u === "/backups" && method === "GET") return json(backupsReply.body, backupsReply.status);
    if (u === "/backups" && method === "POST") return json({ ...GOOD, name: "manshya-sandbox-20261015T020000Z.db" }, 201);
    if (u.endsWith("/restore-check") && method === "POST") return json(restoreReply);
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

describe("back office: database backups", () => {
  const open = async () => { render(<ManshyaAdmin isOpen onClose={() => {}} />); fireEvent.click(await screen.findByRole("button", { name: "Reconciliation" })); await screen.findByText("Check the books now"); await screen.findByText("Database backups"); };

  it("lists each backup with whether it was verified, its size, what it holds, and whether a copy has left the machine", async () => {
    await open(); expect(screen.getByText("verified")).toBeInTheDocument(); expect(screen.getByText("unsound")).toBeInTheDocument(); expect(screen.getAllByText("5.0 MB")).toHaveLength(2);
    expect(screen.getByText("1 journal(s) do not balance")).toBeInTheDocument(); expect(screen.getByText("not set up")).toBeInTheDocument(); expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("12 file(s), 2 new")).toBeInTheDocument(); expect(screen.getByText("12 file(s) — CHECK")).toBeInTheDocument();                // a changed document is flagged
    expect(screen.getByText(/do not protect against losing the volume/)).toBeInTheDocument();
  });
  it("lets a superadmin take a backup, and says whether it came out sound", async () => {
    await open(); fireEvent.click(screen.getByRole("button", { name: "Take a backup now" })); await screen.findByText("Backup taken and checked: 412 journals.");
    expect(calls.some((c) => c.method === "POST" && c.url === "/backups")).toBe(true);
  });
  it("tests a restore from a backup and says the restored copy reconciles", async () => {
    await open(); fireEvent.click(screen.getAllByText("Test restore")[0]); await screen.findByText("Restored copy reconciles: 412 journals, 824 entries.");
    expect(calls.find((c) => c.url.endsWith("/restore-check"))?.url).toBe("/backups/manshya-sandbox-20261014T020000Z.db/restore-check");
  });
  it("shows what was wrong when the restored copy does not reconcile", async () => {
    restoreReply = { restored: true, ok: false, exceptions: 1, items: [{ check: "payment_not_posted", detail: "Payment of 100 cents was never posted" }], journals: 3, entries: 6 };
    await open(); fireEvent.click(screen.getAllByText("Test restore")[0]); expect(await screen.findByText(/payment not posted — Payment of 100 cents was never posted/)).toBeInTheDocument(); expect(screen.getByText("The backup itself was not changed.")).toBeInTheDocument();
  });
  it("offers the same to an owner, the other role that can reach the back office", async () => {
    setSession({ id: "u2", username: "owner1", name: "Owner", email: "o@x.co", role: "owner" }); await open();
    expect(screen.getByRole("button", { name: "Take a backup now" })).toBeInTheDocument(); expect(screen.getAllByText("Test restore").length).toBeGreaterThan(0);
  });
  it("does not offer to restore-test a backup that was never verified (there is nothing recorded to test)", async () => {
    backupsReply = { status: 200, body: { enabled: true, data: [{ name: "manshya-sandbox-20260101T000000Z.db", created_at: "2026-01-01T00:00:00.000Z", bytes: 100, ok: false, unverified: true, problems: ["No verification record: this backup was never verified"] }] } };
    await open(); expect(screen.getByText("never verified")).toBeInTheDocument(); expect(screen.queryByText("Test restore")).toBeNull();
  });
  it("says so when backups are off for an in-memory database, and offers nothing to do", async () => {
    backupsReply = { status: 200, body: { enabled: false, data: [] } }; await open(); expect(screen.getByText("Backups are off: this database is in memory.")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Take a backup now" })).toBeNull();
  });
  it("never breaks the rest of the page when the server has no backups route, refuses, or fails", async () => {
    for (const status of [404, 401, 500]) { backupsReply = { status, body: { error: "nope" } }; const { unmount } = render(<ManshyaAdmin isOpen onClose={() => {}} />); fireEvent.click(await screen.findByRole("button", { name: "Reconciliation" })); await screen.findByText("Check the books now"); expect(screen.queryByText("Database backups")).toBeNull(); expect(screen.getByText("refund mismatch")).toBeInTheDocument(); unmount(); }
  });
});

