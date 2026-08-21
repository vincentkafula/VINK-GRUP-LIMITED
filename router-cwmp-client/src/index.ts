import { CwmpClient } from "./cwmpClient.js";
import { startConnectionRequestServer } from "./connectionRequestServer.js";

/**
 * Reference CWMP client entry point -- what a real VINK router would
 * run at startup. Configuration is read from environment variables,
 * same convention as the server-side services this connects to
 * (server/src/services/genieAcsClient.ts's own GENIEACS_NBI_URL).
 */

const ACS_URL = process.env.CWMP_ACS_URL || "http://localhost:7557/";
const SERIAL_NUMBER = process.env.CWMP_SERIAL_NUMBER || "DEV-SERIAL-000001";
const CONNECTION_REQUEST_PORT = Number(process.env.CWMP_CONNECTION_REQUEST_PORT || 7547);
const PERIODIC_INFORM_INTERVAL_SECONDS = Number(process.env.CWMP_PERIODIC_INTERVAL || 300);

const client = new CwmpClient({
  acsUrl: ACS_URL,
  deviceId: {
    manufacturer: "VINK",
    oui: "00147F",
    productClass: "VINK-CPE-1",
    serialNumber: SERIAL_NUMBER,
  },
});

async function runSessionSafely(eventCode: string) {
  try {
    await client.runSession([{ eventCode }]);
    console.log(`[cwmp] Session completed (${eventCode})`);
  } catch (err) {
    console.error(`[cwmp] Session failed (${eventCode}):`, err instanceof Error ? err.message : err);
  }
}

runSessionSafely("1 BOOT");

setInterval(() => runSessionSafely("2 PERIODIC"), PERIODIC_INFORM_INTERVAL_SECONDS * 1000);

startConnectionRequestServer({
  port: CONNECTION_REQUEST_PORT,
  onConnectionRequest: () => runSessionSafely("6 CONNECTION REQUEST"),
});

console.log(`[cwmp] Client started -- ACS: ${ACS_URL}, connection-request listener on port ${CONNECTION_REQUEST_PORT}`);
