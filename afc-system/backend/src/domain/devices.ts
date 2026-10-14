import { deviceSecret } from "@afc/shared";
import type { Db } from "../db";
import { isUniqueViolation } from "../db";
import { type Actor, audit } from "./audit";
import { badRequest, conflict, notFound } from "./errors";
import type { FeedHub } from "./events";

export const DEVICE_ID = /^[A-Za-z0-9_-]{3,32}$/;

/** Registers a validator and returns its signing secret ONCE. The secret is derived from the server master key, so it is never stored. */
export async function registerDevice(db: Db, actor: Actor, master: Buffer, i: { id: string; name: string; routeId?: number }) {
  if (!DEVICE_ID.test(i.id)) throw badRequest("bad_device_id", "Device ids are 3-32 letters, digits, - or _");
  if (i.routeId !== undefined && !(await db.route.findUnique({ where: { id: i.routeId } }))) throw badRequest("no_route", "That route does not exist");
  try {
    const d = await db.device.create({ data: { id: i.id, name: i.name, routeId: i.routeId } });
    await audit(db, actor, "device.register", d.id, { name: d.name });
    return { device: d, secret: deviceSecret(master, d.id, d.rotation).toString("hex") };
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("device_exists", "A device with that id already exists");
    throw e;
  }
}

/** New secret; the old one stops working immediately. Use after a device is lost, stolen, or opened. */
export async function rotateDeviceSecret(db: Db, actor: Actor, master: Buffer, id: string) {
  const d = await db.device.update({ where: { id }, data: { rotation: { increment: 1 }, status: "ACTIVE" } }).catch(() => null);
  if (!d) throw notFound("Device");
  await audit(db, actor, "device.rotate", id, { rotation: d.rotation });
  return { device: d, secret: deviceSecret(master, d.id, d.rotation).toString("hex") };
}

export async function revokeDevice(db: Db, actor: Actor, id: string, hub?: FeedHub) {
  const d = await db.device.update({ where: { id }, data: { status: "REVOKED", rotation: { increment: 1 } } }).catch(() => null);
  if (!d) throw notFound("Device");
  await audit(db, actor, "device.revoke", id);
  hub?.publish({ type: "device", at: new Date().toISOString(), deviceId: id, status: "REVOKED" });
  return d;
}

export const listDevices = (db: Db) => db.device.findMany({ orderBy: { id: "asc" } });
