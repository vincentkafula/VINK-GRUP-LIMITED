import { registerPlugin } from "@capacitor/core";

/**
 * Web-app-facing wrapper around the native TelpoTerminal Capacitor
 * plugin (android/app/src/main/java/za/co/vink/app/terminal/
 * TelpoTerminalPlugin.java). See that file's own top comment for the
 * full honest picture: this plumbing is real and correctly wired, but
 * there is no certified EMV kernel behind it yet. Calling
 * startCardListener() today returns { started: false, error: "..." }
 * rather than a fabricated success.
 *
 * On web (not running inside the Capacitor Android shell), this plugin
 * simply doesn't exist -- registerPlugin's web fallback throws
 * "not implemented" if called, so any UI offering tap-to-pay should
 * check isNativePlatform (see below) before showing that control at all.
 */

export interface CardTapEvent {
  maskedPan: string | null;
  scheme: string | null;
  cardholderVerification: string | null;
  emvCryptogramRef: string | null;
}

interface TelpoTerminalPlugin {
  startCardListener(): Promise<{ started: boolean; error?: string }>;
  stopCardListener(): Promise<{ stopped: boolean }>;
  isReady(): Promise<{ ready: boolean }>;
  addListener(eventName: "cardTapped", listenerFunc: (event: CardTapEvent) => void): Promise<{ remove: () => void }>;
}

const TelpoTerminal = registerPlugin<TelpoTerminalPlugin>("TelpoTerminal");

/** True only when running inside the actual native Android app shell, not the plain web build. */
export function isNativeTerminalAvailable(): boolean {
  return typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === "function"
    && (window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();
}

export async function startCardListener(): Promise<{ started: boolean; error?: string }> {
  if (!isNativeTerminalAvailable()) {
    return { started: false, error: "Not running inside the native Android app -- tap-to-pay requires the installed VINK app on a Telpo device." };
  }
  return TelpoTerminal.startCardListener();
}

export async function stopCardListener(): Promise<void> {
  if (!isNativeTerminalAvailable()) return;
  await TelpoTerminal.stopCardListener();
}

export async function isTerminalReady(): Promise<boolean> {
  if (!isNativeTerminalAvailable()) return false;
  const result = await TelpoTerminal.isReady();
  return result.ready;
}

export function onCardTapped(handler: (event: CardTapEvent) => void): () => void {
  if (!isNativeTerminalAvailable()) return () => {};
  let removeFn: (() => void) | null = null;
  TelpoTerminal.addListener("cardTapped", handler).then(h => { removeFn = h.remove; });
  return () => removeFn?.();
}
