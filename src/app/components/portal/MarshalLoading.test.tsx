import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let liveHandler: ((event: string, data: unknown) => void) | null = null;
vi.mock("./rankLive", () => ({ useRankLive: (h: (e: string, d: unknown) => void) => { liveHandler = h; return true; } }));

import { MarshalLoading } from "./MarshalLoading";
import { rand } from "./ui";
const R = (cents: number) => rand(cents / 100);

type Reply = { status?: number; body: unknown } | ((init?: RequestInit) => { status?: number; body: unknown });
let routes: Record<string, Reply>, calls: { url: string; method: string; body?: unknown }[];
const RANK = { id: "rank-1", name: "Langa rank" };
const D1 = { id: "dev-1", serial: "RK-1", model: "P18Q", status: "active", online: true, sessionId: null }, D2 = { id: "dev-2", serial: "RK-2", model: "P18Q", status: "active", online: false, sessionId: null };
const Q = (id: string, reg: string, over: Record<string, unknown> = {}) => ({ id, vehicleId: "v-" + id, registration: reg, seats: 15, joinedAt: "2026-10-07T10:00:00Z", status: "waiting", sessionId: null, driverName: null, passengers: 0, totalCents: 0, ...over });
const BOARD = (queue: unknown[], devices: unknown[]) => ({ success: true, queue, devices });
const URL_BOARD = "GET /api/portal/marshal/ranks/rank-1/loading";
beforeEach(() => {
  calls = []; liveHandler = null; routes = { [URL_BOARD]: { body: BOARD([Q("q1", "CA 111-111"), Q("q2", "CA 222-222")], [D1]) } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET"; calls.push({ url: path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const r = routes[`${method} ${path}`]; if (!r) return new Response(JSON.stringify({ error: "unexpected " + method + " " + path }), { status: 500 });
    const x = typeof r === "function" ? r(init) : r; return new Response(JSON.stringify(x.body), { status: x.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const posts = () => calls.filter((c) => c.method === "POST");

describe("the marshal's loading board", () => {
  it("shows the rank's devices (online or not, free or in use) and the queue with where each vehicle is", async () => {
    routes[URL_BOARD] = { body: BOARD([Q("q1", "CA 111-111", { status: "loading", sessionId: "s1", driverName: "Dee", passengers: 3, totalCents: 7500 }), Q("q2", "CA 222-222", { status: "pairing", sessionId: "s2" }), Q("q3", "CA 333-333")], [{ ...D1, sessionId: "s1" }, D2]) };
    render(<MarshalLoading rank={RANK} />);
    expect(await screen.findByText("Card devices at Langa rank")).toBeInTheDocument(); expect(screen.getByText("Online")).toBeInTheDocument(); expect(screen.getByText("Offline")).toBeInTheDocument(); expect(screen.getByText("In use")).toBeInTheDocument(); expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText(`Loading · Dee · 3 passengers · ${R(7500)}`)).toBeInTheDocument(); expect(screen.getByText("Waiting for the driver to tap their driver card")).toBeInTheDocument(); expect(screen.getByText("Waiting")).toBeInTheDocument();
  });
  it("starts loading a vehicle on the free online device, naming the vehicle and the device, and refreshes the board", async () => {
    routes["POST /api/portal/marshal/ranks/rank-1/sessions"] = { status: 201, body: { success: true, session: { status: "pending" } } }; render(<MarshalLoading rank={RANK} />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Start loading" }))[1]);
    await waitFor(() => expect(posts()).toEqual([{ url: "/api/portal/marshal/ranks/rank-1/sessions", method: "POST", body: { terminalId: "dev-1", queueId: "q2" } }])); expect(await screen.findByText("Loading started. Waiting for the driver's card.")).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith("/loading")).length).toBeGreaterThan(1);
  });
  it("lets the marshal choose which free device to load on, preferring an online one by default", async () => {
    routes[URL_BOARD] = { body: BOARD([Q("q1", "CA 111-111")], [D2, D1]) }; routes["POST /api/portal/marshal/ranks/rank-1/sessions"] = { status: 201, body: { success: true } }; render(<MarshalLoading rank={RANK} />);
    const sel = (await screen.findByLabelText("Device to load on")) as HTMLSelectElement; expect(sel.value).toBe("dev-1");                       // the online one, though listed second
    fireEvent.change(sel, { target: { value: "dev-2" } }); fireEvent.click(screen.getByRole("button", { name: "Start loading" })); await waitFor(() => expect(posts()[0].body).toEqual({ terminalId: "dev-2", queueId: "q1" }));
  });
  it("loads on the default device (the online one, even when it is listed second) when the marshal does not choose", async () => {
    routes[URL_BOARD] = { body: BOARD([Q("q1", "CA 111-111")], [D2, D1]) }; routes["POST /api/portal/marshal/ranks/rank-1/sessions"] = { status: 201, body: { success: true } }; render(<MarshalLoading rank={RANK} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start loading" })); await waitFor(() => expect(posts()[0].body).toEqual({ terminalId: "dev-1", queueId: "q1" }));
  });
  it("says when there is no device at the rank, and when every device is in use, instead of offering to start", async () => {
    routes[URL_BOARD] = { body: BOARD([Q("q1", "CA 111-111")], []) }; const a = render(<MarshalLoading rank={RANK} />); expect(await screen.findByText(/has no shared card device yet/)).toBeInTheDocument(); expect(screen.getByText("No free device")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Start loading" })).toBeNull(); a.unmount();
    routes[URL_BOARD] = { body: BOARD([Q("q1", "CA 111-111")], [{ ...D1, sessionId: "s9" }]) }; render(<MarshalLoading rank={RANK} />); expect(await screen.findByText("No free device")).toBeInTheDocument();
  });
  it("departs a loading vehicle and cancels a vehicle still waiting for its driver, and cannot cancel once passengers have paid", async () => {
    routes[URL_BOARD] = { body: BOARD([Q("q1", "CA 111-111", { status: "loading", sessionId: "s1", driverName: "Dee", passengers: 2, totalCents: 5000 }), Q("q2", "CA 222-222", { status: "pairing", sessionId: "s2" })], [{ ...D1, sessionId: "s1" }, { ...D2, sessionId: "s2" }]) };
    routes["POST /api/portal/marshal/ranks/rank-1/sessions/s1/close"] = { body: { success: true } }; routes["POST /api/portal/marshal/ranks/rank-1/sessions/s2/cancel"] = { body: { success: true } };
    render(<MarshalLoading rank={RANK} />); await screen.findByText("Card devices at Langa rank");
    expect(screen.getAllByRole("button", { name: "Cancel" })).toHaveLength(1);                                    // only the vehicle that has taken no money
    fireEvent.click(screen.getByRole("button", { name: "Depart" })); await waitFor(() => expect(posts().map((p) => p.url)).toEqual(["/api/portal/marshal/ranks/rank-1/sessions/s1/close"]));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); await waitFor(() => expect(posts().map((p) => p.url)).toContain("/api/portal/marshal/ranks/rank-1/sessions/s2/cancel"));
  });
  it("shows the server's reason when a session cannot be started, and keeps the board", async () => {
    routes["POST /api/portal/marshal/ranks/rank-1/sessions"] = { status: 409, body: { success: false, error: "That device is already loading a vehicle", code: "device_busy" } }; render(<MarshalLoading rank={RANK} />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Start loading" }))[0]); expect(await screen.findByText("That device is already loading a vehicle")).toBeInTheDocument(); expect(screen.getByText("CA 111-111")).toBeInTheDocument();
  });
  it("refreshes the board the moment a live event arrives", async () => {
    render(<MarshalLoading rank={RANK} />); await screen.findByText("Card devices at Langa rank"); const n = calls.length;
    routes[URL_BOARD] = { body: BOARD([Q("q1", "CA 111-111", { status: "loading", sessionId: "s1", driverName: "Dee", passengers: 1, totalCents: 2500 })], [{ ...D1, sessionId: "s1" }]) };
    act(() => liveHandler!("rank.session", {})); expect(await screen.findByText(`Loading · Dee · 1 passenger · ${R(2500)}`)).toBeInTheDocument(); expect(calls.length).toBeGreaterThan(n);
  });
  it("says so when nobody is waiting, and reports a failed load", async () => {
    routes[URL_BOARD] = { body: BOARD([], [D1]) }; const a = render(<MarshalLoading rank={RANK} />); expect(await screen.findByText(/Nobody is waiting/)).toBeInTheDocument(); a.unmount();
    routes[URL_BOARD] = { status: 500, body: { success: false, error: "boom" } }; render(<MarshalLoading rank={RANK} />); expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
