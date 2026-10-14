import { createServer } from "node:http";
import { DevKeyProvider, sampleFareTable, topUpCard, DesfireSession, type KeyProvider } from "@afc/shared";
import { loadConfig } from "./config";
import { ConsoleFeedback, GpioFeedback } from "./feedback";
import { PcscReader, SimulatedReader, type CardEvent } from "./readers";
import { Store } from "./store";
import { SyncClient } from "./syncClient";
import { TapProcessor } from "./tapProcessor";

/**
 * Validator entry point.
 *   npm run validator        real reader (PC/SC), keys from the environment or a key service
 *   npm run validator:sim    simulated reader and demo cards, no hardware
 * Keys: the validator needs ONLY the DEBIT master key (AFC_MASTER_KEY_DEBIT) in development. In production plug an ExternalKeyProvider
 * (KMS / HSM / NXP SAM) into `keyProvider()` below so the key never sits in this process's environment.
 */
if (process.argv.includes("--sim")) process.env.SIMULATOR = "1";
const cfg = loadConfig();
const store = new Store(cfg.sqlitePath);
let stopId = cfg.stopId;

function keyProvider(): KeyProvider {
  // Production: return new ExternalKeyProvider(async (role, input) => yourSamOrKms.diversify(role, input));
  return DevKeyProvider.fromEnv();
}

const feedback = cfg.feedback === "gpio" ? new GpioFeedback() : new ConsoleFeedback();
const processor = new TapProcessor({ keys: keyProvider(), store, feedback, deviceId: cfg.deviceId, place: () => ({ routeId: cfg.routeId, stopId }) });

const secret = cfg.deviceSecret;
const sync = secret ? new SyncClient({ serverUrl: cfg.serverUrl, deviceId: cfg.deviceId, secret, store }) : undefined;
if (!sync) console.warn("[sync] DEVICE_SECRET is not set: running standalone, taps stay on this device.");
if (!store.fareTable()) {
  if (cfg.simulator) { store.setFareTable(sampleFareTable()); console.log("[sim] using the sample fare table until the first sync"); }
  else console.warn("[fares] no fare table yet: taps are refused until the first successful sync.");
}

const runSync = async () => {
  if (!sync) return;
  const r = await sync.drain();
  if (r.ok) { if (r.sent || r.updated.length) console.log(`[sync] sent ${r.sent} (accepted ${r.accepted}, already had ${r.duplicates}, rejected ${r.rejected})${r.updated.length ? " · updated " + r.updated.join(", ") : ""}`); }
  else console.warn(`[sync] ${r.error} (${store.pendingCount()} tap(s) waiting, they are safe)`);
};

const onCard = async (c: CardEvent) => {
  const out = await processor.handle(c.uid, c.transceiver);
  if (out.status === "charged" || out.status === "already_paid" || out.status === "denied") void runSync();
};

/** A small control port on this machine only: the vehicle's console or GPS posts the current stop here. */
createServer((req, res) => {
  const send = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "GET" && req.url === "/status") return send(200, { deviceId: cfg.deviceId, routeId: cfg.routeId, stopId, online: store.online, queued: store.pendingCount(), openIntents: store.openIntents(), fareTableVersion: store.fareTableVersion, hotlistVersion: store.hotlistVersion, lastSyncAt: store.getMeta("lastSyncAt") ?? null });
  if (req.method === "POST" && req.url === "/stop") {
    let b = ""; req.on("data", (d) => { b += d; if (b.length > 1000) req.destroy(); });
    req.on("end", () => { try { const n = Number(JSON.parse(b).stopId); if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(); stopId = n; send(200, { stopId }); } catch { send(400, { error: "send {\"stopId\": <number>}" }); } });
    return;
  }
  send(404, { error: "not found" });
}).listen(cfg.controlPort, "127.0.0.1", () => console.log(`[control] http://127.0.0.1:${cfg.controlPort}/status  (POST /stop {"stopId":n})`));

const reader = cfg.simulator
  ? new SimulatedReader(DevKeyProvider.fromEnv(), {
      setStop: (id) => { stopId = id; },
      topup: async (uid, cents) => topUpCard(new DesfireSession(sim.cards.get(uid.toString("hex"))!), uid, DevKeyProvider.fromEnv(), cents),
    })
  : new PcscReader();
const sim = reader as SimulatedReader;
if (cfg.simulator) await sim.personalizeDemoCards();

await reader.start(onCard);
await runSync();
setInterval(runSync, cfg.syncIntervalSeconds * 1000).unref();
console.log(`[validator] ${cfg.deviceId} on route ${cfg.routeId}, stop ${stopId}${cfg.simulator ? " (SIMULATOR)" : ""}`);
