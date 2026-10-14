import { describe, expect, it } from "vitest";
import { runProtocolSelfTest, SimulatedDesfireCard } from "../src";

describe("protocol self-test", () => {
  it("passes every step against the card simulator and leaves the card clean", async () => {
    const card = new SimulatedDesfireCard({ uid: Buffer.from("04112233445566", "hex") });
    const results = await runProtocolSelfTest(card);
    const failed = results.filter((r) => !r.ok);
    expect(failed).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(13);
    expect(card.appIds()).toEqual([]);                    // the throw-away application was removed
  });
  it("stops with a clear failure when the card master key is wrong", async () => {
    const card = new SimulatedDesfireCard({ uid: Buffer.from("04112233445566", "hex"), piccKey: Buffer.alloc(16, 5) });
    const results = await runProtocolSelfTest(card);
    expect(results[0]).toMatchObject({ ok: false });
    expect(results).toHaveLength(1);
  });
});
