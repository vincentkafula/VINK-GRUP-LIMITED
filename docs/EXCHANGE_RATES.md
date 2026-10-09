# Live exchange rates

The public **Exchange Rates** page (footer > Useful Tools > Exchange rates) shows real market rates: a currency converter for 150+ currencies and a table of the rand against the currencies VINK expects to serve first (US dollar, euro, pound, yuan, kwacha, pula, Namibian dollar, metical, lilangeni, loti and others the source carries).

## Where the numbers come from
`server/src/services/liveRates.ts` reads one table of every currency against the rand:
1. **ExchangeRate-API** (`open.er-api.com`, no key). The source updates about once a day. Their terms for the open endpoint ask for attribution, so the page names the source, links to it and shows when the source last updated. With `FX_PROVIDER_KEY` set, the keyed endpoint of the same company is used instead.
2. **currency-api** (jsDelivr, then Cloudflare Pages), used automatically if the first source fails or sends a table that does not pass the checks.

A table is accepted only if every rate is a finite positive number, only real ISO 4217 currencies are kept, and the US dollar and the rand are present. The answer is cached for an hour and one request serves everyone who asks at the same time. If every source is down, the last good table is served and marked **stale** (the page says so); if there never was one, the page shows a clear error with a Try again button.

## API (public, no sign-in)
- `GET /api/currency/rates` : the whole table, `1 ZAR = rates[code]`, with `source`, `attributionUrl`, `sourceUpdatedAt`, `fetchedAt`, `cached`, `stale`.
- `GET /api/currency/convert?from=USD&to=ZMW&amount=100` : one conversion at the same rates.

## What these rates are not
They are mid-market **reference rates for information**. They are not a quote, not an offer, and not what VINK will charge: the page says so, and says VINK's own cross-border rates will be published at launch (June 2027). Cross-border quotes inside the platform use their own, stricter rate handling (`services/fxRates.ts`: two-source comparison, jump limits, freshness limits).

## Checking the real sources
`LIVE_RATES_TEST=1 npx vitest run src/services/liveRates.test.ts` (in `server/`) calls the real services and checks both answer and agree to within 5%.

Note: NAD, SZL and LSL show exactly 1.00 against the rand because those currencies are pegged to it.
