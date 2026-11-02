# Banking engine safeguards

What protects the banking engine (`server/src/manshya/core`: the ledger, accounts, cards, credit, insurance and the rest) from bugs, mistakes and loss, how to use it, and what it does **not** do. Everything here runs on the bundled mocks; real money needs the third-party items at the end.

## 1. The ledger cannot be rewritten

Every movement of money is a **journal** of **entries** that add up to zero. Once posted they are append-only: the database refuses to edit or delete an entry, to delete a journal, or to change a journal at all (the one exception is a blank *mode* tag being filled in, which the engine does itself). A mistake is corrected by posting a **reversing journal**, which leaves both in the record.

The guards are four triggers: `ledger_entries_no_update`, `ledger_entries_no_delete`, `ledger_journals_no_delete`, `ledger_journals_no_update`. They are created on every start (`IF NOT EXISTS`), so an older database gains them. Anyone with access to the file can still drop them by name. That is deliberate (a real repair may need it), and it is what an audit of the database would show; a backup that is missing them is reported as unsound.

## 2. Daily reconciliation covers every kind of money movement

The books are checked against the engine's own records once a day (and on demand by a superadmin: *Reconciliation > Run*). Beyond "every journal balances, the books net to zero and no money account is negative" it checks, for each subsystem, that:

- every record that moved money has a posting, for the amount on the record;
- every failed record has a matching reversal, and nothing is reversed that did not fail;
- no posting points at a record that does not exist.

| Subsystem | Checked |
| --- | --- |
| Payments, refunds, payouts, transfers | posted for the right amount; stuck items; dead webhooks |
| Bill payments, vehicle renewals, international payments, inbound bank credits | posted, right amount, failed ones returned, orphans |
| Card machine payments (VINK Tap) | the money posted to the bank account the payment says it went to, and money posted to a bank account by a payment must be named (`payment_settlement_mismatch`) |
| Card purchases and their reversals | approved = posted; declined = nothing; amount returned = amount reversed; never more than the purchase |
| Cash for collection | posted, collected or returned exactly once; **the escrow account equals the vouchers still waiting** |
| Disputes and chargebacks | held, then released (won) or charged back with the fee (lost); **the disputes account equals the open disputes** |
| Insurance | a premium for every policy; a paid claim equals what was posted; **claims paid never exceed the cover** |
| Credit | a term loan was paid out; nothing posted for a facility that does not exist |

`server/src/manshya/core/reconcileBooks.js` lists every kind of posting the engine makes (`COVERED`). A test reads the engine's source and **fails if a new kind of posting appears that is not listed**, so a new way of moving money cannot be added without deciding how it is reconciled.

Set `RECON_ALERT_EMAIL` and the first scheduled run that finds a *new* problem emails the list; the same unresolved problems are not repeated daily, and a clean run re-arms the alert. The first run after this was added may report genuine old discrepancies: treat them as findings.

## 3. Backups

`backup.js`. SQLite's online backup is taken by the scheduler once a day (when there has not been a good one for 24 hours) and on demand by a superadmin, to `backups/` beside the database file (`/data/backups` on Railway). Each is **verified immediately**: opened on its own; SQLite's integrity check; every journal balanced; the books net to zero; the append-only guards present; still the same payments mode. Size, checksum and the result go in a `.json` manifest beside it. A backup that fails is **kept for investigation and an alert is sent, but it never counts as good and never causes a good one to be deleted.** The newest `BACKUPS_KEPT` (default 14) good backups are kept. Files are readable only by their owner (they contain everything).

**Uploaded documents** (the KYC evidence customers send) are not in the database: they are files beside it. They are written once, so each backup **mirrors** them into `backups/uploads-mirror/`: new files are copied, nothing is overwritten or deleted. It alerts if a file has *changed* since it was first saved, has *disappeared* from the live store (the mirror keeps it), or if the database lists a document whose file is not there.

Who: the back office is reachable only by the `owner` and `superadmin` roles (`manshya/access.ts`), and both are the engine's superadmin, so both can list backups (`GET /api/vink/admin/backups`), take one (`POST .../backups`) and run the restore test (`POST .../backups/<name>/restore-check`). The engine also has lesser admin roles that can list but not take or test; no signed-in user has one today. They are on the **Reconciliation** page of the back office (*Database backups*). **There is no download.**

### The restore test (the go-live item "Database and ledger restore tested")

`restore-check` copies a backup to a scratch file, opens it as a working database and runs the full reconciliation on it; the backup itself is never opened for writing. A clean result means the backup restores to books that reconcile.

### Restoring for real

1. Run `restore-check` on the backup you intend to use. Do not continue unless it is clean.
2. **Stop the service** so nothing writes.
3. Move the current `manshya.db`, `manshya.db-wal` and `manshya.db-shm` aside (do not delete them).
4. Copy the chosen `backups/manshya-<mode>-<time>.db` to the database path (`MANSHYA_DB_PATH`). It is a complete, consolidated database; no `-wal` file is needed. The database refuses to open in the other payments mode.
5. Copy the contents of `backups/uploads-mirror/` into `uploads/` beside the database. The mirror holds every document ever uploaded, so it is a superset.
6. Start the service. Check `GET /api/vink/health`, then run *Reconciliation > Run*: it should be clean.
7. Everything that happened **after** the backup was taken is lost (at most a day, with the daily schedule). Reconcile that gap against the card processor, the bank feed and the gateways before reopening.

### What backups do not do

- **They are on the same volume as the database.** They protect against corruption, mistakes and bad deploys, **not against losing the volume.** A copy has to leave the machine, which needs somewhere to send it (a bucket, another host) that you must provide. Pass `offsite: { put(file, manifest), putUpload(file, key) }` when the engine is created and every good backup, and every newly mirrored document, is handed to it; a failure there raises an alert and never deletes anything. Until that exists, the go-live item "automated backups and a tested restore" is only partly met.
- They cover the banking engine's SQLite database and its uploads. The PostgreSQL database (users, portals, wallets, pool, cross-border) is a separate store and needs its own backup (Railway's Postgres backups, or your own).
- Make sure the volume has room: 14 backups plus the document mirror.

## 4. Insurance cannot pay out more than its cover

A claim is capped at the cover **remaining** after earlier claims; approving one re-checks this inside the same transaction as the payout, so two approvals cannot together overpay; and a policy whose cover has been paid out in full is closed, which also stops its premiums.

## 5. Card purchases and reversals through the processor

The route the card processor calls (`/api/payments/issuer/fast`) asks the token-card service first, then the **bank-account cards** (authorise, reverse and the zero-amount card check), and only then answers "not ours". A reversal can be for part of a purchase and several can arrive; together they never return more than was taken; each reversal message is applied once even if the processor retries it; and a returned purchase stops counting against the card's daily and monthly limits.

## What is left for other people

Everything the go-live gate (`payments/goLive.ts`) lists as manual: legal advice and the licences (South Africa and Zambia), the sponsor bank agreement, the pooled account, retailer agreements, published terms and privacy, the **independent** security review, a load test at the planned volume, **live secrets**, the support runbook and the pilot. Plus: the real card processor, payment gateway, bank rails, bill-payment aggregator, identity bureau and vehicle-licensing provider (each sits behind an adapter with a bundled mock), and the off-site store above.
