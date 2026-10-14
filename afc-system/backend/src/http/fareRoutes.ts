import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { deactivateRoute, discountSchema, draftFareTable, publishedFareTable, publishFareTable, replaceDiscounts, replaceTimeRules, routeSchema, timeRuleSchema, upsertRoute } from "../domain/fares";
import { notFound } from "../domain/errors";
import { actorOf, operatorScope, requireRole, type Deps } from "./app";

export async function fareRoutes(app: FastifyInstance, { db }: Deps): Promise<void> {
  const read = requireRole("VIEWER", "AGENT", "OPERATOR");
  const edit = requireRole("OPERATOR");

  app.get("/fares/draft", { preHandler: read }, async () => ({ table: await draftFareTable(db) }));
  app.get("/fares/published", { preHandler: read }, async () => ({ table: await publishedFareTable(db) }));
  app.get("/operators", { preHandler: read }, async () => ({ operators: await db.operator.findMany({ orderBy: { id: "asc" } }) }));

  app.post("/fares/publish", { preHandler: edit }, async (req, reply) => reply.code(201).send({ table: await publishFareTable(db, actorOf(req)) }));

  app.post("/fares/routes", { preHandler: edit }, async (req, reply) => {
    const id = await upsertRoute(db, actorOf(req), routeSchema.parse(req.body), operatorScope(req));
    return reply.code(201).send({ id });
  });
  app.put("/fares/routes/:id", { preHandler: edit }, async (req) => {
    const id = z.coerce.number().int().parse((req.params as { id: string }).id);
    const body = routeSchema.parse(req.body);
    if (body.id !== id) throw notFound("Route");
    return { id: await upsertRoute(db, actorOf(req), body, operatorScope(req)) };
  });
  app.delete("/fares/routes/:id", { preHandler: edit }, async (req) => {
    await deactivateRoute(db, actorOf(req), z.coerce.number().int().parse((req.params as { id: string }).id), operatorScope(req));
    return { ok: true };
  });

  // time-of-day rules and passenger discounts apply to every operator, so only a full admin changes them
  app.put("/fares/time-rules", { preHandler: requireRole() }, async (req) => {
    await replaceTimeRules(db, actorOf(req), z.array(timeRuleSchema).max(50).parse(req.body));
    return { ok: true };
  });
  app.put("/fares/discounts", { preHandler: requireRole() }, async (req) => {
    await replaceDiscounts(db, actorOf(req), z.array(discountSchema).max(10).parse(req.body));
    return { ok: true };
  });

  app.get("/anomalies", { preHandler: read }, async (req) => {
    const q = z.object({ open: z.enum(["1", "0"]).optional(), take: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    return { anomalies: await db.anomaly.findMany({ where: q.open === "1" ? { resolvedAt: null } : {}, orderBy: { createdAt: "desc" }, take: q.take }) };
  });
  app.post("/anomalies/:id/resolve", { preHandler: edit }, async (req) => {
    const id = (req.params as { id: string }).id;
    const r = await db.anomaly.updateMany({ where: { id, resolvedAt: null }, data: { resolvedAt: new Date() } });
    if (!r.count) throw notFound("Open anomaly");
    return { ok: true };
  });
}
