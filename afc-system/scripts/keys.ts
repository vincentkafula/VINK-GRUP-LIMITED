import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CARD_KEY_ROLES, keyFingerprint, passphraseFromEnv, sealKeys, unsealKeys, type CardKeyRole, type SealedFile } from "@afc/shared";

/**
 * Master-key tooling. Keys are generated here, sealed with a passphrase, and never printed.
 *
 *   npm run keys -- generate --dir ./keys           makes the master keys and one sealed file per kind of station:
 *        all.sealed          every key       -> your safe / offline backup, and the personalisation station
 *        validator.sealed    DEBIT + TICKET  -> each validator (it can take fares and mark tickets used, nothing else)
 *        topup.sealed        CREDIT          -> each top-up terminal
 *   npm run keys -- check ./keys/validator.sealed    opens a file and lists its roles with fingerprints
 *
 * The passphrase comes from AFC_KEY_PASSPHRASE_FILE (a path) or AFC_KEY_PASSPHRASE. Use DIFFERENT passphrases for different station files:
 * run generate, then re-seal station files with `reseal`. Back up all.sealed and its passphrase in two separate places.
 *
 *   npm run keys -- reseal ./keys/all.sealed --roles DEBIT,TICKET --out ./keys/validator-bus12.sealed --new-passphrase-file ./pass-bus12
 */
const [cmd, ...rest] = process.argv.slice(2);
const opt = (n: string) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined; };
const pass = () => { const p = passphraseFromEnv(); if (!p) throw new Error("Set AFC_KEY_PASSPHRASE_FILE (a file holding the passphrase) or AFC_KEY_PASSPHRASE"); return p; };
const write = (path: string, f: SealedFile) => { writeFileSync(path, JSON.stringify(f, null, 2) + "\n"); try { chmodSync(path, 0o600); } catch { /* not supported on this file system */ } };
const show = (path: string, m: Partial<Record<CardKeyRole, Buffer>>) => { console.log(path); for (const r of CARD_KEY_ROLES) if (m[r]) console.log(`   ${r.padEnd(7)} fingerprint ${keyFingerprint(m[r]!)}`); };

if (cmd === "generate") {
  const dir = opt("dir") ?? "./keys";
  if (existsSync(join(dir, "all.sealed")) && !rest.includes("--force")) throw new Error(`${join(dir, "all.sealed")} already exists. Generating new keys would make every issued card unreadable. Use --force only if you are sure.`);
  mkdirSync(dir, { recursive: true });
  const m = Object.fromEntries(CARD_KEY_ROLES.map((r) => [r, randomBytes(16)])) as Record<CardKeyRole, Buffer>;
  const p = pass();
  write(join(dir, "all.sealed"), sealKeys(m, p));
  write(join(dir, "validator.sealed"), sealKeys({ DEBIT: m.DEBIT, TICKET: m.TICKET }, p));
  write(join(dir, "topup.sealed"), sealKeys({ CREDIT: m.CREDIT }, p));
  show(join(dir, "all.sealed"), m);
  console.log("\nKeys sealed. Next:\n  1. Back up all.sealed AND its passphrase in two different places. Losing them means every issued card is unusable.\n  2. Give each station only its own file, ideally re-sealed with its own passphrase (reseal).\n  3. Never commit this folder (the repository's .gitignore already excludes *.sealed).");
} else if (cmd === "check") {
  const file = rest[0]; if (!file) throw new Error("npm run keys -- check <file>");
  show(file, unsealKeys(JSON.parse(readFileSync(file, "utf8")) as SealedFile, pass()));
} else if (cmd === "reseal") {
  const file = rest[0], out = opt("out"), roles = (opt("roles") ?? "").split(",").filter(Boolean) as CardKeyRole[], np = opt("new-passphrase-file");
  if (!file || !out || !roles.length || !np) throw new Error("npm run keys -- reseal <file> --roles DEBIT,TICKET --out <file> --new-passphrase-file <path>");
  const all = unsealKeys(JSON.parse(readFileSync(file, "utf8")) as SealedFile, pass());
  const subset: Partial<Record<CardKeyRole, Buffer>> = {};
  for (const r of roles) { if (!CARD_KEY_ROLES.includes(r) || !all[r]) throw new Error(`${r} is not in ${file}`); subset[r] = all[r]; }
  write(out, sealKeys(subset, readFileSync(np, "utf8").replace(/[\r\n]+$/, "")));
  show(out, subset);
} else {
  console.log("Commands: generate [--dir ./keys] [--force] | check <file> | reseal <file> --roles A,B --out <file> --new-passphrase-file <path>");
  process.exit(cmd ? 1 : 0);
}
