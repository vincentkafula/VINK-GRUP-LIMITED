# AFC: automatic fare collection with MIFARE DESFire cards

Passengers tap a MIFARE DESFire card on a validator. The validator proves the card is genuine, works out the fare, takes it from the card in one atomic step, and shows a green or red light. It works with no network and reports to the server later. Staff run everything from a web dashboard.

```
afc-system/
  shared/       fare engine, DESFire protocol + card simulator, key diversification, sync signing   (used by everything)
  backend/      API (Fastify), Postgres schema (Prisma), double-entry ledger, device sync, reports, live feed
  validator/    the device software: card reader, tap flow, offline SQLite queue, signed sync
  dashboard/    staff web app (Next.js + Tailwind)
  scripts/      personalize.ts (prepare a card), selftest.ts (protocol check, run on a spare card first)
  docs/         THREAT_MODEL.md
  docker-compose.yml   database + API + dashboard in one command
```

## Decisions I made so you could start (change any of them)

| Choice | Default | Why |
|---|---|---|
| Vehicle / place | Minibus network, Southern Africa | the other VINK systems are taxi/minibus |
| Currency, time zone | South African rand (cents everywhere), SAST (UTC+2, no DST) | VINK's currency; time-of-day fares use it |
| Fares | Flat fare (one tap) **or** zone fare, **pay on exit** | validators hold only the DEBIT key, so they can take money but never give it back; charging on exit keeps that true |
| Cards | DESFire EV2/EV3, AES-128, one application, 3 keys | Classic's Crypto1 is broken, so Classic is never accepted |
| Balance on the card | R 0 to R 5 000.00 | limits the loss from a lost card or a leaked key |
| Re-tap block | 90 to 120 s per route | tunable per route |
| Validator runtime | Raspberry Pi 4 + ACR122U/ACR1252U, Node 22.13+ | as requested |
| Database | PostgreSQL via Prisma | as requested |

## What is real and what is a stand-in

**Verified by tests in this repository (`npm test`: about 210 tests):**
- AES-CMAC against the RFC 4493 vectors, key diversification against NXP's published AN10922 example.
- The whole card protocol (authenticate, MACed debit/credit, commit/abort, change key) between the reader code and a **software card**, including a card pulled away mid-transaction and a reply lost after a commit.
- The fare engine, the ledger (enforced by Postgres triggers: append-only, balanced, no negative card balance), top-up idempotency, signed device sync with replay protection, anomaly detection, reports, the live feed. These run against a **real PostgreSQL** (an embedded one, started by the tests).
- Validator and server together over HTTP (offline taps, lost replies, hotlist, forged replies, cloned-card detection).
- **Single-trip Ultralight tickets**: signature check (Ed25519, bound to the card's UID), password-protected writes, one-use enforcement on the card, on the device and on the server, copy detection, tickets pulled away mid-write. Against a software Ultralight with the real chip's password rules.
- **Cancelling a ticket** (void/refund): the sale is reversed in the books, the ticket is marked void, devices are told at their next sync and refuse it; a used ticket cannot be cancelled.
- **Ultralight C tickets** and the **P18Q terminal flow** (journal store, plugin contract, Keystore key provider) against software cards and a fake plugin; see docs/DEVICE.md.
- Sealed key files (wrong passphrase, tampering, per-station subsets) and the mobile-money adapter slot (two differently shaped callbacks).

**NOT verified here, and you must verify before going live:**
1. **The card protocol against a real DESFire card.** I had no hardware. The reader code follows NXP's datasheets and is exercised against a card simulator I also wrote, so a shared misunderstanding would not show. Run `npm run selftest -- --reader` on a **spare** card first (see below). If any step fails on the real card, do not personalise real cards.
2. The PC/SC reader glue (`nfc-pcsc`), the Raspberry Pi GPIO feedback and the Docker images were written but not run on real hardware or Docker in this environment.
3. **Mobile money**: the callback is verified through an adapter (`backend/src/domain/mobileMoney.ts`). Two adapters ship: the small signed format used by the tests, and one illustrating a differently shaped provider. **Neither is a real provider.** Writing the adapter for yours (MTN MoMo, Airtel Money, ...) is a short, testable job once you have their callback documentation and a sandbox account.
4. **Hardware-backed key custody.** Sealed key files (passphrase-encrypted, one file per kind of station) are built and tested: they keep master keys out of environment variables and out of plain files. A **KMS/HSM/NXP SAM** still needs your module behind `ExternalKeyProvider`: a SAM keeps keys out of process memory entirely, which a software file cannot.
5. **The P18Q plugin (`AfcDevicePlugin.java`).** Compiles against the vendor SDK and its CMAC is checked against RFC 4493, but no `BasicOper` call has run on a unit: follow the bench list in docs/DEVICE.md. Ultralight C keys and the Android Keystore key custody are in the same position. A SAM (secure access module) is not built.
5b. **Ultralight on a real reader.** The ticket logic is tested against a software chip; the pseudo-APDUs that read and write pages through an ACR122U/ACR1252U (and the password command through the reader's pass-through) come from the reader's manual and were not run on hardware. Bench-test one ticket write and read before relying on them.
6. **Not built, on purpose:** EV2/EV3 "secure messaging" (the newer channel; it needs an authenticated test against real cards, and writing it from memory would give a false sense of safety, so the code uses the EV1-compatible AES mode that EV2/EV3 cards also speak), LRP, and cards configured with **random UIDs** (they hide the UID the per-card keys are derived from; turn that feature off, or tell me and I will derive keys from a card serial stored in a free-read file). 

## Quick start, no hardware (about 5 minutes)

Needs Node 22.13 or newer. Nothing else: Postgres is started for you by an npm package.

```bash
cd afc-system
npm install

# 1. the API with its own throw-away Postgres, migrations and sample data (leave it running)
SEED_ADMIN_PASSWORD='Choose-a-passw0rd' npm run dev:embedded -w backend
#    it prints the signing secret for the demo device VAL-0001 once; copy it

# 2. the dashboard (another terminal)
npm run dashboard                       # http://localhost:3000   sign in as admin@afc.local with the password above

# 3. a validator with a simulated reader and demo cards (another terminal)
cd validator
DEVICE_ID=VAL-0001 DEVICE_SECRET=<the secret from step 1> SERVER_URL=http://127.0.0.1:4000 ROUTE_ID=2 STOP_ID=201 \
AFC_MASTER_KEY_PICC=$(openssl rand -hex 16) AFC_MASTER_KEY_ADMIN=$(openssl rand -hex 16) \
AFC_MASTER_KEY_DEBIT=$(openssl rand -hex 16) AFC_MASTER_KEY_CREDIT=$(openssl rand -hex 16) \
npm run sim
```

In the validator terminal type commands: `list`, `tap Thandi`, `tap Sipho` (student, 25% off), `tap Joyce` (senior, 50% off), `tap Low` (too little money), `stop 104` (change the stop), `tear <uid> 2` (the next card loses contact mid-tap), `lose-reply <uid>` (the next commit works but the reply is lost), `topup <uid> 5000`. Watch the dashboard Overview and Cards pages update. Staff accounts created by the seed: `admin@`, `operator@`, `agent@`, `viewer@afc.local`, all with the password you set.

To test a tap without a terminal: the unit and end-to-end tests do exactly this (`npm test`).

## Running it for real

### Server (Docker)
```bash
cd afc-system
cp .env.example .env        # fill in every value; generate secrets with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose up --build
docker compose run --rm backend npx tsx prisma/seed.ts     # first run only
```
Put the API and dashboard behind HTTPS (a reverse proxy such as Caddy or nginx). Staff sign-in tokens and the live-feed token travel in requests, so TLS is not optional.

### Validator hardware (Raspberry Pi 4)
- Reader: ACR122U or ACR1252U on USB. `sudo apt install pcscd libpcsclite-dev`, then `npm install` in `afc-system` (installs `nfc-pcsc`). Node 22.13+ (`node:sqlite` is built in, so there is no native database package to compile).
- Feedback wiring (BCM pin numbers, change with `GPIO_*`): GPIO17 to the green LED, GPIO27 to the red LED, each through a 330 ohm resistor to ground; GPIO22 to an active buzzer through an NPN transistor (2N2222, 1 kohm base resistor) so the pin does not source the buzzer's current. Install `sudo apt install gpiod` (the `gpioset` tool). Set `FEEDBACK=gpio`. Test it on the bench: this was not run on hardware.
- Power: a 5 V supply that tolerates vehicle voltage swings (a DC-DC converter rated for 9-36 V in, 5 V 3 A out). A power cut is safe: the tap flow writes its intent to disk first (see "How a tap stays safe").
- Run it as a service: a systemd unit running `npm run start -w validator` with `Restart=always`, the `.env` from `validator/.env.example`, and `After=pcscd.service`.
- A real clock matters: requests are rejected if the device clock is more than 5 minutes off. Use NTP, and an RTC module if the device is often offline for days.
- Tell the validator where it is: the vehicle's console or GPS posts the stop to `http://127.0.0.1:7070/stop` with `{"stopId":101}`; `GET /status` shows the queue and versions.

### Keys (read this before issuing a real card)
- There are five **master keys**, 16 random bytes each: `PICC` (the card's own master key), `ADMIN`, `DEBIT`, `CREDIT`, and `TICKET` (derives each Ultralight ticket card's write password). Each card gets its **own** keys, derived from the masters with its UID (AES-CMAC, NXP AN10922), so a key read from one card tells an attacker nothing about another.
- **Who holds what:** validators hold only `DEBIT` and `TICKET`. Top-up terminals hold only `CREDIT`. Only the personalisation station holds all of them. A stolen validator can take fares but can never add money.
- **Never** put master keys in source code, a committed file or the database. For development they come from `AFC_MASTER_KEY_*` environment variables (`DevKeyProvider`, which refuses to start in production). For production implement `ExternalKeyProvider` (`shared/src/keys.ts`) against your KMS, HSM or an **NXP SAM AV3**: it receives `01 || UID || AID || systemId || role` and returns the 16-byte card key. With a SAM the master key never leaves the chip.
- **Sealed key files (the step up from environment variables).** `npm run keys -- generate --dir ./keys` makes the master keys (never printed) and writes passphrase-encrypted files: `all.sealed` (for your safe and the personalisation station), `validator.sealed` (DEBIT + TICKET), `topup.sealed` (CREDIT). Re-seal a station's file with its own passphrase using `keys reseal`, and `keys check <file>` lists the roles with fingerprints so you can confirm a backup matches. Programs read `AFC_KEY_FILE` plus `AFC_KEY_PASSPHRASE_FILE` (a path to a systemd credential or mounted secret). The files are encrypted with scrypt + AES-256-GCM; the role list is authenticated, so a file cannot be quietly swapped for another. **Back up `all.sealed` and its passphrase in two different places.**
- **Know the trade-off:** a validator that derives card keys in software holds the `DEBIT` master in memory, so stealing one validator exposes every card's spending key. A SAM removes that; budget for one per validator for a serious deployment.

### Prepare a card
```bash
# once, on a SPARE card: does the real card behave the way the code expects?
npm run selftest -- --reader                       # add --piccKey <32 hex> if the card's master key is not all zeros

# then, per card:
export AFC_MASTER_KEY_PICC=... AFC_MASTER_KEY_ADMIN=... AFC_MASTER_KEY_DEBIT=... AFC_MASTER_KEY_CREDIT=...
export AFC_API_URL=https://api.example.com AFC_API_TOKEN=<a staff sign-in token>
npm run personalize -- --balance 0 --holder "Thandi Mokoena" --category adult --yes
```
`personalize` creates the fare application, sets the per-card keys, reads the balance back to prove it, and registers the card with the server (so the books match the card from day one). With `--sim` it does everything against a software card. **Assumption to check:** a blank EV2/EV3 card ships with an AES card master key of 16 zero bytes. If your supplier delivers DES or a different key, set the AES key once with NXP's tooling, then pass `--piccKey`.

### Single-trip tickets (Ultralight)

For passengers without a fare card: a cheap MIFARE Ultralight EV1 (MF0UL21) or NTAG213/215 card sold at the counter, good for one trip within a time window.

- **On the card:** 16 bytes of ticket data (route or "any", ticket number, valid from/until), a 64-byte Ed25519 signature over the data **and the card's UID**, and a "used" record.
- **Why validators cannot mint tickets:** they hold only the *public* key, delivered by the server at sync. The private key stays on the server (`TICKET_SIGNING_KEY`).
- **Why a phone cannot reset a ticket:** writes need a per-card password (derived from the `TICKET` master key), set at the counter, with the configuration locked and five wrong tries locking the card.
- **Sell one:** `npm run tickets -- keygen` once (put the private key in your secret store as `TICKET_SIGNING_KEY`, with `TICKET_KEY_ID`), then at the counter `npm run tickets -- issue --route 1 --minutes 120 --price 1500 --method CASH --reference RC-1001` and tap a blank card (`--sim` for a software card). The sale is booked in the ledger (cash received, income earned), keyed on the receipt number so it can never be sold or charged twice.
- **Use one:** the validator checks the signature, route, dates, the card's own "used" record and this device's record, then writes "used" and reports it. Offline works.
- **The honest limit:** Ultralight has no card-side cryptography, so a *full copy* of an unused ticket onto a special card with the same UID can be used once per device that has not heard about the other copy. This device refuses a copy of a ticket it has already accepted; the server flags the same ticket number used twice (HIGH alert; three serious flags block the card). Keep tickets short-lived and cheap; do not sell high-value passes on Ultralight (use DESFire cards for those).

## How a tap stays safe

1. **Hotlist** (blocked/lost cards) is checked before the card is touched.
2. **The UID alone is never trusted.** The validator authenticates with the card's own diversified AES key; a copied UID gets nowhere.
3. The fare is worked out from the card's balance and its tap record, using the local fare table (no network needed).
4. The validator **writes an intent to disk** ("I am about to take this fare; the card's counter will become N").
5. **Debit + new tap record + commit** happen as one transaction on the card: all or nothing.
6. If the card is pulled away or the reply is lost, the outcome is unknown. The next time the card is read, its counter tells the truth: counter = N means the fare was taken (recorded once, passenger **not** charged again); lower means it was not (processed normally).
7. Each tap becomes a queued record with its own id. Sync sends them signed; the server stores each id once, however often it is sent. Records leave the queue only when the server confirms them.

## Money, and what the books check

Every movement is a balanced double-entry **journal** (`card:<uid>`, `revenue:route:<id>`, `prepaid:pending`, `clearing:cash`, ...). Postgres itself refuses to change or delete a posting, and refuses a journal that does not add up, and refuses a card balance below zero. The physical card is the source of truth for its balance; the server's ledger follows it and **flags** disagreements instead of hiding them: a balance that does not match, two taps claiming the same card counter (a cloned card or leaked key; the second is kept but not posted), a fare no route could charge, arithmetic that does not add up, a device skipping sequence numbers, an unregistered card. Three serious flags on a card within 24 hours block it automatically and put it on the hotlist.

Top-ups: money received is recorded (cash or mobile money) and sits in `prepaid:pending` until a terminal holding the CREDIT key puts it on the card; then the terminal confirms. The same receipt or provider reference can never credit twice.

## Environment variables

| Where | Variable | Meaning |
|---|---|---|
| backend | `DATABASE_URL` | Postgres connection |
| backend | `JWT_SECRET` | 32+ characters, signs staff tokens (required in production) |
| backend | `DEVICE_KEY_MASTER` | 64 hex characters; device signing secrets are derived from it (required in production) |
| backend | `CORS_ORIGIN` | the dashboard's address |
| backend | `MOBILE_MONEY_WEBHOOK_SECRET` | enables `POST /api/webhooks/mobile-money` (HMAC-SHA256 over the raw body in `x-signature`) |
| backend | `TICKET_SIGNING_KEY`, `TICKET_KEY_ID`, `TICKET_RETIRED_KEYS` | the Ed25519 key that signs tickets (base64 PKCS8), its number, and old public keys still accepted as `id:hex,id:hex`. Without a key, ticket endpoints answer 503 (development derives one from `JWT_SECRET`) |
| backend | `MOBILE_MONEY_PROVIDER` | which adapter reads the provider's callbacks (`generic`, `example`, or yours) |
| backend | `AUTO_BLOCK_HIGH_ANOMALIES`, `LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`, `LOGIN_RATE_LIMIT` | see `backend/.env.example` |
| dashboard | `NEXT_PUBLIC_API_URL` | where the browser reaches the API (build time) |
| validator | `DEVICE_ID`, `DEVICE_SECRET`, `SERVER_URL`, `ROUTE_ID`, `STOP_ID`, `SQLITE_PATH`, `SYNC_INTERVAL_SECONDS`, `FEEDBACK`, `CONTROL_PORT` | see `validator/.env.example` |
| validator / scripts | `AFC_KEY_FILE`, `AFC_KEY_PASSPHRASE_FILE` | a sealed key file and the path to its passphrase (production) |
| validator / scripts | `AFC_MASTER_KEY_PICC/ADMIN/DEBIT/CREDIT/TICKET` | development key provider (32 hex each) |
| personalize | `AFC_API_URL`, `AFC_API_TOKEN` | register cards while personalising |

## Tests

```bash
npm test            # 191 tests; the backend ones start an embedded Postgres, so the first run is slower
npm run typecheck
npm run selftest    # test vectors + the card protocol against the simulator
```
Covered: crypto vectors, card protocol and failure cases, fare engine, ledger rules, top-ups, device authentication and replay, offline sync, anomaly detection, access control, reports, validator tap flow, and validator + server end to end.

## First-run checklist

1. `npm install`, `npm test` (everything passes on your machine).
2. Quick start above with the simulator; tap the demo cards; look at the dashboard.
3. Generate real secrets (`.env`): `POSTGRES_PASSWORD`, `JWT_SECRET`, `DEVICE_KEY_MASTER`. `docker compose up --build`, seed, put TLS in front. **Change every seeded password**; remove or deactivate the demo accounts and the demo device.
4. In the dashboard: Fares & routes (your routes, stops, zones, fares), then **Publish**. Devices: register each validator, copy its secret to the device.
5. Generate the four master keys, store them in your key service, **back them up** (losing `DEBIT`/`CREDIT`/`ADMIN`/`PICC` means cards can no longer be read or topped up).
6. Buy a few spare DESFire EV2/EV3 cards and a reader. Run `npm run selftest -- --reader`. **Stop if anything fails.**
7. Personalise a handful of real cards, tap them on a bench validator, check the dashboard, block one, watch the validator refuse it after its next sync.
8. Pilot on one vehicle before the fleet.

## What you must configure or supply yourself

- The four master keys and a production key service (KMS/HSM, ideally NXP SAM AV3 per validator).
- `JWT_SECRET`, `DEVICE_KEY_MASTER`, database credentials, TLS certificates and a domain.
- DESFire cards and readers (check the cards' key defaults and UID mode).
- Your mobile-money provider account and an adapter for their callback format (the placeholder shows the shape: signature, idempotent reference).
- Your fares, routes, stops and discount policy; staff accounts and their roles.
- Legal and regulatory: holding passenger money (stored value) may need approvals (in South Africa, check with the Reserve Bank/PASA position on closed-loop prepaid instruments, and POPIA for the personal data you hold: card holder names and tap histories).
- Monitoring and backups of the database; the ledger is the financial record.

See `docs/THREAT_MODEL.md` for what the design defends against and what remains.
