# Developer Login Credentials

These are the default seeded accounts for local development and QA. They
are **not shown anywhere in the product UI** — no autofill button, no hint
text on the login screen, nothing a site visitor could discover by clicking
around. This file is the only place they're documented, and it's meant for
developers working on the codebase, not end users.

All accounts are created automatically the first time the database seeds
(see `server/src/db/migrate.ts`). Signing in with any of them through the
normal login form on the site routes correctly based on role — this isn't
a special "dev mode" bypass, it's exercising the real login → role check →
dashboard flow with known credentials.

## Owner account (new, separate dashboard — pending)

| Field    | Value              |
|----------|--------------------|
| Username | `superadmin`       |
| Password | `Wakuca97950@`     |
| Role     | `owner`            |

Currently routes to the same Management Panel as the admin account below,
as a placeholder — a distinct dashboard for this role is planned once the
reference design is provided, at which point only this account's routing
will change.

## Admin account (existing Management Panel)

Routes to the **Management Panel** (matching `vink-dashboard(1).html`)
after sign-in. This is the account that was previously named `superadmin`
— renamed to `admin` to free up the `superadmin` username for the owner
account above. Same password as before.

| Field    | Value           |
|----------|-----------------|
| Username | `admin`         |
| Password | `Admin@1234`    |
| Role     | `superadmin`    |

Two additional management-role accounts also exist (`noc1` / `Noc@5678`,
`billing1` / `Bill@9012`) — see `server/src/data/store.ts`.

## Customer account

Routes to the **personal banking dashboard** after sign-in.

| Field    | Value               |
|----------|---------------------|
| Username | `customer1`         |
| Password | `Customer@2026`     |
| Role     | `customer`          |
| Name     | Demo Customer       |

## Changing these

To change a password, role, or add another default account, edit:

- **Management/owner accounts** — `server/src/data/store.ts` (the
  `db.users` array). Passwords are bcrypt-hashed at seed time via
  `bcrypt.hashSync(...)`; edit the plaintext string there, not the hash.
- **Default customer account** — `server/src/db/migrate.ts`, in
  `seedDefaultCustomer()`.
- **The admin/superadmin rename** — `server/src/db/migrate.ts`, in
  `seedAccountRestructure()`. This is a one-time migration matched by
  email address (stable across the rename), not username — safe to leave
  in place indefinitely; it no-ops once the rename has happened.

**Important pattern to know if you add more seeded data here**: this
database has already been seeded with products since early in this
project, and `migrateAndSeed()` has an early-return path that skips the
main seed block entirely once that's true. Anything added only inside
that main block will silently never run against the real, already-seeded
database — it'll work in a fresh local test DB and then quietly do nothing
in production. This has actually happened twice already (once for news
content, once for the customer account) before being caught and fixed.
Any new seed logic needs an explicit call from both the early-return
branch and the fresh-seed branch, the way `seedNews()`,
`seedDefaultCustomer()`, and `seedAccountRestructure()` all do.

## Mastercard Open Banking integration (sandbox)

Unlike the accounts above, these are **not** seeded anywhere in this codebase — they're your own Developer Portal credentials and belong only in Railway's environment variables, never in a file that gets committed.

**Correction worth noting**: the first version of this integration was built against the wrong auth scheme (OAuth 1.0a with an RSA private key, which applies to *other* Mastercard API products). Confirmed directly against Mastercard's own [open-banking-reference-application](https://github.com/Mastercard/open-banking-reference-application) that Open Banking is actually built on Finicity's API underneath, and uses a simpler scheme: **Partner ID + Partner Secret + App Key, exchanged for a short-lived bearer token — no private key file needed at all.**

To activate this, set these in Railway's environment variables (backend service):

| Variable | Where it comes from |
|---|---|
| `MASTERCARD_PARTNER_ID` | Developer Portal → your project's credentials |
| `MASTERCARD_PARTNER_SECRET` | Same page |
| `MASTERCARD_APP_KEY` | Same page (this was the field labeled "App Key" in the portal) |
| `MASTERCARD_API_BASE_URL` | Only override if instructed otherwise — defaults to `https://api.finicity.com` |

Once set, `GET /api/mastercard/status` (owner/superadmin only) confirms the integration sees its credentials — it never makes a real request itself, so it's safe to check anytime.

**Not yet verified against a live sandbox call** — this environment has no network access to Mastercard/Finicity's sandbox. The bearer-token exchange and request logic (`server/src/services/mastercardClient.ts`) is implemented against the documented flow, but make one real test call after setting the environment variables to confirm it actually works before building anything on top of it.



## Visa Developer Platform integration (sandbox)

You uploaded Visa's own official JWE/JWS encryption utility (Java, from the Visa Developer Program) and asked to build a Visa integration from it. Ported faithfully to TypeScript in `server/src/services/visaEncryptionUtils.ts` — every algorithm, key-derivation step, and header field was read directly from the uploaded Java source and verified to round-trip correctly (see the commit message for the exact test scenarios run, matching Visa's own Java test suite).

**What this actually is**: Visa's payload encryption scheme for protecting sensitive fields (card numbers, account details, etc.) inside API request/response bodies sent to Visa Developer Platform APIs. It's not authentication by itself — Visa APIs typically also require separate transport-level auth (mutual TLS, API key headers) depending on the specific product, which isn't included here since no Visa API product/credentials were specified.

Two independent modes, matching the original Java library exactly:

**Shared Secret (symmetric)** — wired into real endpoints:

| Variable | Where it comes from |
|---|---|
| `VISA_API_KEY` | Visa Developer Portal → your project |
| `VISA_SHARED_SECRET` | Same page |

Once set, `GET /api/visa/status` (owner/superadmin only) confirms it's configured. `POST /api/visa/encrypt` and `POST /api/visa/decrypt` do a real encrypt/decrypt round trip — useful for confirming your actual sandbox credentials work before wiring this into a real Visa API call.

**RSA PKI (asymmetric)** — the encryption/decryption functions exist (`createJweRsa`, `decryptJweRsa`, `createJwsRsa`, `verifyAndExtractJweFromJwsRsa`) and were verified correct, but aren't wired into a route yet since no RSA keys were provided to test against. `VISA_RSA_PUBLIC_KEY` and `VISA_KEY_ID` are documented in `.env.example` for when you're ready to use this mode — you'd also need the matching private key, which (same rule as Mastercard's) should go directly into Railway's environment variables, never pasted into chat.

**What was actually verified, not just written**: ran both of Visa's own test scenarios from their Java test suite (shared-secret full round-trip, RSA PKI full round-trip) against this TypeScript port and confirmed identical behavior, plus two additional checks — XML payload content-type handling, and that decryption with the wrong secret is correctly rejected rather than silently succeeding. Also ran a full round trip through the actual HTTP API (`/encrypt` then `/decrypt`) with test credentials, not just the underlying functions in isolation. Caught and fixed one real bug during this process: the RSA public key was initially being imported bound to the wrong algorithm (encryption instead of signature verification), which `jose` correctly rejected — fixed by loading the key with the algorithm it's actually being used for at each call site.

**Not verified**: an actual call against Visa's live sandbox, since real Visa credentials were never provided and this environment has no network access to Visa's servers.

## Before any real production launch

Delete or rotate every credential in this file. These exist purely so a
developer can sign in and see the management, owner, and customer
experiences without registering a fresh account every time — they should
never reach a real, publicly accessible deployment with real user data.

