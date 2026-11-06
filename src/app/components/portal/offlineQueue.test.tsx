import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendOrQueue, flush, pending, rejected, clearRejected, newRef, useOutbox, type OutboxItem } from "./offlineQueue";
import type { Call } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOSIGNAL = { error: "We could not reach the server. Please try again." };
const callWith = (fn: (path: string, init: any) => any): Call => vi.fn(async (path: string, init: any) => fn(path, init)) as unknown as Call;
beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); });
afterEach(() => { vi.useRealTimers(); });

describe("sending a change, or keeping it on the phone", () => {
  it("sends it at once when the server answers, always with a reference the server can remember", async () => {
    const call = callWith(() => ({ data: { success: true, id: "x" } })); const r = await sendOrQueue(call, { method: "POST", path: "/incidents", body: { type: "fight" }, label: "Safety report" });
    expect(r).toEqual({ status: "sent", data: { success: true, id: "x" } }); const sent = (call as any).mock.calls[0]; expect(sent[0]).toBe("/incidents"); expect(sent[1].body.clientRef).toMatch(/^[A-Za-z0-9._-]{8,80}$/); expect(pending()).toEqual([]);
  });
  it("keeps the change when the server cannot be reached, with the same reference, and tells the caller it is queued", async () => {
    const call = callWith(() => NOSIGNAL); const r = await sendOrQueue(call, { method: "POST", path: "/grievances", body: { category: "pay", message: "x" }, label: "Complaint" });
    expect(r.status).toBe("queued"); const p = pending(); expect(p).toHaveLength(1); expect(p[0]).toMatchObject({ method: "POST", path: "/grievances", label: "Complaint", body: { category: "pay", message: "x", clientRef: (r as any).ref } });
  });
  it("shows a refusal to the marshal and does not queue it, because the server has already answered", async () => {
    const r = await sendOrQueue(callWith(() => ({ error: "You do not work at that rank" })), { method: "POST", path: "/incidents", body: {}, label: "x" }); expect(r).toEqual({ status: "error", error: "You do not work at that rank" }); expect(pending()).toEqual([]);
  });
  it("queues at once, without trying, when the phone knows it is offline, and keeps a reference the caller supplied", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true }); const call = callWith(() => ({ data: {} })); const r = await sendOrQueue(call, { method: "POST", path: "/shifts", body: { clientRef: "mine-0001-abcd" }, label: "Shift" });
    expect(r).toEqual({ status: "queued", ref: "mine-0001-abcd" }); expect(call).not.toHaveBeenCalled(); expect(pending()[0].ref).toBe("mine-0001-abcd");
  });
  it("makes references that are valid for the server and different each time", () => { const a = newRef("inc"), b = newRef("inc"); expect(a).toMatch(/^inc-[a-z0-9]+-[a-z0-9]{8}$/); expect(a).not.toBe(b); });
  it("survives damaged storage, ignoring what it cannot read", () => { localStorage.setItem("vink.marshal.outbox.v1", "{not json"); expect(pending()).toEqual([]); localStorage.setItem("vink.marshal.outbox.v1", JSON.stringify([{ nope: 1 }, { ref: "ok-12345678", path: "/x", method: "POST", body: {}, label: "l", at: "t" }])); expect(pending().map((i) => i.ref)).toEqual(["ok-12345678"]); });
});

describe("sending what is waiting", () => {
  const add = (ref: string, path = "/incidents") => localStorage.setItem("vink.marshal.outbox.v1", JSON.stringify([...pending(), { ref, method: "POST", path, body: { clientRef: ref, n: ref }, label: `Label ${ref}`, at: "2026-11-06T08:00:00Z" } satisfies OutboxItem]));
  it("sends oldest first with the stored reference and clears each one as it is accepted", async () => {
    add("ref-aaaa-0001"); add("ref-bbbb-0002", "/grievances"); const seen: string[] = []; const r = await flush(callWith((path, init) => { seen.push(`${path}|${init.body.clientRef}`); return { data: { success: true } }; }));
    expect(seen).toEqual(["/incidents|ref-aaaa-0001", "/grievances|ref-bbbb-0002"]); expect(r).toEqual({ sent: 2, remaining: 0, refused: 0 }); expect(pending()).toEqual([]);
  });
  it("stops at the first failure to reach the server and keeps everything not yet sent, in order", async () => {
    add("ref-aaaa-0001"); add("ref-bbbb-0002"); add("ref-cccc-0003"); let n = 0; const r = await flush(callWith(() => (++n === 2 ? NOSIGNAL : { data: {} })));
    expect(r).toEqual({ sent: 1, remaining: 2, refused: 0 }); expect(pending().map((i) => i.ref)).toEqual(["ref-bbbb-0002", "ref-cccc-0003"]);
  });
  it("does not retry a change the server refuses, and never loses it: it goes to a list the marshal can see, and sending carries on", async () => {
    add("ref-aaaa-0001"); add("ref-bbbb-0002"); const r = await flush(callWith((_p, init) => (init.body.clientRef === "ref-aaaa-0001" ? { error: "That overlaps a shift you already have" } : { data: {} })));
    expect(r).toEqual({ sent: 1, remaining: 0, refused: 1 }); expect(rejected()).toEqual([{ label: "Label ref-aaaa-0001", error: "That overlaps a shift you already have", at: expect.any(String) }]); clearRejected(); expect(rejected()).toEqual([]);
  });
  it("is safe to call twice at once: each change is sent only once", async () => {
    add("ref-aaaa-0001"); let calls = 0; const call = callWith(async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return { data: {} }; });
    const [a, b] = await Promise.all([flush(call), flush(call)]); expect(calls).toBe(1); expect(a.sent + b.sent).toBe(1);
  });
});

describe("the waiting list on screen", () => {
  it("reports what is waiting and sends it when the phone comes back online", async () => {
    localStorage.setItem("vink.marshal.outbox.v1", JSON.stringify([{ ref: "ref-aaaa-0001", method: "POST", path: "/incidents", body: { clientRef: "ref-aaaa-0001" }, label: "Safety report", at: "t" }]));
    let online = false; const call = callWith(() => (online ? { data: {} } : NOSIGNAL)); const { result } = renderHook(() => useOutbox(call));
    await waitFor(() => expect(result.current.waiting).toHaveLength(1)); online = true; await act(async () => { window.dispatchEvent(new Event("online")); await new Promise((r) => setTimeout(r, 10)); });
    await waitFor(() => expect(result.current.waiting).toEqual([])); expect(pending()).toEqual([]);
  });
  it("updates when a change is queued elsewhere on the page", async () => {
    const call = callWith(() => NOSIGNAL); const { result } = renderHook(() => useOutbox(call)); expect(result.current.waiting).toEqual([]);
    await act(async () => { await sendOrQueue(call, { method: "POST", path: "/incidents", body: {}, label: "Safety report" }); }); await waitFor(() => expect(result.current.waiting).toHaveLength(1));
  });
});
