import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Deliberately separate app identity from the main VINK consumer app
 * (za.co.vink.app) -- this is a standalone terminal app for P18Q
 * device buyers, meant for its own Play Store listing under its own
 * package name, not bundled with or dependent on the main app's build.
 */
const config: CapacitorConfig = {
  appId: "za.co.vink.terminal",
  appName: "VINK Terminal",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
