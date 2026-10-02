import type { PaymentsConfig } from "../config.js";
import type { IssuingProvider } from "./types.js";
import { MockIssuer } from "./mockIssuer.js";
import { PaymentologyIssuer } from "./paymentologyIssuer.js";

export function getIssuingProvider(cfg: PaymentsConfig): IssuingProvider {
  switch (cfg.issuingProvider) {
    case "mock": return new MockIssuer();
    case "paymentology": return new PaymentologyIssuer(cfg.paymentology!);   // config validation guarantees credentials
  }
}
