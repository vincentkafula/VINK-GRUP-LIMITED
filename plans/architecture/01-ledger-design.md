# Ledger Design

**Status:** Phase 2 design document. Not yet implemented — this defines the
target that Phase 3 (Backend Completion) migrates the in-memory
`server/src/data/bankingStore.ts` into.

## Why this exists

Phase 0's audit found the single largest structural gap in the platform:
there is no real ledger. `bankAccounts.ts` and `bankCards.ts` have zero
`pool.query` calls between them — every balance, every card, every
"transaction" the current UI shows lives in a mutable in-memory object that
resets to seed data on every deploy or crash. Everything else in this
document — the ERD, the API contract, the migration plan — exists to fix
that one thing properly, not to add features around it.

## Decisions (settled, not open questions)

| Decision | Choice | Why |
|---|---|---|
| Money representation | **Integer minor units** (cents), Postgres `BIGINT` | Floats lose precision on arithmetic; `NUMERIC` works but integer cents is the industry-standard choice and matches what every payment processor's API actually returns. `amount_cents: 154999` not `amount: 1549.99`. |
| Ledger style | **Double-entry, append-only** | Every movement of money is two rows (a debit and a credit) that net to zero, never an update to a balance column. Balances are a derived read, not stored state that can drift from reality. |
| Balance storage | **Derived, with a cached snapshot** | The source of truth is `SUM(ledger_entries.amount_cents) WHERE account_id = X`. A `account_balances` materialized/cached table exists purely for read performance (dashboards querying balance constantly), refreshed on every entry insert inside the same transaction — never the other place money "lives." |
| Currency | Multi-currency from day one | The existing `Currency` union (ZAR/USD/EUR/GBP/NGN/KES) and multi-currency dashboard already exist in the frontend — the ledger schema needs `currency` on every entry, not bolted on later. |
| Idempotency | Every money-moving table has an idempotency key | Same pattern already shipped in Phase 1 for `terminal_taps` — extended here to every ledger-writing endpoint, not just AFC taps. |
| Existing AFC tables | **Kept, connected — not replaced** | `terminal_taps`, `driver_ledger`, `association_ledger` are real, working, Postgres-backed, and already in production use conceptually. The new ledger doesn't duplicate them; a tap becomes a `ledger_entries` pair via a connecting job (see Migration Plan), so AFC revenue and personal/business banking share one true ledger instead of two parallel ones. |

## Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o{ accounts : owns
    accounts ||--o{ ledger_entries : "has entries"
    accounts ||--o| account_balances : "cached balance"
    accounts ||--o{ cards : "issues"
    ledger_transactions ||--|{ ledger_entries : "contains (>=2, sums to 0 per currency)"
    ledger_transactions ||--o| idempotency_keys : "deduplicated by"
    terminal_taps ||--o| ledger_transactions : "settles into"
    cards ||--o{ card_transactions : "authorizes"
    card_transactions ||--o| ledger_transactions : "settles into"

    users {
        uuid id PK
        text role
        text kyc_status
        text aml_status
    }

    accounts {
        uuid id PK
        uuid user_id FK
        text account_number UK
        text iban UK
        text account_type
        text currency
        text status
        timestamptz created_at
    }

    account_balances {
        uuid account_id PK_FK
        bigint balance_cents
        bigint available_cents
        bigint pending_cents
        timestamptz last_entry_at
        bigint last_entry_seq
    }

    ledger_transactions {
        uuid id PK
        text idempotency_key UK
        text transaction_type
        text status
        text initiated_by
        text reference
        timestamptz created_at
        timestamptz posted_at
    }

    ledger_entries {
        uuid id PK
        uuid transaction_id FK
        uuid account_id FK
        bigint amount_cents "positive=credit, negative=debit"
        text currency
        bigint sequence_no "monotonic per account, for cached-balance replay"
        timestamptz created_at
    }

    cards {
        uuid id PK
        uuid account_id FK
        text card_type
        text network
        text status
        text last_four
        text token_reference "processor token, never a real PAN"
    }

    card_transactions {
        uuid id PK
        uuid card_id FK
        uuid ledger_transaction_id FK
        text merchant_name
        bigint amount_cents
        text status
    }

    idempotency_keys {
        text key PK
        text scope
        uuid resulted_in_transaction_id
        timestamptz created_at
    }
```

## Why append-only, double-entry — concretely

The current `bankAccounts.ts` pattern (illustrative of the in-memory
store, not real code):

```ts
account.balance -= amount;   // <-- the entire problem, in one line
```

This has no history, no audit trail, and no way to detect or recover from
a bug that ran twice, ran with the wrong sign, or ran against the wrong
account. The target pattern:

```sql
BEGIN;
INSERT INTO ledger_transactions (id, idempotency_key, transaction_type, status, reference)
VALUES ($1, $2, 'p2p_transfer', 'posted', $3);

INSERT INTO ledger_entries (transaction_id, account_id, amount_cents, currency, sequence_no)
VALUES
  ($1, $sender_account,   -$amount_cents, $currency, nextval_for($sender_account)),
  ($1, $recipient_account, $amount_cents, $currency, nextval_for($recipient_account));

-- Cached balance update, same transaction, so it can never drift from
-- the entries that are the actual source of truth:
UPDATE account_balances SET balance_cents = balance_cents + $delta, last_entry_seq = $seq
WHERE account_id = $sender_account;
UPDATE account_balances SET balance_cents = balance_cents + $delta, last_entry_seq = $seq
WHERE account_id = $recipient_account;
COMMIT;
```

Two entries, same transaction, opposite signs, same currency — they net
to zero by construction. `SUM(amount_cents) WHERE account_id = X` is
always correct even if `account_balances` is ever wiped and rebuilt from
`ledger_entries` (which is exactly the recovery path if the cache ever
does drift — replay entries in `sequence_no` order).

## What's deliberately out of scope here

- **FX conversion logic** — multi-currency accounts exist in the schema,
  but the rate-lookup/conversion-fee logic is a Phase 3 service, not a
  schema concern.
- **Interest accrual** — `accounts.interest_rate` exists in the current
  frontend types; accrual as a scheduled job is Phase 3.
- **Card network settlement reconciliation** (matching Visa/Mastercard's
  own settlement files against `card_transactions`) — Phase 3, and
  blocked on Visa/Mastercard credentials existing at all per the Phase 0
  audit.
