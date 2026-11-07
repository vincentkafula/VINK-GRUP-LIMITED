
  # VINK MUILTI SERVICES LLC

  This is a code bundle for VINK MUILTI SERVICES LLC. The original project is available at https://www.figma.com/design/i4Vll4uJyzdfikrwKVOGrG/VINK-MUILTI-SERVICES-LLC.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  
  ## Architecture and guides

  - **Front end**: React (Vite) in `src/`; the role dashboards are in `src/app/components/portal`.
  - **Back end**: Node and Express in `server/` (`cd server && npm run dev`). The schema is `server/src/db/schema.sql` (idempotent and additive); `server/src/portal/testDb.ts` mirrors it for fast in-memory tests. Run the tests with `cd server && npm test`, and on a real PostgreSQL by setting `TEST_PG_URL`.
  - **Money** is whole cents (integer) in the newer code; rand with decimals only at the edges of older code.
  - **Guides**: [Owner dashboard](docs/OWNER_DASHBOARD.md) (design, rules, API, demo data, rollback, what needs legal confirmation), [Association compliance dashboard](docs/ASSOCIATION_COMPLIANCE.md), [Marshal commission](docs/MARSHAL_COMMISSION.md).
  - **Demo data** for the owner dashboard: `cd server && DATABASE_URL=... DEMO_PASSWORD='a-long-passphrase' npm run seed:owner-demo` (never against production).
