import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { SimulatedUltralight, readTicket, verifyTicket, publicKeyFromHex, writeTicket } from "@afc/shared";
import { generateTicketKeyPair, keyProviderFromEnv } from "@afc/shared/node";
import { PcscReader } from "../validator/src/readers";

/**
 * Single-trip tickets on MIFARE Ultralight (use MF0UL21, or NTAG213/215: at least 88 bytes of user memory).
 *
 *   npm run tickets -- keygen --out ticket-signing.key
 *        creates the Ed25519 key pair that signs tickets. The PRIVATE key goes to a file (mode 600): put its contents in the server's secret store as
 *        TICKET_SIGNING_KEY and delete the file. The public key is printed; validators get it from the server by themselves.
 *
 *   npm run tickets -- issue --route 1 --minutes 120 --price 1500 --method CASH --reference RC-1001 [--sim]
 *        the ticket counter: tap a blank ultralight, the script reads its UID, sells the ticket through the API (AFC_API_URL + AFC_API_TOKEN of an
 *        agent), writes what the server signed onto the card, protects the card with its own password, locks it, and reads everything back.
 *        --route 0 (the default) is a ticket for any route. --sim uses a software card, no hardware needed.
 *
 * Needs the TICKET master key (AFC_KEY_FILE or AFC_MASTER_KEY_TICKET): it derives each card's write password.
 */
const [cmd, ...rest] = process.argv.slice(2);
const opt = (n: string, d?: string) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };

if (cmd === "keygen") {
  const out = opt("out") ?? "ticket-signing.key";
  const kp = generateTicketKeyPair();
  writeFileSync(out, kp.privateKeyBase64 + "\n"); try { chmodSync(out, 0o600); } catch { /* not supported */ }
  console.log(`Private key written to ${out}. Put it in your secret store as TICKET_SIGNING_KEY, then delete the file. Never commit it.\nPublic key (safe to share): ${kp.publicKeyHex}`);
} else if (cmd === "issue") {
  const url = process.env.AFC_API_URL, token = process.env.AFC_API_TOKEN;
  if (!url || !token) throw new Error("Set AFC_API_URL and AFC_API_TOKEN (a staff sign-in token of an agent or operator)");
  const keys = await keyProviderFromEnv();
  const body = {
    routeId: Number(opt("route", "0")), validForMinutes: Number(opt("minutes", "120")), priceCents: Number(opt("price")), method: opt("method", "CASH"),
    reference: opt("reference") ?? (rest.includes("--sim") ? "SIM-" + randomUUID().slice(0, 8) : undefined),
  };
  if (!Number.isInteger(body.priceCents) || !body.reference) throw new Error("--price (cents) and --reference (the receipt number) are required");

  const run = async (io: SimulatedUltralight | import("@afc/shared").UltralightIo) => {
    const uid = await io.uid();
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/tickets`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ...body, cardUid: uid.toString("hex") }) });
    const json = (await res.json()) as { ticket?: { id: number; validUntil: string }; dataHex?: string; signatureHex?: string; keyId?: number; replay?: boolean; error?: { message: string } };
    if (!res.ok || !json.dataHex) throw new Error(`The server refused the sale (${res.status}): ${json.error?.message ?? "unknown"}`);
    await writeTicket(io, keys, Buffer.from(json.dataHex, "hex"), Buffer.from(json.signatureHex!, "hex"));
    const back = await readTicket(io);
    console.log(`Ticket ${json.ticket!.id} written to card ${uid.toString("hex")}: route ${body.routeId || "any"}, valid until ${json.ticket!.validUntil}${json.replay ? " (this receipt had already been sold; the same ticket was written again)" : ""}.`);
    return back;
  };

  if (rest.includes("--sim")) {
    const card = new SimulatedUltralight(Buffer.concat([Buffer.from([0x04]), randomBytes(6)]));
    const back = await run(card);
    const pubRes = await fetch(`${url.replace(/\/+$/, "")}/api/tickets-public-keys`, { headers: { authorization: `Bearer ${token}` } });
    const pub = ((await pubRes.json()) as { keys: { publicKey: string }[] }).keys[0].publicKey;
    console.log("Verifies with the server's public key:", verifyTicket(publicKeyFromHex(pub), back.data, back.signature, back.uid) ? "yes" : "NO");
  } else {
    const reader = new PcscReader();
    console.log("Tap a blank Ultralight card ...");
    let done = false;
    await reader.start(async ({ ultralight }) => {
      if (!ultralight) { console.log("That is a DESFire card. Tap an Ultralight ticket card."); return; }
      if (done) return; done = true;
      try { await run(ultralight); process.exitCode = 0; } catch (e) { console.error("Failed:", e instanceof Error ? e.message : e); process.exitCode = 1; }
      finally { await reader.stop(); setTimeout(() => process.exit(), 200); }
    });
  }
} else {
  console.log("Commands: keygen [--out file] | issue --route N --minutes M --price CENTS --method CASH|MOBILE_MONEY --reference RECEIPT [--sim]");
  process.exit(cmd ? 1 : 0);
}
