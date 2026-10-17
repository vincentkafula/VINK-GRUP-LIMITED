import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail } from "../auth/email.js";
import { createSponsorshipService, type SponsorshipService } from "../services/sponsorshipService.js";
import { createSponsorshipReview, type SponsorshipReview } from "../services/sponsorshipReview.js";
import { REVIEW_CRITERIA, DEFAULT_WEIGHTS, weightedScore } from "../config/sponsorship.js";
import { good, ngoDocs } from "./sponsorshipFixtures.js";

const SECTION = "Sponsorships and Partnerships";
let db: Db, svc: SponsorshipService, review: SponsorshipReview, clock = new Date("2026-10-09T10:00:00Z");
const U1 = "00000000-0000-4000-8000-000000000001", U2 = "00000000-0000-4000-8000-000000000002", U3 = "00000000-0000-4000-8000-000000000003", U4 = "00000000-0000-4000-8000-000000000004";
const all = (n: number) => Object.fromEntries(REVIEW_CRITERIA.map((c) => [c.id, n]));
const apply = async (patch: Record<string, unknown> = {}) => ((await svc.submit({ ...good, ...patch }, ngoDocs())) as { ref: string }).ref;
const idOf = async (ref: string) => String((await db.query(`SELECT id FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0].id);

beforeEach(async () => {
  db = allPortalsDb(); clock = new Date("2026-10-09T10:00:00Z");
  svc = createSponsorshipService({ db, mail: new ConsoleEmail(), env: {} as NodeJS.ProcessEnv, now: () => clock });
  review = createSponsorshipReview({ db, now: () => clock, sectionName: SECTION });
  await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,'amy','Amy Super','amy@vink.co.za','superadmin'), ($2,'ben','Ben Reviewer','ben@vink.co.za','customer'), ($3,'cara','Cara Reviewer','cara@vink.co.za','customer'), ($4,'dan','Dan Other','dan@vink.co.za','customer')`, [U1, U2, U3, U4]);
  await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,$3), ($2,$3), ($4,'Finance')`, [U2, U3, SECTION, U4]);   // Ben and Cara work on sponsorships; Dan is in Finance
});

describe("the weighted score", () => {
  it("is the share of the best possible mark, using the weights, and is empty until every criterion has a score", () => {
    expect(weightedScore(all(5), DEFAULT_WEIGHTS)).toBe(100); expect(weightedScore(all(0), DEFAULT_WEIGHTS)).toBe(0); expect(weightedScore(all(3), DEFAULT_WEIGHTS)).toBe(60);
    const half = { ...all(0), strategic: 5, impact: 5, feasibility: 5 };
    expect(weightedScore(half, DEFAULT_WEIGHTS)).toBe(50);
    expect(weightedScore(half, { ...DEFAULT_WEIGHTS, strategic: 4 })).toBe(Math.round((6 * 5 / (9 * 5)) * 1000) / 10);        // strategic counts four times as much: 6 of 9 weighted points
    expect(weightedScore({ strategic: 5 }, DEFAULT_WEIGHTS)).toBeNull(); expect(weightedScore(all(5), { strategic: 0, impact: 0, feasibility: 0, budget: 0, reach: 0, measurable: 0 })).toBeNull();
  });
});

describe("weights and the approval limit", () => {
  it("count every criterion equally and set no limit until a Super Administrator says otherwise", async () => {
    expect(await review.settings()).toEqual({ weights: DEFAULT_WEIGHTS, approvalLimitZar: null });
  });
  it("can be changed, and the change is kept", async () => {
    const r = await review.setSettings(U1, { weights: { ...DEFAULT_WEIGHTS, strategic: 3, impact: 4 }, approvalLimitZar: 100000 });
    expect(r).toMatchObject({ ok: true, settings: { weights: { strategic: 3, impact: 4, feasibility: 1 }, approvalLimitZar: 100000 } });
    expect(await review.settings()).toMatchObject({ weights: { strategic: 3, impact: 4 }, approvalLimitZar: 100000 });
    await review.setSettings(U1, { approvalLimitZar: null });
    expect((await review.settings()).approvalLimitZar).toBeNull(); expect((await review.settings()).weights.impact).toBe(4);   // clearing the limit leaves the weights alone
  });
  it("refuse nonsense", async () => {
    expect(await review.setSettings(U1, { weights: { ...DEFAULT_WEIGHTS, impact: -1 } })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("Community impact") });
    expect(await review.setSettings(U1, { weights: { ...DEFAULT_WEIGHTS, impact: 11 } })).toMatchObject({ ok: false });
    expect(await review.setSettings(U1, { weights: { strategic: 1 } })).toMatchObject({ ok: false });
    expect(await review.setSettings(U1, { weights: Object.fromEntries(REVIEW_CRITERIA.map((c) => [c.id, 0])) })).toMatchObject({ ok: false, error: expect.stringContaining("At least one") });
    expect(await review.setSettings(U1, { approvalLimitZar: -5 })).toMatchObject({ ok: false }); expect(await review.setSettings(U1, { approvalLimitZar: "lots" })).toMatchObject({ ok: false });
    expect(await review.settings()).toEqual({ weights: DEFAULT_WEIGHTS, approvalLimitZar: null });
  });
  it("stop anyone but a Super Administrator approving above the limit, and treat an amount that could not be converted as above it", async () => {
    const ref = await apply();                                                                                                                  // R50,000
    expect(await review.mayApprove(ref, false)).toEqual({ ok: true });                                                                           // no limit yet
    await review.setSettings(U1, { approvalLimitZar: 40000 });
    expect(await review.mayApprove(ref, false)).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("R40") });
    expect(await review.mayApprove(ref, true)).toEqual({ ok: true });
    await review.setSettings(U1, { approvalLimitZar: 50000 }); expect(await review.mayApprove(ref, false)).toEqual({ ok: true });                // exactly at the limit is allowed
    const gbp = await apply({ projectTitle: "Pound request", currency: "GBP" });                                                                  // no stored rate: amount_zar is empty
    expect(await review.mayApprove(gbp, false)).toMatchObject({ ok: false, error: expect.stringContaining("could not be converted") });
    expect(await review.mayApprove("SP-AAAAAA", false)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("scoring an application", () => {
  it("takes a whole mark from 0 to 5 on every criterion, and says which one is wrong", async () => {
    const ref = await apply();
    for (const bad of [{ ...all(3), impact: 6 }, { ...all(3), impact: -1 }, { ...all(3), impact: 2.5 }, { ...all(3), impact: "high" }]) expect(await review.saveScore(ref, { id: U2, name: "Ben" }, { scores: bad })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("Community impact") });
    const { impact, ...missing } = all(3) as Record<string, number>; void impact;
    expect(await review.saveScore(ref, { id: U2, name: "Ben" }, { scores: missing })).toMatchObject({ ok: false });
    expect(await review.saveScore("SP-AAAAAA", { id: U2, name: "Ben" }, { scores: all(3) })).toMatchObject({ ok: false, status: 404 });
    expect((await review.scoresFor(await idOf(ref))).reviewers).toHaveLength(0);
  });
  it("keeps one set of scores per reviewer, replaced when they score again, and averages the reviewers", async () => {
    const ref = await apply(); const id = await idOf(ref);
    expect(await review.saveScore(ref, { id: U2, name: "Ben Reviewer" }, { scores: all(3), comment: "Solid" })).toEqual({ ok: true, total: 60 });
    expect(await review.saveScore(ref, { id: U3, name: "Cara Reviewer" }, { scores: all(5) })).toEqual({ ok: true, total: 100 });
    let s = await review.scoresFor(id); expect(s.reviewers.map((r) => [r.reviewerName, r.total])).toEqual([["Ben Reviewer", 60], ["Cara Reviewer", 100]]); expect(s.average).toBe(80);
    clock = new Date(clock.getTime() + 60_000);
    await review.saveScore(ref, { id: U2, name: "Ben Reviewer" }, { scores: all(4), comment: "On reflection, better" });
    s = await review.scoresFor(id); expect(s.reviewers).toHaveLength(2); expect(s.reviewers.find((r) => r.reviewerId === U2)).toMatchObject({ total: 80, comment: "On reflection, better" }); expect(s.average).toBe(90);
  });
  it("is worked out with the weights as they are now, so changing the weights changes every total", async () => {
    const ref = await apply(); const id = await idOf(ref);
    await review.saveScore(ref, { id: U2, name: "Ben" }, { scores: { ...all(0), strategic: 5 } });
    expect((await review.scoresFor(id)).average).toBe(16.7);                                    // one criterion of six
    await review.setSettings(U1, { weights: { ...DEFAULT_WEIGHTS, strategic: 5 } });
    expect((await review.scoresFor(id)).average).toBe(50);                                      // that criterion now counts for five of ten
  });
  it("never moves an application: a perfect score does not approve it", async () => {
    const ref = await apply(); await review.saveScore(ref, { id: U2, name: "Ben" }, { scores: all(5) });
    expect((await svc.get(ref))!.status).toBe("submitted"); expect((await svc.get(ref))!.history).toHaveLength(1);
  });
});

describe("who an application is handed to", () => {
  it("is a Super Administrator or someone approved for the sponsorship section, and nobody else", async () => {
    expect((await review.staff()).map((p) => p.name)).toEqual(["Amy Super", "Ben Reviewer", "Cara Reviewer"]);          // Dan is in Finance, not here
  });
  it("can be assigned, reassigned and cleared, and the list can be filtered by it", async () => {
    const a = await apply(), b = await apply({ projectTitle: "Netball League" }), c = await apply({ projectTitle: "Choir" });
    expect(await review.assign(a, U2)).toEqual({ ok: true, assignedTo: U2, assignedName: "Ben Reviewer" });
    await review.assign(b, U3);
    expect((await svc.list({ assigned: U2 })).applications.map((x) => x.ref)).toEqual([a]);
    expect((await svc.list({ assigned: "none" })).applications.map((x) => x.ref)).toEqual([c]);
    expect((await svc.list()).applications.find((x) => x.ref === a)).toMatchObject({ assignedTo: U2, assignedName: "Ben Reviewer" });
    await review.assign(a, U3); expect((await review.assignmentOf(await idOf(a)))).toEqual({ assignedTo: U3, assignedName: "Cara Reviewer" });
    expect(await review.assign(a, null)).toEqual({ ok: true, assignedTo: null, assignedName: null }); expect((await svc.list({ assigned: "none" })).total).toBe(2);
  });
  it("refuses someone who does not work on sponsorships, and an application that does not exist", async () => {
    const a = await apply();
    expect(await review.assign(a, U4)).toMatchObject({ ok: false, status: 400 }); expect(await review.assign(a, "nobody")).toMatchObject({ ok: false });
    expect(await review.assign("SP-AAAAAA", U2)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("reports", () => {
  it("count applications by status, category and place, add up the rand, and say how many amounts could not be converted", async () => {
    await apply(); await apply({ projectTitle: "Netball League", category: "sports", province: "Gauteng" });
    const usd = await apply({ projectTitle: "Dollar request", currency: "USD", totalBudget: 4000, amountRequested: 2000, ownContribution: 1000, otherSponsorsAmount: 1000, expenditure: [{ description: "All", amount: 4000 }] });
    await db.query(`INSERT INTO fx_rates (pair, rate) VALUES ('ZAR-USD', 0.05)`);                                                                   // too late for the one above: it has no rand figure
    await apply({ projectTitle: "Pound request", currency: "GBP" });
    void usd;
    const s = await review.summary({});
    expect(s.total).toBe(4); expect(s.byStatus.find((x) => x.id === "submitted")!.count).toBe(4);
    expect(s.byCategory.map((c) => [c.label, c.count])).toEqual([["Youth empowerment and entrepreneurship", 3], ["Sports sponsorship", 1]]);
    expect(s.byLocation.map((c) => [c.label, c.count])).toEqual([["Western Cape", 3], ["Gauteng", 1]]);
    expect(s.totals.requestedZar).toBe(100000); expect(s.totals.notConverted).toBe(2); expect(s.byMonth).toEqual([expect.objectContaining({ id: "2026-10", count: 4 })]);
  });
  it("can be limited to a range of days", async () => {
    await apply(); clock = new Date("2026-11-20T10:00:00Z"); await apply({ projectTitle: "A later one", startDate: "2026-12-01", endDate: "2026-12-20" });   // a project cannot start before the day it is sent
    expect((await review.summary({ from: "2026-11-01" })).total).toBe(1); expect((await review.summary({ to: "2026-10-31" })).total).toBe(1);
    expect((await review.summary({ from: "2026-10-01", to: "2026-11-20" })).total).toBe(2); expect((await review.summary({ from: "not a date" })).total).toBe(2);
  });
  it("export every application as spreadsheet rows with matching columns", async () => {
    const ref = await apply(); await review.saveScore(ref, { id: U2, name: "Ben" }, { scores: all(4) });
    const x = await review.exportRows({});
    expect(x.columns).toHaveLength(19); for (const r of x.rows) expect(r).toHaveLength(x.columns.length);
    expect(x.rows[0].slice(0, 4)).toEqual([ref, "2026-10-09", "Submitted", "Khayelitsha Youth Hub"]); expect(x.rows[0][12]).toBe(50000); expect(x.rows[0][18]).toBe(80);
  });
});
