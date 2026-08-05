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

## Mastercard integration (sandbox)

Unlike the accounts above, Mastercard credentials are **not** seeded anywhere in this codebase — they're your own Developer Portal credentials and belong only in Railway's environment variables, never in a file that gets committed.

What you gave me (Partner IDs, an App Key/Secret pair, a Signature Verification Key fingerprint) confirmed the integration is set up on Mastercard's side, but I didn't put any of those values into the codebase — the App Key/Secret were already masked when you shared them, and the Partner ID/fingerprint alone aren't enough to make a signed request work.

To actually activate this, set these in Railway's environment variables (backend service):

| Variable | Where it comes from |
|---|---|
| `MASTERCARD_CONSUMER_KEY` | Developer Portal → your project → API Keys |
| `MASTERCARD_SIGNING_KEY` | Your private key file (`.p12`/`.pem`, generated alongside the Signature Verification Key), **base64-encoded** since it's a multi-line file and env vars are single strings — encode it with `base64 -i your-key-file.p12` (or `-w0` on Linux to avoid line wraps) |
| `MASTERCARD_KEY_PASSWORD` | Only if your key file has one |
| `MASTERCARD_ENV` | `sandbox` (default) or `production` |
| `MASTERCARD_API_BASE_URL` | Only override if your specific onboarded API product uses a different base URL than `https://sandbox.api.mastercard.com` |

Once set, `GET /api/mastercard/status` (owner/superadmin only) will confirm the integration sees its credentials — it never makes a real signed request itself, so it's safe to check anytime.

**Not yet verified against a live sandbox call** — this environment has no network access to Mastercard's sandbox, and no private key was provided to sign a test request with. The OAuth 1.0a signing logic (`server/src/services/mastercardClient.ts`) is implemented against Mastercard's documented algorithm, but you should make one real test call after setting the environment variables to confirm it actually works end to end before building anything on top of it.

## Before any real production launch

Delete or rotate every credential in this file. These exist purely so a
developer can sign in and see the management, owner, and customer
experiences without registering a fresh account every time — they should
never reach a real, publicly accessible deployment with real user data.

