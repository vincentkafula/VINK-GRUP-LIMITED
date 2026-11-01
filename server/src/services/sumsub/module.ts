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
  const identity = createIdentity({ db: d.db, config, client, now: d.now, subjects: [applicationSubject(d.db), sponsorshipSubject(d.db)] });
  return { identity, config, webhookRouter: createSumsubWebhookRouter({ identity, config }) };
}
export type IdentityModule = ReturnType<typeof createIdentityModule>;
