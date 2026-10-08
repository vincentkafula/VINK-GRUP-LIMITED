# VINK tokens: the closed-loop points system

VINK works like the City of Cape Town's MyCiTi card or Golden Arrow's card, adapted to the minibus taxi industry, where fares are shared between
a driver, an owner, an association and a device investor instead of going to one company.

Real money stays in **one pooled bank account** (a transactional account at any registered bank). Customers hold **tokens** against it. A tap moves tokens between
wallets on the VINK ledger. **Nothing moves in the bank** until someone turns tokens back into money.

## The money flow

| Step | What happens | Bank movement |
|---|---|---|
| **Buy tokens** | A customer pays into the pooled account quoting their **account number** (their payment reference, `VKR…`). When the bank's credit is recorded, the same amount is issued as tokens to their wallet. 1 token = R1 (K1 for kwacha). | Money in |
| **Tap** | The passenger taps a VINK card on the driver's device. The server takes the **route fare** from the card's wallet. The money engine settles it to the owner side (or the driver on a cash-basis agreement) after the platform fee. | None |
| **Trip** | Every 16 taps make a trip. The driver then pays the **association levy** (R20 or what the association sets, to the marshal who logged the departure, otherwise to the association) and the investor's **device fee** (R1 by default, a setting). | None |
| **Weekly / monthly** | The owner-driver agreement (for example R1 000 a week) runs from the same wallets. | None |
| **Turn tokens into money** | Tokens go to the holder's own verified VINK bank account (instant), or the holder asks for a **cash-out** and staff pay it out of the pool, or staff make a **refund** for any reason. | Money out (cash-out and refund only) |
| **Send tokens** | A holder sends tokens to another holder in the same currency; across South Africa and Zambia through the cross-border corridor when one is open. | None |

Tokens cannot be withdrawn any other way. There is no manual withdrawal: only the token service moves tokens out of a wallet, each time under a reference that makes it
happen once.

## Where the pieces are

- `server/src/services/tokenService.ts`: wallets, cards, the tap, transfers, redemption, cash-outs, activity, route fares, settings.
- `server/src/services/moneyEngine.ts`: a holder with an active token wallet is paid in tokens everywhere the engine moves money (`tokenParty`). The investor's per-trip device fee is created with the trip.
- `server/src/services/poolService.ts`: unchanged. A bank credit with the holder's account number is credited to their token wallet because the engine resolves the holder to it.
- `server/src/portal/tokenRoutes.ts`: the holder's API (`/api/portal/<role>/tokens`), the device API (`/api/terminal/token`) and the staff API (`/api/admin/tokens`).
- Screens: **VINK Tokens** in every portal dashboard (`TokensPanel.tsx`) and the **VINK tokens** panel on the staff country-configuration page.
- Tables: `token_wallets`, `token_cards`, `token_routes`, `token_settings`, `token_events`, `token_cashouts` (in `db/schema.sql`).

Ledger accounts: a wallet is `wallet:<currency>:<userId>`. Staff cash-outs wait in `sys:token_cashout` (or `sys:zmw:token_cashout`) until they are paid or rejected.
Reconciliation (`/api/admin/money/reconciliation`) checks that every confirmed token tap has its journal and that the cash-out holding account equals the requests waiting.

## The device

The device proves itself with its serial number and API key (`x-terminal-serial`, `x-terminal-api-key`).

```
GET  /api/terminal/token/routes                       the fares of the device's association
POST /api/terminal/token/tap                          Idempotency-Key: <unique per tap>
     { "cardNumber": "04A1B2C3", "routeId": "<uuid>" }
201  { "success": true, "data": { "tapId", "fareCents": 2000, "balanceCents": 8000, "route": "Langa – Cape Town", "replayed": false } }
402  { "success": false, "code": "insufficient_tokens" | "card" | "wallet" | "currency", "error": "…" }
```

A retry with the same key answers as before and never charges twice. The device only names the route; **the server decides the fare**, so a tampered device cannot
change a price. A card is identified by its chip UID, stored only as a hash. A holder blocks a lost card at once from their screen.

## Settings

| Setting | Where | Default |
|---|---|---|
| Fare per route | Association: **VINK Tokens > Route fares** | none (a device cannot charge until its association has set a route) |
| Association levy per trip | Association: **Marshal fee** setting | country default (R20) |
| Device fee per trip (paid to the investor) | Staff: **VINK tokens** panel | R1.00 (still being negotiated) |
| Platform fee per tap | Country profile (`afc`) | as configured |

Token taps do not pay the investor a share of each tap: the investor earns the per-trip device fee instead.

### CATA Langa routes (effective 1 October 2025, R20 each)

Langa – Cape Town · Langa – Khayelitsha · Langa – Sea Point · Langa – Woodstock · Langa – Montague Gardens · Langa – Century City · Langa – Canal? · Langa – Horry Cross

Please confirm the spelling of the last two with CATA before entering them. The association enters these under **VINK Tokens > Route fares**.

## Before real money

- The system runs in the sandbox by default. Live mode follows the country profile and the go-live checklist; **no real customer money should be taken until**:
  - a **BIN sponsor / sponsor bank** and the pooled account are in place, and the legal structure for holding customer funds (stored value / e-money, FICA accountable-institution status, safeguarding of the pool) is confirmed by the company's legal adviser;
  - the **licences** for South Africa and Zambia are in place;
  - the pooled account's details and the bank-feed webhook are configured (see `MONEY_ENGINE.md`).
- Wallets currently use the standard KYC tier limits of the country profile. Per-tier wallet limits tied to the identity checks a holder has passed are still to be built.

## Not built yet

- Buying tokens at a retailer (Shoprite, Pick n Pay and so on): today a customer pays by EFT or deposit into the pooled account with their account number as the reference. A retail agent channel would pay into the same account and quote the same reference.
- A physical reader app that calls the device API (the API is ready and tested).
- Issuing a real bank card (Visa/Mastercard) linked to the holder's VINK bank account. Today tokens move into the VINK bank account instantly, and the card on that account is the existing banking product.
- Refunds back to the original payer's bank account are paid by staff by hand from the pool and then marked paid.
