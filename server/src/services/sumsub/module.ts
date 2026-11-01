import type { Db } from "../../portal/driverRoutes.js";
import { sumsubConfigFromEnv } from "./config.js";
import { createSumsubClient } from "./client.js";
import { createIdentity } from "./identity.js";
import { applicationSubject, sponsorshipSubject } from "./subjects.js";
import { createSumsubWebhookRouter } from "./webhook.js";

/** The whole identity-check system from a database and the environment: server start-up and the tests both build it here, so they cannot wire it differently. */
export function createIdentityModule(d: { db: Db; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: () => Date }) {
  const config = sumsubConfigFromEnv(d.env ?? process.env);
  const client = createSumsubClient({ config, fetchImpl: d.fetchImpl, now: d.now });
  const subjects = [applicationSubject(d.db), sponsorshipSubject(d.db)];
  const identity = createIdentity({ db: d.db, config, client, now: d.now, subjects });                          // is the PERSON applying who they say?
  const kyb = createIdentity({ db: d.db, config, client, now: d.now, subjects, party: "company" });          // is the BUSINESS behind a business or corporate application real? (KYB)
  // One webhook serves both: an event is offered to the person check, and if that is not its applicant, to the business check.
  const events = { applyEvent: async (payload: unknown) => { const r = await identity.applyEvent(payload); return r.ok && r.ignored === "unknown applicant" ? kyb.applyEvent(payload) : r; } };
  return { identity, kyb, config, webhookRouter: createSumsubWebhookRouter({ identity: events, config }) };
}
export type IdentityModule = ReturnType<typeof createIdentityModule>;
