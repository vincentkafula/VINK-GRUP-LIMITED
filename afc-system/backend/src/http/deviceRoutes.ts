import { deviceSecret, MAX_CLOCK_SKEW_SECONDS, signRequest, verifySignature } from "@afc/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { isUniqueViolation } from "../db";
import { listDevices, registerDevice, revokeDevice, rotateDeviceSecret } from "../domain/devices";
import { processBatch, syncExtras, syncSchema } from "../domain/sync";
import { ticketKeyList } from "../domain/tickets";
import { actorOf, requireRole, type Deps } from "./app";

export async function deviceRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { config, db, hub } = deps;
  const read = requireRole("VIEWER", "AGENT", "OPERATOR");
  const manage = requireRole("OPERATOR");

  /* ───── staff: the device register ───── */
  app.get("/devices", { preHandler: read }, async () => ({ devices: await listDevices(db) }));
  app.post("/devices", { preHandler: manage }, async (req, reply) => {
    const b = z.object({ id: z.string(), name: z.string().min(1).max(80), routeId: z.number().int().optional() }).parse(req.body);
    const r = await registerDevice(db, actorOf(req), config.deviceKeyMaster, b);
    return reply.code(201).send({ device: r.device, secret: r.secret, note: "Copy the secret into the device now. It is not stored and cannot be shown again; rotate it to get a new one." });
  });
  app.post("/devices/:id/rotate", { preHandler: manage }, async (req) => {
    const r = await rotateDeviceSecret(db, actorOf(req), config.deviceKeyMaster, (req.params as { id: string }).id);
    return { device: r.device, secret: r.secret };
  });
  app.post("/devices/:id/revoke", { preHandler: manage }, async (req) => ({ device: await revokeDevice(db, actorOf(req), (req.params as { id: string }).id, hub) }));

  /* ───── devices: signed sync ───── */
  await app.register(async (dev) => {
    // the body is kept as the exact text the device signed
    dev.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 2_000_000 }, (_req, body, done) => done(null, body));

    const deny = (reply: FastifyReply, why: string) => reply.code(401).send({ error: { code: "unauthorized_device", message: "The device could not be verified" }, ...(deps.config.env === "test" ? { why } : {}) });

    dev.post("/device/sync", { config: { rateLimit: { max: 120, timeWindow: "1 minute", keyGenerator: (r: FastifyRequest) => String(r.headers["x-device-id"] ?? r.ip) } } }, async (req, reply) => {
      const deviceId = String(req.headers["x-device-id"] ?? "");
      const ts = Number(req.headers["x-timestamp"]);
      const nonce = String(req.headers["x-nonce"] ?? "");
      const sig = String(req.headers["x-signature"] ?? "");
      const raw = String(req.body ?? "");
      if (!deviceId || !Number.isFinite(ts) || !/^[A-Za-z0-9-]{16,64}$/.test(nonce)) return deny(reply, "missing headers");

      const device = await db.device.findUnique({ where: { id: deviceId } });
      const secret = deviceSecret(config.deviceKeyMaster, deviceId, device?.rotation ?? 0);
      // same answer for an unknown device, a revoked one and a bad signature, so the endpoint reveals nothing about which devices exist
      if (!device || device.status !== "ACTIVE" || !verifySignature(secret, ts, nonce, raw, sig)) return deny(reply, "bad signature or unknown/revoked device");
      if (Math.abs(Date.now() / 1000 - ts) > MAX_CLOCK_SKEW_SECONDS) return deny(reply, "timestamp outside the allowed window");
      try { await db.deviceNonce.create({ data: { deviceId, nonce, expiresAt: new Date(Date.now() + 2 * MAX_CLOCK_SKEW_SECONDS * 1000) } }); }
      catch (e) { if (isUniqueViolation(e)) return deny(reply, "replayed request"); throw e; }
      if (Math.random() < 0.02) void db.deviceNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

      const body = syncSchema.parse(JSON.parse(raw));
      if (body.deviceId !== deviceId) return deny(reply, "device id mismatch");
      const result = await processBatch({ db, hub, autoBlockAt: config.autoBlockHighAnomalies }, deviceId, body.batch);
      const extras = await syncExtras(db, body, config.ticketSigner ? ticketKeyList(config.ticketSigner) : undefined);
      const fv = extras.fareTable?.version ?? body.fareTableVersion;
      if (fv !== device.fareVersion) await db.device.update({ where: { id: deviceId }, data: { fareVersion: fv } });

      const out = JSON.stringify({ ...result, serverTime: new Date().toISOString(), ...extras });
      // the reply is signed too: a device must not accept a hotlist or fare table that someone injected on the way
      const st = Math.floor(Date.now() / 1000);
      return reply.header("content-type", "application/json").header("x-server-timestamp", String(st)).header("x-response-signature", signRequest(secret, st, nonce, out)).send(out);
    });
  });
}
