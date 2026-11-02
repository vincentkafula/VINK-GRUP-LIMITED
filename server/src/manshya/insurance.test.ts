import { describe, it, expect } from "vitest";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
const { createManshya } = require("./core");

/** A customer with money in an account and one funeral policy (cover R10 000). */
function setup(cover = 1_000_000) {
  const mn = createManshya(); const m = mn.services.createMerchant("Cover Co"); const a = mn.services.createBankAccount(m.id, "Main", "current");
  mn.db.transaction(() => mn.ledger.post("deposit", [{ account: "sys:external_in", kind: "system", amount: -5_000_000 }, { account: `bank:${a.id}`, merchant: m.id, kind: "bank", amount: 5_000_000 }])).immediate();
  const pol = mn.insurance.buy(m, { product: "funeral", cover, accountId: a.id, beneficiary: "Spouse" });
  const claim = (amount: number) => mn.insurance.claim(m, { policyId: pol.id, cause: "accident", amount, description: "Accident" });
  const balance = () => mn.ledger.balance(`bank:${a.id}`);
  return { mn, m, a, pol, claim, balance };
}
const status = (mn: any, id: string) => mn.db.prepare("SELECT status FROM policies WHERE id=?").get(id).status;

describe("insurance cover", () => {
  it("takes the first premium when the policy is bought and keeps the books clean", () => {
    const { mn, a, pol, balance } = setup(); expect(balance()).toBe(5_000_000 - pol.premium); expect(mn.recon.run(new Date(), "t").ok).toBe(true); expect(a.id).toBeTruthy();
  });
  it("rejects a natural-causes claim during the waiting period, and pays a claim that the cover allows", () => {
    const { mn, m, pol, balance } = setup(); const before = balance();
    expect(mn.insurance.claim(m, { policyId: pol.id, cause: "natural", amount: 100_000, description: "x" })).toMatchObject({ status: "rejected" });
    const c = mn.insurance.claim(m, { policyId: pol.id, cause: "accident", amount: 300_000, description: "x" }); expect(mn.insurance.decide(c.id, { decision: "approve" })).toMatchObject({ status: "paid", paid: 300_000 });
    expect(balance()).toBe(before + 300_000); expect(status(mn, pol.id)).toBe("active");
  });
});

describe("a policy cannot pay out more than its cover", () => {
  it("does not let a claim be larger than the cover that is left, once something has been paid", () => {
    const { mn, m, pol, claim } = setup(); mn.insurance.decide(claim(700_000).id, { decision: "approve" });
    expect(() => claim(400_000)).toThrow(/between 100 and 300000/); expect(claim(300_000)).toMatchObject({ status: "submitted" });                          // exactly what is left is allowed
    expect(m.id).toBeTruthy(); expect(pol.id).toBeTruthy();
  });
  it("refuses to approve claims that together would pay more than the cover, even when each was legitimate when it was made, and says how much is left", () => {
    const { mn, claim, balance } = setup();
    const first = claim(700_000), second = claim(700_000);                                                          // both are within the cover when submitted
    mn.insurance.decide(first.id, { decision: "approve" }); const before = balance();
    expect(() => mn.insurance.decide(second.id, { decision: "approve" })).toThrow(/Only R 3000\.00 of cover is left/);
    expect(balance()).toBe(before); expect(mn.db.prepare("SELECT status FROM claims WHERE id=?").get(second.id).status).toBe("submitted");                        // nothing was paid and the claim is still open
    expect(mn.insurance.decide(second.id, { decision: "approve", amount: 300_000 })).toMatchObject({ paid: 300_000 });                                               // staff can pay what is left
  });
  it("closes the policy when all the cover has been paid, stops its premiums, and takes no further claims", () => {
    const { mn, m, pol, claim, a } = setup(); mn.insurance.decide(claim(1_000_000).id, { decision: "approve" });
    expect(status(mn, pol.id)).toBe("closed"); const before = mn.ledger.balance(`bank:${a.id}`); mn.insurance.runPremiums(new Date(Date.now() + 40 * 864e5)); expect(mn.ledger.balance(`bank:${a.id}`)).toBe(before);
    expect(() => mn.insurance.claim(m, { policyId: pol.id, cause: "accident", amount: 100, description: "x" })).toThrow(/not found/); expect(mn.recon.run(new Date(), "t").ok).toBe(true);
  });
  it("is noticed by reconciliation if claims paid ever exceed the cover by any other route", () => {
    const { mn, pol, claim } = setup(); mn.insurance.decide(claim(600_000).id, { decision: "approve" }); mn.db.prepare("UPDATE policies SET cover=500000 WHERE id=?").run(pol.id);
    const r = mn.recon.run(new Date(), "t"); expect(mn.recon.detail(r.id).items.map((i: any) => i.check)).toContain("claims_exceed_cover");
  });
});
