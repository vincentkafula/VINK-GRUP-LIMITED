# Rank devices: shared card devices at the rank

To cut cost, vehicles do not each carry a payment device. A route has a shared device at each end (its departure rank and its destination rank). The marshal opens a **loading session** for the vehicle at the front of the queue; the **driver taps their own driver card** on the device to pair it; passengers then pay on that device; when the vehicle is full the session closes and the next vehicle loads. An owner may still register a device of their own for their own vehicle.

**Status: slice 1 of 5 is built** (sessions and pairing, below). Passenger taps, settlement, the live dashboards and owner devices are not built yet; they need the decisions in section 5.

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
| Passenger tap into a session, double-tap rule | `tapToken` + a session | Slice 2 |
| Money goes to that vehicle's owner and driver | `moneyEngine` settlement | Slice 3 (needs approval) |
| Live driver dashboard (WebSockets) | `LiveHub`, with private channels | Slice 4 |
| Owner-owned devices, reports, offline sync | | Slice 5 |
| Audit of every pairing, tap and session change | `audit_log` | **Built** for sessions and pairing |

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

## 4. How to test it without hardware

- **Automated:** `server/src/portal/rankSessions.test.ts` (25 tests on an in-memory Postgres) covers every rule above.
- **By hand, in sandbox:**
  1. Register a device (`POST /api/terminal/register`, a reviewer role). Its API key is **shown once**.
  2. Make it a rank device: `PATCH /api/terminal/terminals/<id>` with `{"kind":"rank","rankId":"…","routeId":"…"}` (the route needs `from_rank_id` and `to_rank_id` set to its two ranks).
  3. As a marshal, join a vehicle to the queue, then `POST /ranks/:id/sessions`.
  4. Act as the device: `npm run rank:simulate -- --url http://localhost:3001 --serial <serial> --key <apiKey> --card <driver card UID> [--times 2]` from the `server` folder. Try a passenger's card, an unknown card, and another driver's card to see each refusal.
  5. As the marshal, `GET /ranks/:id/loading`, then `close` the session.

## 5. Decisions, with a recommendation for each

| Decision | Options | Recommended |
| --- | --- | --- |
| **Owner-owned device: does the driver still tap to start a session?** | Yes, or no | **Yes.** Without it a fare cannot be tied to a driver, and the driver's pay agreement and accountability depend on that. Skip the marshal and the rank pairing, but keep the driver tap. |
| **Fare split between driver and owner** | Percentage; fixed amount per trip; keep today's rule | **Keep today's rule**: VINK's flat fee comes off, the investor gets their share of that fee, the owner gets the rest, and the driver's pay stays the private agreement between owner and driver. Only change who is credited (slice 3), not the maths. |
| **Same card tapped twice quickly** | Block for a short window; allow and flag; allow for several seats | **Block the same card on the same device for 10 seconds, then allow**, and record the blocked tap. A person paying for two passengers taps twice on purpose, so the window is short and configurable. |
| **Insufficient balance** | Decline; allow a small negative | **Decline** with "Not enough tokens" (already how a token tap works). |
| **Card type** | VINK prepaid closed-loop card (Mifare-type chip UID); bank cards (EMV) | **VINK prepaid card for fares.** It is the only card that can be charged today. Bank-card taps are recorded but no money moves until a real acquirer exists. |
| **Connectivity** | SIM; Wi-Fi | **SIM** (a rank has no reliable Wi-Fi), with offline taps queued on the device and synced with the same idempotency key. |

## 6. Risks found in the current design

1. **Settlement pays the terminal's owner and driver**, which is wrong for a shared device: the money must follow the vehicle and driver in the **session**. This is the riskiest change (slice 3), so it needs your approval first.
2. **Trips are built from the terminal's own vehicle**, so a rank device produces no trips until slice 3.
3. **The live hub sends every event to every signed-in client** and does not remember who each socket belongs to. Used as it is, any signed-in user would see every driver's takings. It needs private channels (by session and user) before slice 4.
4. **A token tap has no short-window duplicate rule**, only a retry key, so the same card tapped twice quickly is charged twice (section 5).
5. **Bank-card taps record a split but move no money**, so they must not be offered as a way to pay a fare yet.
6. **Closing a session is three statements, not one transaction** (close, leave the queue, log the departure). The first is atomic and guards against doubles, but a crash between them could leave a closed session without its departure. The audit log and the departure link make it detectable.
7. **Queue order on a tie uses a random id** (already known), so two vehicles joining in the same instant have no fixed order.

## 7. What is next

1. **Slice 2 (small):** a passenger tap on a rank device is accepted only while a session is `loading`, adds to the session's count and total, applies the duplicate rule, and is safe to retry.
2. **Slice 3 (needs approval):** settlement and trips follow the session's vehicle, owner and driver.
3. **Slice 4:** private live channels, the Driver Loading Dashboard, the marshal screens.
4. **Slice 5:** owner devices, offline sync and reports.
