# Going live: the gate, alerts, settlement matching and secure card entry

These are the controls that stand between the sandbox and real money. All of them work in the sandbox today. Staff use them through `/api/admin/ops/*` (owner and superadmin only); there is no staff screen for them yet.

## 1. The go-live gate

`PAYMENTS_MODE=live` is refused at start-up until every item is satisfied (`payments/goLive.ts`, `liveStartBlockers`). The server prints the missing items and exits.

- **Manual items** (13): legal structure, South Africa and Zambia licences, BIN sponsor agreement, pooled account, retailer settlement agreements, terms/privacy/POPIA, independent security review, load test, backup restore, fresh live secrets, support runbook, pilot sign-off. A named staff member confirms each with a note of at least 10 characters saying where the evidence is. The confirmation stores who and when and can be withdrawn.
- **Automatic items**: live mode set, a real issuing provider, a real (non-sandbox) payout provider, the card endpoint secret set, an alert destination configured, and reconciliation clean (this last one is shown but does not block a restart).

Confirm the manual items while the system is still in sandbox mode on the same database; the start-up check reads those confirmations.

| Call | Purpose |
|---|---|
| `GET /api/admin/ops/go-live` | Every item, whether it holds, and who confirmed it |
| `POST /api/admin/ops/go-live/:key/confirm` `{ "note": "..." }` | Confirm a manual item |
| `DELETE /api/admin/ops/go-live/:key` | Withdraw a confirmation |

## 2. Alerts

A check runs every five minutes (`OPS_MONITOR=off` turns it off): the reconciliation plus a card-decline-rate check. An issue is sent once when it appears, again every hour while a **problem** stays (every 24 hours for an **attention** item), and once when it clears. What was sent is stored (`ops_alert_state`), so a restart repeats nothing, and a destination that is down loses nothing: the alert is retried at the next check.

Destinations: `ALERT_WEBHOOK_URL` (Slack-style incoming webhook, https only) and/or `ALERT_EMAIL_TO` (sent through the platform's email sender, which needs `RESEND_API_KEY` and `EMAIL_FROM`). With neither set, alerts are only written to the log.

`GET /api/admin/ops/health` shows the live reconciliation and what has been sent; `POST /api/admin/ops/check` runs a check now.

## 3. Sponsor-bank settlement matching

Import the bank's settlement file and every line is matched to the card purchases VINK approved (`services/schemeSettlement.ts`). It only compares and records; it never moves money.

VINK's own file layout, to be mapped to the bank's real one once known (`columnMap`):

```
authorisation_id,type,amount,currency,settled_on,reference
T1:R1,purchase,125.50,ZAR,2026-10-07,S1
T1:R1,refund,40.00,ZAR,2026-10-08,S7
```

A purchase line carries the original amount, a refund line the amount returned. Results: matched, unknown purchase, amount mismatch, declined purchase (VINK declined it), refund exceeds what was reversed, currency mismatch, duplicate (ignored). The same file cannot be imported twice. Exceptions show as a reconciliation **problem** until a person closes each one with a written note. Approved purchases older than five days that no file has settled show as **attention** (once any file has been imported).

`POST /api/admin/ops/settlement/import` `{ provider, filename, csv }`; `GET .../settlement/files`; `GET .../settlement/exceptions`; `POST .../settlement/exceptions/:id/resolve` `{ note }`.

## 4. Secure card entry (hosted fields)

A holder adds a payout debit card in a separate card form shown in a frame on the VINK page. The card number goes from the browser to the form's own host and never to VINK's page or API; VINK receives only a session id and then collects the tokenised card for that user, once, within ten minutes. The same rules as before apply afterwards (debit only, name checked against the account, three cards at most).

- **Sandbox**: `payments/providers/hostedFields.ts` provides the form page and a vault endpoint (`/api/payments/sandbox-vault/*`, mounted only in sandbox mode) that stand in for the processor. Test card numbers only. The page may be framed only by the origins in `ALLOWED_ORIGINS` / `FRONTEND_URL` and the production domains.
- **Live**: a provider implementing `HostedCardFields` (in `providers/types.ts`) replaces the sandbox class; the token service and the front end do not change. In live mode typed card numbers are refused outright (`card_fields_required`).
- **Not done**: the real processor's hosted-field integration, which needs the BIN sponsor's or processor's documentation.
