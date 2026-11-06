import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DriverQueuePosition, DriverFees } from "./DriverQueue";
import { rand } from "./ui";

const R = (cents: number) => rand(cents / 100).replace(/\s/g, " ");
let reply: (path: string) => unknown;
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(reply(String(url).replace(/^https?:\/\/[^/]+/, ""))), { status: 200 }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the driver's place in the queue", () => {
  it("shows the position at each rank, how many are ahead and how many are waiting", async () => {
    reply = () => ({ success: true, positions: [{ rankId: "k1", rank: "Langa", registration: "CA 111-111", position: 3, ahead: 2, waiting: 7, loading: false }] });
    render(<DriverQueuePosition />); expect(await screen.findByText("3")).toBeInTheDocument(); expect(screen.getByText(/CA 111-111 at Langa/)).toBeInTheDocument(); expect(screen.getByText(/2 vehicles ahead of you · 7 waiting/)).toBeInTheDocument();
  });
  it("says you are next, says one vehicle ahead in the singular, and says when you are loading", async () => {
    reply = () => ({ success: true, positions: [{ rankId: "k1", rank: "Langa", registration: "A", position: 1, ahead: 0, waiting: 4, loading: false }, { rankId: "k2", rank: "Bellville", registration: "B", position: 2, ahead: 1, waiting: 2, loading: false }, { rankId: "k3", rank: "Elsewhere", registration: "C", position: 1, ahead: 0, waiting: 1, loading: true }] });
    render(<DriverQueuePosition />); expect(await screen.findByText(/You are next\. · 4 waiting/)).toBeInTheDocument(); expect(screen.getByText(/1 vehicle ahead of you · 2 waiting/)).toBeInTheDocument(); expect(screen.getByText(/Loading now\. · 1 waiting/)).toBeInTheDocument();
  });
  it("says so when the vehicle is not in a queue", async () => { reply = () => ({ success: true, positions: [] }); render(<DriverQueuePosition />); expect(await screen.findByText("Your vehicle is not in a queue right now.")).toBeInTheDocument(); });
});

describe("the driver's trip fees", () => {
  it("shows what is due, paid and owed, and that owed fees are collected from their VINK account", async () => {
    reply = () => ({ success: true, trips: 3, feesDueCents: 6000, feesReceivedCents: 2000, feesOutstandingCents: 4000, tripsOwed: 2, outstanding: [] });
    render(<DriverFees />); expect(await screen.findByText(/3 trips · due/)).toHaveTextContent(`3 trips · due ${R(6000)}, paid ${R(2000)}, still owed ${R(4000)}.`); expect(screen.getByText("2 trip fees are waiting to be collected from your VINK account.")).toBeInTheDocument();
  });
  it("says when there are none, and uses the singular for one", async () => {
    reply = () => ({ success: true, trips: 0, feesDueCents: 0, feesReceivedCents: 0, feesOutstandingCents: 0, tripsOwed: 0, outstanding: [] }); const a = render(<DriverFees />); expect(await screen.findByText("No trip fees in this period.")).toBeInTheDocument(); a.unmount();
    reply = () => ({ success: true, trips: 1, feesDueCents: 2000, feesReceivedCents: 0, feesOutstandingCents: 2000, tripsOwed: 1, outstanding: [] }); render(<DriverFees />); expect(await screen.findByText("1 trip fee is waiting to be collected from your VINK account.")).toBeInTheDocument();
  });
});

describe("the driver's trips", () => {
  it("lists their recent trips with what each fee is, and sends a query about one", async () => {
    const { DriverTripFees } = await import("./DriverQueue"); const sent: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { const p = String(url).replace(/^https?:\/\/[^/]+/, ""); if (init?.method === "POST") { sent.push({ p, body: JSON.parse(String(init.body)) }); return new Response(JSON.stringify({ success: true, id: "q1" }), { status: 201 }); }
      return new Response(JSON.stringify({ success: true, trips: [{ departureId: "d1", time: "2026-11-02T04:00:00Z", rank: "Langa", registration: "CA 111-111", feeCents: 2000, feeStatus: "paid" }, { departureId: "d2", time: "2026-11-02T05:00:00Z", rank: "Langa", registration: "CA 111-111", feeCents: 2000, feeStatus: "owed" }, { departureId: "d3", time: "2026-11-01T05:00:00Z", rank: "Bellville", registration: "CA 111-111", feeCents: null, feeStatus: "none" }] }), { status: 200 }); }));
    render(<DriverTripFees />); expect(await screen.findByText(new RegExp(`${R(2000).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Paid`))).toBeInTheDocument(); expect(screen.getByText(/ Owed/)).toBeInTheDocument(); expect(screen.getByText("No fee")).toBeInTheDocument();
    const { fireEvent, waitFor } = await import("@testing-library/react"); fireEvent.click(screen.getAllByText("Query this trip")[1]); fireEvent.change(screen.getByLabelText("What is wrong"), { target: { value: "I did not do this trip" } }); fireEvent.click(screen.getByRole("button", { name: "Send query" }));
    await waitFor(() => expect(sent).toEqual([{ p: "/api/portal/driver/disputes", body: { targetId: "d2", message: "I did not do this trip" } }])); expect(await screen.findByText("Sent. Your association will answer.")).toBeInTheDocument();
  });
  it("says there are no trips", async () => { const { DriverTripFees } = await import("./DriverQueue"); reply = () => ({ success: true, trips: [] }); render(<DriverTripFees />); expect(await screen.findByText("No trips in the last 14 days.")).toBeInTheDocument(); });
});
