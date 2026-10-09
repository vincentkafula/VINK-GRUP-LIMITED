import { Router, type Request, type Response } from "express";
import { convert, type LiveRates } from "../services/liveRates.js";

/**
 * Live market rates for display (see services/liveRates.ts). Public: no sign-in.
 *   GET /rates                              the whole table, 1 ZAR = rates[code]; { data, cached, stale }
 *   GET /convert?from=USD&to=ZMW&amount=100 one conversion at the same rates
 * These are reference rates for information, not an offer to deal at.
 */
export interface RatesSource { get(): Promise<{ data: LiveRates; cached: boolean; stale: boolean }> }

const CODE = /^[A-Za-z]{3}$/;
const MAX_AMOUNT = 1e12;

export function createRatesRouter(cache: RatesSource): Router {
  const router = Router();

  router.get("/rates", async (_req: Request, res: Response): Promise<void> => {
    try {
      const r = await cache.get();
      res.set("Cache-Control", "public, max-age=300");
      res.json({ success: true, data: r.data, cached: r.cached, ...(r.stale ? { stale: true } : {}) });
    } catch (err) {
      console.error("[currency] live rates unavailable:", err instanceof Error ? err.message : err);
      res.status(503).json({ success: false, error: "Exchange rates are temporarily unavailable" });
    }
  });

  router.get("/convert", async (req: Request, res: Response): Promise<void> => {
    const from = String(req.query.from ?? "").toUpperCase(), to = String(req.query.to ?? "").toUpperCase();
    const amount = req.query.amount === undefined ? 1 : Number(req.query.amount);
    if (!CODE.test(from) || !CODE.test(to)) { res.status(400).json({ success: false, error: "from and to must be three-letter currency codes, for example USD and ZMW" }); return; }
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) { res.status(400).json({ success: false, error: "amount must be a number from 0 to 1 000 000 000 000" }); return; }
    try {
      const r = await cache.get();
      const c = convert(r.data.rates, from, to, amount);
      if (!c) { res.status(404).json({ success: false, error: `No rate for ${!r.data.rates[from] ? from : to}` }); return; }
      res.set("Cache-Control", "public, max-age=300");
      res.json({ success: true, data: { from, to, amount, rate: c.rate, result: c.result, source: r.data.source, attributionUrl: r.data.attributionUrl, sourceUpdatedAt: r.data.sourceUpdatedAt, fetchedAt: r.data.fetchedAt }, ...(r.stale ? { stale: true } : {}) });
    } catch (err) {
      console.error("[currency] live rates unavailable:", err instanceof Error ? err.message : err);
      res.status(503).json({ success: false, error: "Exchange rates are temporarily unavailable" });
    }
  });

  return router;
}
