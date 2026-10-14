import type { Tx, Db } from "../db";

/** Version counters that tell devices their copy of the hotlist / card profiles is out of date. */
export type VersionKey = "hotlistVersion" | "profilesVersion";

export async function getVersion(db: Db | Tx, key: VersionKey): Promise<number> {
  return (await db.setting.findUnique({ where: { key } }))?.value ?? 0;
}

export async function bumpVersion(db: Db | Tx, key: VersionKey): Promise<number> {
  const row = await db.setting.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
}
