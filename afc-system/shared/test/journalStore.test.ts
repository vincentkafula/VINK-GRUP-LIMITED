import { describe, expect, it } from "vitest";
import { JournalStore, MemoryJournalIo } from "../src";
import type { SyncTransaction } from "../src";

const tx = (n: number): SyncTransaction => ({ id: `t${n}`, deviceSeq: n, kind: "tap", result: "ok", fare: 0 } as unknown as SyncTransaction);

describe("JournalStore", () => {
  it("survives a restart: everything made durable comes back", async () => {
    const io = new MemoryJournalIo();
    const a = await JournalStore.open(io);
    a.enqueue(tx(1)); a.enqueue(tx(2)); a.setHotlist(5, ["aa", "bb"]); a.setProfiles(3, [{ uid: "cc", category: "senior" }]);
    a.putIntent({ uid: "dd", txnId: "x", expectedCounter: 1, balanceBefore: 100, fare: 10, txn: tx(3), createdAt: 1 });
    await a.durable();
    const b = await JournalStore.open(io);
    expect(b.pending().map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(b.isHotlisted("aa")).toBe(true); expect(b.hotlistVersion).toBe(5);
    expect(b.categoryOf("cc")).toBe("senior"); expect(b.getIntent("dd")?.fare).toBe(10);
  });
  it("loses only what was not made durable", async () => {
    const io = new MemoryJournalIo();
    const a = await JournalStore.open(io);
    a.enqueue(tx(1)); await a.durable(); a.enqueue(tx(2));
    expect((await JournalStore.open(io)).pending().map((t) => t.id)).toEqual(["t1"]);
  });
  it("ignores a half-written last line", async () => {
    const io = new MemoryJournalIo();
    const a = await JournalStore.open(io); a.enqueue(tx(1)); await a.durable();
    io.lines.push('["enq",{"seq":2,"payl');
    expect((await JournalStore.open(io)).pending()).toHaveLength(1);
  });
  it("keeps changes after a failed write and writes them next time", async () => {
    const io = new MemoryJournalIo(); io.appendFailures = 1;
    const a = await JournalStore.open(io); a.enqueue(tx(1));
    await expect(a.durable()).rejects.toThrow();
    await a.durable();
    expect((await JournalStore.open(io)).pending()).toHaveLength(1);
  });
  it("marks sent/rejected, deletes intents and compacts without losing state", async () => {
    const io = new MemoryJournalIo();
    const a = await JournalStore.open(io);
    for (let i = 1; i <= 2000; i++) a.enqueue(tx(i));
    a.markSent(["t1"]); a.markRejected("t2", "bad"); a.setHotlist(1, ["zz"]);
    await a.durable();
    expect(io.lines).toHaveLength(1);                             // compacted to a snapshot
    const b = await JournalStore.open(io);
    expect(b.pendingCount()).toBe(1998); expect(b.rejected()).toEqual([{ id: "t2", note: "bad" }]); expect(b.isHotlisted("zz")).toBe(true);
    expect(b.nextSeq()).toBe(1);
  });
});
