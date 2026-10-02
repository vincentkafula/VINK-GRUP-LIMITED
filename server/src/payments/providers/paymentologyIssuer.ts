import type { IssuingProvider, IssuedCard, ProviderEvent } from "./types.js";
import { NotConfiguredError } from "./types.js";
import type { ProviderCredentials } from "../config.js";

/**
 * Paymentology issuing adapter: NOT IMPLEMENTED YET, on purpose.
 *
 * Paymentology is a card issuing and processing platform (an "issuer-processor"): it issues Visa/Mastercard cards
 * for us and calls our server in real time to approve or decline each purchase. It is not an acquirer, so it does
 * not take card payments from customers on a website (that needs a separate acquiring PSP).
 *
 * Their API reference and sandbox are only available to onboarded clients, so the request/response shapes,
 * authentication and webhook signature scheme are unknown to us and must NOT be guessed. To finish it:
 *   1. get sandbox credentials and the API/webhook documentation from Paymentology
 *   2. implement the methods below against their sandbox, mapping their events onto ProviderEvent
 *   3. run the shared contract tests (providers/contract.test.ts) against it
 * Until then every call fails loudly instead of pretending to work.
 */
export class PaymentologyIssuer implements IssuingProvider {
  readonly name = "paymentology";
  constructor(private readonly creds: ProviderCredentials) {}

  private unimplemented(op: string): never {
    throw new NotConfiguredError(`Paymentology ${op} is not implemented: it needs their API documentation and sandbox credentials (base URL ${this.creds.baseUrl}).`);
  }
  async createCard(): Promise<IssuedCard> { return this.unimplemented("createCard"); }
  async setCardStatus(): Promise<void> { return this.unimplemented("setCardStatus"); }
  verifyWebhook(): ProviderEvent { return this.unimplemented("verifyWebhook"); }
}
