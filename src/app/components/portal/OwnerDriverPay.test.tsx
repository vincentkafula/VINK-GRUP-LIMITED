/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DriverTargetsScreen, toCents } from "./OwnerDriverPay";
import { rand } from "./ui";

const R = (cents: number) => rand(cents / 100).replace(/\s/g, " ");
const norm = (t: string | null | undefined) => (t ?? "").replace(/\s/g, " ");
type Reply = { status?: number; body: unknown } | "network";
let routes: (method: string, path: string, body: any) => Reply | undefined, calls: { method: string; path: string; body: any }[];
const P = "/api/portal/owner";
const FLEET = { success: true, today: "2026-11-04", measures: { vehicles: 3, withTarget: 2, arrearsCents: 50000, surplusCents: 10000, receivedThisWeekCents: 30000, receivedThisMonthCents: 150000, red: 1, amber: 0, green: 1 },
  vehicles: [{ vehicleId: "v1", registration: "CA 111-111", driver: "Dan Driver", hasTarget: true, status: "red", target: { period: "daily", amountCents: 20000 }, arrearsCents: 50000, surplusCents: 0, lastPaymentOn: "2026-11-01" },
    { vehicleId: "v2", registration: "CA 222-222", driver: "Dee Driver", hasTarget: true, status: "green", target: { period: "weekly", amountCents: 140000 }, arrearsCents: 0, surplusCents: 10000, lastPaymentOn: "2026-11-03" },
    { vehicleId: "v3", registration: "CA 333-333", driver: null, hasTarget: false, status: "none", target: null, arrearsCents: 0, surplusCents: 0, lastPaymentOn: null }],
  flags: [{ id: "pay:arrears:v1", severity: "medium", message: "CA 111-111: R500.00 is owed by the driver (about 2.5 days of the target)" }] };
const REC = { success: true, vehicle: { id: "v1", registration: "CA 111-111" }, hasTarget: true, status: "red", target: { id: "t1", period: "daily", amountCents: 20000, workingDays: 63, dueWeekday: 7, startDate: "2026-11-02", endDate: null, terms: null, driverId: null }, targets: [], split: { ownerBp: 7000, associationBp: 2000, financeBp: 1000, maintenanceBp: 0 }, earmarks: { owner: 21000, association: 6000, finance: 3000, maintenance: 0, totalCents: 30000 },
  totals: { expectedCents: 80000, receivedCents: 30000, waivedCents: 0, balanceCents: -50000, arrearsCents: 50000, surplusCents: 0 }, daysBehind: 2.5, lastPaymentOn: "2026-11-01", pauses: [{ id: "z1", fromDate: "2026-11-10", toDate: "2026-11-11", reason: "Service" }, { id: "z2", fromDate: "2026-10-01", toDate: "2026-10-02", reason: "Breakdown" }],
  weeks: [{ weekStart: "2026-10-26", expectedCents: 40000, receivedCents: 30000, waivedCents: 0, balanceCents: -10000, shortfallCents: 10000, carriedForwardCents: 10000 }, { weekStart: "2026-11-02", expectedCents: 40000, receivedCents: 0, waivedCents: 0, balanceCents: -50000, shortfallCents: 40000, carriedForwardCents: 50000 }], flags: [{ id: "pay:arrears:v1", severity: "medium", message: "CA 111-111: R500.00 is owed by the driver" }] };
const PAYMENTS = { success: true, payments: [{ id: "p1", vehicleId: "v1", amountCents: 30000, paidOn: "2026-11-01", method: "cash", driver: "Dan Driver", note: "Sunday money", voided: false, voidReason: null, allocations: { owner: 21000, association: 6000, finance: 3000, maintenance: 0 } }, { id: "p2", vehicleId: "v1", amountCents: 5000, paidOn: "2026-10-30", method: "eft", driver: null, note: null, voided: true, voidReason: "Entered twice", allocations: { owner: 5000, association: 0, finance: 0, maintenance: 0 } }] };
beforeEach(() => {
  localStorage.clear(); calls = []; routes = (m, p) => {
    if (p === `${P}/driver-pay/fleet`) return { body: FLEET }; if (p === `${P}/drivers`) return { body: { success: true, drivers: [{ driverId: "d1", name: "Dan Driver", status: "active" }, { driverId: "d2", name: "Dee Driver", status: "active" }, { driverId: "d9", name: "Pending Pete", status: "pending" }] } };
    if (p === `${P}/driver-pay/vehicles/v1`) return { body: REC }; if (p.startsWith(`${P}/driver-pay/payments?`)) return { body: PAYMENTS };
    if (m === "POST" || m === "PUT" || m === "DELETE") return { status: m === "POST" ? 201 : 200, body: { success: true, id: "new", duplicate: false } }; return undefined;
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, ""), method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ method, path, body });
    const r = routes(method, path, body); if (r === "network") throw new TypeError("Failed to fetch"); if (!r) return new Response(JSON.stringify({ success: false, error: "unexpected " + method + " " + path }), { status: 500 }); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const writes = () => calls.filter((c) => c.method !== "GET");
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const li = (reg: string) => screen.getByText(reg, { selector: "b" }).closest("li")!;
const openV1 = async () => { render(<DriverTargetsScreen />); fireEvent.click(within(await screen.findByText("CA 111-111", { selector: "b" }).then((b) => b.closest("li")!)).getByRole("button", { name: "Open" })); await screen.findByText(/Should pay/); };

describe("reading an amount in rand", () => {
  it("takes whole rand, cents, spaces and either decimal mark, and refuses anything else", () => {
    expect([toCents("300"), toCents("300.5"), toCents("300,50"), toCents("1 200"), toCents("1,200.50"), toCents(" 0.05 ")]).toEqual([30000, 30050, 30050, 120000, 120050, 5]); for (const bad of ["", "0", "0.00", "-5", "abc", "12.345", "R300", "3 0 0.5.5"]) expect(toCents(bad), bad).toBeNull();
  });
});

describe("the fleet", () => {
  it("shows what is owed, what came in, how many are behind, and what needs attention", async () => {
    render(<DriverTargetsScreen />); expect(await screen.findByText(R(50000))).toBeInTheDocument(); expect(screen.getByText(R(30000))).toBeInTheDocument(); expect(screen.getByText(R(150000))).toBeInTheDocument(); expect(screen.getByText("1 of 2")).toBeInTheDocument(); expect(screen.getByText("Soon")).toBeInTheDocument(); expect(screen.getByText(/R500.00 is owed by the driver \(about 2.5 days/)).toBeInTheDocument();
  });
  it("lists each vehicle with its target, what it owes or is ahead, when it last paid, and a light that always has words", async () => {
    render(<DriverTargetsScreen />); await screen.findByText("CA 111-111", { selector: "b" }); expect(li("CA 111-111")).toHaveTextContent(`Dan Driver · ${R(20000)} a day · owes ${R(50000)} · last paid 2026-11-01`); expect(within(li("CA 111-111")).getByText("Far behind")).toBeInTheDocument();
    expect(li("CA 222-222")).toHaveTextContent(`${R(140000)} a week · ${R(10000)} ahead`); expect(within(li("CA 222-222")).getByText("Paying on time")).toBeInTheDocument(); expect(li("CA 333-333")).toHaveTextContent("no target"); expect(within(li("CA 333-333")).getByText("No target set")).toBeInTheDocument();
  });
  it("says to add a vehicle first when there are none", async () => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/driver-pay/fleet` ? { body: { ...FLEET, vehicles: [], flags: [] } } : o(m, p, b)))(routes); render(<DriverTargetsScreen />); expect(await screen.findByText("Add a vehicle first.")).toBeInTheDocument(); });
});

describe("recording a payment", () => {
  it("sends the vehicle, the amount in cents, the date, the method and a reference, and shows it was saved", async () => {
    render(<DriverTargetsScreen />); await screen.findByText("CA 111-111", { selector: "b" }); pick("Payment vehicle", "v1"); pick("Payment amount", "300.50"); fireEvent.click(screen.getByRole("button", { name: "EFT" })); pick("Payment note", "Monday"); fireEvent.click(screen.getByRole("button", { name: "Save payment" }));
    await waitFor(() => expect(writes().at(-1)!.path).toBe(`${P}/driver-pay/payments`)); const b = writes().at(-1)!.body; expect(b).toMatchObject({ vehicleId: "v1", amountCents: 30050, method: "eft", note: "Monday" }); expect(b.paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(b.clientRef).toMatch(/^pay-/); expect(b.driverId).toBeUndefined(); expect(await screen.findByText("Saved.")).toBeInTheDocument(); expect(screen.getByLabelText("Payment amount")).toHaveValue("");
  });
  it("names a driver only when one is chosen, and marks the chosen method", async () => {
    render(<DriverTargetsScreen />); await screen.findByText("CA 111-111", { selector: "b" }); expect(screen.getByRole("button", { name: "Cash" })).toHaveAttribute("aria-pressed", "true"); fireEvent.click(screen.getByRole("button", { name: "VINK" })); expect(screen.getByRole("button", { name: "VINK" })).toHaveAttribute("aria-pressed", "true"); expect(screen.getByRole("button", { name: "Cash" })).toHaveAttribute("aria-pressed", "false");
    expect(within(screen.getByLabelText("Payment driver")).queryByText("Pending Pete")).toBeNull(); pick("Payment vehicle", "v2"); pick("Payment amount", "100"); pick("Payment driver", "d2"); fireEvent.click(screen.getByRole("button", { name: "Save payment" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ driverId: "d2", method: "vink" }));
  });
  it("asks for the vehicle and a proper amount before sending anything", async () => {
    render(<DriverTargetsScreen />); await screen.findByText("CA 111-111", { selector: "b" }); fireEvent.click(screen.getByRole("button", { name: "Save payment" })); expect(await screen.findByText("Choose the vehicle.")).toBeInTheDocument(); pick("Payment vehicle", "v1"); pick("Payment amount", "three hundred"); fireEvent.click(screen.getByRole("button", { name: "Save payment" })); expect(await screen.findByText(/Type the amount in rand/)).toBeInTheDocument(); expect(writes()).toEqual([]);
  });
  it("shows the server's reason when a payment is refused, and does not keep it to try again", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (m === "POST" && p.endsWith("/payments") ? { status: 400, body: { success: false, error: "Give the date it was paid (not in the future)" } } : o(m, p, b)))(routes); render(<DriverTargetsScreen />); await screen.findByText("CA 111-111", { selector: "b" }); pick("Payment vehicle", "v1"); pick("Payment amount", "100"); fireEvent.click(screen.getByRole("button", { name: "Save payment" }));
    expect(await screen.findByText("Give the date it was paid (not in the future)")).toBeInTheDocument(); expect(JSON.parse(localStorage.getItem("vink.marshal.outbox.v1") ?? "[]")).toEqual([]);
  });
  it("with no signal, keeps the payment on the phone, says so, and sends it once with the same reference when the signal returns", async () => {
    let online = false; const orig = routes; routes = (m, p, b) => (m === "POST" && p.endsWith("/driver-pay/payments") && !online ? "network" : orig(m, p, b)); render(<DriverTargetsScreen />); await screen.findByText("CA 111-111", { selector: "b" }); pick("Payment vehicle", "v1"); pick("Payment amount", "250"); fireEvent.click(screen.getByRole("button", { name: "Save payment" }));
    expect(await screen.findByText("Saved on this phone. It will be sent when you are online.")).toBeInTheDocument(); const q = JSON.parse(localStorage.getItem("vink.marshal.outbox.v1") ?? "[]"); expect(q).toHaveLength(1); expect(q[0].body).toMatchObject({ vehicleId: "v1", amountCents: 25000 }); const ref = q[0].body.clientRef; expect(ref).toMatch(/^pay-/);
    expect(await screen.findByText(/1 change is saved on this phone and waiting to be sent: Payment of .* for CA 111-111/)).toBeInTheDocument(); online = true; fireEvent.click(screen.getByRole("button", { name: "Send now" })); await waitFor(() => expect(JSON.parse(localStorage.getItem("vink.marshal.outbox.v1") ?? "[]")).toEqual([]));
    const sent = writes().filter((c) => c.path === `${P}/driver-pay/payments`); expect(sent.at(-1)!.body.clientRef).toBe(ref); expect(screen.queryByText(/waiting to be sent/)).toBeNull();
  });
});

describe("one vehicle", () => {
  it("shows how far behind it is, in plain words, with the week-by-week figures and what carries forward", async () => {
    await openV1(); expect(screen.getByText(`Should pay ${R(20000)} a day from 2026-11-02.`)).toBeInTheDocument(); expect(screen.getAllByText("Owed to you")).toHaveLength(2); expect(screen.getByText(/That is about 2.5 days of the target. The last payment was on 2026-11-01./)).toBeInTheDocument();
    const rows = screen.getAllByRole("row").map((r) => r.textContent); expect(rows[1]).toContain(`2026-11-02${R(40000)}${R(0)}${R(0)}${R(50000)}`); expect(rows[2]).toContain(`2026-10-26${R(40000)}${R(30000)}${R(0)}${R(10000)}`);
  });
  it("lists the payments received with what was set aside, and a cancelled one struck out with its reason", async () => {
    await openV1(); const ps = (await screen.findByText(/Sunday money/)).closest("li")!; expect(ps).toHaveTextContent(`2026-11-01 · ${R(30000)} · Cash · Dan Driver · Sunday money`); expect(ps).toHaveTextContent(`Set aside: yours ${R(21000)}, association ${R(6000)}, finance ${R(3000)}, maintenance ${R(0)}`); const cx = screen.getByText(/Cancelled: Entered twice/).closest("li")!; expect(cx).toHaveTextContent(`2026-10-30 · ${R(5000)} · EFT`);
  });
  it("cancels a payment entered by mistake, showing the server's reason when none is given, and sending the reason when it is", async () => {
    const orig = routes; routes = (m, p, b) => (p.endsWith("/void") && !b?.reason ? { status: 400, body: { success: false, error: "Say why the payment is being voided" } } : orig(m, p, b)); await openV1(); fireEvent.click(await screen.findByRole("button", { name: "Entered by mistake?" })); fireEvent.click(screen.getByRole("button", { name: "Cancel this payment" })); expect(await screen.findByText("Say why the payment is being voided")).toBeInTheDocument();
    pick("Reason for cancelling", "Entered twice by mistake"); fireEvent.click(screen.getByRole("button", { name: "Cancel this payment" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/driver-pay/payments/p1/void`, body: { reason: "Entered twice by mistake" } }));
  });
  it("sets a daily target from the working-day buttons, in cents, from a date, and a weekly one with its due day", async () => {
    await openV1(); fireEvent.click(screen.getByText("Change the target", { selector: "summary" })); pick("Target amount", "250"); fireEvent.click(within(screen.getByRole("group", { name: "Working days" })).getByRole("button", { name: "Sat" })); fireEvent.click(screen.getByRole("button", { name: "Change the target" }));
    await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/driver-pay/targets`, body: { vehicleId: "v1", period: "daily", amountCents: 25000, workingDays: 31 } })); expect(writes().at(-1)!.body.dueWeekday).toBeUndefined();                  // Monday to Saturday (63) less Saturday (32) is 31
    pick("Target period", "weekly"); pick("Target due day", "5"); pick("Target amount", "1400"); pick("Target driver", "d2"); pick("Target terms", "Pays before 20:00"); fireEvent.click(screen.getByRole("button", { name: "Change the target" })); await waitFor(() => expect(writes().at(-1)!.body).toMatchObject({ period: "weekly", amountCents: 140000, dueWeekday: 5, driverId: "d2", terms: "Pays before 20:00" })); expect(writes().at(-1)!.body.workingDays).toBeUndefined();
  });
  it("refuses a target with no amount or no working days before sending", async () => {
    await openV1(); fireEvent.click(screen.getByText("Change the target", { selector: "summary" })); pick("Target amount", ""); fireEvent.click(screen.getByRole("button", { name: "Change the target" })); expect(await screen.findByText(/Type the amount in rand, for example 200/)).toBeInTheDocument(); pick("Target amount", "200"); for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) fireEvent.click(within(screen.getByRole("group", { name: "Working days" })).getByRole("button", { name: d }));
    fireEvent.click(screen.getByRole("button", { name: "Change the target" })); expect(await screen.findByText("Choose at least one working day.")).toBeInTheDocument(); expect(writes()).toEqual([]);
  });
  it("shows the split and sends basis points only when the four shares add up to 100%, saying so as it is typed", async () => {
    await openV1(); fireEvent.click(screen.getByText("How payments are set aside")); expect(screen.getByText("Total 100%")).toBeInTheDocument(); expect(screen.getByText(`So far: yours ${R(21000)}, association ${R(6000)}, finance instalment ${R(3000)}, maintenance ${R(0)}.`)).toBeInTheDocument();
    pick("Split Yours (%)", "60"); expect(screen.getByText("Total 90%")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Save the split" })); expect(await screen.findByText("The four shares must add up to 100%.")).toBeInTheDocument(); expect(writes()).toEqual([]);
    pick("Split Maintenance (%)", "10"); expect(screen.getByText("Total 100%")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Save the split" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "PUT", path: `${P}/driver-pay/vehicles/v1/split`, body: { ownerBp: 6000, associationBp: 2000, financeBp: 1000, maintenanceBp: 1000 } }));
  });
  it("adds days off the road, and offers to cancel only a pause that has not started", async () => {
    await openV1(); fireEvent.click(screen.getByText("Days off the road")); const future = screen.getByText(/2026-11-10 to 2026-11-11: Service/).closest("li")!, past = screen.getByText(/2026-10-01 to 2026-10-02: Breakdown/).closest("li")!; expect(within(past).queryByRole("button", { name: "Cancel" })).toBeNull();
    pick("Pause from", "2026-11-20"); pick("Pause to", "2026-11-22"); pick("Pause reason", "Service"); fireEvent.click(screen.getByRole("button", { name: "Add days off the road" })); await waitFor(() => expect(writes().at(-1)).toEqual({ method: "POST", path: `${P}/driver-pay/pauses`, body: { vehicleId: "v1", fromDate: "2026-11-20", toDate: "2026-11-22", reason: "Service" } }));
    fireEvent.click(within(future).getByRole("button", { name: "Cancel" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "DELETE", path: `${P}/driver-pay/pauses/z1` }));
  });
  it("offers to waive part of what is owed only while something is owed, and records it with a reason in cents", async () => {
    await openV1(); fireEvent.click(screen.getByText("Do not chase part of what is owed")); pick("Waive amount", "100"); pick("Waive reason", "Funeral"); fireEvent.click(screen.getByRole("button", { name: "Waive it" })); await waitFor(() => expect(writes().at(-1)).toMatchObject({ method: "POST", path: `${P}/driver-pay/waivers`, body: { vehicleId: "v1", amountCents: 10000, reason: "Funeral" } }));
    cleanup(); routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/driver-pay/vehicles/v1` ? { body: { ...REC, totals: { ...REC.totals, arrearsCents: 0, surplusCents: 5000, balanceCents: 5000 } } } : o(m, p, b)))(routes); await openV1(); expect(screen.queryByText("Do not chase part of what is owed")).toBeNull(); expect(screen.getByText("Paid ahead")).toBeInTheDocument();
  });
  it("says there is no target when there is none, and offers to set one", async () => {
    routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/driver-pay/vehicles/v1` ? { body: { ...REC, hasTarget: false, status: "none", target: null, weeks: [], flags: [], totals: { expectedCents: 0, receivedCents: 0, waivedCents: 0, balanceCents: 0, arrearsCents: 0, surplusCents: 0 } } } : o(m, p, b)))(routes); render(<DriverTargetsScreen />); fireEvent.click(within(await screen.findByText("CA 111-111", { selector: "b" }).then((b) => b.closest("li")!)).getByRole("button", { name: "Open" })); expect(await screen.findByText("No target is set for this vehicle.")).toBeInTheDocument(); expect(screen.getByText("Set the target", { selector: "summary" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "End this target" })).toBeNull();
  });
});

describe("money the platform collected, on a vehicle's page", () => {
  const withPlatform = (platform: any, flags: any[] = []) => { routes = ((o) => (m: string, p: string, b: any) => (p === `${P}/driver-pay/vehicles/v1` ? { body: { ...REC, platform, flags: [...REC.flags, ...flags] } } : o(m, p, b)))(routes); };
  it("says how much the platform collected, lists the payments, and tells the owner not to write them down", async () => {
    withPlatform({ countedCents: 30000, payments: [{ id: "i1", ref: "weekly:a:2026-11-01", paidOn: "2026-11-01", amountCents: 10000 }, { id: "i2", ref: "weekly:a:2026-11-03", paidOn: "2026-11-03", amountCents: 20000 }], unmatched: [], partlyPaid: [] }); await openV1();
    expect(norm(screen.getByText(/of what was received was collected for you by the platform/).textContent)).toBe(`${R(30000)} of what was received was collected for you by the platform. It is already counted above, so you do not need to write it down.`); expect(screen.getByText(new RegExp(`2026-11-03 · .*20 ?000|2026-11-03 ·`))).toBeInTheDocument(); expect(screen.getAllByText(/\(collected by the platform\)/)).toHaveLength(2);
  });
  it("says what has been part paid and what is still owed, and that the part paid is not counted yet", async () => {
    withPlatform({ countedCents: 0, payments: [], unmatched: [], partlyPaid: [{ ref: "weekly:a:2026-11-03", dueOn: "2026-11-03", paidCents: 18000, owedCents: 12000 }] }); await openV1(); expect(norm(screen.getByText(/has been part paid/).textContent)).toBe(`A payment due on 2026-11-03 has been part paid: ${R(18000)} has been paid and ${R(12000)} is still owed. The part that was paid is not counted until the whole payment is settled.`); expect(screen.queryByText(/collected for you by the platform/)).toBeNull();
  });
  it("shows the warning when it may be counted twice, and when it could not be matched to one vehicle, as it shows every other thing that needs attention", async () => {
    withPlatform({ countedCents: 30000, payments: [{ id: "i1", ref: "r", paidOn: "2026-11-03", amountCents: 30000 }], unmatched: [], partlyPaid: [] }, [{ id: "pay:twice:i1", severity: "medium", message: "CA 111-111: the platform collected R300.00 on 2026-11-03, and you also wrote down R300.00 on 2026-11-02. If it is the same payment, cancel yours so it is not counted twice", subject: "CA 111-111" }, { id: "pay:platform-unmatched:v1", severity: "medium", message: "CA 111-111: R150.00 collected by the platform could not be matched to one vehicle, so it is not counted here", subject: "CA 111-111" }]); await openV1(); expect(screen.getByText(/cancel yours so it is not counted twice/)).toBeInTheDocument(); expect(screen.getByText(/could not be matched to one vehicle, so it is not counted here/)).toBeInTheDocument();
  });
  it("shows nothing about the platform when it collected nothing, or when the server says nothing", async () => { await openV1(); expect(screen.queryByText(/collected for you by the platform/)).toBeNull(); cleanup(); withPlatform({ countedCents: 0, payments: [], unmatched: [], partlyPaid: [] }); await openV1(); expect(screen.queryByText(/collected for you by the platform/)).toBeNull(); expect(screen.queryByText(/part paid/)).toBeNull(); });
});

