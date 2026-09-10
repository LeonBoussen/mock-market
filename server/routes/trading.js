import { Router } from 'express';
import { z } from 'zod';
import { sql } from '../db.js';
import { requireAuth, rateLimit } from '../lib/security.js';
import { ah, ok, ApiError, catalogItem } from '../lib/util.js';
import {
  profileOwnerCheck, placeOrder, cancelOrder, portfolioOverview,
  recordEquityPoint, summarizePositions,
} from '../lib/engine.js';
import { profilePublic } from './auth.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, rateLimit('general'));

function loadProfile(req) {
  const profile = sql.profileById.get(Number(req.params.profileId));
  return profileOwnerCheck(profile, req.auth.user.id);
}

const orderSchema = z.object({
  symbol: z.string().min(1).max(40),
  side: z.enum(['buy', 'sell']),
  kind: z.enum(['market', 'limit']).default('market'),
  qty: z.number().finite().positive(),
  limitPrice: z.number().finite().positive().optional(),
});

router.get('/overview', ah(async (req, res) => {
  const profile = loadProfile(req);
  const overview = await portfolioOverview(profile);
  await recordEquityPoint(profile.id);
  ok(res, { overview });
}));

router.get('/positions', ah(async (req, res) => {
  const profile = loadProfile(req);
  const positions = await summarizePositions(profile);
  ok(res, { positions, baseCurrency: profile.base_currency, failedFx: positions.failedFx, failedQuote: positions.failedQuote });
}));

router.get('/orders', ah(async (req, res) => {
  const profile = loadProfile(req);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const rows = sql.ordersForProfile.all(profile.id, limit);
  const orders = rows.map((o) => {
    const item = catalogItem(o.symbol);
    return { ...o, name: item.n, currency: item.c };
  });
  ok(res, { orders });
}));

router.post('/orders', ah(async (req, res) => {
  const profile = loadProfile(req);
  const parsed = orderSchema.safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.issues[0].message);
  const { symbol, side, kind, qty, limitPrice } = parsed.data;
  const order = await placeOrder(profile, {
    symbol: symbol.toUpperCase(),
    side,
    kind,
    qty,
    limitPrice: kind === 'limit' ? limitPrice : undefined,
  });
  const positions = await summarizePositions(profile);
  ok(res, { order, positions, baseCurrency: profile.base_currency }, 201);
}));

router.delete('/orders/:orderId', ah(async (req, res) => {
  const profile = loadProfile(req);
  const order = await cancelOrder(profile, Number(req.params.orderId));
  ok(res, { order });
}));

router.get('/equity', ah(async (req, res) => {
  const profile = loadProfile(req);
  const rows = sql.equitySeries.all(profile.id);
  ok(res, { points: rows.map((r) => ({ ts: r.ts, value: r.value_base, cash: r.cash_base })), baseCurrency: profile.base_currency });
}));

export default router;
