import type { FastifyInstance } from "fastify";
import { CATEGORIES } from "@afc/shared";
import { z } from "zod";
import { cardHistory, cardView, listCards, normaliseUid, registerCard, setCardCategory, setCardStatus, UID_PATTERN } from "../domain/cards";
import { badRequest, HttpError } from "../domain/errors";
import { ADAPTERS } from "../domain/mobileMoney";
import { cancelTopup, confirmLoad, createTopupOrder, directLoad, handleMobileMoneyEvent, pendingLoads } from "../domain/topups";
import { actorOf, requireRole, type Deps } from "./app";

const uidParam = (s: unknown) => {
  const uid = normaliseUid(String(s));
  if (!UID_PATTERN.test(uid)) throw badRequest("bad_uid", "A card UID is 14 hex characters");
  return uid;
};

export async function cardRoutes(app: FastifyInstance, { config, db, hub }: Deps): Promise<void> {
  const read = requireRole("VIEWER", "AGENT", "OPERATOR");
  const issue = requireRole("AGENT", "OPERATOR");
  const manage = requireRole("OPERATOR");

  app.post("/cards", { preHandler: issue }, async (req, reply) => {
    const b = z.object({
      uid: z.string().min(1).max(40), type: z.enum(["DESFIRE", "ULTRALIGHT_TICKET"]).optional(), holderName: z.string().max(100).optional(),
      holderRef: z.string().max(60).optional(), category: z.enum(CATEGORIES).optional(), initialBalance: z.number().int().optional(),
    }).parse(req.body);
    const card = await registerCard(db, actorOf(req), b);
    return reply.code(201).send({ card });
  });

  app.get("/cards", { preHandler: read }, async (req) => {
    const q = z.object({ search: z.string().max(60).optional(), status: z.enum(["ACTIVE", "BLOCKED", "LOST", "EXPIRED"]).optional(), take: z.coerce.number().int().min(1).max(200).default(50), skip: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    return listCards(db, q);
  });

  app.get("/cards/:uid", { preHandler: read }, async (req) => ({ card: await cardView(db, uidParam((req.params as { uid: string }).uid)) }));
  app.get("/cards/:uid/history", { preHandler: read }, async (req) => cardHistory(db, uidParam((req.params as { uid: string }).uid)));

  app.patch("/cards/:uid/status", { preHandler: manage }, async (req) => {
    const b = z.object({ status: z.enum(["ACTIVE", "BLOCKED", "LOST", "EXPIRED"]), reason: z.string().max(200).optional() }).parse(req.body);
    return { card: await setCardStatus(db, actorOf(req), uidParam((req.params as { uid: string }).uid), b.status, b.reason) };
  });

  app.patch("/cards/:uid/category", { preHandler: manage }, async (req) => {
    const b = z.object({ category: z.enum(CATEGORIES), holderName: z.string().max(100).optional() }).parse(req.body);
    return { card: await setCardCategory(db, actorOf(req), uidParam((req.params as { uid: string }).uid), b.category, b.holderName) };
  });

  /* ───── top-ups ───── */
  const topupBody = z.object({ cardUid: z.string(), amount: z.number().int(), method: z.enum(["CASH", "MOBILE_MONEY", "ADMIN"]), reference: z.string().min(1).max(80), deviceId: z.string().max(32).optional() });

  app.post("/topups", { preHandler: issue }, async (req, reply) => {
    const b = topupBody.parse(req.body);
    if (b.method === "ADMIN" && req.user.role !== "ADMIN" && req.user.role !== "OPERATOR") throw new HttpError(403, "forbidden", "Only admins and operator staff can make manual adjustments");
    const r = await createTopupOrder(db, actorOf(req), { ...b, cardUid: uidParam(b.cardUid) }, hub);
    return reply.code(r.replay ? 200 : 201).send({ topup: r.topup, replay: r.replay });
  });

  /** For an agent terminal that took payment and credited the card in one go. */
  app.post("/topups/load", { preHandler: issue }, async (req, reply) => {
    const b = topupBody.extend({ cardBalanceAfter: z.number().int().min(0).optional() }).parse(req.body);
    if (b.method === "ADMIN" && req.user.role !== "ADMIN" && req.user.role !== "OPERATOR") throw new HttpError(403, "forbidden", "Only admins and operator staff can make manual adjustments");
    const r = await directLoad(db, actorOf(req), { ...b, cardUid: uidParam(b.cardUid) }, { cardBalanceAfter: b.cardBalanceAfter }, hub);
    return reply.code(r.replay ? 200 : 201).send({ topup: r.topup, replay: r.replay });
  });

  app.post("/topups/:id/confirm", { preHandler: issue }, async (req) => {
    const b = z.object({ deviceId: z.string().max(32).optional(), cardBalanceAfter: z.number().int().min(0).optional() }).parse(req.body ?? {});
    const r = await confirmLoad(db, actorOf(req), (req.params as { id: string }).id, b, hub);
    return { topup: r.topup, replay: r.already };
  });

  app.post("/topups/:id/cancel", { preHandler: manage }, async (req) => ({ topup: await cancelTopup(db, actorOf(req), (req.params as { id: string }).id) }));
  app.get("/cards/:uid/pending-loads", { preHandler: issue }, async (req) => ({ loads: await pendingLoads(db, uidParam((req.params as { uid: string }).uid)) }));
  app.get("/topups", { preHandler: read }, async (req) => {
    const q = z.object({ status: z.enum(["PENDING_LOAD", "LOADED", "CANCELLED"]).optional(), take: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    return { topups: await db.topup.findMany({ where: q.status ? { status: q.status } : {}, orderBy: { createdAt: "desc" }, take: q.take }) };
  });

  /* ───── mobile-money provider callback (placeholder: signed, idempotent, off until a secret is configured) ───── */
  await app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 64_000 }, (_req, body, done) => done(null, body));
    hook.post("/webhooks/mobile-money", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
      const secret = config.mobileMoneyWebhookSecret;
      const adapter = ADAPTERS[config.mobileMoneyProvider];
      if (!secret || !adapter) return reply.code(404).send({ error: { code: "not_found", message: "Not enabled" } });
      const e = adapter.parse({ headers: req.headers, rawBody: String(req.body ?? ""), secret });
      if (!e) return reply.code(401).send({ error: { code: "bad_signature", message: "The callback could not be verified" } });
      const r = await handleMobileMoneyEvent(db, { ...e, cardUid: uidParam(e.cardUid) }, hub);
      return { received: true, ...r };
    });
  });
}
