/**
 * The contract between the web view and the native Capacitor plugin `AfcDevice` (terminal-app/android/.../AfcDevicePlugin.java). The plugin only moves bytes:
 * strings are lowercase hex, and every call that touches the reader runs on one thread on the native side.
 */
export interface AfcDevicePlugin {
  open(): Promise<{ open: boolean }>;
  close(): Promise<void>;
  /** Looks for a card. `iso4` is true for a DESFire (speaks ISO 14443-4) and false for an Ultralight. */
  poll(): Promise<{ present: boolean; uid?: string; iso4?: boolean }>;
  /** One command to a DESFire card; the answer includes the two status bytes. */
  apdu(o: { hex: string; timeoutMs?: number }): Promise<{ hex: string }>;
  /** Four pages (16 bytes) from `page`. */
  ulRead(o: { page: number }): Promise<{ hex: string }>;
  /** One page (4 bytes = 8 hex characters). */
  ulWrite(o: { page: number; hex: string }): Promise<void>;
  ulcAuth(o: { keyHex: string }): Promise<void>;
  ulcSetKey(o: { keyHex: string }): Promise<void>;
  /** Beep for `units` steps of the SDK's beeper (about 10 ms each). */
  beep(o: { units?: number }): Promise<void>;

  journalLoad(): Promise<{ lines: string[] }>;
  /** Resolves only when the lines are on storage (fsync). */
  journalAppend(o: { lines: string[] }): Promise<void>;
  /** Atomically replaces the whole journal with one line. */
  journalReplace(o: { line: string }): Promise<void>;

  keyImport(o: { role: KeyRole; keyHex: string; replace?: boolean }): Promise<void>;
  keyStatus(): Promise<{ roles: Record<KeyRole, { installed: boolean; hardwareBacked: boolean }> }>;
  /** AES-CMAC of `inputHex` under the role's master key (16 bytes, hex). */
  keyDiversify(o: { role: KeyRole; inputHex: string }): Promise<{ keyHex: string }>;
}

export type KeyRole = "PICC" | "ADMIN" | "DEBIT" | "CREDIT" | "TICKET";
