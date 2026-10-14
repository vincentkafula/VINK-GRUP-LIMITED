import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { Config } from "../config";
import type { Db } from "../db";
import { Prisma } from "../db";
import type { Actor } from "../domain/audit";
import { HttpError, forbidden } from "../domain/errors";
import { FeedHub } from "../domain/events";
import { LedgerError } from "../domain/ledger";
import { authRoutes } from "./authRoutes";
import { cardRoutes } from "./cardRoutes";
import { deviceRoutes } from "./deviceRoutes";
import { fareRoutes } from "./fareRoutes";
import { feedRoutes } from "./feedRoutes";
import { reportRoutes } from "./reportRoutes";

export type Role = "ADMIN" | "OPERATOR" | "AGENT" | "VIEWER";
export interface JwtUser { sub: string; email: string; role: Role; operatorId?: number }

declare module "@fastify/jwt" {
  interface FastifyJWT { payload: JwtUser; user: JwtUser }
}

export interface Deps { config: Config; db: Db; hub: FeedHub }

/** Requires a signed-in staff member whose role is one of `roles` (ADMIN is always allowed). */
export const requireRole = (...roles: Role[]) => async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: { code: "unauthorized", message: "Sign in to continue" } }); }
  if (req.user.role !== "ADMIN" && !roles.includes(req.user.role)) throw forbidden();
};

export const actorOf = (req: FastifyRequest): Actor => ({ id: req.user.sub, email: req.user.email, ip: req.ip });

/** Operator staff see and change only their own operator's routes and money. Admins see everything. */
export const operatorScope = (req: FastifyRequest): number | undefined => (req.user.role === "OPERATOR" ? req.user.operatorId ?? -1 : undefined);

export async function buildApp(deps: Omit<Deps, "hub"> & { hub?: FeedHub }, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const hub = deps.hub ?? new FeedHub();
  const d: Deps = { ...deps, hub };
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 1_000_000 });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: d.config.corsOrigin.split(",").map((s) => s.trim()), methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], credentials: false });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(jwt, { secret: d.config.jwtSecret, sign: { expiresIn: "8h" } });
  await app.register(websocket);

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof ZodError) return reply.code(400).send({ error: { code: "invalid_input", message: err.issues[0]?.message ?? "Invalid input", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } });
    if (err instanceof LedgerError) return reply.code(409).send({ error: { code: err.code.toLowerCase(), message: err.message } });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return reply.code(409).send({ error: { code: "duplicate", message: "That already exists" } });
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: { code: e.code?.toLowerCase() ?? "bad_request", message: e.message ?? "Bad request" } });
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: { code: "server_error", message: "Something went wrong on our side" } });
  });

  app.get("/health", async (_req, reply) => {
    try { await d.db.$queryRaw`SELECT 1`; return { ok: true }; } catch { return reply.code(503).send({ ok: false }); }
  });

  await app.register(async (api) => authRoutes(api, d), { prefix: "/api" });
  await app.register(async (api) => cardRoutes(api, d), { prefix: "/api" });
  await app.register(async (api) => fareRoutes(api, d), { prefix: "/api" });
  await app.register(async (api) => deviceRoutes(api, d), { prefix: "/api" });
  await app.register(async (api) => reportRoutes(api, d), { prefix: "/api" });
  await app.register(async (api) => feedRoutes(api, d), { prefix: "/api" });
  return app;
}
