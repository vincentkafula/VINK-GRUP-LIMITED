import crypto from "crypto";
import type { IssuingProvider, IssuedCard, AuthorisationRequest, AuthorisationDecision, ProviderEvent } from "./types.js";
import { ReplayGuard, verifySignedWebhook } from "./webhook.js";

/** Sandbox issuing provider. Behaves like a real issuer-processor would from our side, with no network. */
export const MOCK_WEBHOOK_SECRET = "sandbox-mock-issuer-secret";

export class MockIssuer implements IssuingProvider {
  readonly name = "mock";
  private cards = new Map<string, IssuedCard>();
  private guard = new ReplayGuard();
  constructor(private secret = MOCK_WEBHOOK_SECRET) {}

  async createCard({ kind }: { customerRef: string; kind: "physical" | "virtual" }): Promise<IssuedCard> {
    const now = new Date();
    const card: IssuedCard = {
      providerCardId: "mock_card_" + crypto.randomBytes(8).toString("hex"),
      last4: String(crypto.randomInt(0, 10000)).padStart(4, "0"),
      brand: crypto.randomInt(0, 2) ? "visa" : "mastercard",
      expiry: `${String(now.getMonth() + 1).padStart(2, "0")}/${String((now.getFullYear() + 4) % 100).padStart(2, "0")}`,
      status: kind === "virtual" ? "active" : "inactive",
    };
    this.cards.set(card.providerCardId, card);
    return card;
  }

  async setCardStatus(id: string, status: "active" | "frozen" | "blocked"): Promise<void> {
    const c = this.cards.get(id);
    if (!c) throw new Error("unknown card");
    if (c.status === "blocked") throw new Error("a blocked card cannot be changed");
    c.status = status;
  }

  /** What the issuer's real-time authorisation would decide: card status first, then sandbox scenario amounts. */
  authorise(req: AuthorisationRequest): AuthorisationDecision {
    const c = this.cards.get(req.providerCardId);
    if (!c) return { approved: false, reason: "unknown_card" };
    if (c.status !== "active") return { approved: false, reason: c.status === "frozen" ? "card_frozen" : "card_not_active" };
    if (req.amount.amount === 66600) return { approved: false, reason: "suspected_fraud" };
    if (req.amount.amount === 55500) return { approved: false, reason: "insufficient_funds" };
    return { approved: true };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderEvent {
    const h = (k: string) => { const v = headers[k]; return Array.isArray(v) ? v[0] : v; };
    return verifySignedWebhook({ secret: this.secret, rawBody, signature: h("x-signature"), timestamp: h("x-timestamp"), guard: this.guard });
  }
}
