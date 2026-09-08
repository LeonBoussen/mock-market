import { db, sql } from '../db.js';

const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const inflight = new Map(); // dedupe concurrent requests per URL

async function fetchYahoo(pathAndQuery, { retries = 4 } = {}) {
  const key = pathAndQuery;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
      const host = HOSTS[attempt % HOSTS.length];
      try {
        const res = await fetch(`https://${host}${key}`, {
          headers: { 'user-agent': UA, accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
        });
        if (res.status === 429) {
          await sleep(1200 * (attempt + 1) + Math.random() * 900);
          continue;
        }
        if (res.status === 404) return { error: 'not_found', status: 404 };
        if (!res.ok) {
          lastErr = new Error(`yahoo http ${res.status}`);
          await sleep(700 * (attempt + 1));
          continue;
        }
        const json = await res.json();
        if (!json?.chart?.result?.[0] && json?.chart?.error) {
          return { error: json.chart.error.description || 'yahoo error', status: 400 };
        }
        return { json };
      } catch (e) {
        lastErr = e;
        await sleep(700 * (attempt + 1));
      }
    }
    return { error: lastErr?.message || 'network failure', status: 0 };
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalize(result) {
  const meta = result.meta || {};
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose || null;
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null) continue;
    const o = q.open?.[i] ?? c;
    const h = q.high?.[i] ?? c;
    const l = q.low?.[i] ?? c;
    bars.push({
      t: ts[i] * 1000,
      o: Number(o),
      h: Number(h),
      l: Number(l),
      c: Number(c),
      v: q.volume?.[i] ?? 0,
      a: adj?.[i] != null ? Number(adj[i]) : null,
    });
  }
  return {
    meta: {
      symbol: meta.symbol,
      currency: meta.currency,
      exchange: meta.fullExchangeName || meta.exchangeName || null,
      marketState: meta.marketState || 'CLOSED',
      gmtoffset: meta.gmtoffset ?? 0,
      longName: meta.longName || meta.shortName || meta.symbol,
      regularMarketPrice: meta.regularMarketPrice ?? null,
      regularMarketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
      regularMarketDayHigh: meta.regularMarketDayHigh ?? null,
      regularMarketDayLow: meta.regularMarketDayLow ?? null,
    },
    bars,
  };
}

// ---- Caching ----------------------------------------------------------

const TTL_SECONDS = {
  '1m': 45, '2m': 60, '5m': 90, '15m': 120, '30m': 150, '60m': 180, '90m': 240,
  '1d': 240, '5d': 360, '1wk': 600, '1mo': 600, '3mo': 1200,
  quote: 20,
};

function cacheKey(symbol, interval, range) {
  return `y:${symbol}:${interval}:${range}`;
}

function readCache(key, maxAgeMs) {
  const row = sql.getCache.get(key);
  if (!row) return null;
  if (Date.now() - row.fetched_at > maxAgeMs) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  sql.setCache.run(key, JSON.stringify(value), Date.now());
}

// ---- Public: bars / quote ---------------------------------------------

// range: '1d' | '5d' | '1mo' ... or {period1, period2} in epoch seconds
export async function getChart(symbol, { interval = '1d', range = '1mo', period1, period2, fresh = false } = {}) {
  const qs = new URLSearchParams({ interval });
  if (period1 && period2) {
    qs.set('period1', Math.floor(period1));
    qs.set('period2', Math.floor(period2));
  } else if (range) {
    qs.set('range', range);
  }
  qs.set('includePrePost', 'false');
  const url = `/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`;
  const key = period1 && period2
    ? cacheKey(symbol, interval, `p${Math.floor(period1 / 86400)}-${Math.floor(period2 / 86400)}`)
    : cacheKey(symbol, interval, range);
  const ttl = (TTL_SECONDS[interval] ?? 300) * 1000;

  if (!fresh) {
    const cached = readCache(key, ttl);
    if (cached) return cached;
  }
  const { json, error, status } = await fetchYahoo(url);
  if (error || !json) {
    const cached = readCache(key, ttl * 6); // serve stale if network hiccup
    if (cached) return cached;
    throw Object.assign(new Error(`Could not load ${symbol}: ${error || 'no data'}`), { status: status || 502 });
  }
  const out = normalize(json.chart.result[0]);
  writeCache(key, out);
  return out;
}

// Lightweight quote: daily bars over 5 sessions give us prev close + latest.
export async function getQuote(symbol, { fresh = false } = {}) {
  const key = cacheKey(symbol, 'quote', 'q');
  const ttl = (TTL_SECONDS.quote ?? 20) * 1000;
  if (!fresh) {
    const cached = readCache(key, ttl);
    if (cached) return cached;
  }
  const chart = await getChart(symbol, { interval: '1d', range: '5d', fresh });
  const bars = chart.bars.filter((b) => b.c != null);
  if (bars.length === 0) throw Object.assign(new Error(`No price data for ${symbol}`), { status: 404 });
  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : last;
  const price = chart.meta.regularMarketPrice != null ? chart.meta.regularMarketPrice : last.c;
  const out = {
    symbol,
    currency: chart.meta.currency,
    exchange: chart.meta.exchange,
    marketState: chart.meta.marketState,
    gmtoffset: chart.meta.gmtoffset,
    name: chart.meta.longName,
    price: Number(price),
    prevClose: Number(prev.c),
    change: Number(price) - Number(prev.c),
    changePct: prev.c ? ((Number(price) - Number(prev.c)) / Number(prev.c)) * 100 : 0,
    high: last.h ?? Number(price),
    low: last.l ?? Number(price),
    volume: last.v ?? 0,
    time: Number(last.t),
    regularMarketTime: chart.meta.regularMarketTime,
  };
  writeCache(key, out);
  return out;
}

// ---- FX ---------------------------------------------------------------

// usd_per: how many USD for 1 unit of `ccy`. 'GBp' handled (pence).
const FX_PAIRS = {
  EUR: { sym: 'EURUSD=X', inv: false },
  GBP: { sym: 'GBPUSD=X', inv: false },
  JPY: { sym: 'USDJPY=X', inv: true },
  CNY: { sym: 'USDCNY=X', inv: true },
  HKD: { sym: 'USDHKD=X', inv: true },
  CHF: { sym: 'USDCHF=X', inv: true },
  INR: { sym: 'USDINR=X', inv: true },
  KRW: { sym: 'USDKRW=X', inv: true },
  AUD: { sym: 'AUDUSD=X', inv: false },
  CAD: { sym: 'USDCAD=X', inv: true },
  SEK: { sym: 'USDSEK=X', inv: true },
  NOK: { sym: 'USDNOK=X', inv: true },
};

const FX_TTL_MS = 60 * 1000;

export async function getUsdPer(ccy, { fresh = false } = {}) {
  if (ccy === 'USD') return 1;
  const unit = ccy === 'GBp' ? 'GBP' : ccy;
  const cfg = FX_PAIRS[unit];
  if (!cfg) throw new Error(`No FX route for currency ${ccy}`);

  if (!fresh) {
    const row = sql.getFx.get(cfg.sym);
    if (row && Date.now() - row.fetched_at < FX_TTL_MS) {
      const v = cfg.inv ? 1 / row.usd_per : row.usd_per;
      return ccy === 'GBp' ? v / 100 : v;
    }
  }
  const chart = await getChart(cfg.sym, { interval: '1d', range: '5d', fresh });
  const bars = chart.bars.filter((b) => b.c != null);
  if (!bars.length) throw new Error(`No FX data for ${cfg.sym}`);
  const rate = Number(bars[bars.length - 1].c);
  sql.setFx.run(cfg.sym, rate, Date.now());
  const v = cfg.inv ? 1 / rate : rate;
  return ccy === 'GBp' ? v / 100 : v;
}

// Convert an amount expressed in instrument currency into profile base currency.
export async function toBase(amount, instCurrency, baseCurrency) {
  if (!amount) return 0;
  if (instCurrency === baseCurrency) return amount; // note: 'GBp' never equals 'GBP', flows through FX
  const usdInst = await getUsdPer(instCurrency);
  const usdBase = await getUsdPer(baseCurrency);
  return (amount * usdInst) / usdBase;
}

export async function toInst(amountBase, instCurrency, baseCurrency) {
  if (!amountBase) return 0;
  if (instCurrency === baseCurrency) return amountBase;
  const usdInst = await getUsdPer(instCurrency);
  const usdBase = await getUsdPer(baseCurrency);
  return (amountBase * usdBase) / usdInst;
}

// ---- Exchange-local date helpers ---------------------------------------

// Daily-bar trading-day label ("YYYY-MM-DD") in the instrument's own timezone.
export function barDate(barTimeMs, gmtoffsetSec) {
  return new Date(barTimeMs + gmtoffsetSec * 1000).toISOString().slice(0, 10);
}

export function addDaysYmd(ymd, days) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const ms = (ymd) => Date.parse(ymd + 'T00:00:00Z');
