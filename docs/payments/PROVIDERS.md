# Payment providers: what each one does and where we are

## Two different jobs
| Job | What it means | Example providers | State here |
|---|---|---|---|
| **Issuing** | We issue Visa/Mastercard cards to our customers; the provider approves or declines each purchase by calling our server in real time. | **Paymentology** | Adapter contract + mock done; Paymentology adapter is a stub (see below) |
| **Acquiring** | A customer pays *us* (or our merchants) by card on a website or terminal. | Peach Payments, Paystack, Flutterwave, Adyen, Stripe... | Contract + Manshya mock only. **No provider chosen yet.** |

**Paymentology is an issuer-processor, not an acquirer.** It can power the cards a customer carries, but it does not
accept card payments from a shopper's checkout. The Manshya checkout page, payment links and card-machine sales still
need an acquiring PSP. Choose one (it changes which markets you can serve) before building that adapter.

## Plan of record
- **Development and testing:** Visa and Mastercard developer sandboxes (credentials already on the Railway backend for Mastercard Open Banking; Visa variables not yet set).
- **Go-live:** Paymentology issues and processes the cards and **sponsors the BIN** (stated by the owner; the terms are not in this repository).
- Consequence: the live card path is Paymentology's, not Visa's or Mastercard's directly, so behaviour tested against the scheme sandboxes can differ from live (API shapes, webhook formats, decline codes). Get Paymentology's sandbox and certification tests **before** launch; it is a go-live blocker in `GO_LIVE_CHECKLIST.md`.

## Visa DPS Card and Account Services (sandbox, built)
Source: the OpenAPI export from the Visa Developer portal (`https://sandbox.api.visa.com`). The file itself is not committed (Visa terms; keep it in your own storage).

| We can do | Visa call |
|---|---|
| Register a card (get a card id) | `POST /dcas/cardservices/v2/cards` |
| Read status | `GET /dcas/cardservices/v2/cards/{cardId}/cardstatus` (prepaid: `v1/cards/prepaid/{cardId}/cardstatus`) |
| Freeze / unfreeze / block | `PUT /dcas/cardservices/v2/cards/{cardId}/cardstatus` with the spec's status codes (`LK-LOCKED_BY_CARDHOLDER`, `__-UNLOCK_BY_CARDHOLDER`, ... for debit; `ACTIVE`/`SUSPENDED`/`STOLEN_CARD` for prepaid) |
| Card details (last4, accounts) | `GET /dcas/cardservices/v2/cards/{cardId}` |

Not built, on purpose: PIN set/change (spec requires Message Level Encryption, and PINs should not touch our servers), activation with identity tokens (needs personal data such as birth date and ID numbers), CVV2 generation.

- Code: `server/src/payments/providers/visaDps.ts`; select with `CARD_SERVICING_PROVIDER=visa_dps` plus `SANDBOX_VISA_API_KEY` / `SANDBOX_VISA_SHARED_SECRET`.
- **Authentication is UNVERIFIED.** The exported spec has an empty security section. X-Pay (API key + shared secret) is used because the repo already has it. If the sandbox answers 401/403, check the portal's Authentication page; the scheme is a one-function swap (`authenticate`).
- **Card numbers:** registering a card sends a PAN. It is forwarded and never stored or logged; error text has card-number-like digits masked. Use Visa's **sandbox test numbers only**, and never wire this to a customer-facing form.
- Staff-only sandbox tools: `GET /api/payments/sandbox/status`, `POST /api/payments/sandbox/cards`, `GET|PUT /api/payments/sandbox/cards/:id[/status]` (404 in live mode).
- Tests: offline tests check every request against the spec; `visaDps.sandbox.test.ts` hits the real sandbox only when credentials and `SANDBOX_VISA_TEST_PAN` are set.
- `visa_dps` is rejected in live mode: live card servicing goes through Paymentology, whose servicing adapter is not built.

## Paymentology (issuing)
- Their API reference and sandbox are available only to onboarded clients, so the real request shapes, authentication,
  card-lifecycle calls, authorisation-webhook format and signature scheme are **not in this repository and were not guessed**.
- `server/src/payments/providers/paymentologyIssuer.ts` therefore throws `NotConfiguredError` for every call.
- To finish it:
  1. Get sandbox credentials and the full documentation from Paymentology.
  2. Set `ISSUING_PROVIDER=paymentology` and the `SANDBOX_PAYMENTOLOGY_BASE_URL`, `_API_KEY`, `_WEBHOOK_SECRET` variables.
  3. Implement `createCard`, `setCardStatus` and `verifyWebhook` (and the authorisation handler that maps their real-time
     decision request onto Manshya's `cards.authorize()`), using their signature scheme and `ReplayGuard`.
  4. Add their official test cards/scenarios to `server/src/payments/sandbox/testData.ts`, with a link to their docs.
  5. Add the adapter to `issuingContract(...)` in `providers/contract.test.ts` and run their certification tests.

## Direct scheme connection (Visa / Mastercard)
Connecting straight to VisaNet or Mastercard (ISO 8583, BankNet) needs an acquiring or issuing licence or a sponsoring
bank, PCI DSS Level 1 certification and scheme registration. That is a business and compliance project, not code. The
adapter layer exists so a direct connection can be added later without touching application code.

## Adapter rules
- Card numbers, CVV and track data never pass through any adapter; only provider tokens, last4, brand and expiry.
- Every money-moving call takes an idempotency key.
- Sandbox and live credentials use different variable names (`SANDBOX_*` vs `LIVE_*`) so one is never read for the other.
