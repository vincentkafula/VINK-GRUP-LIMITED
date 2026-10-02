import type { PaymentsConfig } from "../config.js";
import type { IssuingProvider, CardServicingProvider, AccountValidationProvider } from "./types.js";
import { VisaPavValidation } from "./visaPav.js";
import { MockAccountValidation } from "./mockAccountValidation.js";
import { VisaDpsServicing } from "./visaDps.js";
import { buildVisaAuth } from "./visaAuth.js";
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
      return new VisaDpsServicing({ baseUrl: v.baseUrl, programType: v.programType, ...buildVisaAuth(v.auth) });
    }
  }
}

export function getAccountValidationProvider(cfg: PaymentsConfig): AccountValidationProvider {
  switch (cfg.accountValidationProvider) {
    case "mock": return new MockAccountValidation();
    case "visa_pav": {
      const v = cfg.visaPav!;   // config validation guarantees credentials
      return new VisaPavValidation({
        baseUrl: v.baseUrl, ...buildVisaAuth(v.auth), acquiringBin: v.acquiringBin, acquirerCountryCode: v.acquirerCountryCode,
        cardAcceptor: { name: v.acceptorName, idCode: v.acceptorIdCode, terminalId: v.terminalId },
      });
    }
  }
}
