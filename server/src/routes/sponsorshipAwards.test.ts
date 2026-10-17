import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail, type EmailMessage, type EmailSender } from "../auth/email.js";
import { createSponsorshipService, type SponsorshipService } from "../services/sponsorshipService.js";
import { createSponsorshipAwards, type SponsorshipAwards } from "../services/sponsorshipAwards.js";
import { good, ngoDocs } from "./sponsorshipFixtures.js";

let db: Db, mail: ConsoleEmail, svc: SponsorshipService, awards: SponsorshipAwards, clock = new Date("2026-10-09T10:00:00Z");
const BY = "00000000-0000-4000-8000-000000000001";
const later = (s = 5) => { clock = new Date(clock.getTime() + s * 1000); };
const text = (b: Buffer) => [...b.toString("latin1").matchAll(/\[(.*?)\]\s*TJ/g)].map((m) => [...m[1].matchAll(/<([0-9a-fA-F]+)>/g)].map((h) => Buffer.from(h[1], "hex").toString("latin1")).join("")).join("\n").replace(/\s+/g, " ");   // a long line is wrapped by the PDF: read it as running text
const build = (m: EmailSender = mail) => { svc = createSponsorshipService({ db, mail: m, env: {} as NodeJS.ProcessEnv, now: () => clock }); awards = createSponsorshipAwards({ db, mail: m, now: () => clock, pdfCompress: false, setStatus: (ref, i) => svc.setStatus(ref, i) }); };
const apply = async (patch: Record<string, unknown> = {}) => ((await svc.submit({ ...good, ...patch }, ngoDocs())) as { ref: string }).ref;
const approved = async (patch: Record<string, unknown> = {}) => { const ref = await apply(patch); later(); await svc.setStatus(ref, { status: "under_review", reason: "Taken on", by: BY }); later(); await svc.setStatus(ref, { status: "approved", reason: "Committee approved", by: BY }); later(); return ref; };
const idOf = async (ref: string) => String((await db.query(`SELECT id FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0].id);
const NO_LIMIT = { limitZar: null };
const signed = async (ref: string, amount = 45000) => { await awards.award(ref, { amount }, BY, NO_LIMIT); await awards.agreement(ref, "send", {}, BY); later(); await awards.agreement(ref, "signed", {}, BY); later(); };

beforeEach(() => { db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date("2026-10-09T10:00:00Z"); build(); });

describe("awarding an amount", () => {
  it("is only possible once the application is approved", async () => {
    const ref = await apply();
    expect(await awards.award(ref, { amount: 40000 }, BY, NO_LIMIT)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Approve the application") });
    later(); await svc.setStatus(ref, { status: "under_review", reason: "Taken on", by: BY });
    expect(await awards.award(ref, { amount: 40000 }, BY, NO_LIMIT)).toMatchObject({ ok: false, status: 409 });
    expect(await awards.award("SP-AAAAAA", { amount: 40000 }, BY, NO_LIMIT)).toMatchObject({ ok: false, status: 404 });
  });
  it("records the amount, in rand too, and starts with the agreement pending", async () => {
    const ref = await approved();
    const r = await awards.award(ref, { amount: "45 000", conditions: "Funds are used for facilitators and venue hire only." }, BY, NO_LIMIT);
    expect(r).toMatchObject({ ok: true, award: { amount: 45000, currency: "ZAR", amountZar: 45000, stage: "agreement_pending", stageLabel: "Agreement pending", conditions: "Funds are used for facilitators and venue hire only.", agreementSentAt: null, disbursed: 0, remaining: 45000, milestones: [], payments: [] } });
  });
  it("is never more than was asked for, and must be a real amount", async () => {
    const ref = await approved();
    expect(await awards.award(ref, { amount: 50001 }, BY, NO_LIMIT)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("more than the ZAR 50") });
    for (const bad of [0, -5, "lots", undefined, ""]) expect(await awards.award(ref, { amount: bad }, BY, NO_LIMIT), String(bad)).toMatchObject({ ok: false, status: 400 });
    expect((await awards.award(ref, { amount: 50000 }, BY, NO_LIMIT)).ok).toBe(true);                                                         // the whole amount asked for is fine
  });
  it("is converted to rand at the stored rate for another currency", async () => {
    await db.query(`INSERT INTO fx_rates (pair, rate) VALUES ('ZAR-USD', 0.05)`);
    const ref = await approved({ projectTitle: "Dollar request", currency: "USD", totalBudget: 4000, amountRequested: 2000, ownContribution: 1000, otherSponsorsAmount: 1000, expenditure: [{ description: "All", amount: 4000 }] });
    expect(await awards.award(ref, { amount: 1500 }, BY, NO_LIMIT)).toMatchObject({ ok: true, award: { amount: 1500, currency: "USD", amountZar: 30000 } });
  });
  it("above the approval limit needs a Super Administrator", async () => {
    const ref = await approved();
    expect(await awards.award(ref, { amount: 45000 }, BY, { limitZar: 40000 })).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("Super Administrator") });
    expect((await awards.award(ref, { amount: 40000 }, BY, { limitZar: 40000 })).ok).toBe(true);
    const gbp = await approved({ projectTitle: "Pound request", currency: "GBP" });
    expect(await awards.award(gbp, { amount: 10000 }, BY, { limitZar: 40000 })).toMatchObject({ ok: false, error: expect.stringContaining("could not be converted") });
  });
  it("can be changed until the agreement is sent, and not after", async () => {
    const ref = await approved();
    await awards.award(ref, { amount: 40000 }, BY, NO_LIMIT); expect((await awards.award(ref, { amount: 42000, conditions: "New terms" }, BY, NO_LIMIT))).toMatchObject({ ok: true, award: { amount: 42000, conditions: "New terms" } });
    await awards.agreement(ref, "send", {}, BY);
    expect(await awards.award(ref, { amount: 30000 }, BY, NO_LIMIT)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already been sent") });
  });
});

describe("the award letter and the agreement", () => {
  it("are PDFs that name the project, the amount and the milestones, and the agreement says it is a template", async () => {
    const ref = await approved(); await awards.award(ref, { amount: 45000, conditions: "Facilitators and venue only" }, BY, NO_LIMIT); await awards.addMilestone(ref, { title: "Pitch day", dueDate: "2026-12-15" });
    const l = await awards.document(ref, "letter"), a = await awards.document(ref, "agreement");
    expect(l.ok && a.ok).toBe(true); if (!l.ok || !a.ok) return;
    expect(l.filename).toBe(`Award letter ${ref}.pdf`); expect(a.filename).toBe(`Sponsorship agreement ${ref}.pdf`);
    for (const d of [l, a]) { expect(d.data.subarray(0, 5).toString()).toBe("%PDF-"); const t = text(d.data); expect(t).toContain(ref); expect(t).toContain("Township Entrepreneurs Bootcamp"); expect(t).toContain("Pitch day"); expect(t).toContain("Khayelitsha Youth Hub"); expect(t).toMatch(/ZAR 45.?000/); expect(t).toContain("Facilitators and venue only"); }
    expect(text(a.data)).toMatch(/DRAFT TEMPLATE/); expect(text(a.data)).toContain("Brand logo placement"); expect(text(a.data)).toContain("To be added by VINK's legal advisers");
    expect(text(l.data)).not.toMatch(/DRAFT TEMPLATE/);
  });
  it("cannot be made before an award, or for something that does not exist", async () => {
    const ref = await approved();
    expect(await awards.document(ref, "letter")).toMatchObject({ ok: false, status: 404 }); expect(await awards.document("SP-AAAAAA", "agreement")).toMatchObject({ ok: false, status: 404 });
  });
});

describe("sending the agreement", () => {
  it("emails both PDFs to the applicant, marks it sent, and moves the application to agreement pending with a history entry", async () => {
    const ref = await approved(); await awards.award(ref, { amount: 45000 }, BY, NO_LIMIT); mail.sent.length = 0;
    const r = await awards.agreement(ref, "send", { note: "Sent by Amy" }, BY);
    expect(r).toMatchObject({ ok: true, award: { stage: "agreement_pending", agreementNote: "Sent by Amy" } }); expect((r as { award: { agreementSentAt: string | null } }).award.agreementSentAt).toBeTruthy();
    const m = mail.sent.find((x) => x.subject.includes("award and agreement"))!;
    expect(m).toMatchObject({ to: "thandi@example.com", replyTo: "sponsorships@vink.co.za" }); expect(m.attachments!.map((a) => a.filename).sort()).toEqual([`Award letter ${ref}.pdf`, `Sponsorship agreement ${ref}.pdf`]);
    expect(m.text).toContain("sign it and return it"); expect(m.text).toMatch(/never send us a password/);
    const a = (await svc.get(ref))!; expect(a.status).toBe("agreement_pending"); expect(a.history.at(-1)).toMatchObject({ fromStatus: "approved", toStatus: "agreement_pending", reason: "Award letter and agreement sent", changedBy: BY });
  });
  it("changes nothing when the email cannot be sent, so staff can simply try again", async () => {
    const down: EmailSender = { name: "down", async send() { throw new Error("mail is down"); } }; build(down);
    const ref = await approved(); await awards.award(ref, { amount: 45000 }, BY, NO_LIMIT);
    expect(await awards.agreement(ref, "send", {}, BY)).toMatchObject({ ok: false, status: 502, error: expect.stringContaining("Nothing was changed") });
    expect((await svc.get(ref))!.status).toBe("approved"); expect((await awards.forApplication(await idOf(ref)))!.agreementSentAt).toBeNull();
    const sent: EmailMessage[] = []; build({ name: "up", async send(m) { sent.push(m); } });
    expect((await awards.agreement(ref, "send", {}, BY)).ok).toBe(true); expect(sent.filter((m) => m.attachments?.length)).toHaveLength(1);
  });
  it("can be sent again while it is unsigned, without moving the application a second time", async () => {
    const ref = await approved(); await awards.award(ref, { amount: 45000 }, BY, NO_LIMIT); await awards.agreement(ref, "send", {}, BY); later();
    expect((await awards.agreement(ref, "send", {}, BY)).ok).toBe(true);
    expect((await svc.get(ref))!.history.filter((h) => h.toStatus === "agreement_pending")).toHaveLength(1);
  });
  it("needs an award first, and an application that is approved", async () => {
    const ref = await approved(); expect(await awards.agreement(ref, "send", {}, BY)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Make an award") });
    expect(await awards.agreement("SP-AAAAAA", "send", {}, BY)).toMatchObject({ ok: false, status: 404 }); expect(await awards.agreement(ref, "nonsense", {}, BY)).toMatchObject({ ok: false });
  });
});

describe("marking the agreement signed", () => {
  it("is a record that staff were told it was signed (not an electronic signature), and starts the award", async () => {
    const ref = await approved(); await awards.award(ref, { amount: 45000 }, BY, NO_LIMIT);
    expect(await awards.agreement(ref, "signed", {}, BY)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Send the agreement") });
    await awards.agreement(ref, "send", {}, BY); later();
    const r = await awards.agreement(ref, "signed", { signedOn: "2026-10-08", note: "Signed copy received by email" }, BY);
    expect(r).toMatchObject({ ok: true, award: { stage: "active", stageLabel: "Agreement signed", signedOn: "2026-10-08", agreementNote: "Signed copy received by email" } });
    expect(await awards.agreement(ref, "signed", {}, BY)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already been signed") });
  });
  it("uses today when no date is given, and refuses a date that is not real or is in the future", async () => {
    const ref = await approved(); await awards.award(ref, { amount: 45000 }, BY, NO_LIMIT); await awards.agreement(ref, "send", {}, BY);
    expect(await awards.agreement(ref, "signed", { signedOn: "2026-10-12" }, BY)).toMatchObject({ ok: false, error: expect.stringContaining("future") });
    expect(await awards.agreement(ref, "signed", { signedOn: "2026-02-31" }, BY)).toMatchObject({ ok: false });
    expect(await awards.agreement(ref, "signed", {}, BY)).toMatchObject({ ok: true, award: { signedOn: "2026-10-09" } });
  });
});

describe("milestones", () => {
  it("are added, changed, ticked off and removed, and kept in date order", async () => {
    const ref = await approved(); await awards.award(ref, { amount: 45000 }, BY, NO_LIMIT);
    await awards.addMilestone(ref, { title: "Pitch day", dueDate: "2026-12-15" }); await awards.addMilestone(ref, { title: "Programme starts", dueDate: "2026-11-01" }); const r = await awards.addMilestone(ref, { title: "Final report" });
    const ms = (r as { award: { milestones: { id: string; title: string; dueDate: string | null; status: string }[] } }).award.milestones;
    expect(ms.map((m) => m.title)).toEqual(["Programme starts", "Pitch day", "Final report"]);                                         // by date; no date last
    const done = await awards.updateMilestone(ref, ms[0].id, { status: "done", note: "Started on time" });
    expect(done).toMatchObject({ ok: true, award: { milestones: [expect.objectContaining({ status: "done", note: "Started on time", doneAt: expect.any(String) }), expect.anything(), expect.anything()] } });
    const undone = await awards.updateMilestone(ref, ms[0].id, { status: "pending" }); expect((undone as { award: { milestones: { doneAt: string | null }[] } }).award.milestones[0].doneAt).toBeNull();
    await awards.updateMilestone(ref, ms[2].id, { title: "Final report due", dueDate: "2027-01-31" });
    expect((await awards.deleteMilestone(ref, ms[1].id) as { award: { milestones: unknown[] } }).award.milestones).toHaveLength(2);
  });
  it("refuse a missing name, a date that is not real, an unknown milestone, or an award that does not exist", async () => {
    const ref = await approved(); expect(await awards.addMilestone(ref, { title: "Early" })).toMatchObject({ ok: false, status: 409 });
    await awards.award(ref, { amount: 45000 }, BY, NO_LIMIT);
    expect(await awards.addMilestone(ref, { title: "x" })).toMatchObject({ ok: false, status: 400 }); expect(await awards.addMilestone(ref, { title: "Pitch", dueDate: "tomorrow" })).toMatchObject({ ok: false });
    expect(await awards.updateMilestone(ref, "00000000-0000-4000-8000-0000000000aa", { status: "done" })).toMatchObject({ ok: false, status: 404 }); expect(await awards.deleteMilestone(ref, "00000000-0000-4000-8000-0000000000aa")).toMatchObject({ ok: false, status: 404 });
  });
});

describe("payments", () => {
  it("cannot be recorded until the agreement is signed", async () => {
    const ref = await approved(); await awards.award(ref, { amount: 45000 }, BY, NO_LIMIT); await awards.agreement(ref, "send", {}, BY);
    expect(await awards.addPayment(ref, { kind: "cash", amount: 1000 }, BY)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("after the agreement is signed") });
  });
  it("are recorded with who recorded them, add up, and show what is left", async () => {
    const ref = await approved(); await signed(ref);
    await awards.addPayment(ref, { kind: "cash", amount: 20000, paidOn: "2026-10-08", reference: "EFT 8841", note: "First half" }, BY);
    const r = await awards.addPayment(ref, { kind: "in_kind", amount: "5 000", note: "Printed banners" }, BY);
    expect(r).toMatchObject({ ok: true, award: { disbursed: 25000, remaining: 20000, payments: [expect.objectContaining({ kind: "cash", amount: 20000, paidOn: "2026-10-08", reference: "EFT 8841", recordedBy: BY }), expect.objectContaining({ kind: "in_kind", kindLabel: "Products, equipment or services", paidOn: "2026-10-09" })] } });
  });
  it("can never be more than the award in all", async () => {
    const ref = await approved(); await signed(ref);
    await awards.addPayment(ref, { kind: "cash", amount: 44000 }, BY);
    expect(await awards.addPayment(ref, { kind: "cash", amount: 1500 }, BY)).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(/more than is left of the award: ZAR 1[\s\u00a0,]?000/) });
    expect((await awards.addPayment(ref, { kind: "cash", amount: 1000 }, BY)).ok).toBe(true);                                                  // the last rand is fine
    expect((await awards.forApplication(await idOf(ref)))!.remaining).toBe(0);
  });
  it("must be a real kind, amount and date, not in the future", async () => {
    const ref = await approved(); await signed(ref);
    for (const bad of [{ kind: "barter", amount: 10 }, { kind: "cash", amount: 0 }, { kind: "cash", amount: "lots" }, { kind: "cash", amount: 10, paidOn: "soon" }, { kind: "cash", amount: 10, paidOn: "2026-10-30" }]) expect(await awards.addPayment(ref, bad, BY), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    expect(await awards.addPayment("SP-AAAAAA", { kind: "cash", amount: 10 }, BY)).toMatchObject({ ok: false, status: 404 });
  });
  it("cannot be changed or deleted once recorded (there is no route for it), and the database refuses a zero payment", async () => {
    const ref = await approved(); await signed(ref); await awards.addPayment(ref, { kind: "cash", amount: 100 }, BY);
    expect(Object.keys(awards).filter((k) => /payment/i.test(k))).toEqual(["addPayment"]);
  });
});

describe("what the applicant sees of an award", () => {
  it("is nothing until the agreement is sent, then the award, its milestones and what has been paid, and never the staff's own notes", async () => {
    const ref = await approved(); const id = await idOf(ref);
    expect(await awards.applicantView(id)).toBeNull();
    await awards.award(ref, { amount: 45000, conditions: "Facilitators only" }, BY, NO_LIMIT); await awards.addMilestone(ref, { title: "Pitch day", dueDate: "2026-12-15" });
    expect(await awards.applicantView(id)).toBeNull();                                                                                          // made, but not yet sent: staff may still change it
    await awards.agreement(ref, "send", { note: "INTERNAL: chase the signature" }, BY);
    expect(await awards.applicantView(id)).toEqual({ amount: 45000, currency: "ZAR", conditions: "Facilitators only", stage: "agreement_pending", stageLabel: "Agreement pending", signedOn: null, milestones: [{ title: "Pitch day", dueDate: "2026-12-15", status: "pending" }], paid: 0, remaining: 45000 });
    expect(JSON.stringify(await awards.applicantView(id))).not.toMatch(/INTERNAL/);
  });
});

describe("the budget", () => {
  it("adds up requested, approved, committed and paid in rand, and counts what could not be converted", async () => {
    const a = await approved(); await signed(a, 45000); await awards.addPayment(a, { kind: "cash", amount: 20000 }, BY);                         // committed and part paid
    const b = await approved({ projectTitle: "Netball League", organisation: "Ocean View Netball", email: "coach@netball.example" }); await awards.award(b, { amount: 30000 }, BY, NO_LIMIT);   // approved, no agreement yet
    await apply({ projectTitle: "Pound request", currency: "GBP" });                                                                            // no rand figure
    await awards.addMilestone(a, { title: "Programme starts", dueDate: "2026-09-01" }); await awards.addMilestone(a, { title: "Pitch day", dueDate: "2026-12-15" });
    const r = await awards.budget();
    expect(r.totals).toEqual({ requestedZar: 100000, approvedZar: 75000, committedZar: 45000, paidZar: 20000, awards: 2, notConverted: 1 });
    expect(r.awards.map((x) => [x.organisation, x.stageLabel, x.awarded, x.paid, x.remaining])).toEqual([["Khayelitsha Youth Hub", "Agreement signed", 45000, 20000, 25000], ["Ocean View Netball", "Agreement pending", 30000, 0, 30000]]);
    expect(r.awards[0]).toMatchObject({ milestonesDone: 0, milestonesTotal: 2, overdue: 1 });                                                    // the September milestone is past and not done
  });
  it("marks an award completed only once it has started", async () => {
    const ref = await approved(); const id = await idOf(ref); await awards.award(ref, { amount: 45000 }, BY, NO_LIMIT);
    await awards.markCompleted(id); expect((await awards.forApplication(id))!.stage).toBe("agreement_pending");
    await awards.agreement(ref, "send", {}, BY); later(); await awards.agreement(ref, "signed", {}, BY); await awards.markCompleted(id);
    expect((await awards.forApplication(id))!.stage).toBe("completed");
  });
});
