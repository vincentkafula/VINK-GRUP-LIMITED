/**
 * Card-reading interface for till/POS hardware -- HONEST PLACEHOLDER,
 * not a real integration. Same situation as retail-pos-app's own
 * cardReader.ts (this file is a copy of that one, unchanged): no
 * vendor SDK has been confirmed or provided for this hardware yet.
 * Deliberately different from terminal-app's p18qTerminal.ts, where a
 * real vendor SDK exists and is genuinely integrated (see
 * android/app/src/main/java/za/co/vink/app/terminal/P18QTerminalPlugin.java
 * in the main repo).
 *
 * This file exists so the rest of the app (checkout screen, backend
 * submission, MDM) can be built and genuinely work end-to-end against
 * a stable interface now, without waiting on hardware. It does NOT
 * fabricate hardware calls or simulate a fake successful card read --
 * that would be actively misleading, the same reasoning the original
 * (pre-SDK) taxi terminal plugin used before a real SDK was provided.
 *
 * WHAT HAPPENS ONCE A REAL SDK EXISTS FOR THIS HARDWARE:
 * 1. Get the vendor's actual SDK and documentation -- do not guess at
 *    class/method names the way this file's own comments warn against
 *    doing blind.
 * 2. Build a real native Capacitor plugin (same pattern as
 *    P18QTerminalPlugin.java), wired to the vendor's real API.
 * 3. Replace startCardListener()'s "not integrated" response below
 *    with a real call into that plugin, translating its real tap
 *    callback into the same onCardTapped() event shape this file
 *    already defines -- the rest of the app (App.tsx, api.ts) doesn't
 *    need to change at all when that happens, since it's already
 *    built against this same interface.
 */

export interface CardTapEvent {
  maskedPan: string | null;
  scheme: string | null;
  cardholderVerification: string | null;
  emvCryptogramRef: string | null;
}

export function isNativeReaderAvailable(): boolean {
  // Always false until a real native plugin exists -- see the
  // class-level comment above. Not a bug, not forgotten -- the honest,
  // correct value given there is nothing to actually call yet.
  return false;
}

export async function startCardListener(): Promise<{ started: boolean; error?: string }> {
  return { started: false, error: "Card reader not yet integrated -- no vendor SDK has been provided for this hardware. See cardReader.ts's own top comment for what's needed before this can work." };
}

export async function stopCardListener(): Promise<void> {
  // Nothing to stop -- nothing was ever started.
}

export async function isReaderReady(): Promise<boolean> {
  return false;
}

export function onCardTapped(_handler: (event: CardTapEvent) => void): () => void {
  // Never actually fires anything -- returns a real, valid unsubscribe
  // function anyway, so calling code doesn't need special-case
  // handling for "the reader isn't integrated yet" versus any other
  // reason no tap ever arrives.
  return () => {};
}
