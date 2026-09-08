import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../lib/security.js';
import { ah, ok, ApiError, CATALOG, catalogItem } from '../lib/util.js';
import { getQuote, getChart } from '../lib/yahoo.js';

const router = Router();

const ALLOWED_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1d', '5d', '1wk', '1mo', '3mo']);
const ALLOWED_RANGES = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']);

router.get('/catalog', ah(async (req, res) => {
  ok(res, { items: CATALOG });
}));

const quotesSchema = z.object({
  symbols: z.string().min(1).max(1200),
});

router.get('/quotes', requireAuth, ah(async (req, res) => {
  const parsed = quotesSchema.safeParse(req.query || {});
  if (!parsed.success) throw new ApiError(400, 'validation', 'Provide symbols=SYM1,SYM2');
  const symbols = [...new Set(parsed.data.symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 200);
  const quotes = [];
  const failed = [];
  // small parallel batches so Yahoo is never hammered
  for (let i = 0; i < symbols.length; i += 4) {
    const batch = symbols.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map((s) => getQuote(s)));
    results.forEach((r, j) => {
      const sym = batch[j];
      if (r.status === 'fulfilled') {
        const item = catalogItem(sym);
        quotes.push({ ...r.value, name: item.n, region: item.region, type: item.type });
      } else {
        failed.push(sym);
      }
    });
  }
  quotes.sort((a, b) => a.symbol.localeCompare(b.symbol));
  ok(res, { quotes, failed });
}));

const historySchema = z.object({
  symbol: z.string().min(1).max(40),
  interval: z.string().refine((v) => ALLOWED_INTERVALS.has(v), 'invalid interval'),
  range: z.string().refine((v) => ALLOWED_RANGES.has(v), 'invalid range').default('1mo'),
  fresh: z.string().optional(),
});

router.get('/history', requireAuth, ah(async (req, res) => {
  const parsed = historySchema.safeParse(req.query || {});
  if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.issues[0].message);
  const item = catalogItem(parsed.data.symbol.toUpperCase());
  const chart = await getChart(item.s, {
    interval: parsed.data.interval,
    range: parsed.data.range,
    fresh: parsed.data.fresh === '1',
  });
  ok(res, { meta: chart.meta, bars: chart.bars });
}));

export default router;
