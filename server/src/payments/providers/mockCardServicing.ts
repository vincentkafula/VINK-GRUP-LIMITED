import crypto from "crypto";
import type { CardServicingProvider, ServicedCardDetails, ServicedCardStatus } from "./types.js";

/** Sandbox card servicing with no network. Stores only the card id and last4, never the PAN. */
export class MockCardServicing implements CardServicingProvider {
  readonly name = "mock";
  private cards = new Map<string, { last4: string; status: ServicedCardStatus }>();

  async registerCard({ primaryAccountNumber }: { primaryAccountNumber: string }): Promise<{ cardId: string }> {
    if (!/^[0-9]{16,19}$/.test(primaryAccountNumber)) throw new Error("primaryAccountNumber must be 16 to 19 digits");
    const cardId = "mock-" + crypto.randomUUID();
    this.cards.set(cardId, { last4: primaryAccountNumber.slice(-4), status: "active" });
    return { cardId };
  }
  private get(id: string) {
    const c = this.cards.get(id);
    if (!c) throw new Error("unknown card");
    return c;
  }
  async getCardStatus(cardId: string) { return { status: this.get(cardId).status, activationStatus: "ACTIVATED" }; }
  async setCardStatus(cardId: string, status: ServicedCardStatus) {
    const c = this.get(cardId);
    if (c.status === "blocked") throw new Error("a blocked card cannot be changed");
    c.status = status;
  }
  async getCardDetails(cardId: string): Promise<ServicedCardDetails> {
    const c = this.get(cardId);
    return { cardId, last4: c.last4, accounts: [{ accountId: "mock-account", accountNumberMasked: "••••0001", type: "Prepaid" }] };
  }
}
