import { Buffer } from "buffer";
import { registerPlugin } from "@capacitor/core";
import { AfcTerminal, type AfcDevicePlugin, type TerminalOptions } from "@afc/terminal";

// the shared fare code uses Node's Buffer; a web view does not have it
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;

/**
 * Starts the fare-collection terminal on the P18Q: the reader, the durable journal, the DESFire fare flow and the Ultralight C ticket flow, all from the shared
 * code in afc-system (tested there against simulated cards). Native side: android/app/src/main/java/za/co/vink/terminal/AfcDevicePlugin.java.
 * Not run on a P18Q yet: see the "STATE OF THIS FILE" list at the top of AfcDevicePlugin.java for what to check on the bench first.
 */
export const afcDevice = registerPlugin<AfcDevicePlugin>("AfcDevice");

export async function startAfcTerminal(o: Omit<TerminalOptions, "plugin">): Promise<AfcTerminal> {
  const terminal = await AfcTerminal.create({ ...o, plugin: afcDevice });
  terminal.start();
  return terminal;
}
