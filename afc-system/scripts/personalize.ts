import { randomBytes } from "node:crypto";
import { BALANCE_MAX, CATEGORIES, DesfireSession, DevKeyProvider, SimulatedDesfireCard, personalizeCard, type Category, type KeyProvider } from "@afc/shared";
import { PcscReader } from "../validator/src/readers";

/**
 * Card personalisation: turns a blank MIFARE DESFire EV2/EV3 card into an AFC fare card and registers it with the server.
 *
 *   npm run personalize -- --sim --balance 5000 --holder "Test Rider"          (software card, no hardware)
 *   npm run personalize -- --balance 0 --holder "Thandi Mokoena" --category student --yes   (real reader: tap a blank card when asked)
 *
 * What it does, in order: reads the UID, creates the AFC application (3 AES keys) with the balance and tap-record files, replaces the
 * factory keys with keys derived for THIS card from the master keys (AN10922), reads the balance back with the validator key to prove it,
 * then registers the card (and its starting balance) with the server so the books match the card.
 *
 * Needs the four master keys: AFC_MASTER_KEY_PICC / _ADMIN / _DEBIT / _CREDIT (32 hex characters each) for development, or plug an
 * ExternalKeyProvider (KMS / HSM / SAM) into `keys()` below. Registration needs AFC_API_URL and AFC_API_TOKEN (a staff sign-in token).
 * A card that is not factory fresh needs --piccKey <32 hex> (its current card master key) and --reformat to wipe an old fare application.
 */
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const balance = Number(opt("balance") ?? 0);
const holder = opt("holder");
const category = (opt("category") ?? "adult") as Category;
if (!Number.isInteger(balance) || balance < 0 || balance > BALANCE_MAX) throw new Error(`--balance is in cents, 0 to ${BALANCE_MAX}`);
if (!CATEGORIES.includes(category)) throw new Error(`--category must be one of ${CATEGORIES.join(", ")}`);

function keys(): KeyProvider {
  // Production: return new ExternalKeyProvider(async (role, input) => yourKmsOrSam.diversify(role, input));
  if (flag("sim") && !process.env.AFC_MASTER_KEY_DEBIT) {
    console.log("[sim] no master keys in the environment: using random ones for this run only");
    return new DevKeyProvider({ PICC: randomBytes(16), ADMIN: randomBytes(16), DEBIT: randomBytes(16), CREDIT: randomBytes(16) });
  }
  const k = DevKeyProvider.fromEnv();
  return k;
}

async function register(uid: string) {
  const url = process.env.AFC_API_URL, token = process.env.AFC_API_TOKEN;
  const body = { uid, holderName: holder, category, initialBalance: balance };
  if (!url || !token) {
    console.log("\nThe card is ready, but it is NOT registered with the server (AFC_API_URL / AFC_API_TOKEN not set). Register it now:");
    console.log(`  curl -X POST ${url ?? "http://localhost:4000"}/api/cards -H "Authorization: Bearer <staff token>" -H "Content-Type: application/json" -d '${JSON.stringify(body)}'`);
    return;
  }
  const res = await fetch(`${url.replace(/\/+$/, "")}/api/cards`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 201) console.log(`Registered with the server: ${uid}${holder ? " (" + holder + ")" : ""}, starting balance ${balance} cents.`);
  else console.error(`!! The card is personalised but the server refused to register it (${res.status}): ${await res.text()}\n   Register it by hand, with the same starting balance, before it is used.`);
}

async function personalise(uid: Buffer, transport: ConstructorParameters<typeof DesfireSession>[0], k: KeyProvider) {
  console.log(`Card UID ${uid.toString("hex")}: creating the fare application ...`);
  const piccKey = opt("piccKey") ? Buffer.from(opt("piccKey")!, "hex") : undefined;
  const r = await personalizeCard(new DesfireSession(transport), uid, k, { initialBalance: balance, currentPiccKey: piccKey, reformat: flag("reformat") });
  console.log(`Done and verified: the validator key reads ${r.balance} cents from the card.`);
  await register(r.uid);
}

const k = keys();
if (flag("sim")) {
  const uid = Buffer.concat([Buffer.from([0x04]), randomBytes(6)]);
  await personalise(uid, new SimulatedDesfireCard({ uid }), k);
} else {
  if (!flag("yes")) { console.log("This will write keys to the next card tapped on the reader. Run again with --yes to continue."); process.exit(1); }
  const reader = new PcscReader();
  console.log("Tap a blank DESFire card on the reader ...");
  let done = false;
  await reader.start(async ({ uid, transceiver }) => {
    if (done) return; done = true;
    try { await personalise(uid, transceiver, k); process.exitCode = 0; }
    catch (e) { console.error("Personalisation failed:", e instanceof Error ? e.message : e, "\nThe card may be partly written. Run the self-test, then retry with --reformat (and --piccKey if the card master key is no longer the factory one)."); process.exitCode = 1; }
    finally { await reader.stop(); setTimeout(() => process.exit(), 200); }
  });
}
