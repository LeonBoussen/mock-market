import { db, sql, round2 } from '../db.js';
import { ApiError, catalogItem } from './util.js';
import { getQuote, getUsdPer, barDate } from './yahoo.js';

const EPS = 1e-9;

export function profileOwnerCheck(profile, userId) {
  if (!profile) throw new ApiError(404, 'not_found', 'Profile not found.');
  if (profile.user_id !== userId) throw new ApiError(403, 'forbidden', 'This profile belongs to another account.');
  return profile;
}

// Ratio that converts 1 unit of instrument currency into profile base currency.
async function instToBaseRatio(instCcy, baseCcy) {
  if (instCcy === baseCcy) return 1;
  const a = await getUsdPer(instCcy);
  const b = await getUsdPer(baseCcy);
  return a / b;
}

function validateQty(qty) {
  if (!Number.isFinite(qty) || qty <= 0 || qty > 1e12) {
    throw new ApiError(422, 'bad_qty', 'Quantity must be a positive number.');
  }
  return Math.round(qty * 1e6) / 1e6;
}

// Core accounting for a fill. priceInst is per-unit in the instrument currency.
async function applyFill(profile, order, priceInst, note) {
  const item = catalogItem(order.symbol);
  const ratio = await instToBaseRatio(item.c, profile.base_currency);
  const priceBase = priceInst * ratio;
  const now = Date.now();

  const doFill = db.transaction(() => {
    const side = order.side;
    let realized = null;
    let cashDelta = 0;
    if (side === 'buy') {
      const costBase = round2(order.qty * priceBase);
      if (profile.cash + EPS < costBase) {
        throw new ApiError(
          422,
          'insufficient_funds',
          `Not enough cash. You need ${costBase.toFixed(2)} ${profile.base_currency} but have ${profile.cash.toFixed(2)}.`
        );
      }
      const pos = sql.positionByKey.get(order.profile_id, order.symbol);
      const oldQty = pos ? pos.qty : 0;
      const newQty = oldQty + order.qty;
      const avgInst = oldQty > 0 ? (pos.avg_price * oldQty + priceInst * order.qty) / newQty : priceInst;
      const avgBase = oldQty > 0
        ? (pos.avg_unit_cost_base * oldQty + order.qty * priceBase) / newQty
        : priceBase;
      sql.upsertPosition.run(order.profile_id, order.symbol, newQty, avgInst, avgBase, now);
      sql.markOrderFilled.run(priceInst, -costBase, null, note || null, now, order.id);
      sql.adjustCash.run(-costBase, order.profile_id);
      cashDelta = -costBase;
    } else {
      const pos = sql.positionByKey.get(order.profile_id, order.symbol);
      const held = pos ? pos.qty : 0;
      if (held + EPS < order.qty) {
        throw new ApiError(
          422,
          'not_enough_shares',
          `You only hold ${held} of ${order.symbol} — can't sell ${order.qty}.`
        );
      }
      const proceedsBase = round2(order.qty * priceBase);
      realized = round2(order.qty * (priceBase - pos.avg_unit_cost_base));
      const newQty = held - order.qty;
      if (newQty <= EPS) sql.deletePosition.run(order.profile_id, order.symbol);
      else sql.upsertPosition.run(order.profile_id, order.symbol, newQty, pos.avg_price, pos.avg_unit_cost_base, now);
      sql.markOrderFilled.run(priceInst, proceedsBase, realized, note || null, now, order.id);
      sql.addRealized.run(realized, order.profile_id);
      sql.adjustCash.run(proceedsBase, order.profile_id);
      cashDelta = proceedsBase;
    }
    return { realized, cashDelta };
  });

  const res = doFill();
  // Store a meaningful equity point using the *new* cash + position mark
  void recordEquityPoint(profile.id, true);
  return res;
}

// Record an equity point for a profile (throttled, unless forced).
let lastEquityWrite = new Map();
export async function recordEquityPoint(profileId, force = false) {
  const now = Date.now();
  const last = lastEquityWrite.get(profileId) || 0;
  if (!force && now - last < 15 * 60 * 1000) return;
  try {
    const value = await currentTotalValue(profileId);
    if (value != null) {
      sql.insertEquity.run(profileId, now, round2(value.total), round2(value.cash));
      lastEquityWrite.set(profileId, now);
    }
  } catch {
    // valuation hiccup (network) — skip silently, points are opportunistic
  }
}

async function currentTotalValue(profileId) {
  const profile = sql.profileById.get(profileId);
  if (!profile) return null;
  const sum = await summarizePositions(profile);
  if (sum.failedFx.length > 0) return null; // avoid wrong points when FX missing
  return { total: sum.marketValue + profile.cash, cash: profile.cash };
}

// ---- Order placement ----------------------------------------------------

export async function placeOrder(profile, { symbol, side, kind, qty, limitPrice }) {
  const item = catalogItem(symbol);
  validateQty(qty);
  side = side === 'sell' ? 'sell' : 'buy';
  kind = kind === 'limit' ? 'limit' : 'market';

  if (kind === 'limit') {
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
      throw new ApiError(422, 'bad_limit', 'Limit orders need a valid limit price.');
    }
    limitPrice = Math.round(limitPrice * 1e4) / 1e4;

    let quote = null;
    try {
      quote = await getQuote(symbol);
    } catch {
      /* quote unavailable — order is queued for the poller */
    }
    const now = Date.now();

    // Affordability: a buy limit needs cash covering the worst case (the limit price).
    if (quote && side === 'buy') {
      const ratio = await instToBaseRatio(item.c, profile.base_currency);
      const worst = round2(qty * limitPrice * ratio);
      if (profile.cash + EPS < worst) {
        throw new ApiError(
          422,
          'insufficient_funds',
          `This limit order can cost up to ${worst.toFixed(2)} ${profile.base_currency}, but you have ${profile.cash.toFixed(2)}.`
        );
      }
    }

    const info = sql.insertOrder.run(profile.id, symbol, side, 'limit', qty, limitPrice, 'open', null, null, null, 'Working', now, null);
    const order = sql.orderById.get(info.lastInsertRowid);

    // If the market already crossed the limit, fill immediately at the market price.
    if (quote) {
      const crossed =
        side === 'buy' ? quote.price <= limitPrice + EPS : quote.price >= limitPrice - EPS;
      if (crossed) {
        const note = quote.marketState === 'REGULAR'
          ? 'Limit hit — filled at the market price.'
          : 'Limit hit — market closed, filled at the latest close.';
        try {
          await applyFill(profile, order, quote.price, note);
        } catch (e) {
          sql.markOrderCanceled.run(Date.now(), order.id);
          throw e;
        }
      }
    }
    return orderRow(order.id);
  }

  // Market order — fill at the live price.
  let quote;
  try {
    quote = await getQuote(symbol);
  } catch (e) {
    throw new ApiError(502, 'quote_failed', `Could not fetch a live price for ${symbol}. Please retry.`);
  }
  const note = quote.marketState === 'REGULAR' ? null : 'Market closed — filled at the latest close.';
  const order = {
    profile_id: profile.id,
    symbol,
    side,
    kind: 'market',
    qty,
    limit_price: null,
  };
  const now = Date.now();
  const info = sql.insertOrder.run(profile.id, symbol, side, 'market', qty, null, 'open', null, null, null, null, now, null);
  const row = sql.orderById.get(info.lastInsertRowid);
  await applyFill(profile, row, quote.price, note);
  return orderRow(row.id);
}

export async function cancelOrder(profile, orderId) {
  const order = sql.orderById.get(orderId);
  if (!order || order.profile_id !== profile.id) throw new ApiError(404, 'not_found', 'Order not found.');
  if (order.status !== 'open') throw new ApiError(409, 'not_open', 'Only open orders can be canceled.');
  sql.markOrderCanceled.run(Date.now(), order.id);
  return orderRow(order.id);
}

function orderRow(id) {
  const o = sql.orderById.get(id);
  const item = catalogItem(o.symbol);
  return { ...o, name: item.n, currency: item.c };
}

// Try to fill an open limit order against current market price.
export async function tryMatchOrder(order) {
  if (order.status !== 'open') return { filled: false };
  let quote;
  try {
    quote = await getQuote(order.symbol, { fresh: true });
  } catch {
    return { filled: false };
  }
  const price = quote.price;
  const crossed =
    order.side === 'buy' ? price <= order.limit_price + EPS : price >= order.limit_price - EPS;
  if (!crossed) return { filled: false };
  const profile = sql.profileById.get(order.profile_id);
  if (!profile) return { filled: false };
  const note = quote.marketState === 'REGULAR'
    ? `Limit hit — filled at market price`
    : 'Limit hit — market closed, filled at the latest close.';
  // Fill at the current market price (price improvement: never worse than the limit).
  await applyFill(profile, order, price, note);
  return { filled: true };
}

// Poller step: try to fill all open limit orders.
export async function tickOpenOrders() {
  const open = sql.allOpenOrders.all();
  if (!open.length) return { tried: 0, filled: 0 };
  let filled = 0;
  for (const order of open) {
    try {
      const r = await tryMatchOrder(order);
      if (r.filled) filled++;
    } catch {
      /* keep working */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { tried: open.length, filled };
}

// ---- Portfolio ----------------------------------------------------------

export async function summarizePositions(profile, positions = null) {
  const rows = positions || sql.positionsForProfile.all(profile.id);
  const base = profile.base_currency;
  const out = { positions: [], marketValue: 0, unrealized: 0, dayPnl: 0, failedFx: [], failedQuote: [] };

  // quotes in small parallel batches
  const distinct = [...new Set(rows.map((r) => r.symbol))];
  const quotes = new Map();
  for (let i = 0; i < distinct.length; i += 5) {
    const batch = distinct.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map((s) => getQuote(s)));
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') quotes.set(batch[j], r.value);
    });
  }

  for (const pos of rows) {
    const item = catalogItem(pos.symbol);
    const q = quotes.get(pos.symbol);
    if (!q) {
      out.failedQuote.push(pos.symbol);
      continue;
    }
    let ratio = null;
    if (item.c !== base) {
      try {
        ratio = await instToBaseRatio(item.c, base);
      } catch {
        out.failedFx.push(pos.symbol);
        continue;
      }
    } else ratio = 1;

    const unitValueBase = q.price * ratio;
    const valueBase = pos.qty * unitValueBase;
    const unrealizedBase = pos.qty * (unitValueBase - pos.avg_unit_cost_base);
    const dayUnitBase = (q.price - q.prevClose) * ratio;
    const dayPnlBase = pos.qty * dayUnitBase;
    out.marketValue += valueBase;
    out.unrealized += unrealizedBase;
    out.dayPnl += dayPnlBase;
    out.positions.push({
      symbol: pos.symbol,
      name: item.n,
      currency: item.c,
      region: item.region,
      type: item.type,
      qty: pos.qty,
      avgPrice: pos.avg_price,
      avgUnitCostBase: pos.avg_unit_cost_base,
      lastPrice: q.price,
      prevClose: q.prevClose,
      changePct: q.changePct,
      priceReturnPct: pos.avg_price ? ((q.price - pos.avg_price) / pos.avg_price) * 100 : 0,
      unitValueBase,
      valueBase,
      unrealizedBase,
      dayPnlBase,
      returnPct: pos.avg_unit_cost_base ? ((unitValueBase - pos.avg_unit_cost_base) / pos.avg_unit_cost_base) * 100 : 0,
      weightPct: null, // computed by caller once totals known
      time: q.time,
      marketState: q.marketState,
    });
  }
  const denom = out.marketValue || 1;
  for (const p of out.positions) p.weightPct = (p.valueBase / denom) * 100;
  return out;
}

export async function portfolioOverview(profile) {
  const sum = await summarizePositions(profile);
  const cash = round2(profile.cash);
  const marketValue = round2(sum.marketValue);
  return {
    profileId: profile.id,
    baseCurrency: profile.base_currency,
    cash,
    marketValue,
    totalValue: round2(cash + marketValue),
    unrealized: round2(sum.unrealized),
    realized: round2(profile.realized_base),
    dayPnl: round2(sum.dayPnl),
    positions: sum.positions,
    positionCount: sum.positions.length,
    failedFx: sum.failedFx,
    failedQuote: sum.failedQuote,
    asOf: Date.now(),
  };
}

// Reset profile practice balance
export async function resetProfile(profile) {
  const now = Date.now();
  db.transaction(() => {
    sql.clearProfilePositions.run(profile.id);
    sql.cancelOpenOrders.run(now, profile.id);
    sql.resetProfileCash.run(profile.id);
    sql.insertEquity.run(profile.id, now, round2(profile.starting_balance), round2(profile.starting_balance));
  })();
  return sql.profileById.get(profile.id);
}

// Date label helper re-export for convenience
export const label = barDate;
