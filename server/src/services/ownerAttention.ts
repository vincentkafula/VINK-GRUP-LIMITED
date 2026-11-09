import { createHash } from "node:crypto";
import type { Db } from "../portal/common.js";
import { createOwnerFinance } from "./ownerFinance.js";
import { createOwnerCompliance } from "./ownerCompliance.js";
import { createDriverTargets } from "./driverTargets.js";

/**
 * WHAT NEEDS THE OWNER, in one place (docs/OWNER_DASHBOARD.md): the money, servicing, compliance and driver-payment alerts that the dashboard, the in-app Notifications and the text messages all draw on, so they can never disagree about what needs attention.
 * Each alert has a stable id (so something already seen or already texted is recognised), an importance and a plain sentence. Only the family of alerts asked for is worked out.
 */
export type AttentionKind = "finance" | "service" | "compliance" | "arrears";
export interface Attention { id: string; severity: "high" | "medium" | "low"; message: string }
/** Which alerts belong to which family, by the start of their id. */
export const ATTENTION_PREFIX: Record<AttentionKind, string[]> = { finance: ["fin:", "fines:", "pl:"], service: ["mnt:"], compliance: ["cc:"], arrears: ["pay:"] };
const SEV = { high: 0, medium: 1, low: 2 } as const;

/** The alerts for the families asked for, most serious first, each once. Only high and medium importance are returned: a low note is for the dashboard, not for a message. */
export async function gatherAttention(db: Db, now: () => Date, owner: string, kinds: AttentionKind[], onDay: string): Promise<Attention[]> {
  const all: Attention[] = [];
  if (kinds.includes("finance")) all.push(...(await createOwnerFinance(db, now).finances(owner, onDay)).flags, ...((await createOwnerFinance(db, now).overview(owner, onDay)).flags));
  if (kinds.includes("service")) all.push(...(await createOwnerFinance(db, now).maintenanceStatus(owner, onDay)).flags);
  if (kinds.includes("compliance")) all.push(...((await createOwnerCompliance(db, now).centre(owner, onDay)) as { flags: Attention[] }).flags);
  if (kinds.includes("arrears")) all.push(...((await createDriverTargets(db, now).fleet(owner, onDay)) as { flags: Attention[] }).flags);
  const seen = new Set<string>();
  return all.filter((f) => (f.severity === "high" || f.severity === "medium") && kinds.some((k) => ATTENTION_PREFIX[k].some((p) => f.id.startsWith(p))) && !seen.has(f.id) && !!seen.add(f.id)).sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.message.localeCompare(b.message));
}

/** A short heading for an alert, from its id. */
export function attentionTitle(id: string): string {
  if (id.startsWith("fin:due:")) return "An instalment is coming up"; if (id.startsWith("fin:missing:")) return "An instalment has not been recorded"; if (id.startsWith("fin:")) return "A loan needs attention";
  if (id.startsWith("fines:")) return "Fines are unpaid"; if (id.startsWith("pl:")) return "A vehicle is losing money"; if (id.startsWith("mnt:")) return "Servicing needs attention"; if (id.startsWith("pay:")) return "A driver's payments need attention"; return "Needs attention";
}
/** The key under which the owner's "I have read it" is kept. It includes a fingerprint of the wording, so when the situation changes (for example the number of unpaid fines) it shows as new again, and an unchanged one stays read. */
export function attentionKey(a: Attention): string { return `alert-${a.id}-${createHash("sha1").update(a.message).digest("hex").slice(0, 8)}`; }
