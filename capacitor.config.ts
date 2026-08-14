import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Wraps the existing VINK React web app (built via `npm run build`, output
 * to dist/) into native iOS and Android shells for app store submission.
 * This is the standard, legitimate path for taking a web app to both
 * stores without a full native rewrite -- Capacitor ships the built web
 * assets inside a real native app container, giving access to native
 * APIs (push notifications, geolocation, camera) where the web app needs
 * them, while the actual UI stays the same React codebase.
 *
 * appId follows Apple/Google's required reverse-domain format --
 * za.co.vink.app -- matching VINK's own domain (vink.co.za) reversed,
 * which both stores expect to correspond to a domain the submitting
 * developer account actually controls.
 */
const config: CapacitorConfig = {
  appId: "za.co.vink.app",
  appName: "VINK",
  webDir: "dist",
  server: {
    // In production, Capacitor serves the bundled dist/ files locally on
    // the device -- androidScheme/iosScheme only affect the internal
    // scheme used to serve those local files, not a remote URL. There is
    // no live-reload "url" pointing at a dev server here; that's a local
    // development convenience only, added separately when actually
    // building on a machine with the native toolchains.
    androidScheme: "https",
    iosScheme: "https",
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
