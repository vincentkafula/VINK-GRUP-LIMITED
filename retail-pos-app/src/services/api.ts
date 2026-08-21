/**
 * Calls to the real backend retail endpoints
 * (server/src/routes/retailRouter.ts). This app never registers
 * itself -- POST /api/retail/register requires admin credentials this
 * app never holds. An admin provisions the terminal separately and
 * hands the resulting serial + API key to whoever sets up the device;
 * this app's Setup screen just stores what it's given.
 */

const API_BASE = import.meta.env.VITE_API_URL || "https://vink-grup-limited-production.up.railway.app";

export interface TransactionPayload {
  maskedPan: string | null;
  scheme: string | null;
  cardholderVerification: string | null;
  emvCryptogramRef: string | null;
  amount: number;
  currency: string;
}

export interface TransactionResult {
  success: boolean;
  data?: { transactionId: string; receivedAt: string; status: string };
  error?: string;
}

export async function submitTransaction(serial: string, apiKey: string, payload: TransactionPayload): Promise<TransactionResult> {
  try {
    const res = await fetch(`${API_BASE}/api/retail/transaction`, {
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

export interface HeartbeatResult {
  success: boolean;
  data?: {
    acknowledged: boolean;
    updateAvailable: boolean;
    latestVersion: string | null;
    downloadUrl: string | null;
    releaseNotes: string | null;
    mandatory: boolean;
  };
  error?: string;
}

/**
 * MDM heartbeat -- same honest limit as terminal-app's own
 * sendHeartbeat(): "an update exists, here's where to get it", not a
 * silent remote push. Installing still needs the operator to
 * tap-confirm Android's own install prompt.
 */
export async function sendHeartbeat(serial: string, apiKey: string, appVersion: string): Promise<HeartbeatResult> {
  try {
    let batteryPct: number | undefined;
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    if (typeof nav.getBattery === "function") {
      const battery = await nav.getBattery();
      batteryPct = Math.round(battery.level * 100);
    }

    const res = await fetch(`${API_BASE}/api/retail/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-terminal-serial": serial,
        "x-terminal-api-key": apiKey,
      },
      body: JSON.stringify({ appVersion, batteryPct }),
    });
    const json = await res.json();
    return json;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error -- could not reach the server" };
  }
}
