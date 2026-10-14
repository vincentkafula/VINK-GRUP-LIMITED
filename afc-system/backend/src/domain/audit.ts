import type { Db, Tx } from "../db";
import { Prisma } from "../db";

export interface Actor { id?: string; email: string; ip?: string }
export const SYSTEM: Actor = { email: "system" };

/** Every staff action that changes something is written here: who, what, to what, and the details. Append-only by convention and by DB role grants in production. */
export async function audit(db: Db | Tx, actor: Actor, action: string, target?: string, detail?: Record<string, unknown>): Promise<void> {
  await db.auditLog.create({ data: { actorId: actor.id, actorEmail: actor.email, action, target, detail: detail as Prisma.InputJsonValue | undefined, ip: actor.ip } });
}
