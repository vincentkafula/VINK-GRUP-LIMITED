import type { CapacitorConfig } from "@capacitor/cli";

/**
 * A fourth, deliberately separate app identity -- za.co.vink.app (main
 * consumer app), za.co.vink.terminal (taxi AFC), za.co.vink.retailpos
 * (retail card payments), and now za.co.vink.till (full point-of-sale:
 * product catalog, checkout, receipts, cash + card).
 */
const config: CapacitorConfig = {
  appId: "za.co.vink.till",
  appName: "VINK Till",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
