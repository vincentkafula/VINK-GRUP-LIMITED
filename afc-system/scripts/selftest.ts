import { aesCmac, diversifyAes128, runProtocolSelfTest, SimulatedDesfireCard } from "@afc/shared";
import { PcscReader } from "../validator/src/readers";

/**
 * Checks that the cryptography and the card protocol behave. Always runs the published test vectors (RFC 4493 AES-CMAC, NXP AN10922 key
 * diversification) and the full protocol check against the card simulator. With --reader it also runs the protocol check on a REAL card:
 *
 *     npm run selftest -- --reader                      (factory-fresh spare card: card master key all zeros)
 *     npm run selftest -- --reader --piccKey <32 hex>   (a card whose master key you changed)
 *
 * The check creates a throw-away application (AID F0F0F0), exercises authentication, MACed debit/credit, commit/abort and both ChangeKey forms,
 * then deletes it. Use a spare card. If a step passes on the simulator but fails on the real card, do not personalise real cards yet.
 */
const args = process.argv.slice(2);
const hex = (s: string) => Buffer.from(s.replace(/\s/g, ""), "hex");
let failed = false;
const line = (ok: boolean, name: string, detail?: string) => { if (!ok) failed = true; console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? "  - " + detail : ""}`); };

console.log("Test vectors");
line(aesCmac(hex("2b7e151628aed2a6abf7158809cf4f3c"), hex("6bc1bee22e409f96e93d7e117393172a")).toString("hex") === "070a16b46b4d4144f79bdd9dd04a287c", "AES-CMAC, RFC 4493 example 2");
line(diversifyAes128(hex("00112233445566778899AABBCCDDEEFF"), hex("04782E21801D80"), hex("3042F5"), hex("4E585020416275")).toString("hex").toUpperCase() === "A8DD63A3B89D54B37CA802473FDA9175", "Key diversification, NXP AN10922 example");

console.log("\nProtocol check against the simulator");
for (const r of await runProtocolSelfTest(new SimulatedDesfireCard({ uid: hex("04aabbccddeeff") }))) line(r.ok, r.name, r.detail);

if (args.includes("--reader")) {
  const i = args.indexOf("--piccKey");
  const piccKey = i >= 0 ? hex(args[i + 1]) : Buffer.alloc(16);
  console.log("\nProtocol check on a real card. Tap a SPARE card ...");
  const reader = new PcscReader();
  let ran = false;
  await reader.start(async ({ uid, transceiver }) => {
    if (ran) return; ran = true;
    console.log(`Card UID ${uid.toString("hex")}`);
    for (const r of await runProtocolSelfTest(transceiver, piccKey)) line(r.ok, r.name, r.detail);
    await reader.stop();
    console.log(failed ? "\nSOME CHECKS FAILED." : "\nAll checks passed.");
    process.exit(failed ? 1 : 0);
  });
} else {
  console.log(failed ? "\nSOME CHECKS FAILED." : "\nAll checks passed. (Add --reader to run the protocol check on a real card.)");
  process.exit(failed ? 1 : 0);
}
