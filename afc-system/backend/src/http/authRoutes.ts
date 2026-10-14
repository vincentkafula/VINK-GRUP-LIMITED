import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { passwordProblem, hashPassword, verifyPassword } from "../auth/password";
import { audit } from "../domain/audit";
import { badRequest, conflict, HttpError, notFound } from "../domain/errors";
import { actorOf, requireRole, type Deps, type Role } from "./app";

const DUMMY_HASH = "scrypt$16384$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

export async function authRoutes(app: FastifyInstance, { config, db }: Deps): Promise<void> {
  app.post("/auth/login", { config: { rateLimit: { max: config.loginRateLimit, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const { email, password } = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).parse(req.body);
    const user = await db.adminUser.findUnique({ where: { email: email.toLowerCase() } });
    const now = new Date();
    if (user?.lockedUntil && user.lockedUntil > now) throw new HttpError(423, "locked", "Too many failed attempts. Try again later.");
    // always run a hash comparison so timing does not reveal whether the account exists
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.active || !ok) {
      if (user) {
        const failed = user.failedLogins + 1;
        const lock = failed >= config.loginMaxFailures;
        await db.adminUser.update({ where: { id: user.id }, data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + config.loginLockMinutes * 60_000) : user.lockedUntil } });
        await audit(db, { email: user.email, ip: req.ip }, lock ? "auth.locked" : "auth.failed");
      }
      return reply.code(401).send({ error: { code: "invalid_credentials", message: "Wrong email or password" } });
    }
    await db.adminUser.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    const token = await reply.jwtSign({ sub: user.id, email: user.email, role: user.role as Role, operatorId: user.operatorId ?? undefined });
    await audit(db, { id: user.id, email: user.email, ip: req.ip }, "auth.login");
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role, operatorId: user.operatorId } };
  });

  app.get("/auth/me", { preHandler: requireRole("VIEWER", "AGENT", "OPERATOR") }, async (req) => ({ user: req.user }));

  app.post("/auth/password", { preHandler: requireRole("VIEWER", "AGENT", "OPERATOR") }, async (req) => {
    const { current, next } = z.object({ current: z.string(), next: z.string() }).parse(req.body);
    const user = await db.adminUser.findUnique({ where: { id: req.user.sub } });
    if (!user || !(await verifyPassword(current, user.passwordHash))) throw new HttpError(401, "invalid_credentials", "The current password is wrong");
    const problem = passwordProblem(next);
    if (problem) throw badRequest("weak_password", problem);
    await db.adminUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
    await audit(db, actorOf(req), "auth.password");
    return { ok: true };
  });

  /* ───── staff accounts (admins only) ───── */
  const roleEnum = z.enum(["ADMIN", "OPERATOR", "AGENT", "VIEWER"]);
  app.get("/users", { preHandler: requireRole() }, async () => ({ users: (await db.adminUser.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true, name: true, role: true, operatorId: true, active: true, createdAt: true } })) }));

  app.post("/users", { preHandler: requireRole() }, async (req, reply) => {
    const b = z.object({ email: z.string().email().max(200), name: z.string().min(1).max(100), password: z.string(), role: roleEnum, operatorId: z.number().int().optional() }).parse(req.body);
    const problem = passwordProblem(b.password);
    if (problem) throw badRequest("weak_password", problem);
    if (b.role === "OPERATOR" && b.operatorId === undefined) throw badRequest("operator_required", "Operator staff must belong to an operator");
    if (await db.adminUser.findUnique({ where: { email: b.email.toLowerCase() } })) throw conflict("user_exists", "A user with that email already exists");
    const u = await db.adminUser.create({ data: { email: b.email.toLowerCase(), name: b.name, role: b.role, operatorId: b.operatorId, passwordHash: await hashPassword(b.password) } });
    await audit(db, actorOf(req), "user.create", u.id, { role: u.role });
    return reply.code(201).send({ user: { id: u.id, email: u.email, name: u.name, role: u.role, operatorId: u.operatorId } });
  });

  app.patch("/users/:id", { preHandler: requireRole() }, async (req) => {
    const { id } = req.params as { id: string };
    const b = z.object({ role: roleEnum.optional(), active: z.boolean().optional(), password: z.string().optional() }).parse(req.body);
    if (id === req.user.sub && (b.active === false || (b.role && b.role !== "ADMIN"))) throw badRequest("self_lockout", "You cannot remove your own admin access");
    if (b.password !== undefined) { const p = passwordProblem(b.password); if (p) throw badRequest("weak_password", p); }
    const u = await db.adminUser.update({ where: { id }, data: { role: b.role, active: b.active, ...(b.password ? { passwordHash: await hashPassword(b.password), failedLogins: 0, lockedUntil: null } : {}) } }).catch(() => null);
    if (!u) throw notFound("User");
    await audit(db, actorOf(req), "user.update", id, { role: b.role, active: b.active, passwordReset: !!b.password });
    return { user: { id: u.id, email: u.email, role: u.role, active: u.active } };
  });

  app.get("/audit", { preHandler: requireRole() }, async (req) => {
    const q = z.object({ take: z.coerce.number().int().min(1).max(500).default(100), before: z.coerce.bigint().optional() }).parse(req.query);
    const rows = await db.auditLog.findMany({ where: q.before ? { id: { lt: q.before } } : {}, orderBy: { id: "desc" }, take: q.take });
    return { entries: rows.map((r) => ({ ...r, id: r.id.toString() })) };
  });
}
