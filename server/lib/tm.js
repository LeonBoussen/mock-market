import { sql, round2 } from '../db.js';
import { ApiError, catalogItem } from './util.js';
import { getChart, barDate, ms } from './yahoo.js';

const MIN_START = ms('1995-01-01');

function ymd(d) {
  const s = new Date(d);
  return s.toISOString().slice(0, 10);
}

// Full daily-history fetch over a window.
async function fetchDaily(symbol, p1Ms, p2Ms) {
  const chart = await getChart(symbol, {
    interval: '1d',
    period1: Math.floor(p1Ms / 1000),
    period2: Math.floor(p2Ms / 1000),
  });
  const gmtoffset = chart.meta.gmtoffset ?? 0;
  const bars = chart.bars.map((b) => ({ ...b, date: barDate(b.t, gmtoffset) }));
  return { meta: chart.meta, gmtoffset, bars };
}

function statsFromCloses(closes) {
  if (closes.length < 2) return null;
  const rets = [];
  let prev = closes[0];
  for (let i = 1; i < closes.length; i++) {
    if (prev > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / prev));
    prev = closes[i];
  }
  if (!rets.length) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1 || 1);
  const sd = Math.sqrt(variance);
  let peak = closes[0];
  let maxDD = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    if (peak > 0) maxDD = Math.min(maxDD, c / peak - 1);
  }
  return {
    volPct: sd * Math.sqrt(252) * 100,
    maxDrawdownPct: maxDD * 100,
    tradingDays: closes.length,
  };
}

/**
 * Simulate "what if I had invested $X into SYMBOL on DATE (and optionally sold on EXIT_DATE)".
 * All math in the instrument's native currency. Returns metrics + series for the chart.
 */
export async function runSimulation({ symbol, startDate, exitDate = null, amount }) {
  const item = catalogItem(symbol);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '')) throw new ApiError(422, 'bad_date', 'Pick a valid date (YYYY-MM-DD).');
  const startMs = ms(startDate);
  if (startMs < MIN_START) throw new ApiError(422, 'date_too_old', 'The time machine reaches back to January 1995.');
  const todayMs = Date.now();
  if (startMs > todayMs - 12 * 60 * 60 * 1000) {
    throw new ApiError(422, 'future_date', 'That date is in the future (or still trading today). Pick an earlier date.');
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
    throw new ApiError(422, 'bad_amount', 'Enter an amount to invest — e.g. 1000.');
  }
  amount = round2(amount);

  let exitMs = null;
  if (exitDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exitDate)) throw new ApiError(422, 'bad_date', 'Invalid exit date.');
    exitMs = ms(exitDate);
    if (exitMs <= startMs) throw new ApiError(422, 'bad_exit', 'Exit date must be after the entry date.');
  }

  // Fetch with ~60 days of context before the entry date and a little after today.
  const p1 = startMs - 60 * 86400000;
  const p2 = todayMs + 3 * 86400000;
  const { meta, gmtoffset, bars } = await fetchDaily(symbol, p1, p2);
  if (!bars.length) throw new ApiError(502, 'no_data', `No history available for ${symbol}.`);

  const lastDate = bars[bars.length - 1].date;

  // Entry: first session on/after the chosen date.
  const idxStart = bars.findIndex((b) => b.date >= startDate);
  if (idxStart === -1) throw new ApiError(422, 'no_data', `No trading sessions found on or after ${startDate}.`);
  const entryBar = bars[idxStart];
  const entryDate = entryBar.date;
  const entryPrice = entryBar.c;

  // Exit: session on/before exit date (clamped to last available session when exit is open/future).
  let idxEnd = bars.length - 1;
  let clampedExit = false;
  if (exitMs) {
    const effExitDate = exitMs > ms(lastDate) ? lastDate : exitDate;
    clampedExit = effExitDate !== exitDate;
    const idx = (() => {
      let best = -1;
      for (let i = idxStart; i < bars.length; i++) {
        if (bars[i].date <= effExitDate) best = i;
        else break;
      }
      return best;
    })();
    if (idx === -1) throw new ApiError(422, 'no_data', 'No trading session found up to the exit date.');
    idxEnd = idx;
  } else {
    clampedExit = true; // still trading — outcome shown at the latest close
  }
  const exitBar = bars[idxEnd];
  const exitDateActual = exitBar.date;
  const exitPrice = exitBar.c;

  const qty = amount / entryPrice;
  const endValue = round2(qty * exitPrice);
  const pnl = round2(endValue - amount);
  const pnlPct = ((exitPrice / entryPrice) - 1) * 100;
  const days = Math.max(1, Math.round((ms(exitDateActual) - ms(entryDate)) / 86400000));
  const years = days / 365.25;
  const annualizedPct = years > 0.02 ? ((exitPrice / entryPrice) ** (1 / years) - 1) * 100 : null;

  const heldCloses = bars.slice(idxStart, idxEnd + 1).map((b) => b.c);
  const st = statsFromCloses(heldCloses);

  // Benchmark: SPY over the same window (price-only).
  let bench = null;
  try {
    const spy = await fetchDaily('SPY', ms(entryDate) - 2 * 86400000, ms(exitDateActual) + 86400000);
    const s0 = spy.bars.find((b) => b.date >= entryDate);
    const s1 = [...spy.bars].reverse().find((b) => b.date <= exitDateActual);
    if (s0 && s1 && s1.date > s0.date) {
      const pct = (s1.c / s0.c - 1) * 100;
      bench = { symbol: 'SPY', name: 'S&P 500', entryDate: s0.date, exitDate: s1.date, pct, beat: pnlPct >= pct };
    }
  } catch {
    bench = null;
  }

  // Chart series: context bars (a bit before entry) → end, compact.
  const ctxStart = Math.max(0, idxStart - 10);
  const series = bars.slice(ctxStart, idxEnd + 1).map((b) => ({
    t: b.t,
    o: b.o, h: b.h, l: b.l, c: b.c, v: b.v,
  }));

  const result = {
    symbol,
    name: item.n,
    currency: item.c,
    region: item.region,
    type: item.type,
    gmtoffset,
    exchange: meta.exchange,
    entryDate,
    entryPrice: round2(entryPrice * 1e4) / 1e4,
    exitDate: exitDateActual,
    exitPrice: round2(exitPrice * 1e4) / 1e4,
    amount,
    qty,
    endValue,
    pnl,
    pnlPct,
    days,
    annualizedPct: annualizedPct != null ? round2(annualizedPct) : null,
    maxDrawdownPct: st ? round2(st.maxDrawdownPct) : null,
    volatilityPct: st ? round2(st.volPct) : null,
    tradingDays: st ? st.tradingDays : null,
    clampedExit,
    requestedExitDate: exitDate,
    latestAvailableDate: lastDate,
    benchmark: bench,
  };

  return { result, series };
}

export function saveSim(userId, result, series) {
  const now = Date.now();
  const payload = JSON.stringify({ result, series });
  const info = sql.insertSim.run(
    userId, result.symbol, 'buy', result.amount, result.entryDate, result.exitDate,
    result.entryPrice, result.exitPrice, result.pnl, result.pnlPct, result.days,
    result.currency, payload, now
  );
  return sql.simById.get(info.lastInsertRowid);
}

export function simSummary(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    amount: row.amount,
    startDate: row.start_date,
    exitDate: row.exit_date,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    pnl: row.pnl,
    pnlPct: row.pnl_pct,
    days: row.days,
    currency: row.currency,
    createdAt: row.created_at,
  };
}
