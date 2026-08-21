import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Deliberately separate app identity from both the main VINK consumer
 * app (za.co.vink.app) and the taxi terminal app (za.co.vink.terminal)
 * -- a third, genuinely independent product for retail merchants,
 * different hardware, different ownership model, different fee model.
 */
const config: CapacitorConfig = {
  appId: "za.co.vink.retailpos",
  appName: "VINK Retail POS",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
