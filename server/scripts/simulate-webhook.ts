/**
 * Webhook simulator and replay tool (sandbox only).
 *
 *   npm run webhook:simulate -- --url http://localhost:3001/api/manshya/gateways/mock/webhook \
 *        --body '{"gatewayRef":"mock_abc","status":"paid"}' [--times 2] [--scheme gateway|issuer] [--bad-signature]
 *   npm run webhook:simulate -- --url ... --file captured-event.json     (replay a saved body byte-for-byte)
 *
 * --times 2 sends the same signed request twice, to check that the receiver handles duplicates (idempotency).
 * --bad-signature sends a tampered signature, to check that the receiver rejects it.
 * Refuses to run unless PAYMENTS_MODE is sandbox (the default) and the target is local or explicitly allowed.
 */
import crypto from "crypto";
import fs from "fs";
import { signWebhook } from "../src/payments/providers/webhook.js";
import { MOCK_WEBHOOK_SECRET } from "../src/payments/providers/mockIssuer.js";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  if ((process.env.PAYMENTS_MODE ?? "sandbox") !== "sandbox") throw new Error("The webhook simulator only runs in sandbox mode.");
  const url = arg("url");
  if (!url) throw new Error("--url is required");
  const host = new URL(url).hostname;
  const allowed = (process.env.WEBHOOK_SIM_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !allowed.includes(host)) {
    throw new Error(`Refusing to send to ${host}. Add it to WEBHOOK_SIM_ALLOWED_HOSTS if it is a sandbox endpoint you own.`);
  }
  const file = arg("file");
  const raw = file ? fs.readFileSync(file) : Buffer.from(arg("body") ?? "");
  if (!raw.length) throw new Error("--body or --file is required");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if ((arg("scheme") ?? "gateway") === "gateway") {
    // VINK's mock gateway: HMAC-SHA256 of the raw body in x-mock-signature.
    const secret = process.env.SANDBOX_GATEWAY_WEBHOOK_SECRET ?? "dev-mock-secret";
    headers["x-mock-signature"] = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  } else {
    const { signature, timestamp } = signWebhook(process.env.SANDBOX_ISSUER_WEBHOOK_SECRET ?? MOCK_WEBHOOK_SECRET, raw);
    headers["x-signature"] = signature;
    headers["x-timestamp"] = String(timestamp);
  }
  if (flag("bad-signature")) for (const k of ["x-mock-signature", "x-signature"]) if (headers[k]) headers[k] = headers[k].replace(/.$/, (c) => (c === "0" ? "1" : "0"));

  const times = Number(arg("times") ?? 1);
  for (let i = 1; i <= times; i++) {
    const res = await fetch(url, { method: "POST", headers, body: raw });
    console.log(`#${i} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
