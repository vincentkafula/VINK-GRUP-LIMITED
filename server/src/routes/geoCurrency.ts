import { Router, Request, Response } from "express";

const router: ReturnType<typeof Router> = Router();

// ─── Country → currency mapping ─────────────────────────────────────────────
// Covers the markets most relevant to a South African transport/banking
// platform (SADC neighbours + major trading partners), plus common fallbacks.
// Extend as the platform expands to new countries.
const COUNTRY_CURRENCY: Record<string, { country: string; code: string; symbol: string; name: string }> = {
  ZA: { country: "South Africa",          code: "ZAR", symbol: "R",    name: "South African Rand" },
  ZM: { country: "Zambia",                code: "ZMW", symbol: "ZK",   name: "Zambian Kwacha" },
  ZW: { country: "Zimbabwe",              code: "USD", symbol: "$",    name: "US Dollar" }, // Zimbabwe largely trades in USD
  BW: { country: "Botswana",              code: "BWP", symbol: "P",    name: "Botswana Pula" },
  NA: { country: "Namibia",               code: "NAD", symbol: "N$",   name: "Namibian Dollar" },
  MZ: { country: "Mozambique",            code: "MZN", symbol: "MT",   name: "Mozambican Metical" },
  LS: { country: "Lesotho",               code: "LSL", symbol: "L",    name: "Lesotho Loti" },
  SZ: { country: "Eswatini",              code: "SZL", symbol: "E",    name: "Eswatini Lilangeni" },
  MW: { country: "Malawi",                code: "MWK", symbol: "MK",   name: "Malawian Kwacha" },
  KE: { country: "Kenya",                 code: "KES", symbol: "KSh",  name: "Kenyan Shilling" },
  NG: { country: "Nigeria",               code: "NGN", symbol: "₦",    name: "Nigerian Naira" },
  GH: { country: "Ghana",                 code: "GHS", symbol: "GH₵",  name: "Ghanaian Cedi" },
  TZ: { country: "Tanzania",              code: "TZS", symbol: "TSh",  name: "Tanzanian Shilling" },
  UG: { country: "Uganda",                code: "UGX", symbol: "USh",  name: "Ugandan Shilling" },
  US: { country: "United States",         code: "USD", symbol: "$",    name: "US Dollar" },
  GB: { country: "United Kingdom",        code: "GBP", symbol: "£",    name: "British Pound" },
  DE: { country: "Germany",               code: "EUR", symbol: "€",    name: "Euro" },
  FR: { country: "France",                code: "EUR", symbol: "€",    name: "Euro" },
  NL: { country: "Netherlands",           code: "EUR", symbol: "€",    name: "Euro" },
  AE: { country: "United Arab Emirates",  code: "AED", symbol: "AED",  name: "UAE Dirham" },
  IN: { country: "India",                 code: "INR", symbol: "₹",    name: "Indian Rupee" },
  CN: { country: "China",                 code: "CNY", symbol: "¥",    name: "Chinese Yuan" },
  AU: { country: "Australia",             code: "AUD", symbol: "A$",   name: "Australian Dollar" },
  CA: { country: "Canada",                code: "CAD", symbol: "C$",   name: "Canadian Dollar" },
};
const DEFAULT_COUNTRY = { countryCode: "ZA", ...COUNTRY_CURRENCY.ZA };

function isPrivateIp(ip: string): boolean {
  return (
    ip === "::1" || ip === "127.0.0.1" || ip.startsWith("192.168.") ||
    ip.startsWith("10.") || ip.startsWith("172.16.") || ip.startsWith("::ffff:127.")
  );
}

// GET /api/geo/detect — resolve the caller's country (and matching currency)
// from their IP address. Falls back to South Africa for local/private IPs
// (dev environments) or if the lookup fails for any reason.
router.get("/detect", async (req: Request, res: Response): Promise<void> => {
  const rawIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";

  if (!rawIp || isPrivateIp(rawIp)) {
    res.json({ success: true, data: DEFAULT_COUNTRY, source: "default" });
    return;
  }

  try {
    // ipapi.co: free tier, HTTPS, no API key required, ~1000 req/day.
    const resp = await fetch(`https://ipapi.co/${rawIp}/json/`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) throw new Error(`ipapi.co returned ${resp.status}`);
    const geo = await resp.json() as { country_code?: string; country_name?: string; error?: boolean };

    if (geo.error || !geo.country_code) throw new Error("geo lookup returned no country");

    const currency = COUNTRY_CURRENCY[geo.country_code] ?? COUNTRY_CURRENCY.ZA;
    res.json({
      success: true,
      data: { ...currency, countryCode: geo.country_code, country: geo.country_name ?? currency.country },
      source: "ip-geolocation",
    });
  } catch (err) {
    console.warn("[geo] IP lookup failed, defaulting to South Africa:", err instanceof Error ? err.message : err);
    res.json({ success: true, data: DEFAULT_COUNTRY, source: "fallback" });
  }
});

// GET /api/geo/countries — the supported country/currency list, for a manual
// "change your delivery country" picker (IP geolocation isn't always right).
router.get("/countries", (_req: Request, res: Response): void => {
  const list = Object.entries(COUNTRY_CURRENCY).map(([countryCode, c]) => ({ countryCode, ...c }));
  res.json({ success: true, data: list });
});

// ─── Live FX rates ───────────────────────────────────────────────────────────
let rateCache: { base: string; rates: Record<string, number>; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — matches how often the free-tier source actually updates

// GET /api/currency/rates — live exchange rates with ZAR as the base
// (every price in this app is stored/settled in ZAR; this converts for
// *display* only). Cached server-side for an hour so we don't hammer the
// upstream API and every storefront request stays fast.
router.get("/rates", async (_req: Request, res: Response): Promise<void> => {
  const now = Date.now();
  if (rateCache && now - rateCache.fetchedAt < CACHE_TTL_MS) {
    res.json({ success: true, data: rateCache, cached: true });
    return;
  }

  try {
    // open.er-api.com: free, no API key, rates update roughly daily.
    const resp = await fetch("https://open.er-api.com/v6/latest/ZAR", { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`open.er-api.com returned ${resp.status}`);
    const data = await resp.json() as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };

    if (data.result !== "success" || !data.rates) throw new Error("rate provider returned an error result");

    rateCache = { base: "ZAR", rates: data.rates, fetchedAt: now };
    res.json({ success: true, data: rateCache, cached: false });
  } catch (err) {
    console.error("[currency] Live rate fetch failed:", err instanceof Error ? err.message : err);
    if (rateCache) {
      // Serve the last known-good cache rather than fail the whole page —
      // stale rates are far better than no rates for a storefront.
      res.json({ success: true, data: rateCache, cached: true, stale: true });
      return;
    }
    res.status(503).json({ success: false, error: "Exchange rates are temporarily unavailable" });
  }
});

export default router;
