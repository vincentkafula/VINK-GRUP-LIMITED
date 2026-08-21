/**
 * Real integration with a running GenieACS instance's NBI (Northbound
 * Interface) REST API -- genuinely documented and stable, unlike
 * Open5GS's own provisioning story (see open5gsClient.ts's own
 * comment). Verified against the official docs
 * (docs.genieacs.com/en/latest/api-reference.html and
 * github.com/genieacs/genieacs/wiki/api-reference) before writing any
 * of this: base URL, resource paths, MongoDB-style query syntax, and
 * the optional x-api-key header are all confirmed real, not guessed.
 *
 * This is the router/CPE management side of the MVNO stack -- pushing
 * config to deployed customer routers, checking their status, and
 * pushing firmware. Honest limitation: like open5gsClient.ts, this
 * hasn't been run against a live GenieACS instance (none is running
 * in this environment) -- verified by careful matching against the
 * documented request/response shapes, not by an actual live call.
 */

const DEFAULT_NBI_BASE = "http://localhost:7557";

function nbiBase(): string {
  return process.env.GENIEACS_NBI_URL || DEFAULT_NBI_BASE;
}

function authHeaders(): Record<string, string> {
  const key = process.env.GENIEACS_API_KEY;
  return key ? { "x-api-key": key } : {};
}

export interface GenieAcsDevice {
  _id: string;
  [key: string]: unknown;
}

export async function listDevices(query?: Record<string, unknown>): Promise<GenieAcsDevice[]> {
  const url = new URL(`${nbiBase()}/devices/`);
  if (query) url.searchParams.set("query", JSON.stringify(query));
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error(`GenieACS listDevices failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as GenieAcsDevice[];
}

export async function getDevice(deviceId: string): Promise<GenieAcsDevice | null> {
  const devices = await listDevices({ _id: deviceId });
  return devices[0] ?? null;
}

export async function enqueueTask(deviceId: string, task: Record<string, unknown>, connectionRequest = true): Promise<void> {
  const url = new URL(`${nbiBase()}/devices/${encodeURIComponent(deviceId)}/tasks`);
  if (connectionRequest) url.searchParams.set("connection_request", "");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(task),
  });
  if (!res.ok) throw new Error(`GenieACS enqueueTask failed: ${res.status} ${await res.text()}`);
}

export async function rebootDevice(deviceId: string): Promise<void> {
  await enqueueTask(deviceId, { name: "reboot" });
}

export async function setWifiCredentials(
  deviceId: string,
  ssid: string,
  password: string,
  paramPrefix = "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1"
): Promise<void> {
  await enqueueTask(deviceId, {
    name: "setParameterValues",
    parameterValues: [
      [`${paramPrefix}.SSID`, ssid, "xsd:string"],
      [`${paramPrefix}.PreSharedKey.1.PreSharedKey`, password, "xsd:string"],
    ],
  });
}

export async function pushFirmwareUpgrade(deviceId: string, fileName: string): Promise<void> {
  await enqueueTask(deviceId, { name: "download", file: fileName });
}

export async function uploadFirmware(fileName: string, fileContent: Buffer, oui: string, productClass: string, version: string): Promise<void> {
  const res = await fetch(`${nbiBase()}/files/${encodeURIComponent(fileName)}`, {
    method: "PUT",
    headers: {
      ...authHeaders(),
      fileType: "1 Firmware Upgrade Image",
      oui,
      productClass,
      version,
    },
    body: fileContent,
  });
  if (!res.ok) throw new Error(`GenieACS uploadFirmware failed: ${res.status} ${await res.text()}`);
}

export async function createPreset(name: string, preset: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${nbiBase()}/presets/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(preset),
  });
  if (!res.ok) throw new Error(`GenieACS createPreset failed: ${res.status} ${await res.text()}`);
}

export async function listFaults(deviceId?: string): Promise<Record<string, unknown>[]> {
  const url = new URL(`${nbiBase()}/faults/`);
  if (deviceId) url.searchParams.set("query", JSON.stringify({ device: deviceId }));
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (!res.ok) throw new Error(`GenieACS listFaults failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}
