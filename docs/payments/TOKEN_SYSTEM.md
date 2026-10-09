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
| **Turn tokens into money** | Tokens go to the holder's own verified VINK bank account (instant), or the holder asks for a **cash-out** and the **system pays it to the holder's own debit card**. Staff can make a **refund** for any reason: it is paid the same way, to the holder's own card. | Money out (to the holder's own debit card only) |
| **Send tokens** | A holder sends tokens to another holder in the same currency; across South Africa and Zambia through the cross-border corridor when one is open. | None |

Tokens cannot be withdrawn any other way. There is no manual withdrawal and **no payout by hand**: only the token service moves tokens out of a wallet, each time under a reference that makes it
happen once, and money only ever goes to a verified debit card in the holder's own name.

## Where the pieces are

- `server/src/services/tokenService.ts`: wallets, cards, the tap, transfers, redemption, cash-outs, activity, route fares, settings.
- `server/src/services/moneyEngine.ts`: a holder with an active token wallet is paid in tokens everywhere the engine moves money (`tokenParty`). The investor's per-trip device fee is created with the trip.
- `server/src/services/poolService.ts`: unchanged. A bank credit with the holder's account number is credited to their token wallet because the engine resolves the holder to it.
- `server/src/portal/tokenRoutes.ts`: the holder's API (`/api/portal/<role>/tokens`), the device API (`/api/terminal/token`) and the staff API (`/api/admin/tokens`).
- Screens: **VINK Tokens** in every portal dashboard (`TokensPanel.tsx`) and the **VINK tokens** panel on the staff country-configuration page.
- Tables: `token_wallets`, `token_cards`, `token_routes`, `token_settings`, `token_events`, `token_cashouts`, `token_payout_cards`, `token_issued_cards`, `token_card_spend` (in `db/schema.sql`).

Ledger accounts: a wallet is `wallet:<currency>:<userId>`. Payouts wait in `sys:token_cashout` (or `sys:zmw:token_cashout`) until the card is paid or the payout is refused, and card purchases wait in `sys:card_settlement` until the sponsor bank settles them with the scheme.
Reconciliation (`/api/admin/money/reconciliation`) checks that every confirmed token tap has its journal, that the cash-out holding account equals the payouts waiting or with the card service, that the card settlement account equals the approved card purchases, and it flags payouts with no answer for 15 minutes, payouts that failed six times, and debit cards waiting for review.

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

### The card reader app (`/reader`)

A driver opens **`/reader`** in Chrome on an Android phone with NFC. The first time, they enter the serial number and API key the device was registered with (kept on that phone only). They pick the route, tap **Start reading cards**, and the passenger taps a VINK card on the back of the phone. The chip number is read with Web NFC and sent to the tap endpoint; the screen shows a large green **R 20.00 Paid** (with the card's balance and how many seconds it took) or a red **Not enough tokens**. A phone or browser without NFC can type the card number instead.

A tap that loses the connection is never assumed paid or unpaid: the screen offers **Try again**, which resends the same tap reference, so the passenger is charged at most once. There is no offline payment: a balance can only be checked by the server.

## Buying tokens with cash at a retailer

A VINK point of sale at a till or a spaza shop (registered like any retail terminal) calls `/api/retail/token` with its serial number and API key (`x-retail-serial`, `x-retail-api-key`):

```
POST /api/retail/token/lookup   { "reference": "VKR123456789" }                         -> { "holder": "Pam M." }   so the cashier can confirm the customer
POST /api/retail/token/topup    { "reference": "VKR123456789", "amountCents": 20000, "receipt": "TILL-0001" }
201 credited now | 202 recorded, tokens arrive when the retailer's payment clears | 200 already recorded | 409/404/400 refused
```

A cash top-up is between R10 and R5 000, and the receipt number makes it happen once. The retailer pays the money into the pooled account afterwards, so the credit is recorded as not yet cleared: the customer's tokens are issued at once when the instant-credit reserve covers it (and the country profile's limits allow it), otherwise when staff mark the retailer's settlement as cleared on the money page, like any other bank credit that has not arrived yet. Only token wallets are served: the cashier sees the customer's first name and surname initial and nothing else.

## Verification levels

Every wallet starts at **basic**. Staff raise it (basic, standard, full, business) on the staff page once the holder's identity is checked. The country profile's limits for that level then apply: the balance limit and daily money in (top-ups that go over wait for staff instead of being credited), and the daily limit on tokens leaving a wallet (transfers, moves to the bank and cash-outs together). Fares are never limited, and a refund made by staff is not limited. Limits are only enforced when the country profile has "enforce limits" switched on.



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

## Payouts: only to the holder's own debit card, and only by the system

A cash-out or a refund is **never paid to a bank account and never by hand**. It is pushed to a **verified debit card in the holder's own name** by the card payout provider (the way a refund goes back to the card that paid in), and the tokens leave the wallet only when that succeeds.

**Adding a card.** The holder adds a debit card under **VINK Tokens > My debit cards**: card number, expiry and the name on the card. The number is passed once to the card vault to be turned into a token and is **never stored or logged**; VINK keeps the provider token, the brand, the last four digits and the expiry. The card is refused when it is a credit or prepaid card, expired, fails the card check, or is not a published **sandbox test card**: until the processor's hosted card fields exist (so the number never reaches VINK's servers at all) a real card number is refused before anything is done with it. When the name on the card is not the account holder's (surname and first initial), the card waits for a person to approve it on the staff page; otherwise it is verified at once. Up to three cards.

**Paying.** The holder picks an amount (R10 to R25 000, rand only) and a verified card. The tokens move to the cash-out holding account and the system sends the payout straight away:

| Result | What happens |
|---|---|
| Sent | The holding account is cleared against the pool, the payout shows **Paid**, the holder sees "Paid to your debit card". |
| Declined by the card issuer | The tokens return to the wallet at once, with the reason. |
| Not answered or provider down | The tokens stay held and the system tries again after 1, 5, 30, 120, 360 and 720 minutes. After six tries it waits for a person, who can **Try now** or **Refuse** (the tokens go back). A refusal is only possible for a payout that is waiting, never one that is with the card service. |
| Sent but the answer was lost | After 5 minutes the same payout is asked again with the **same reference**; the card service pays a reference once, so the holder is never paid twice. |

Staff have no "mark as paid" button and there is no endpoint for it. A **refund** by staff (with a written reason) goes through the same path to the holder's own card, and fails with a clear message when the holder has no verified debit card.

**Providers** (`CARD_PAYOUT_PROVIDER`):

- `mock` (default in the sandbox): the bundled rail, no network. Test cards: Visa 4111 1111 1111 1111 (pays), 4000 0000 0000 0002 (declined), 4000 0000 0000 0119 (the provider fails twice, then pays), 4242 4242 4242 4242 (a credit card, refused), Mastercard 5555 5555 5555 4444 (pays), 5105 1051 0510 5100 (prepaid, refused).
- `visa_direct`: **Visa Direct push-to-card, sandbox only** (`providers/visaDirect.ts`). It follows Visa's published Funds Transfer push API and has not yet been run against the sandbox (no credentials here), so confirm the field names and the action-code table first. It needs `SANDBOX_VISA_API_KEY` and its auth settings, `SANDBOX_VISA_DIRECT_ACQUIRING_BIN`, `SANDBOX_VISA_DIRECT_ACQUIRER_COUNTRY` (3-digit ISO numeric), `SANDBOX_VISA_DIRECT_SENDER_ACCOUNT`, `SANDBOX_VISA_DIRECT_ACCEPTOR_ID_CODE` and `SANDBOX_CARD_VAULT_KEY` (16 or more characters). Visa Direct takes the card number, so the sandbox vault seals a **published test number** inside the token and refuses anything else.
- **Mastercard Send is not built.** It needs Mastercard's API documentation, a partner id and signing keys, which are not available here and must not be guessed. Setting `CARD_PAYOUT_PROVIDER=mastercard_send` stops the server with a clear message. Until it exists, Mastercard cards can be paid by the bundled rail in the sandbox only; `visa_direct` pays Visa cards.
- **Live mode has no payout provider.** Paying a real card needs the BIN sponsor's tokenised push-to-card service and the processor's hosted card fields; live mode refuses to start until that adapter exists.

## The VINK debit card (Visa or Mastercard, sandbox)

A holder whose identity staff have verified (level above basic) can get a **virtual VINK debit card** under **VINK Tokens > My VINK debit card**. It is issued through the issuing provider (`ISSUING_PROVIDER`: the bundled sandbox issuer today; Paymentology's adapter is built from their public API reference and has not yet been run against their UAT). The card spends the holder's **tokens**, so there is nothing to top up: it works as soon as the wallet holds tokens.

- **Spending.** For every purchase the processor calls `POST /api/payments/issuer/authorisation` and VINK answers approve or decline in real time. VINK approves only if the card and wallet are active, the currency is rand, the amount is within the holder's daily limit for that channel (shop, online or cash machine, from the country profile when it enforces limits) and the wallet holds the amount plus any fee. The tokens leave the wallet at once and wait in the card settlement account for the sponsor bank. Declines are recorded with the reason and move nothing.
- **Charges.** A cash-machine withdrawal carries the country profile's ATM fee (R10 by default). Shop and online purchases carry none for the cardholder: the profile's card_pos and card_online rules are the merchant's.
- **Repeats.** The processor's own authorisation id makes a retried request return the first answer and never spend twice. A `card.reversal` event (or a merchant refund) returns the tokens and any fee once.
- **Control.** The holder can freeze, unfreeze or permanently block the card; it takes effect at once because the processor asks VINK on every purchase. One live card at a time; a blocked card can be replaced.
- **What is kept.** Only the provider's card id, brand, last four and expiry. The full number and security code are shown by the processor's secure screen when live.
- **Try it.** Staff can act as the processor in the sandbox (`POST /api/admin/tokens/sandbox/card-purchase` and `/card-refund`, or the **Try purchase** form on the staff panel). These routes do not exist outside the sandbox.

## Before real money

- The system runs in the sandbox by default. Live mode follows the country profile and the go-live checklist; **no real customer money should be taken until**:
  - a **BIN sponsor / sponsor bank** and the pooled account are in place, and the legal structure for holding customer funds (stored value / e-money, FICA accountable-institution status, safeguarding of the pool) is confirmed by the company's legal adviser;
  - the **licences** for South Africa and Zambia are in place;
  - the pooled account's details and the bank-feed webhook are configured (see `MONEY_ENGINE.md`);
  - the sponsor bank's **push-to-card** and **card issuing** adapters exist and have been run against its sandbox, and card numbers are collected by the processor's hosted fields, never by VINK.
- A retailer must have a settlement agreement before its point of sale is registered: the cash it takes is the retailer's debt to the pool until it pays.

## Not built yet

- **Mastercard Send** (payouts to Mastercard cards), and a **live** push-to-card provider: both need the providers' documentation and credentials.
- **Paymentology issuing is written but untested**: card creation (`providers/paymentologyIssuer.ts`) and the FAST endpoint (`payments/paymentologyFast.ts`, `POST /api/payments/issuer/fast`) follow Paymentology's public pages, but nothing has run against UAT. Still to confirm with them: the exact API paths, how FAST authenticates to us (interim: a shared secret in `X-API-Key`, set `PAYMENTOLOGY_FAST_SECRET`; the endpoint answers 501 without it), and that `ISO_MSG.DE2` is the card's public token. Card settings: `SANDBOX_PAYMENTOLOGY_CLIENT_ID`, `_CARD_PRODUCT_ID`, `_IMAGE_NAME`, `_PARENT_ACCOUNT_ID`, `_CARD_BRAND`.
- **Live hosted card fields:** the flow is built and tested with a sandbox stand-in (see `GO_LIVE.md`); the real processor's card fields still need their documentation.
- **Real settlement file format:** matching is built against VINK's own layout; it has to be mapped to the sponsor bank's actual file.
- **Staff screens** for the go-live gate, alerts and settlement exceptions (the API exists).
- Physical (plastic) cards and digital wallets (Apple Pay, Google Pay).
- A native Android reader app with the card reader's own NFC kernel. The `/reader` web app covers phones with NFC today.
