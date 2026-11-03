import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { allPortalsDb } from "./testDb.js";
import type { Db } from "./common.js";
import { createOwnerRouter } from "./ownerRoutes.js";
import { createAssociationRouter } from "./associationRoutes.js";
import { createDriverRouter } from "./driverRoutes.js";
import { createMarshalRouter } from "./marshalRoutes.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * What loads collected, per load, driver, vehicle or route, for each role that sees them. The fixtures are small enough to add up by hand:
 *
 *   S1  rank R1 (association A)  vehicle V1 (owner O1)  driver D1  marshal M1  route RT1  5 Oct   3 passengers  R75  closed
 *   S2  rank R1 (association A)  vehicle V2 (owner O1)  driver D2  marshal M1  route RT1  5 Oct   2 passengers  R50  closed
 *   S3  O1's OWN device on V1 (association A)           driver D1  no marshal  route RT2  6 Oct   1 passenger   R25  closed
 *   S4  rank R2 (association B)  vehicle V3 (owner O2)  driver D2  marshal M2  route RT2  5 Oct   4 passengers  R100 closed
 *   S5  rank R1 (association A)  vehicle V1 (owner O1)  driver D1  marshal M1  route RT1  7 Oct   1 passenger   R25  STILL LOADING
 *   S6  never paired (pending) and S7 cancelled: they collected nothing and are never in a report.
 * Each fare carries VINK's flat R1.00 fee.
 */
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { A: id(1), B: id(2), O1: id(3), O2: id(4), D1: id(5), D2: id(6), M1: id(7), M2: id(8), nobody: id(9) };
const NOW = new Date("2026-10-07T12:00:00Z");
let db: Db;
const day = (d: number, h = 10, m = 0) => new Date(Date.UTC(2026, 9, d, h, m, 0));

async function fixtures() {
  db = allPortalsDb();
  const names: [string, string, string][] = [[U.A, "Association A", "association"], [U.B, "Association B", "association"], [U.O1, "Owner One", "vehicle_owner"], [U.O2, "Owner Two", "vehicle_owner"], [U.D1, "Dee Driver", "driver"], [U.D2, "Dan Driver", "driver"], [U.M1, "Mo Marshal", "marshal"], [U.M2, "Mia Marshal", "marshal"], [U.nobody, "No Loads", "driver"]];
  for (const [i, n, r] of names) await db.query(`INSERT INTO users (id, username, name, email, role) VALUES ($1,$2,$3,$4,$5)`, [i, n.replace(/ /g, "").toLowerCase(), n, `${i}@x.test`, r]);
  const R1 = id(100), R2 = id(101), V1 = id(110), V2 = id(111), V3 = id(112), RT1 = id(120), RT2 = id(121), T1 = id(130), T2 = id(131), T3 = id(132);
  await db.query(`INSERT INTO ranks (id, association_id, name) VALUES ($1,$2,'Langa rank'),($3,$4,'Bellville rank')`, [R1, U.A, R2, U.B]);
  await db.query(`INSERT INTO vehicles (id, owner_id, registration) VALUES ($1,$2,'CA 111-111'),($3,$2,'CA 222-222'),($4,$5,'CA 333-333')`, [V1, U.O1, V2, V3, U.O2]);
  await db.query(`INSERT INTO token_routes (id, association_id, name, fare_cents) VALUES ($1,$2,'Langa to Bellville',2500),($3,$2,'Bellville to Langa',2500)`, [RT1, U.A, RT2]);
  await db.query(`INSERT INTO terminals (id, serial, kind, rank_id, route_id, association_id, owner_id, vehicle_id) VALUES ($1,'RK-1','rank',$2,$3,$4,NULL,NULL),($5,'RK-2','rank',$6,$7,$8,NULL,NULL),($9,'OWN-1','vehicle',NULL,$7,$4,$10,$11)`, [T1, R1, RT1, U.A, T2, R2, RT2, U.B, T3, U.O1, V1]);
  const session = async (n: number, o: { t: string; rank: string | null; v: string; driver: string | null; marshal: string | null; route: string; paired: Date | null; ended: Date | null; status: string; pax: number; total: number }) => {
    const sid = id(200 + n);
    await db.query(`INSERT INTO loading_sessions (id, terminal_id, rank_id, vehicle_id, route_id, marshal_id, driver_id, status, started_at, paired_at, ended_at, passengers, total_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12)`,
      [sid, o.t, o.rank, o.v, o.route, o.marshal, o.driver, o.status, o.paired ?? day(1), o.ended, o.pax, o.total]);
    if (o.paired === null) await db.query(`UPDATE loading_sessions SET paired_at = NULL WHERE id = $1`, [sid]);
    for (let k = 0; k < o.pax; k++) await db.query(`INSERT INTO terminal_taps (terminal_id, masked_pan, scheme, amount, currency, cardholder_verification, status, session_id, vink_fee_device, vink_fee_card, received_at) VALUES ($1,$2,'vink_token',25,'ZAR','token_card','confirmed',$3,0.5,0.5,$4)`, [o.t, `VINK ****000${k}`, sid, o.paired ?? day(1)]);
  };
  await session(1, { t: T1, rank: R1, v: V1, driver: U.D1, marshal: U.M1, route: RT1, paired: day(5, 10), ended: day(5, 10, 30), status: "closed", pax: 3, total: 7500 });
  await session(2, { t: T1, rank: R1, v: V2, driver: U.D2, marshal: U.M1, route: RT1, paired: day(5, 11), ended: day(5, 12), status: "closed", pax: 2, total: 5000 });
  await session(3, { t: T3, rank: null, v: V1, driver: U.D1, marshal: null, route: RT2, paired: day(6, 8), ended: day(6, 9), status: "closed", pax: 1, total: 2500 });
  await session(4, { t: T2, rank: R2, v: V3, driver: U.D2, marshal: U.M2, route: RT2, paired: day(5, 9), ended: day(5, 10), status: "closed", pax: 4, total: 10000 });
  await session(5, { t: T1, rank: R1, v: V1, driver: U.D1, marshal: U.M1, route: RT1, paired: day(7, 9), ended: null, status: "loading", pax: 1, total: 2500 });
  await session(6, { t: T2, rank: R2, v: V3, driver: null, marshal: U.M2, route: RT2, paired: null, ended: null, status: "pending", pax: 0, total: 0 });
  await session(7, { t: T1, rank: R1, v: V2, driver: U.D2, marshal: U.M1, route: RT1, paired: day(6, 10), ended: day(6, 11), status: "cancelled", pax: 0, total: 0 });
  return { R1, R2, V1, V2, V3, RT1, RT2 };
}

describe("loading reports", () => {
  let server: Server, url = "", as = U.O1, role = "vehicle_owner";
  beforeEach(async () => {
    await fixtures(); as = U.O1; role = "vehicle_owner"; const app = express(); app.use(express.json());
    app.use((req, _r, next) => { (req as any).user = { userId: as, username: "u", role }; next(); });
    app.use("/owner", createOwnerRouter(db, () => NOW)); app.use("/association", createAssociationRouter(db, () => NOW)); app.use("/driver", createDriverRouter(db, () => NOW)); app.use("/marshal", createMarshalRouter(db, () => NOW));
    app.use((err: Error, _q: express.Request, res: express.Response, _n: express.NextFunction) => { res.status(500).json({ success: false, error: err.message }); });
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((ok) => server.close(() => ok())));
  const get = async (who: string, r: string, path: string) => { as = who; role = r; const res = await fetch(url + path); const type = res.headers.get("content-type") ?? ""; return { status: res.status, type, disposition: res.headers.get("content-disposition") ?? "", body: type.includes("json") ? ((await res.json()) as any) : await res.text() }; };
  const owner = (q: string) => get(U.O1, "vehicle_owner", `/owner/loading/report${q}`);
  const ALL = "from=2026-10-01&to=2026-10-07";
  const names = (rows: any[]) => rows.map((x) => [x.name, x.trips, x.collectedCents]);

  it("shows an owner what loads on their own vehicles collected, per driver by default, with the fee and what is left", async () => {
    const r = await owner(`?${ALL}`); expect(r.status).toBe(200); expect(r.body).toMatchObject({ success: true, by: "driver", from: "2026-10-01", to: "2026-10-07", truncated: false });
    expect(r.body.totals).toEqual({ trips: 4, passengers: 7, collectedCents: 17500, feeCents: 700, netCents: 16800 });                                  // S1 + S2 + S3 + S5; not S4 (another owner), S6 (never paired) or S7 (cancelled)
    expect(r.body.rows).toEqual([{ key: U.D1, name: "Dee Driver", trips: 3, passengers: 5, collectedCents: 12500, feeCents: 500, netCents: 12000 }, { key: U.D2, name: "Dan Driver", trips: 1, passengers: 2, collectedCents: 5000, feeCents: 200, netCents: 4800 }]);     // biggest first
  });
  it("groups by vehicle, by route and by load, naming where each load was and whether it is still going", async () => {
    expect(names((await owner(`?by=vehicle&${ALL}`)).body.rows)).toEqual([["CA 111-111", 3, 12500], ["CA 222-222", 1, 5000]]);
    const t = (await owner(`?by=route&${ALL}`)).body.rows; expect(t.map((x: any) => [x.name, x.trips, x.collectedCents, x.feeCents, x.netCents])).toEqual([["Langa to Bellville", 3, 15000, 600, 14400], ["Bellville to Langa", 1, 2500, 100, 2400]]);
    const s = (await owner(`?by=session&${ALL}`)).body.rows; expect(s).toHaveLength(4);
    expect(s.find((x: any) => x.id === id(205))).toMatchObject({ inProgress: true, endedAt: null, place: "Langa rank", driver: "Dee Driver", registration: "CA 111-111", passengers: 1, collectedCents: 2500, feeCents: 100, netCents: 2400 });
    expect(s.find((x: any) => x.id === id(203))).toMatchObject({ inProgress: false, place: "Own device", route: "Bellville to Langa", driver: "Dee Driver" }); expect(s[0].id).toBe(id(205));                  // newest first
  });
  it("shows an association the loads at its own ranks and on its own devices, and not another association's", async () => {
    const a = await get(U.A, "association", `/association/loading/report?by=session&${ALL}`); expect(a.body.rows.map((x: any) => x.id).sort()).toEqual([id(201), id(202), id(203), id(205)]);       // S3 is an owner's device under association A
    expect(a.body.totals).toMatchObject({ trips: 4, collectedCents: 17500 });
    const b = await get(U.B, "association", `/association/loading/report?by=route&${ALL}`); expect(b.body.rows.map((x: any) => [x.name, x.trips, x.collectedCents])).toEqual([["Bellville to Langa", 1, 10000]]); expect(b.body.totals.collectedCents).toBe(10000);
  });
  it("shows a driver only their own loads, wherever they were, and a marshal only the ones they started", async () => {
    const d1 = await get(U.D1, "driver", `/driver/loading/report?by=vehicle&${ALL}`); expect(d1.body.totals).toMatchObject({ trips: 3, passengers: 5, collectedCents: 12500 }); expect(names(d1.body.rows)).toEqual([["CA 111-111", 3, 12500]]);
    const d2 = await get(U.D2, "driver", `/driver/loading/report?by=route&${ALL}`); expect(d2.body.totals).toMatchObject({ trips: 2, collectedCents: 15000 }); expect(names(d2.body.rows)).toEqual([["Bellville to Langa", 1, 10000], ["Langa to Bellville", 1, 5000]]);       // one at each association
    const m1 = await get(U.M1, "marshal", `/marshal/loading/report?by=driver&${ALL}`); expect(m1.body.totals).toMatchObject({ trips: 3, collectedCents: 15000 }); expect(names(m1.body.rows)).toEqual([["Dee Driver", 2, 10000], ["Dan Driver", 1, 5000]]);                       // S3 had no marshal
    const m2 = await get(U.M2, "marshal", `/marshal/loading/report?by=session&${ALL}`); expect(m2.body.rows.map((x: any) => x.id)).toEqual([id(204)]);
  });
  it("keeps one person's loads out of another's report", async () => {
    const o2 = await get(U.O2, "vehicle_owner", `/owner/loading/report?by=session&${ALL}`); expect(o2.body.rows.map((x: any) => x.id)).toEqual([id(204)]);
    for (const [who, r, path] of [[U.nobody, "driver", "/driver"], [U.nobody, "vehicle_owner", "/owner"], [U.nobody, "marshal", "/marshal"], [U.nobody, "association", "/association"]] as const) {
      const e = await get(who, r, `${path}/loading/report?${ALL}`); expect(e.body).toMatchObject({ success: true, rows: [], totals: { trips: 0, passengers: 0, collectedCents: 0, feeCents: 0, netCents: 0 } });
    }
  });
  it("counts only the loads in the period, by the day they began (South African time), and rejects a bad period or grouping", async () => {
    expect((await owner("?from=2026-10-05&to=2026-10-05")).body.totals).toMatchObject({ trips: 2, collectedCents: 12500 });                                  // S1 and S2 (5 Oct), not S3 (6 Oct) or S5 (7 Oct)
    expect((await owner("?from=2026-10-06&to=2026-10-07")).body.totals).toMatchObject({ trips: 2, collectedCents: 5000 });
    expect((await owner("?from=2026-09-01&to=2026-09-30")).body.rows).toEqual([]);
    for (const bad of ["?from=2026-10-09&to=2026-10-01", "?from=nope", "?from=2024-01-01&to=2026-10-07", "?by=colour"]) expect((await owner(bad)).status, bad).toBe(400);
    expect((await owner("")).body).toMatchObject({ from: "2026-09-08", to: "2026-10-07" });                                                              // thirty days to today when no period is given
  });
  it("downloads the same figures as a spreadsheet, per load and grouped, in rand", async () => {
    const s = await get(U.O1, "vehicle_owner", `/owner/loading/report.csv?by=session&${ALL}`); expect(s.status).toBe(200); expect(s.type).toContain("text/csv"); expect(s.disposition).toContain("loads_2026-10-01_2026-10-07.csv");
    const lines = String(s.body).replace(/^\uFEFF/, "").trim().split("\r\n"); expect(lines[0]).toBe("Paired,Ended,Vehicle,Driver,Route,Place,Passengers,Collected (R),Fee (R),Net (R),In progress"); expect(lines).toHaveLength(5);
    expect(lines.find((l) => l.includes("2026-10-07T09:00"))).toBe("2026-10-07T09:00:00.000Z,,CA 111-111,Dee Driver,Langa to Bellville,Langa rank,1,25.00,1.00,24.00,yes");
    const g = await get(U.O1, "vehicle_owner", `/owner/loading/report.csv?by=driver&${ALL}`); expect(String(g.body).replace(/^\uFEFF/, "").trim().split("\r\n")).toEqual(["Driver,Trips,Passengers,Collected (R),Fee (R),Net (R)", "Dee Driver,3,5,125.00,5.00,120.00", "Dan Driver,1,2,50.00,2.00,48.00"]);
    expect((await get(U.O1, "vehicle_owner", "/owner/loading/report.csv?by=colour")).status).toBe(400);
  });
});
