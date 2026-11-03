# Rank devices: shared card devices at the rank

To cut cost, vehicles do not each carry a payment device. A route has a shared device at each end (its departure rank and its destination rank). The marshal opens a **loading session** for the vehicle at the front of the queue; the **driver taps their own driver card** on the device to pair it; passengers then pay on that device; when the vehicle is full the session closes and the next vehicle loads. An owner may still register a device of their own for their own vehicle.

**Status: slices 1 to 3 of 5 are built** (sessions and pairing, passenger taps, and the money following the driver, below). The live dashboards (slice 4) and owner-owned devices, offline sync and reports (slice 5) are not built yet.

## 1. How the existing system works (what this builds on)

- **Terminals** (`terminals`): a device with a serial and an API key, authenticating with `x-terminal-serial` and `x-terminal-api-key`. Each belongs to a vehicle, an owner, a driver, an investor and an association, all fixed on the device.
- **Taps** (`terminal_taps`, `POST /api/terminal/tap`): two kinds. A **bank card** tap is recorded with its revenue split (VINK fee, investor share, the owner side's remainder) but **no money moves yet** (the route says so; it waits for a real card acquirer). A **VINK token card** tap (`tokenService.tapToken`) is the real money path: the card is a closed-loop prepaid wallet identified by its chip UID (hashed), the **server** decides the fare from the route, it is idempotent by a key, the fare is posted to the ledger, and the split is settled.
- **Cards**: `token_wallets` have a role (passenger, driver, owner, marshal, ...) and `token_cards` hold the hashed UID. A driver card is therefore just a token card on a driver's wallet.
- **Ranks, marshals, queue, departures**: `ranks`, `rank_marshals`, `rank_queue` (a vehicle can be in one queue at a time) and `departures` (logged by the marshal), with the marshal dashboard API at `/api/portal/marshal`.
- **Trips and settlement** (`moneyEngine`): taps become `trips` per departure, and settlement pays the **terminal's** owner and driver.
- **Live updates**: a WebSocket `LiveHub` for signed-in clients.
- **Audit**: `audit_log`, written by one helper.

## 2. What the specification maps to

| Specification | Where it lives | Status |
| --- | --- | --- |
| Devices (serial, type rank/owner, route, rank, owner, status, last seen) | `terminals` + new `kind`, `rank_id`, `route_id` | **Built** (slice 1) |
| Ranks and routes, two devices per route | `ranks`, `token_routes` + new `from_rank_id`, `to_rank_id`; one active device per route end enforced | **Built** |
| Marshals | `rank_marshals`, the marshal role | Existing |
| Vehicle queue (waiting / loading / departed) | `rank_queue` + the session; status is derived | **Built** |
| Loading sessions | new `loading_sessions` | **Built** |
| Driver cards | token cards on a driver's wallet | Existing, reused |
| Device pairing endpoint | `POST /api/terminal/pair` | **Built** |
| Start / end session, queue management | marshal routes below | **Built** |
| Passenger tap into a session, double-tap rule | `tapToken` + a session, `POST /api/terminal/token/rank-tap` | **Built** (slice 2) |
| Money goes to the driver who paired the session | `moneyEngine` settlement and trips | **Built** (slice 3) |
| The driver's dashboard data and withdrawal | `GET /api/portal/driver/loading`; the driver's VINK token wallet and cash-out | Data **built**; screen is slice 4 |
| Live driver dashboard (WebSockets) | `LiveHub`, with private channels | Slice 4 (polling works now) |
| Owner-owned devices, reports, offline sync | | Slice 5 |
| Audit of every pairing, tap and session change | `audit_log` and `terminal_taps` | **Built**: sessions, pairing and blocked taps are in the audit log; every accepted or declined tap is a `terminal_taps` row tied to its session |

## 3. What slice 1 does

State of a session: **pending** (opened, waiting for the driver's card) → **loading** (paired) → **closed** (departed) or **cancelled**.

Marshal (at `/api/portal/marshal`, only for a rank the association assigned them):

- `GET /ranks/:id/loading`: the queue with each vehicle's status (waiting / pairing / loading) and the rank's devices (online, in use).
- `POST /ranks/:id/sessions` `{terminalId, queueId?}`: open a session (default: the first vehicle not already loading).
- `POST /ranks/:id/sessions/:sid/cancel` `{reason?}`: a session that never loaded. Refused once passengers have paid.
- `POST /ranks/:id/sessions/:sid/close` `{passengers?, note?}`: the vehicle departs. The departure is logged exactly as the marshal's Depart button does and the vehicle leaves the queue.

Device (authenticated like a tap):

- `POST /api/terminal/pair` `{cardUid}`: the driver's card. Pairs, or answers with a code and reason: `no_session`, `card_unknown`, `card_blocked`, `not_driver_card`, `wrong_driver` (not the driver the owner put on that vehicle or one of the owner's active drivers), `device_busy` (already loading another driver), `driver_busy` (already loading another vehicle). The same card tapped again is answered as a retry.

Admin: the existing `PATCH /api/terminal/terminals/:id` now takes `kind` (`vehicle` or `rank`), `rankId` and `routeId`. The rank must be at one end of the route, and a route has one active device at each end.

Guarantees, whatever order requests arrive in (database indexes): one open session per device, one per vehicle, one loading vehicle per driver. A session nobody pairs is cancelled after 10 minutes. Closing can only happen once. Every change and every refused pairing is in the audit log, and only the last four characters of a card are ever logged.

### Slices 2 and 3: passengers pay, and the money follows the driver

- **Passenger tap** (device, `POST /api/terminal/token/rank-tap` with `cardNumber` and an `Idempotency-Key` header): accepted only while a driver is paired. The server decides the fare from the route the device serves. It is recorded on the session, which keeps a running passenger count and total recounted from its taps. Refusals: `no_session`, `not_paired`, `no_route`, `bad_card`, `duplicate_tap`, and the token service's own (`card`, `wallet`, `currency`, `insufficient_tokens`).
- **A retry is safe:** the same reference is answered as before and charges once. **The same card again within 10 seconds on a new reference is refused** (`duplicate_tap`), so a double tap cannot charge twice. A person paying for a second seat taps again after the window.
- **Who is paid (settlement):** the driver is the one who tapped their card to pair the session (drivers change), and the owner is the vehicle's owner, **not** the terminal's. The driver is credited their VINK token wallet at once, with the fare less the platform's flat fee, and can **withdraw it any time** through the existing VINK Tokens cash-out to cover fuel and other costs. The one exception is an active **monthly salary or per-trip agreement** between that owner and that driver: then the owner receives the fares and pays the driver under the agreement (the owner and driver consented to those automatic transfers). A substitute driver with no agreement keeps what they collect. Taps that do not belong to a session settle exactly as before.
- **One trip per session:** when the vehicle departs, its taps become a trip for the session's own vehicle, driver, owner and marshal, linked to the departure. The marshal fee and the investor's device fee are charged to that driver, and any per-trip pay is due from the owner to that driver. If that step fails the departure still stands and the next money cycle makes the trip, and the ordinary trip run never takes a session's taps (it would split a vehicle that is still loading).
- **The driver's dashboard data:** `GET /api/portal/driver/loading` returns the vehicle this driver is loading now (passengers, running total, the latest taps) and what their departed sessions today came to. It is always the signed-in driver's own. The screen that shows it live is slice 4.

## 4. How to test it without hardware

- **Automated:** `server/src/portal/rankSessions.test.ts` (sessions, pairing, taps, the driver's data and the wiring) and `server/src/services/rankTapMoney.test.ts` (the real token service, ledger and money engine: who is paid, trips and fees) cover every rule above.
- **By hand, in sandbox:**
  1. Register a device (`POST /api/terminal/register`, a reviewer role). Its API key is **shown once**.
  2. Make it a rank device: `PATCH /api/terminal/terminals/<id>` with `{"kind":"rank","rankId":"…","routeId":"…"}` (the route needs `from_rank_id` and `to_rank_id` set to its two ranks).
  3. As a marshal, join a vehicle to the queue, then `POST /ranks/:id/sessions`.
  4. Act as the device: `npm run rank:simulate -- --url http://localhost:3001 --serial <serial> --key <apiKey> --card <driver card UID> [--times 2]` from the `server` folder. Try a passenger's card, an unknown card, and another driver's card to see each refusal.
  5. Passengers: `--action tap --card <a passenger's VINK card>` (the card must be on a wallet with tokens). `--ref <x>` twice shows a safe retry; two taps in a few seconds show `duplicate_tap`.
  6. As the driver, `GET /api/portal/driver/loading`; as the marshal, `GET /ranks/:id/loading`, then `close` the session. The driver's VINK Tokens balance has gone up by the fares less the fee.

## 5. Decisions, with a recommendation for each

| Decision | Options | Recommended |
| --- | --- | --- |
| **Owner-owned device: does the driver still tap to start a session?** | Yes, or no | **Decided: yes.** Drivers change, so whoever is driving taps their card and the session (and its money) is theirs. The owner device skips the marshal and the rank pairing but keeps the driver tap (slice 5). |
| **Whose dashboard the money shows on, and can they withdraw?** | | **Decided:** the driver who is driving, to withdraw any time to cover expenses. Built as in slice 3 above. |
| **Fare split between driver and owner** | Percentage; fixed amount per trip; keep today's rule | **Today's rule is kept** (VINK's flat fee comes off first, the investor is paid a device fee per trip), and only *who is credited* changed. **Still open: what the owner receives when the driver keeps the fares.** Today that is the weekly amount a cash-basis agreement sets. A substitute driver with no agreement owes the owner nothing automatically. Decide whether a substitute should owe the owner a set amount. |
| **Same card tapped twice quickly** | Block for a short window; allow and flag; allow for several seats | **Built as recommended:** the same card on the same session is refused for 10 seconds, then allowed, and the blocked tap is in the audit log (`DUPLICATE_WINDOW_MS`). |
| **Insufficient balance** | Decline; allow a small negative | **Decline** with "Not enough tokens" (already how a token tap works). |
| **Card type** | VINK prepaid closed-loop card (Mifare-type chip UID); bank cards (EMV) | **VINK prepaid card for fares.** It is the only card that can be charged today. Bank-card taps are recorded but no money moves until a real acquirer exists. |
| **Connectivity** | SIM; Wi-Fi | **SIM** (a rank has no reliable Wi-Fi), with offline taps queued on the device and synced with the same idempotency key. |

## 6. Risks found in the current design

1. ~~Settlement pays the terminal's owner and driver.~~ **Fixed for session taps** (slice 3). Every other tap is unchanged.
2. ~~Trips are built from the terminal's own vehicle.~~ **Fixed:** one trip per departed session.
3. **The live hub sends every event to every signed-in client** and does not remember who each socket belongs to. Used as it is, any signed-in user would see every driver's takings. It needs private channels (by session and user) before slice 4.
4. **A token tap on an ordinary vehicle device still has no short-window duplicate rule**, only a retry key. The rank tap has one. The rule recognises a card by its **last four characters** (all the tap record keeps), so two different cards that end the same, tapped within 10 seconds on one session, would be mistaken for one: about 1 in 65,000 per pair, and the cost is "tap again in a few seconds".
5. **Bank-card taps record a split but move no money**, so they must not be offered as a way to pay a fare yet.
6. **Closing a session is three statements, not one transaction** (close, leave the queue, log the departure). The first is atomic and guards against doubles, but a crash between them could leave a closed session without its departure. The audit log and the departure link make it detectable.
7. **Queue order on a tie uses a random id** (already known), so two vehicles joining in the same instant have no fixed order.
8. **A session's counts are recounted from its taps,** so they are always right, but the driver's screen shows what has been recorded: until slice 4 it has to poll.
9. **Substitute drivers and owners:** with the driver keeping the fares, an owner is only paid automatically under a cash-basis agreement. See the open decision in section 5.

## 7. What is next

1. **Slice 4:** private live channels (by user and session) on the live hub, the Driver Loading Dashboard (live total, passenger count, last taps, vehicle full / depart, and the withdraw button), and the marshal's screens.
2. **Slice 5:** owner-owned devices (the driver still taps), offline taps queued on the device and synced by the same reference, and reports per session, driver, vehicle and route.
3. **First, your decision** on what a substitute driver owes the owner (section 5).
