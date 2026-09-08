export const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', GBp: 'p', JPY: '¥', HKD: 'HK$', CNY: 'CN¥',
  CHF: 'CHF ', INR: '₹', KRW: '₩', AUD: 'A$', CAD: 'C$', SEK: 'kr ', NOK: 'kr ',
};

export function ccy(currency) {
  return CURRENCY_SYMBOLS[currency] || currency + ' ';
}

// money: base-currency amounts with 2 decimals
export function money(v, currency = 'USD', opts = {}) {
  const sym = ccy(currency);
  const n = fmtNum(v, { ...opts, max: 2, min: 2 });
  return `${sym}${n}`;
}

// money in asset units (e.g., crypto or large prices)
export function amount(v, currency = 'USD') {
  const sym = ccy(currency);
  const n = fmtNum(v, { max: 2, min: 2 });
  return `${sym}${n}`;
}

// smart price formatter: scale decimals by magnitude
export function price(v, currency) {
  const sym = ccy(currency);
  const a = Math.abs(v);
  let d = 2;
  if (a < 0.0001) d = 8;
  else if (a < 0.01) d = 6;
  else if (a < 1) d = 4;
  else if (a < 1000) d = 2;
  else d = 2;
  return `${sym}${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

export function pct(v, signed = true, digits = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = signed && v > 0 ? '+' : '';
  return `${s}${v.toFixed(digits)}%`;
}

export function signedNum(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = v > 0 ? '+' : '';
  return `${s}${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtNum(v, { min = 2, max = 2, signed = false } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  const n = v.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
  return signed && v > 0 ? '+' + n : n;
}

export function signCls(v) {
  if (v == null || Math.abs(v) < 1e-9) return 'flat-c';
  return v > 0 ? 'up' : 'down';
}

// Compact big numbers: 1.24M, 873K
export function compact(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Compact time for intraday axis
export function fmtAxis(epochMs, gmtoffsetSec = 0, opts = {}) {
  const d = new Date(epochMs + (gmtoffsetSec || 0) * 1000);
  if (opts.date) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const REGION_LABELS = {
  us: 'United States',
  eu: 'Europe',
  uk: 'United Kingdom',
  asia: 'Asia Pacific',
  crypto: 'Crypto',
};

export function todayYmd() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
