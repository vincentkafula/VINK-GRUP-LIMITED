/**
 * Calls to the existing backend terminal endpoints
 * (server/src/routes/terminalRouter.ts, built and verified in the main
 * VINK-GRUP-LIMITED session). This app never registers itself -- POST
 * /api/terminal/register requires admin credentials this app never
 * holds. An admin provisions the terminal separately and hands the
 * resulting serial + API key to whoever sets up the device; this app's
 * Setup screen just stores what it's given.
 */

const API_BASE = import.meta.env.VITE_API_URL || "https://vink-grup-limited-production.up.railway.app";

export interface TapPayload {
  maskedPan: string | null;
  scheme: string | null;
  cardholderVerification: string | null;
  emvCryptogramRef: string | null;
  amount: number;
  currency: string;
}

export interface TapResult {
  success: boolean;
  data?: { tapId: string; receivedAt: string; status: string };
  error?: string;
}

export async function submitTap(serial: string, apiKey: string, payload: TapPayload): Promise<TapResult> {
  try {
    const res = await fetch(`${API_BASE}/api/terminal/tap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-terminal-serial": serial,
        "x-terminal-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error -- could not reach the server" };
  }
}
