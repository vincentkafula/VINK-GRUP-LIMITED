import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../domain/errors";
import { getTicket, issueTicket, listTickets, ticketKeyList } from "../domain/tickets";
import { actorOf, requireRole, type Deps } from "./app";

export async function ticketRoutes(app: FastifyInstance, { config, db }: Deps): Promise<void> {
  const read = requireRole("VIEWER", "AGENT", "OPERATOR");
  const sell = requireRole("AGENT", "OPERATOR");
  const signer = () => { if (!config.ticketSigner) throw new HttpError(503, "tickets_not_configured", "Single-trip tickets are not set up: the server has no ticket signing key (TICKET_SIGNING_KEY)."); return config.ticketSigner; };

  /** Sell a ticket for a card. The reply holds exactly what the encoding station writes onto the card. */
  app.post("/tickets", { preHandler: sell }, async (req, reply) => {
    const b = z.object({
      cardUid: z.string().min(1).max(40), routeId: z.number().int().default(0), priceCents: z.number().int(), validForMinutes: z.number().int().min(1).max(31 * 24 * 60),
      validFrom: z.string().datetime().optional(), method: z.enum(["CASH", "MOBILE_MONEY"]), reference: z.string().min(1).max(80),
    }).parse(req.body);
    const r = await issueTicket(db, actorOf(req), signer(), { cardUid: b.cardUid, routeId: b.routeId, priceCents: b.priceCents, validForSeconds: b.validForMinutes * 60, validFrom: b.validFrom ? new Date(b.validFrom) : undefined, method: b.method, reference: b.reference });
    return reply.code(r.replay ? 200 : 201).send({ ticket: r.ticket, dataHex: r.dataHex, signatureHex: r.signatureHex, keyId: r.keyId, replay: r.replay });
  });

  app.get("/tickets", { preHandler: read }, async (req) => {
    const q = z.object({ status: z.enum(["ISSUED", "USED", "VOID"]).optional(), take: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    return { tickets: await listTickets(db, q) };
  });
  app.get("/tickets/:id", { preHandler: read }, async (req) => ({ ticket: await getTicket(db, z.coerce.number().int().parse((req.params as { id: string }).id)) }));

  /** The public key(s) that check tickets. Safe to publish: they can verify a ticket but never make one. */
  app.get("/tickets-public-keys", { preHandler: read }, async () => ticketKeyList(signer()));
}
