import { render, screen, fireEvent, waitFor, cleanup, within, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The live connection is a test double here: it records the handler so a test can send "a live event", and says whether it is up.
let liveHandler: ((event: string, data: unknown) => void) | null = null, liveUp = true;
vi.mock("./rankLive", () => ({ useRankLive: (h: (e: string, d: unknown) => void) => { liveHandler = h; return liveUp; } }));

import { DriverLoading } from "./DriverLoading";
import { rand } from "./ui";
const R = (cents: number) => rand(cents / 100);                  // the amount as the app writes it (South African style)

type Reply = { status?: number; body: unknown } | ((init?: RequestInit) => { status?: number; body: unknown });
let routes: Record<string, Reply>, calls: { url: string; method: string }[];
const LOADING = (over: Record<string, unknown> = {}, period = { sessions: 2, passengers: 27, totalCents: 67500 }) => ({ success: true, current: { id: "s1", status: "loading", registration: "CA 111-111", driverName: "Dee", passengers: 3, totalCents: 7500, pairedAt: "2026-10-07T10:00:00Z",
  taps: [{ id: "t3", at: "2026-10-07T10:03:00Z", amountCents: 2500, card: "VINK ****FEED", status: "confirmed" }, { id: "t2", at: "2026-10-07T10:02:00Z", amountCents: 2500, card: "VINK ****0002", status: "confirmed" }, { id: "t1", at: "2026-10-07T10:01:00Z", amountCents: 2500, card: "VINK ****0001", status: "confirmed" }], ...over }, period });
const IDLE = { success: true, current: null, period: { sessions: 2, passengers: 27, totalCents: 67500 } };
beforeEach(() => {
  calls = []; liveHandler = null; liveUp = true; routes = { "GET /api/portal/driver/loading": { body: LOADING() } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET"; calls.push({ url: path, method });
    const r = routes[`${method} ${path}`]; if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 });
    const x = typeof r === "function" ? r(init) : r; return new Response(JSON.stringify(x.body), { status: x.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const loads = () => calls.filter((c) => c.method === "GET" && c.url === "/api/portal/driver/loading").length;

describe("the driver's loading dashboard", () => {
  it("shows the vehicle being loaded, the running total, the passenger count and the latest taps with only the end of each card", async () => {
    render(<DriverLoading />);
    expect(await screen.findByText("Loading now · CA 111-111")).toBeInTheDocument();
    expect(screen.getByText(R(7500), { selector: "p" })).toBeInTheDocument(); expect(screen.getByText("3", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("VINK ****FEED")).toBeInTheDocument(); expect(screen.getAllByText(R(2500)).length).toBe(3);
    expect(screen.getByText("Live")).toBeInTheDocument(); expect(screen.getByText("Trips today")).toBeInTheDocument(); expect(screen.getByText(R(67500))).toBeInTheDocument();
  });
  it("fetches the real state the moment a live event arrives, and shows the new total", async () => {
    render(<DriverLoading />); await screen.findByText("Loading now · CA 111-111"); expect(loads()).toBe(1);
    routes["GET /api/portal/driver/loading"] = { body: LOADING({ passengers: 4, totalCents: 10000 }) };
    act(() => liveHandler!("rank.tap", { totalCents: 10000 })); expect(await screen.findByText(R(10000), { selector: "p" })).toBeInTheDocument(); expect(loads()).toBe(2);
  });
  it("says it is updating every few seconds, and checks every five, when the live connection is down; with it up it does not poll that often", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true }); liveUp = false; Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    render(<DriverLoading />); await screen.findByText("Updating every few seconds"); const before = loads();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_100); }); expect(loads()).toBeGreaterThan(before);
    cleanup(); liveUp = true; calls = []; render(<DriverLoading />); await screen.findByText("Live"); const n = loads();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); }); expect(loads()).toBe(n);
  });
  it("asks before departing, does nothing if the driver says not yet, and departs only on a yes", async () => {
    routes["POST /api/portal/driver/loading/depart"] = { body: { success: true, session: { status: "closed" } } };
    render(<DriverLoading />); await screen.findByText("Loading now · CA 111-111");
    fireEvent.click(screen.getByRole("button", { name: "Vehicle full: depart" })); const g = screen.getByRole("group", { name: "Confirm departure" }); expect(g).toHaveTextContent(`Depart with 3 passengers and ${R(7500)}?`);
    fireEvent.click(screen.getByRole("button", { name: "Not yet" })); expect(screen.queryByRole("group", { name: "Confirm departure" })).toBeNull(); expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Vehicle full: depart" })); routes["GET /api/portal/driver/loading"] = { body: IDLE };
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm departure" })).getByRole("button", { name: "Yes, depart" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/portal/driver/loading/depart"]));
    expect(await screen.findByText(/No vehicle is loading for you/)).toBeInTheDocument();                        // refreshed: the load is over
  });
  it("shows the server's reason when the departure is refused, and keeps the screen", async () => {
    routes["POST /api/portal/driver/loading/depart"] = { status: 409, body: { success: false, error: "You are not loading a vehicle right now", code: "no_session" } };
    render(<DriverLoading />); await screen.findByText("Loading now · CA 111-111"); fireEvent.click(screen.getByRole("button", { name: "Vehicle full: depart" })); fireEvent.click(screen.getByRole("button", { name: "Yes, depart" }));
    expect(await screen.findByText("You are not loading a vehicle right now")).toBeInTheDocument();
  });
  it("tells a driver with no vehicle loading how to start, still shows their day, and offers no depart button", async () => {
    routes["GET /api/portal/driver/loading"] = { body: IDLE }; render(<DriverLoading />);
    expect(await screen.findByText(/tap your driver card on the rank device/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /depart/i })).toBeNull(); expect(screen.getByText("27")).toBeInTheDocument(); expect(screen.getByText(R(67500))).toBeInTheDocument();
  });
  it("says that the fares are theirs to withdraw at any time, and takes them to where they can", async () => {
    const onWithdraw = vi.fn(); render(<DriverLoading onWithdraw={onWithdraw} />); await screen.findByText("Loading now · CA 111-111");
    expect(screen.getByText(/withdraw them at any time, for example to cover fuel and other costs/)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: /Withdraw your money/ })); expect(onWithdraw).toHaveBeenCalledTimes(1);
  });
  it("says so when no tap has happened yet, shows a declined tap as declined, and reports a failed load without blanking the page", async () => {
    routes["GET /api/portal/driver/loading"] = { body: LOADING({ passengers: 0, totalCents: 0, taps: [] }) }; const a = render(<DriverLoading />); expect(await screen.findByText("No passenger has tapped yet.")).toBeInTheDocument(); a.unmount();
    routes["GET /api/portal/driver/loading"] = { body: LOADING({ taps: [{ id: "t9", at: "2026-10-07T10:03:00Z", amountCents: 2500, card: "VINK ****0009", status: "declined" }] }) }; const b = render(<DriverLoading />); expect(await screen.findByText("Declined")).toBeInTheDocument(); b.unmount();
    routes["GET /api/portal/driver/loading"] = { status: 500, body: { success: false, error: "boom" } }; render(<DriverLoading />); expect(await screen.findByRole("alert")).toHaveTextContent("boom"); expect(screen.getByText("Your money")).toBeInTheDocument();
  });
});
