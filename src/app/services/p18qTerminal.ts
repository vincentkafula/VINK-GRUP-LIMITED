import { registerPlugin } from "@capacitor/core";

/**
 * Web-app-facing wrapper around the native P18QTerminal Capacitor
 * plugin (android/app/src/main/java/za/co/vink/app/terminal/
 * P18QTerminalPlugin.java) -- bridges to the P18Q bus validator's
 * built-in contactless card reader, using the real Deka EMV SDK
 * (provided 2026-08-17).
 *
 * See that file's own top comment for the full honest picture: the
 * kernel genuinely talks to a tapped card at the protocol level, but
 * uses test-only CAPK keys (EMVCo's reserved test range, not Visa's
 * real production RID), so it reads test cards correctly, not real
 * production cards, until real production CAPKs are obtained through
 * Visa/Mastercard or your acquirer.
 *
 * On web (not running inside the Capacitor Android shell), this plugin
 * simply doesn't exist -- registerPlugin's web fallback throws
 * "not implemented" if called, so any UI offering tap-to-pay should
 * check isNativeTerminalAvailable (see below) before showing that
 * control at all.
 */

export interface CardTapEvent {
  maskedPan: string | null;
  scheme: string | null;
  cardholderVerification: string | null;
  emvCryptogramRef: string | null;
}

interface P18QTerminalPlugin {
  startCardListener(): Promise<{ started: boolean; error?: string }>;
  stopCardListener(): Promise<{ stopped: boolean }>;
  isReady(): Promise<{ ready: boolean }>;
  addListener(eventName: "cardTapped", listenerFunc: (event: CardTapEvent) => void): Promise<{ remove: () => void }>;
}

const P18QTerminal = registerPlugin<P18QTerminalPlugin>("P18QTerminal");

/** True only when running inside the actual native Android app shell, not the plain web build. */
export function isNativeTerminalAvailable(): boolean {
  return typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === "function"
    && (window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();
}

export async function startCardListener(): Promise<{ started: boolean; error?: string }> {
  if (!isNativeTerminalAvailable()) {
    return { started: false, error: "Not running inside the native Android app -- tap-to-pay requires the installed VINK app on a P18Q device." };
  }
  return P18QTerminal.startCardListener();
}

export async function stopCardListener(): Promise<void> {
  if (!isNativeTerminalAvailable()) return;
  await P18QTerminal.stopCardListener();
}

export async function isTerminalReady(): Promise<boolean> {
  if (!isNativeTerminalAvailable()) return false;
  const result = await P18QTerminal.isReady();
  return result.ready;
}

export function onCardTapped(handler: (event: CardTapEvent) => void): () => void {
  if (!isNativeTerminalAvailable()) return () => {};
  let removeFn: (() => void) | null = null;
  P18QTerminal.addListener("cardTapped", handler).then(h => { removeFn = h.remove; });
  return () => removeFn?.();
}
