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
 * MDM heartbeat -- reports this app's own version and the device's
 * battery level, and gets back whether a newer app version exists.
 * Honest limit: a true here means "an update exists, here's where to
 * get it" -- it doesn't and can't silently install anything. Actually
 * installing still goes through Android's own install prompt, which
 * needs the operator to tap-confirm, same as any normal APK install.
 */
export async function sendHeartbeat(serial: string, apiKey: string, appVersion: string): Promise<HeartbeatResult> {
  try {
    let batteryPct: number | undefined;
    // Battery Status API isn't available in every WebView -- read it
    // if present, but don't fail the heartbeat if it's not.
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    if (typeof nav.getBattery === "function") {
      const battery = await nav.getBattery();
      batteryPct = Math.round(battery.level * 100);
    }

    const res = await fetch(`${API_BASE}/api/terminal/heartbeat`, {
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
