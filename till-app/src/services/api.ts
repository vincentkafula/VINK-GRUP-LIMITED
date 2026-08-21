/**
 * Calls to the real backend till endpoints
 * (server/src/routes/tillRouter.ts). This app never registers itself
 * -- an admin provisions the terminal separately and hands the
 * resulting serial + API key to whoever sets up the device.
 */

const API_BASE = import.meta.env.VITE_API_URL || "https://vink-grup-limited-production.up.railway.app";

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock_qty: number | null;
}

export async function fetchProducts(serial: string, apiKey: string): Promise<{ success: boolean; data?: Product[]; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/till/products`, {
      headers: { "x-terminal-serial": serial, "x-terminal-api-key": apiKey },
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error -- could not reach the server" };
  }
}

export interface SaleItemInput { productId: string | null; productName: string; quantity: number; unitPrice: number }

export interface SalePayload {
  items: SaleItemInput[];
  paymentMethod: "cash" | "card";
  taxAmount?: number;
  maskedPan?: string | null;
  scheme?: string | null;
  cardholderVerification?: string | null;
  emvCryptogramRef?: string | null;
}

export interface SaleResult {
  success: boolean;
  data?: {
    saleId: string; createdAt: string; subtotal: number; taxAmount: number; total: number; paymentMethod: string;
    split: { vinkFeePct: number; vinkFeeAmount: number; merchantSettlement: number };
  };
  error?: string;
}

export async function submitSale(serial: string, apiKey: string, payload: SalePayload): Promise<SaleResult> {
  try {
    const res = await fetch(`${API_BASE}/api/till/sale`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-terminal-serial": serial, "x-terminal-api-key": apiKey },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error -- could not reach the server" };
  }
}

export interface HeartbeatResult {
  success: boolean;
  data?: { acknowledged: boolean; updateAvailable: boolean; latestVersion: string | null; downloadUrl: string | null; releaseNotes: string | null; mandatory: boolean };
  error?: string;
}

/** Same honest limit as every other app's own sendHeartbeat(): check-and-prompt, not a silent remote push. */
export async function sendHeartbeat(serial: string, apiKey: string, appVersion: string): Promise<HeartbeatResult> {
  try {
    let batteryPct: number | undefined;
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    if (typeof nav.getBattery === "function") {
      const battery = await nav.getBattery();
      batteryPct = Math.round(battery.level * 100);
    }
    const res = await fetch(`${API_BASE}/api/till/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-terminal-serial": serial, "x-terminal-api-key": apiKey },
      body: JSON.stringify({ appVersion, batteryPct }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error -- could not reach the server" };
  }
}
