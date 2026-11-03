/**
 * Rank device simulator (sandbox only): act as a shared rank device, without hardware.
 *
 *   npm run rank:simulate -- --url http://localhost:3001 --serial RK-1 --key <the device's API key> --card 04A1B2C3D4 [--action pair|tap|sync] [--times 2] [--ref <reference>]
 *
 * --action pair (the default): the DRIVER taps their card. Reports it to POST /api/terminal/pair exactly as the real device will and prints the answer. --times 2 taps the same card twice, to
 * see that a retry is answered as before and does not pair twice. Try a passenger's card, an unknown card, or a card of a driver who is not on the vehicle, to see each refusal and its code.
 * --action tap: a PASSENGER taps their VINK card (POST /api/terminal/token/rank-tap). Each tap gets a new reference, as a real device would; pass --ref to resend the SAME reference and see that
 * a retry is answered as before and charges once. Tapping the same card twice in a few seconds shows the duplicate-tap refusal.
 * --action sync: a tap the device took WITHOUT A SIGNAL and sends now (POST /api/terminal/token/rank-tap/batch). --ago <seconds> says how long ago it happened (default 120). It is placed in the session that
 * was loading then, so try one from before the driver paired (refused) or from a load that has since departed (joins its trip). Resend with the same --ref to see it counted once.
 * The device's API key is shown once, when the terminal is registered (POST /api/terminal/register). Refuses to run unless PAYMENTS_MODE is sandbox (the default) and the target is
 * local or listed in RANK_SIM_ALLOWED_HOSTS.
 */
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  if ((process.env.PAYMENTS_MODE ?? "sandbox") !== "sandbox") throw new Error("The rank device simulator only runs in sandbox mode.");
  const url = arg("url"), serial = arg("serial"), key = arg("key"), card = arg("card");
  if (!url || !serial || !key || !card) throw new Error("--url, --serial, --key and --card are all required");
  const host = new URL(url).hostname, allowed = (process.env.RANK_SIM_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !allowed.includes(host)) throw new Error(`Refusing to send to ${host}. Add it to RANK_SIM_ALLOWED_HOSTS to allow it.`);
  const action = arg("action") ?? "pair";
  if (action !== "pair" && action !== "tap" && action !== "sync") throw new Error("--action must be pair, tap or sync");
  const times = Math.max(1, Number(arg("times") ?? 1));
  for (let i = 1; i <= times; i++) {
    const base = url.replace(/\/$/, ""), headers: Record<string, string> = { "content-type": "application/json", "x-terminal-serial": serial, "x-terminal-api-key": key };
    const res = action === "sync"
      ? await fetch(`${base}/api/terminal/token/rank-tap/batch`, { method: "POST", headers, body: JSON.stringify({ taps: [{ key: `${arg("ref") ?? `sim-${Date.now()}`}-${i}`, cardNumber: card, at: new Date(Date.now() - Number(arg("ago") ?? 120) * 1000).toISOString() }] }) })
      : action === "tap"
      ? await fetch(`${base}/api/terminal/token/rank-tap`, { method: "POST", headers: { ...headers, "idempotency-key": arg("ref") ?? `sim-${Date.now()}-${i}` }, body: JSON.stringify({ cardNumber: card }) })
      : await fetch(`${base}/api/terminal/pair`, { method: "POST", headers, body: JSON.stringify({ cardUid: card }) });
    console.log(`tap ${i}: HTTP ${res.status}`, JSON.stringify(await res.json().catch(() => null)));
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
