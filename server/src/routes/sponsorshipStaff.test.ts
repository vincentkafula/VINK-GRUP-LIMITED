import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "../portal/testDb.js";
import type { Db } from "../portal/driverRoutes.js";
import { ConsoleEmail } from "../auth/email.js";
import { createSponsorship, type Sponsorship } from "./sponsorshipRouter.js";
import { good, ngoDocs, pdf, png, zip } from "./sponsorshipFixtures.js";

const SECTION = "Sponsorships and Partnerships";
const ID = { amy: "00000000-0000-4000-8000-000000000001", ben: "00000000-0000-4000-8000-000000000002", cara: "00000000-0000-4000-8000-000000000003", dan: "00000000-0000-4000-8000-000000000004", fin: "00000000-0000-4000-8000-000000000005", eve: "00000000-0000-4000-8000-000000000006" };
const USERS: Record<string, { userId: string; username: string; role: string }> = {
  amy: { userId: ID.amy, username: "amy", role: "superadmin" }, ben: { userId: ID.ben, username: "ben", role: "customer" }, cara: { userId: ID.cara, username: "cara", role: "customer" },
  dan: { userId: ID.dan, username: "dan", role: "customer" }, fin: { userId: ID.fin, username: "fin", role: "billing_admin" }, eve: { userId: ID.eve, username: "eve", role: "customer" },
};
let db: Db, mail: ConsoleEmail, sys: Sponsorship, server: Server, url = "", clock = new Date("2026-10-09T10:00:00Z");
const later = (s = 5) => { clock = new Date(clock.getTime() + s * 1000); };

beforeEach(async () => {
  db = allPortalsDb(); mail = new ConsoleEmail(); clock = new Date("2026-10-09T10:00:00Z");
  await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,'amy','Amy Super','amy@vink.co.za','superadmin'),($2,'ben','Ben Reviewer','ben@vink.co.za','customer'),($3,'cara','Cara Reviewer','cara@vink.co.za','customer'),($4,'dan','Dan Finance Section','dan@vink.co.za','customer'),($5,'fin','Fiona Finance','fin@vink.co.za','billing_admin'),($6,'eve','Eve Nobody','eve@vink.co.za','customer')`, [ID.amy, ID.ben, ID.cara, ID.dan, ID.fin, ID.eve]);
  await db.query(`INSERT INTO section_permissions (user_id, section) VALUES ($1,$3),($2,$3),($4,'Finance')`, [ID.ben, ID.cara, SECTION, ID.dan]);
  sys = createSponsorship({ db, mail, env: {} as NodeJS.ProcessEnv, now: () => clock, pdfCompress: false });
  const app = express();
  app.use("/api/sponsorship", sys.publicRouter);
  app.use((req, _r, next) => { const u = USERS[req.header("x-user") ?? ""]; if (u) req.user = u as never; next(); });
  app.use("/admin", sys.adminRouter);
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((ok) => server.close(() => ok())));

type J = Record<string, any>;
const call = async (method: string, path: string, who?: string, body?: unknown): Promise<{ status: number; body: J; headers: Headers }> => {
  const r = await fetch(url + path, { method, headers: { ...(who ? { "x-user": who } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = r.headers.get("content-type") ?? ""; return { status: r.status, body: (ct.includes("json") ? await r.json() : {}) as J, headers: r.headers };
};
const multi = async (path: string, data: unknown, files: { name: string; data: Buffer }[] = []) => {
  const fd = new FormData(); fd.append("data", JSON.stringify(data)); files.forEach((f, i) => fd.append(`file${i}`, new Blob([f.data]), f.name));
  const r = await fetch(url + path, { method: "POST", body: fd }); return { status: r.status, body: await r.json() as J };
};
const apply = async () => {
  const fd = new FormData(); fd.append("data", JSON.stringify(good)); for (const f of ngoDocs()) fd.append(`doc_${f.kind}`, new Blob([f.data]), f.filename);
  const r = await fetch(url + "/api/sponsorship", { method: "POST", body: fd }); return ((await r.json()) as J).data.ref as string;
};
const track = (ref: string) => call("POST", "/api/sponsorship/track", undefined, { ref, email: "thandi@example.com" });
const report = { beneficiaries: 58, summary: "We ran the twelve week programme for fifty-eight young people and held the pitch day.", outcomes: "Fifty-eight finished and twenty-two have started a business, confirmed by follow-up calls.", expenditureNotes: "Facilitators, venue hire and the pitch day, as budgeted.", spent: 44200, benefitsDelivered: { logo: "Logo on all banners and shirts.", social: "Twelve posts reaching four thousand people." } };

describe("who may use the staff routes", () => {
  it("are Super Administrators and people approved for the sponsorship section, and nobody else", async () => {
    expect((await call("GET", "/admin/")).status).toBe(401);
    expect((await call("GET", "/admin/", "eve")).status).toBe(403); expect((await call("GET", "/admin/", "dan")).status).toBe(403);   // Dan is in Finance, not here
    expect((await call("GET", "/admin/", "ben")).status).toBe(200); expect((await call("GET", "/admin/", "amy")).status).toBe(200);
    expect((await call("GET", "/admin/", "fin")).status).toBe(403);                                    // finance staff are not reviewers
  });
  it("let finance staff reach the budget, payments and their own capabilities, and only those", async () => {
    expect((await call("GET", "/admin/budget", "fin")).status).toBe(200); expect((await call("GET", "/admin/me", "fin")).body.data).toMatchObject({ isSuper: false, isFinance: true });
    for (const p of ["/admin/staff", "/admin/settings", "/admin/reports/summary", "/admin/SP-AAAAAA"]) expect((await call("GET", p, "fin")).status, p).toBe(403);
    expect((await call("GET", "/admin/budget", "ben")).status).toBe(403); expect((await call("GET", "/admin/budget", "amy")).status).toBe(200);
  });
  it("tell each person what they can do", async () => {
    expect((await call("GET", "/admin/me", "ben")).body.data).toMatchObject({ userId: ID.ben, name: "Ben Reviewer", isSuper: false, isFinance: false, canReview: true, sectionName: SECTION });
    expect((await call("GET", "/admin/me", "amy")).body.data).toMatchObject({ isSuper: true, isFinance: true, canReview: true, settings: { approvalLimitZar: null } });
    expect((await call("GET", "/admin/me", "fin")).body.data).toMatchObject({ isSuper: false, isFinance: true, canReview: false });      // finance staff handle the money, not the applications
  });
  it("keep the settings for Super Administrators, though everyone on the team may read them", async () => {
    expect((await call("PUT", "/admin/settings", "ben", { approvalLimitZar: 40000 })).status).toBe(403);
    expect((await call("GET", "/admin/settings", "ben")).status).toBe(200);
    expect((await call("PUT", "/admin/settings", "amy", { approvalLimitZar: 40000, weights: { strategic: 3, impact: 1, feasibility: 1, budget: 1, reach: 1, measurable: 1 } })).body.data).toMatchObject({ approvalLimitZar: 40000, weights: { strategic: 3 } });
    expect((await call("PUT", "/admin/settings", "amy", { approvalLimitZar: -1 })).status).toBe(400);
  });
});

describe("a whole sponsorship, over HTTP, by the people who would do it", () => {
  it("goes from application to a completed award, each person doing only what they may", async () => {
    await call("PUT", "/admin/settings", "amy", { approvalLimitZar: 40000 });                       // managers may approve up to R40,000
    const ref = await apply(); later();
    // a reviewer takes it on, scores it, and asks for more information
    expect((await call("GET", "/admin/staff", "ben")).body.staff.map((p: J) => p.name)).toEqual(["Amy Super", "Ben Reviewer", "Cara Reviewer"]);
    expect((await call("POST", `/admin/${ref}/assign`, "ben", { userId: ID.ben })).body.data).toMatchObject({ assignedName: "Ben Reviewer" });
    expect((await call("GET", "/admin/?assigned=me", "ben")).body.applications.map((a: J) => a.ref)).toEqual([ref]); expect((await call("GET", "/admin/?assigned=me", "cara")).body.applications).toHaveLength(0);
    expect((await call("PUT", `/admin/${ref}/score`, "ben", { scores: { strategic: 4, impact: 5, feasibility: 4, budget: 3, reach: 4, measurable: 4 }, comment: "Strong" })).body.data.total).toBeCloseTo(80, 0);
    expect((await call("POST", `/admin/${ref}/status`, "ben", { status: "under_review", reason: "Taken on" })).status).toBe(200); later();
    expect((await call("POST", `/admin/${ref}/status`, "ben", { status: "more_information_required", reason: "Budget unclear", applicantMessage: "Please send a quote for the venue hire." })).status).toBe(200); later();
    // the applicant answers, on the tracker
    let t = (await track(ref)).body.data; expect(t).toMatchObject({ status: "more_information_required", canReply: true, canReport: false, award: null });
    expect((await multi("/api/sponsorship/reply", { ref, email: "thandi@example.com", message: "The quote for the hall is attached: R12,500." }, [{ name: "quote.pdf", data: pdf("quote") }])).status).toBe(201); later();
    expect((await call("GET", "/admin/", "ben")).body.applications[0].replied).toBe(true);
    const detail = (await call("GET", `/admin/${ref}`, "ben")).body.data;
    expect(detail.replies).toHaveLength(1); expect(detail.review.reviewers[0]).toMatchObject({ reviewerName: "Ben Reviewer", total: 80 }); expect(detail.documents.filter((d: J) => d.kind === "additional")).toHaveLength(1);
    // the applicant's timeline interleaves what staff said and what they sent
    t = (await track(ref)).body.data; expect(t.timeline.map((e: J) => e.kind + ":" + e.status)).toEqual(["status:submitted", "status:under_review", "status:more_information_required", "reply:reply"]); expect(t.canReply).toBe(true);
    // the manager moves it on, but cannot approve above the limit; the Super Administrator can
    await call("POST", `/admin/${ref}/status`, "ben", { status: "under_review", reason: "Reply read" }); later();
    expect((await call("GET", `/admin/${ref}`, "ben")).body.data.mayApprove).toBe(false); expect((await call("GET", `/admin/${ref}`, "amy")).body.data.mayApprove).toBe(true);
    expect((await call("POST", `/admin/${ref}/status`, "ben", { status: "approved", reason: "Looks good" })).body.error).toMatch(/Approvals above R40.?000 need a Super Administrator/);
    expect((await call("POST", `/admin/${ref}/status`, "amy", { status: "approved", reason: "Approved by the committee", applicantMessage: "Congratulations." })).status).toBe(200); later();
    // the award: the manager cannot go above the limit; the Super Administrator awards, and the documents can be read
    expect((await call("POST", `/admin/${ref}/award`, "ben", { amount: 45000 })).status).toBe(403);
    expect((await call("POST", `/admin/${ref}/award`, "amy", { amount: 45000, conditions: "Facilitators and venue only." })).body.data).toMatchObject({ amount: 45000, stage: "agreement_pending" });
    const letter = await fetch(`${url}/admin/${ref}/award/letter.pdf`, { headers: { "x-user": "ben" } }); expect(letter.status).toBe(200); expect(letter.headers.get("content-type")).toBe("application/pdf"); expect((await letter.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect((await fetch(`${url}/admin/${ref}/award/agreement.pdf`, { headers: { "x-user": "ben" } })).status).toBe(200); expect((await call("GET", `/admin/${ref}/award/nothing.pdf`, "ben")).status).toBe(404);
    expect((await call("POST", `/admin/${ref}/milestones`, "ben", { title: "Pitch day", dueDate: "2026-12-15" })).body.data.milestones).toHaveLength(1);
    // the agreement goes out and the applicant sees the award
    expect((await call("POST", `/admin/${ref}/agreement`, "ben", { action: "send" })).body.data.agreementSentAt).toBeTruthy(); later();
    t = (await track(ref)).body.data; expect(t.status).toBe("agreement_pending"); expect(t.award).toMatchObject({ amount: 45000, stageLabel: "Agreement pending", conditions: "Facilitators and venue only.", milestones: [{ title: "Pitch day", status: "pending" }], paid: 0 });
    expect((await call("POST", `/admin/${ref}/agreement`, "ben", { action: "signed", note: "Signed copy received" })).body.data.stage).toBe("active"); later();
    // money: only finance staff and Super Administrators record payments
    expect((await call("POST", `/admin/${ref}/payments`, "ben", { kind: "cash", amount: 20000 })).status).toBe(403);
    expect((await call("POST", `/admin/${ref}/payments`, "fin", { kind: "cash", amount: 20000, reference: "EFT 8841" })).body.data).toMatchObject({ disbursed: 20000, remaining: 25000 });
    expect((await call("POST", `/admin/${ref}/payments`, "fin", { kind: "cash", amount: 30000 })).status).toBe(400);
    expect((await call("GET", "/admin/budget", "fin")).body.data.totals).toMatchObject({ approvedZar: 45000, committedZar: 45000, paidZar: 20000, awards: 1 });
    // the final report, and its acceptance
    t = (await track(ref)).body.data; expect(t).toMatchObject({ canReport: true, award: { paid: 20000, stageLabel: "Agreement signed" } }); expect(t.benefits.map((b: J) => b.id)).toEqual(["logo", "social"]);
    expect((await multi("/api/sponsorship/report", { ref, email: "thandi@example.com", ...report }, [{ name: "photos.png", data: png() }, { name: "receipts.pdf", data: pdf("r") }])).status).toBe(201); later();
    const rep = (await call("GET", `/admin/${ref}`, "ben")).body.data.reports[0]; expect(rep).toMatchObject({ status: "submitted", beneficiaries: 58 });
    expect((await call("POST", `/admin/${ref}/reports/${rep.id}/review`, "ben", { decision: "accepted", note: "Excellent work." })).status).toBe(200);
    t = (await track(ref)).body.data; expect(t).toMatchObject({ canReport: false, award: { stageLabel: "Completed" } }); expect(t.timeline.at(-1)).toMatchObject({ kind: "report", status: "report_accepted", message: "Excellent work." });
    // nothing the staff wrote privately reaches the applicant
    expect(JSON.stringify(t)).not.toMatch(/Signed copy received|Looks good|Budget unclear|reviewedBy|Ben Reviewer/);
  });

  it("is written to the audit log, with who did it", async () => {
    const ref = await apply(); later();
    await call("POST", `/admin/${ref}/status`, "ben", { status: "under_review", reason: "Taken on" }); await call("PUT", `/admin/${ref}/score`, "ben", { scores: { strategic: 3, impact: 3, feasibility: 3, budget: 3, reach: 3, measurable: 3 } });
    await call("PUT", "/admin/settings", "amy", { approvalLimitZar: 100000 }); await call("GET", "/admin/reports/export.csv", "ben");
    const rows = (await db.query(`SELECT action, actor_name, target FROM audit_log ORDER BY created_at, id`)).rows.map((r) => `${r.actor_name}:${r.action}`);
    for (const e of ["ben:sponsorship.status", "ben:sponsorship.score", "amy:sponsorship.settings", "ben:sponsorship.export"]) expect(rows).toContain(e);
  });
});

describe("reports, over HTTP", () => {
  it("summarise and export, as a spreadsheet that opens", async () => {
    await apply();
    const s = (await call("GET", "/admin/reports/summary?from=2026-10-01&to=2026-10-31", "ben")).body.data; expect(s).toMatchObject({ total: 1, totals: { requestedZar: 50000 } });
    const csv = await fetch(`${url}/admin/reports/export.csv`, { headers: { "x-user": "ben" } }); expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text(); const lines = text.trim().split(/\r?\n/); expect(lines[0]).toContain("Reference"); expect(lines).toHaveLength(2); expect(lines[1]).toContain("Khayelitsha Youth Hub");
  });
});

describe("mistakes are refused clearly", () => {
  it("for a bad reference, a bad id, an unknown application, and a request that is not allowed yet", async () => {
    expect((await call("GET", "/admin/not-a-ref", "ben")).status).toBe(400); expect((await call("GET", "/admin/SP-AAAAAA", "ben")).status).toBe(404);
    const ref = await apply();
    expect((await call("POST", `/admin/${ref}/milestones/not-a-uuid`, "ben", { status: "done" })).status).toBe(400); expect((await call("DELETE", `/admin/${ref}/milestones/not-a-uuid`, "ben")).status).toBe(400);
    expect((await call("POST", `/admin/${ref}/reports/not-a-uuid/review`, "ben", { decision: "accepted" })).status).toBe(400);
    expect((await call("POST", `/admin/${ref}/award`, "ben", { amount: 1000 })).status).toBe(409);                     // not approved yet
    expect((await call("PUT", `/admin/${ref}/score`, "ben", { scores: { strategic: 9 } })).status).toBe(400);
    expect((await call("POST", `/admin/${ref}/assign`, "ben", { userId: ID.eve })).status).toBe(400);                  // Eve does not work on sponsorships
  });
  it("for replies and reports that are not allowed, with the reason", async () => {
    const ref = await apply();
    expect((await multi("/api/sponsorship/reply", { ref, email: "thandi@example.com", message: "An unprompted reply" })).body.error).toMatch(/not waiting for more information/);
    expect((await multi("/api/sponsorship/reply", { ref, email: "wrong@example.com", message: "An unprompted reply" })).status).toBe(404);
    expect((await multi("/api/sponsorship/report", { ref, email: "thandi@example.com", ...report }, [{ name: "a.pdf", data: pdf() }])).body.error).toMatch(/agreement is signed/);
    expect((await fetch(url + "/api/sponsorship/reply", { method: "POST", body: new FormData() })).status).toBe(400);
  });
  it("and the reply and report routes are limited, like the others", async () => {
    const ref = await apply(); let last = 0;
    for (let i = 0; i < 12; i++) last = (await multi("/api/sponsorship/reply", { ref, email: "thandi@example.com", message: `Reply number ${i}` })).status;
    expect(last).toBe(429);
  });
});
