import type { PaymentsConfig } from "../config.js";
import type { IssuingProvider, CardServicingProvider } from "./types.js";
import { VisaDpsServicing, xPayAuthenticator } from "./visaDps.js";
import { MockCardServicing } from "./mockCardServicing.js";
import { MockIssuer } from "./mockIssuer.js";
import { PaymentologyIssuer } from "./paymentologyIssuer.js";

export function getIssuingProvider(cfg: PaymentsConfig): IssuingProvider {
  switch (cfg.issuingProvider) {
    case "mock": return new MockIssuer();
    case "paymentology": return new PaymentologyIssuer(cfg.paymentology!);   // config validation guarantees credentials
  }
}

export function getCardServicingProvider(cfg: PaymentsConfig): CardServicingProvider {
  switch (cfg.cardServicingProvider) {
    case "mock": return new MockCardServicing();
    case "visa_dps": {
      const v = cfg.visaDps!;   // config validation guarantees credentials
      return new VisaDpsServicing({ baseUrl: v.baseUrl, programType: v.programType, authenticate: xPayAuthenticator(v.apiKey, v.sharedSecret) });
    }
  }
}
