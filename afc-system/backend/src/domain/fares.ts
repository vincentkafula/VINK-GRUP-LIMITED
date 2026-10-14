import type { DiscountRule, FareTable, Route as FareRoute, TimeRule, Category } from "@afc/shared";
import { CATEGORIES } from "@afc/shared";
import { z } from "zod";
import type { Db, Tx } from "../db";
import { Prisma } from "../db";
import { type Actor, audit } from "./audit";
import { badRequest, conflict, notFound } from "./errors";

/* ───────── validation ───────── */

const cents = z.number().int().min(0).max(1_000_000);
const stopSchema = z.object({ id: z.number().int().min(1).max(65535), name: z.string().min(1).max(80), zone: z.number().int().min(1).max(50), seq: z.number().int().min(1).max(500) });
export const routeSchema = z.object({
  id: z.number().int().min(1).max(65535),
  code: z.string().min(1).max(16),
  name: z.string().min(1).max(80),
  operatorId: z.number().int().min(1),
  apbSeconds: z.number().int().min(0).max(3600).default(120),
  tapOutTimeoutSeconds: z.number().int().min(300).max(86400).default(14400),
  active: z.boolean().default(true),
  stops: z.array(stopSchema).min(1).max(200),
  fare: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("flat"), flatAmount: cents }),
    z.object({
      mode: z.literal("zone"), minFare: cents, maxFare: cents,
      zoneFares: z.array(z.object({ from: z.number().int().min(1), to: z.number().int().min(1), amount: cents })).max(400),
    }),
  ]),
}).superRefine((r, ctx) => {
  const f = r.fare;
  if (f.mode === "zone") {
    if (f.minFare > f.maxFare) ctx.addIssue({ code: "custom", message: "The minimum fare cannot be above the maximum fare" });
    if (f.zoneFares.some((z) => z.amount > f.maxFare)) ctx.addIssue({ code: "custom", message: "No zone fare can be above the maximum fare" });
    const seen = new Set<string>();
    for (const z of f.zoneFares) { const k = [Math.min(z.from, z.to), Math.max(z.from, z.to)].join("-"); if (seen.has(k)) ctx.addIssue({ code: "custom", message: `Zone pair ${k} is listed twice` }); seen.add(k); }
  }
  if (new Set(r.stops.map((s) => s.id)).size !== r.stops.length) ctx.addIssue({ code: "custom", message: "Stop numbers must be different" });
});
export type RouteInput = z.infer<typeof routeSchema>;

export const timeRuleSchema = z.object({
  name: z.string().min(1).max(60), days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), multiplierBp: z.number().int().min(0).max(30000),
}).refine((r) => r.endMinute > r.startMinute, { message: "The end time must be after the start time" });
export const discountSchema = z.object({ category: z.enum(CATEGORIES), discountBp: z.number().int().min(0).max(10000) });

/* ───────── reading ───────── */

/** The fare table as it stands in the database now (a draft until published). `version` is the NEXT version number. */
export async function draftFareTable(db: Db | Tx): Promise<FareTable> {
  const [routes, rules, discounts, last] = await Promise.all([
    db.route.findMany({ where: { active: true }, include: { stops: { orderBy: { seq: "asc" } }, zoneFares: true }, orderBy: { id: "asc" } }),
    db.timeRule.findMany({ orderBy: { id: "asc" } }),
    db.discountRule.findMany(),
    db.fareTableVersion.findFirst({ orderBy: { version: "desc" }, select: { version: true } }),
  ]);
  const table: FareTable = {
    version: (last?.version ?? 0) + 1,
    currency: "ZAR",
    utcOffsetMinutes: 120,
    publishedAt: new Date().toISOString(),
    routes: routes.map((r): FareRoute => ({
      id: r.id, code: r.code, name: r.name, operatorId: r.operatorId, apbSeconds: r.apbSeconds, tapOutTimeoutSeconds: r.tapOutTimeoutSeconds,
      stops: r.stops.map((s) => ({ id: s.id, name: s.name, zone: s.zone, seq: s.seq })),
      fare: r.mode === "FLAT" ? { mode: "flat", flatAmount: r.flatAmount ?? 0 } : { mode: "zone", minFare: r.minFare, maxFare: r.maxFare, zoneFares: r.zoneFares.map((z) => ({ from: z.fromZone, to: z.toZone, amount: z.amount })) },
    })),
    timeRules: rules.map((t): TimeRule => ({ id: t.id, name: t.name, days: t.days, startMinute: t.startMinute, endMinute: t.endMinute, multiplierBp: t.multiplierBp })),
    discounts: discounts.map((d): DiscountRule => ({ category: d.category as Category, discountBp: d.discountBp })),
  };
  return table;
}

export async function publishedFareTable(db: Db | Tx, version?: number): Promise<FareTable | null> {
  const row = version ? await db.fareTableVersion.findUnique({ where: { version } }) : await db.fareTableVersion.findFirst({ orderBy: { version: "desc" } });
  return row ? (row.json as unknown as FareTable) : null;
}

export async function currentFareVersion(db: Db | Tx): Promise<number> {
  return (await db.fareTableVersion.findFirst({ orderBy: { version: "desc" }, select: { version: true } }))?.version ?? 0;
}

/** Freezes the current rules as the next version. Devices pick it up on their next sync. */
export async function publishFareTable(db: Db, actor: Actor) {
  return db.$transaction(async (tx) => {
    const t = await draftFareTable(tx);
    if (t.routes.length === 0) throw badRequest("no_routes", "Add at least one active route before publishing");
    await tx.fareTableVersion.create({ data: { version: t.version, json: t as unknown as Prisma.InputJsonValue, publishedBy: actor.id } });
    await audit(tx, actor, "fares.publish", String(t.version), { routes: t.routes.length });
    return t;
  });
}

/* ───────── editing ───────── */

export async function upsertRoute(db: Db, actor: Actor, input: RouteInput, scopeOperatorId?: number) {
  if (scopeOperatorId !== undefined && input.operatorId !== scopeOperatorId) throw badRequest("wrong_operator", "You can only manage routes of your own operator");
  return db.$transaction(async (tx) => {
    const existing = await tx.route.findUnique({ where: { id: input.id } });
    if (existing && scopeOperatorId !== undefined && existing.operatorId !== scopeOperatorId) throw notFound("Route");
    if (!(await tx.operator.findUnique({ where: { id: input.operatorId } }))) throw badRequest("no_operator", "That operator does not exist");
    const clash = await tx.route.findFirst({ where: { code: input.code, NOT: { id: input.id } } });
    if (clash) throw conflict("code_taken", `Route code ${input.code} is already used`);
    const otherStops = await tx.stop.findMany({ where: { id: { in: input.stops.map((s) => s.id) }, NOT: { routeId: input.id } }, select: { id: true } });
    if (otherStops.length) throw conflict("stop_taken", `Stop number ${otherStops[0].id} belongs to another route`);

    const f = input.fare;
    const data = {
      code: input.code, name: input.name, operatorId: input.operatorId, apbSeconds: input.apbSeconds, tapOutTimeoutSeconds: input.tapOutTimeoutSeconds, active: input.active,
      mode: f.mode === "flat" ? ("FLAT" as const) : ("ZONE" as const),
      flatAmount: f.mode === "flat" ? f.flatAmount : null,
      minFare: f.mode === "zone" ? f.minFare : 0, maxFare: f.mode === "zone" ? f.maxFare : 0,
    };
    await tx.route.upsert({ where: { id: input.id }, create: { id: input.id, ...data }, update: data });
    await tx.stop.deleteMany({ where: { routeId: input.id } });
    await tx.zoneFare.deleteMany({ where: { routeId: input.id } });
    await tx.stop.createMany({ data: input.stops.map((s) => ({ ...s, routeId: input.id })) });
    if (f.mode === "zone" && f.zoneFares.length) await tx.zoneFare.createMany({ data: f.zoneFares.map((z) => ({ routeId: input.id, fromZone: z.from, toZone: z.to, amount: z.amount })) });
    await audit(tx, actor, existing ? "route.update" : "route.create", String(input.id), { code: input.code, mode: f.mode });
    return input.id;
  });
}

export async function deactivateRoute(db: Db, actor: Actor, id: number, scopeOperatorId?: number) {
  return db.$transaction(async (tx) => {
    const r = await tx.route.findUnique({ where: { id } });
    if (!r || (scopeOperatorId !== undefined && r.operatorId !== scopeOperatorId)) throw notFound("Route");
    await tx.route.update({ where: { id }, data: { active: false } });
    await audit(tx, actor, "route.deactivate", String(id));
  });
}

export async function replaceTimeRules(db: Db, actor: Actor, rules: z.infer<typeof timeRuleSchema>[]) {
  return db.$transaction(async (tx) => {
    await tx.timeRule.deleteMany();
    await tx.timeRule.createMany({ data: rules });
    await audit(tx, actor, "fares.timerules", undefined, { count: rules.length });
  });
}

export async function replaceDiscounts(db: Db, actor: Actor, discounts: z.infer<typeof discountSchema>[]) {
  return db.$transaction(async (tx) => {
    for (const d of discounts) await tx.discountRule.upsert({ where: { category: d.category }, create: d, update: { discountBp: d.discountBp } });
    await audit(tx, actor, "fares.discounts", undefined, { count: discounts.length });
  });
}
