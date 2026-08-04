# Developer Login Credentials

These are the default seeded accounts for local development and QA. They
are **not shown anywhere in the product UI** — no autofill button, no hint
text on the login screen, nothing a site visitor could discover by clicking
around. This file is the only place they're documented, and it's meant for
developers working on the codebase, not end users.

Both accounts are created automatically the first time the database seeds
(see `server/src/db/migrate.ts`). Signing in with either one through the
normal login form on the site routes correctly based on role — this isn't
a special "dev mode" bypass, it's exercising the real login → role check →
dashboard flow with known credentials.

## Management account

Routes to the **Management Panel** after sign-in.

| Field    | Value           |
|----------|-----------------|
| Username | `superadmin`    |
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

To change a password or add another default account, edit:

- **Management accounts** — `server/src/data/store.ts` (the `db.users` array).
  Passwords are bcrypt-hashed at seed time via `bcrypt.hashSync(...)`; edit
  the plaintext string there, not the hash.
- **Default customer account** — `server/src/db/migrate.ts`, in the
  `INSERT INTO users ... 'customer1' ...` block near the end of the seed
  transaction.

After changing either, you'll need to reset the database (or manually
update the row) for the change to take effect — the seed uses
`ON CONFLICT (username) DO NOTHING`, so it won't overwrite an existing row
with a changed password automatically.

## Before any real production launch

Delete or rotate every credential in this file. These exist purely so a
developer can sign in and see both the management and customer experiences
without registering a fresh account every time — they should never reach
a real, publicly accessible deployment with real user data.
