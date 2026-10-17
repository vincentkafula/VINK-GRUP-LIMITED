import { describe, it, expect, beforeEach } from "vitest";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail, type EmailSender } from "../auth/email.js";
import { createScanner } from "../services/fileScan.js";
import { createSponsorshipService, type SponsorshipService } from "../services/sponsorshipService.js";
import { createSponsorshipAwards, type SponsorshipAwards } from "../services/sponsorshipAwards.js";
import { createSponsorshipFollowUp, type SponsorshipFollowUp } from "../services/sponsorshipFollowUp.js";
import { EICAR } from "../services/fileScan.js";
import { good, ngoDocs, file, pdf, png, zip } from "./sponsorshipFixtures.js";

let db: Db, mail: ConsoleEmail, svc: SponsorshipService, awards: SponsorshipAwards, fu: SponsorshipFollowUp, clock = new Date("2026-10-09T10:00:00Z");
const BY = "00000000-0000-4000-8000-000000000001", EMAIL = "thandi@example.com";
const later = (s = 5) => { clock = new Date(clock.getTime() + s * 1000); };
const build = (m: EmailSender = mail) => {
  svc = createSponsorshipService({ db, mail: m, env: {} as NodeJS.ProcessEnv, now: () => clock });
  awards = createSponsorshipAwards({ db, mail: m, now: () => clock, pdfCompress: false, setStatus: (r, i) => svc.setStatus(r, i) });
  fu = createSponsorshipFollowUp({ db, mail: m, scanner: createScanner({}), env: {} as NodeJS.ProcessEnv, now: () => clock, forApplicant: (r, e) => svc.forApplicant(r, e), stageOf: (id) => awards.stageOf(id), markCompleted: (id) => awards.markCompleted(id) });
};
const apply = async () => ((await svc.submit(good, ngoDocs())) as { ref: string }).ref;
const idOf = async (ref: string) => String((await db.query(`SELECT id FROM sponsorship_applications WHERE ref = $1`, [ref])).rows[0].id);
const asking = async () => { const ref = await apply(); later(); await svc.setStatus(ref, { status: "under_review", reason: "Taken on", by: BY }); later(); await svc.setStatus(ref, { status: "more_information_required", reason: "Budget gaps", applicantMessage: "Please send a quote for the venue hire.", by: BY }); later(); return ref; };
const signed = async () => {
  const ref = await apply(); later(); await svc.setStatus(ref, { status: "under_review", reason: "Taken on", by: BY }); later(); await svc.setStatus(ref, { status: "approved", reason: "Approved", by: BY }); later();
  await awards.award(ref, { amount: 45000 }, BY, { limitZar: null }); await awards.agreement(ref, "send", {}, BY); later(); await awards.agreement(ref, "signed", {}, BY); later(); return ref;
};
const report = (over: Record<string, unknown> = {}) => ({ beneficiaries: 58, summary: "We ran the twelve week programme for fifty-eight young people and held the pitch day.", outcomes: "Fifty-eight finished and twenty-two have started a business, confirmed by follow-up calls.", expenditureNotes: "Facilitators, venue hire and the pitch day, as budgeted.", spent: 44200, benefitsDelivered: { logo: "Logo on all banners, shirts and the programme.", social: "Twelve posts reaching about four thousand people." }, challenges: "Two venues cancelled.", ...over });
const evidence = () => [file("evidence", "photos.png", png()), file("evidence", "receipts.pdf", pdf("receipts"))];

beforeEach(() => { db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date("2026-10-09T10:00:00Z"); build(); });

describe("replying when more information is asked for", () => {
  it("stores the reply and its files, tells the team with the files attached, and moves nothing", async () => {
    const ref = await asking(); mail.sent.length = 0;
    expect(await fu.reply(ref, EMAIL, { message: "The venue quote is attached: R12,500 for the hall." }, [file("x", "quote.pdf", pdf("quote")), file("x", "hall.png", png())])).toEqual({ ok: true });
    expect((await svc.get(ref))!.status).toBe("more_information_required");
    const a = (await svc.get(ref))!; expect(a.documents.filter((d) => d.kind === "additional").map((d) => d.filename).sort()).toEqual(["hall.png", "quote.pdf"]);
    const replies = await fu.repliesFor(await idOf(ref)); expect(replies).toHaveLength(1); expect(a.documents.filter((d) => d.kind === "additional").every((d) => d.sourceId === replies[0].id)).toBe(true);
    const m = mail.sent[0]; expect(m).toMatchObject({ to: "sponsorships@vink.co.za" }); expect(m.subject).toContain(ref); expect(m.replyTo).toContain(EMAIL); expect(m.text).toContain("The venue quote is attached"); expect(m.attachments).toHaveLength(2);
  });
  it("is only for the person who applied, and only when information was asked for", async () => {
    const ref = await asking();
    expect(await fu.reply(ref, "someone@else.com", { message: "Hello there" }, [])).toMatchObject({ ok: false, status: 404 }); expect(await fu.reply("SP-AAAAAA", EMAIL, { message: "Hello there" }, [])).toMatchObject({ ok: false, status: 404 });
    const other = ((await svc.submit({ ...good, projectTitle: "A different project" }, ngoDocs())) as { ref: string }).ref; expect(await fu.reply(other, EMAIL, { message: "Unprompted reply" }, [])).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("not waiting") });
    expect(await fu.reply(ref, EMAIL, { message: "hi" }, [])).toMatchObject({ ok: false, status: 400 });
  });
  it("is checked like any other upload: type, disguise and viruses are refused, and nothing is kept", async () => {
    const ref = await asking(); mail.sent.length = 0;
    expect(await fu.reply(ref, EMAIL, { message: "Here is the file" }, [file("x", "notes.txt", Buffer.from("hi"))])).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("not an accepted file type") });
    expect(await fu.reply(ref, EMAIL, { message: "Here is the file" }, [file("x", "a.pdf", Buffer.from("MZ\u0090 program"))])).toMatchObject({ ok: false, error: expect.stringContaining("not really a PDF") });
    expect(await fu.reply(ref, EMAIL, { message: "Here is the file" }, [file("x", "a.pdf", Buffer.from("%PDF-1.4\n" + EICAR))])).toMatchObject({ ok: false, error: expect.stringContaining("EICAR") });
    expect(await fu.repliesFor(await idOf(ref))).toHaveLength(0); expect(mail.sent).toHaveLength(0);
  });
  it("shows staff who has answered since they last acted, until they act", async () => {
    const ref = await asking();
    expect((await svc.list()).applications[0].replied).toBe(false);
    later(); await fu.reply(ref, EMAIL, { message: "The quote is attached below." }, []);
    expect((await svc.list()).applications[0].replied).toBe(true);
    later(); await svc.setStatus(ref, { status: "under_review", reason: "Reply read", by: BY });
    expect((await svc.list()).applications[0].replied).toBe(false);
  });
  it("is kept even when the team's email cannot be sent", async () => {
    build({ name: "down", async send() { throw new Error("mail is down"); } });
    const ref = await asking();
    expect(await fu.reply(ref, EMAIL, { message: "The quote is attached below." }, [])).toEqual({ ok: true });
    expect(await fu.repliesFor(await idOf(ref))).toHaveLength(1);
  });
});

describe("the final report", () => {
  it("is only possible once the agreement is signed", async () => {
    const ref = await apply();
    expect(await fu.submitReport(ref, EMAIL, report(), evidence())).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("agreement is signed") });
    const pending = await apply().catch(() => ""); void pending;
    expect(await fu.submitReport(ref, "someone@else.com", report(), evidence())).toMatchObject({ ok: false, status: 404 });
  });
  it("needs a note on every benefit that was promised, the figures, and evidence, and names every problem", async () => {
    const ref = await signed();
    const r = await fu.submitReport(ref, EMAIL, { beneficiaries: -1, summary: "short", outcomes: "", expenditureNotes: "", spent: "lots", benefitsDelivered: { logo: "ok" } }, []);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(Object.keys((r as { fields: Record<string, string> }).fields).sort()).toEqual(["beneficiaries", "benefitsDelivered.logo", "benefitsDelivered.social", "documents", "expenditureNotes", "outcomes", "spent", "summary"]);
    expect((r as { fields: Record<string, string> }).fields["benefitsDelivered.social"]).toContain("Social media exposure");
    expect((r as { fields: Record<string, string> }).fields.documents).toContain("Evidence of what was delivered");
  });
  it("is stored with its evidence and sent to the team, and the evidence is checked like every other upload", async () => {
    const ref = await signed(); mail.sent.length = 0;
    expect(await fu.submitReport(ref, EMAIL, report(), [file("evidence", "photo.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])), file("evidence", "budget.xlsx", zip())])).toEqual({ ok: true });
    const id = await idOf(ref); const reports = await fu.reportsFor(id);
    expect(reports).toHaveLength(1); expect(reports[0]).toMatchObject({ beneficiaries: 58, spent: 44200, status: "submitted", statusLabel: "Submitted", benefitsDelivered: { logo: expect.any(String), social: expect.any(String) }, challenges: "Two venues cancelled." });
    expect((await svc.get(ref))!.documents.filter((d) => d.kind === "evidence" && d.sourceId === reports[0].id)).toHaveLength(2);
    expect(mail.sent[0].subject).toContain("Final report"); expect(mail.sent[0].text).toContain("People reached: 58"); expect(mail.sent[0].attachments).toHaveLength(2);
    expect(await fu.submitReport(ref, EMAIL, report(), [file("evidence", "x.exe", Buffer.from("MZ"))])).toMatchObject({ ok: false });
  });
  it("is accepted as sent when more was spent than the award (the applicant may have added their own money)", async () => {
    const ref = await signed(); expect(await fu.submitReport(ref, EMAIL, report({ spent: 80000 }), evidence())).toEqual({ ok: true });
  });
  it("is one at a time: not again while it is being read", async () => {
    const ref = await signed(); await fu.submitReport(ref, EMAIL, report(), evidence());
    expect(await fu.submitReport(ref, EMAIL, report(), evidence())).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("being read") });
  });
  it("can be returned with a note the applicant sees, and sent again", async () => {
    const ref = await signed(); await fu.submitReport(ref, EMAIL, report(), evidence()); const id = await idOf(ref); const r1 = (await fu.reportsFor(id))[0]; mail.sent.length = 0; later();
    expect(await fu.reviewReport(ref, r1.id, { decision: "returned", note: "short" }, BY)).toMatchObject({ ok: false, status: 400 });
    expect(await fu.reviewReport(ref, r1.id, { decision: "returned", note: "Please add the receipts for the venue hire." }, BY)).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(mail.sent.find((m) => m.to === EMAIL)).toMatchObject({ subject: expect.stringContaining("needs changes"), text: expect.stringContaining("Please add the receipts") });
    const extras = await fu.applicantExtras((await svc.forApplicant(ref, EMAIL))!);
    expect(extras.reports).toEqual([{ at: expect.any(String), status: "returned", statusLabel: "Returned for changes", note: "Please add the receipts for the venue hire." }]); expect(extras.canReport).toBe(true);
    later(); expect(await fu.submitReport(ref, EMAIL, report({ spent: 44300 }), evidence())).toEqual({ ok: true });
    expect((await fu.reportsFor(id)).map((r) => r.status)).toEqual(["returned", "submitted"]);
  });
  it("completes the award when it is accepted, and then cannot be sent again", async () => {
    const ref = await signed(); await fu.submitReport(ref, EMAIL, report(), evidence()); const id = await idOf(ref); const r = (await fu.reportsFor(id))[0]; later();
    expect(await fu.reviewReport(ref, r.id, { decision: "accepted", note: "Excellent work." }, BY)).toEqual({ ok: true });
    expect((await awards.forApplication(id))!.stage).toBe("completed");
    expect(await fu.reviewReport(ref, r.id, { decision: "accepted" }, BY)).toMatchObject({ ok: false, status: 409 });
    expect(await fu.submitReport(ref, EMAIL, report(), evidence())).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already been accepted") });
    expect((await fu.applicantExtras((await svc.forApplicant(ref, EMAIL))!)).canReport).toBe(false);
  });
  it("is reviewed by someone who picks accept or return, for a report that exists", async () => {
    const ref = await signed(); await fu.submitReport(ref, EMAIL, report(), evidence()); const r = (await fu.reportsFor(await idOf(ref)))[0];
    expect(await fu.reviewReport(ref, r.id, { decision: "maybe" }, BY)).toMatchObject({ ok: false, status: 400 });
    expect(await fu.reviewReport(ref, "00000000-0000-4000-8000-0000000000aa", { decision: "accepted" }, BY)).toMatchObject({ ok: false, status: 404 });
    expect(await fu.reviewReport("SP-AAAAAA", r.id, { decision: "accepted" }, BY)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("what the tracker is told", () => {
  it("is what the applicant may do now and what they have sent, and never the staff's notes", async () => {
    const ref = await asking(); const app = (await svc.forApplicant(ref, EMAIL))!;
    expect(await fu.applicantExtras(app)).toEqual({ replies: [], reports: [], canReply: true, canReport: false, benefits: [] });
    later(); await fu.reply(ref, EMAIL, { message: "The quote is attached below." }, []);
    expect((await fu.applicantExtras(app)).replies).toEqual([{ at: expect.any(String), message: "The quote is attached below." }]);
    const s = await signed(); const extras = await fu.applicantExtras((await svc.forApplicant(s, EMAIL))!);
    expect(extras).toMatchObject({ canReply: false, canReport: true, benefits: [{ id: "logo", label: "Brand logo placement" }, { id: "social", label: "Social media exposure" }] });
    expect(JSON.stringify(extras)).not.toMatch(/reviewedBy|INTERNAL/);
  });
});
