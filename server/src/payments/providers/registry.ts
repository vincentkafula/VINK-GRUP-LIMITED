import type { PaymentsConfig } from "../config.js";
import type { IssuingProvider, CardServicingProvider, AccountValidationProvider, CardVaultProvider, CardPayoutProvider } from "./types.js";
import { MockCardRail } from "./mockCardRail.js";
import { VisaDirectPayout, SandboxPanVault } from "./visaDirect.js";
import { VisaPavValidation } from "./visaPav.js";
import { MockAccountValidation } from "./mockAccountValidation.js";
import { VisaDpsServicing } from "./visaDps.js";
import { buildVisaAuth } from "./visaAuth.js";
import { MockCardServicing } from "./mockCardServicing.js";
import { MockIssuer } from "./mockIssuer.js";
import { PaymentologyIssuer } from "./paymentologyIssuer.js";

export function getIssuingProvider(cfg: PaymentsConfig): IssuingProvider {
  switch (cfg.issuingProvider) {
    // In production the mock issuer only accepts webhooks signed with a secret you set; the public default is for local development.
    case "mock": return new MockIssuer(process.env.SANDBOX_ISSUER_WEBHOOK_SECRET || (process.env.NODE_ENV === "production" ? null : undefined));
    case "paymentology": return new PaymentologyIssuer(cfg.paymentology!, cfg.paymentologyProgrammes);   // config validation guarantees credentials
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

let mockRail: MockCardRail | null = null;
/** The vault (card number -> token) and the payout (money -> card) of the selected provider. They share one instance, so a token made by one is understood by the other. */
export function getCardRail(cfg: PaymentsConfig): { name: string; vault: CardVaultProvider; payout: CardPayoutProvider } {
  switch (cfg.cardPayoutProvider) {
    case "mock": { mockRail ??= new MockCardRail(); return { name: "mock", vault: mockRail, payout: mockRail }; }
    case "visa_direct": {
      const v = cfg.visaDirect!;   // config validation guarantees the settings
      const vault = new SandboxPanVault(v.vaultKey, v.extraTestPans);
      const payout = new VisaDirectPayout({ baseUrl: v.baseUrl, ...buildVisaAuth(v.auth), vault, acquiringBin: v.acquiringBin, acquirerCountryCode: v.acquirerCountryCode, sender: v.sender, cardAcceptor: v.cardAcceptor });
      return { name: "visa_direct", vault, payout };
    }
  }
}
