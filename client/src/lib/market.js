import { useCallback, useEffect, useRef, useState } from 'react';
import api from './api';

// Fetch several quotes; returns a Map keyed by symbol. Polls every refreshMs.
export function useQuotes(symbols, { refreshMs = 30000 } = {}) {
  const [quotes, setQuotes] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const symbolsKey = (symbols || []).join(',');

  // Keep the latest symbol list in a ref so the polling callback never closes over
  // a stale array, and sequence requests so a slow response can't clobber a newer one.
  const symbolsRef = useRef(symbols || []);
  symbolsRef.current = symbols || [];
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const list = symbolsRef.current;
    const seq = ++seqRef.current;
    if (!list.length) {
      setQuotes(new Map());
      setErrors([]);
      setLoading(false);
      return;
    }
    const all = new Map();
    const errs = [];
    // Small batches, but one failed batch must not throw away the others.
    for (let i = 0; i < list.length; i += 30) {
      const batch = list.slice(i, i + 30);
      try {
        const data = await api.get(`/markets/quotes?symbols=${encodeURIComponent(batch.join(','))}`);
        for (const q of data?.quotes || []) all.set(q.symbol, q);
        for (const s of data?.failed || []) errs.push(s);
      } catch (e) {
        errs.push(...batch);
        void e;
      }
      if (seq !== seqRef.current) return; // superseded by a newer request
    }
    if (seq !== seqRef.current) return;
    if (all.size) {
      setQuotes((old) => {
        const merged = new Map(old);
        for (const [k, v] of all) merged.set(k, v);
        return merged;
      });
    }
    setErrors(errs);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);

  return { quotes, loading, errors };
}

// Single live quote for one symbol (e.g. the trade ticket).
export function useQuote(symbol, refreshMs = 20000) {
  const list = symbol ? [symbol] : [];
  const { quotes, loading, errors } = useQuotes(list, { refreshMs });
  return { quote: symbol ? quotes.get(symbol) : null, loading, failed: errors.includes(symbol) };
}

const INTERVAL_MAP = {
  '1D': { interval: '5m', range: '1d' },
  '5D': { interval: '15m', range: '5d' },
  // Yahoo's hourly interval is "60m" ("1h" is rejected as an invalid interval).
  '1M': { interval: '60m', range: '1mo' },
  '3M': { interval: '60m', range: '3mo' },
  '6M': { interval: '1d', range: '6mo' },
  '1Y': { interval: '1d', range: '1y' },
  '5Y': { interval: '1d', range: '5y' },
  MAX: { interval: '1wk', range: 'max' },
};

export const RANGE_KEYS = Object.keys(INTERVAL_MAP);

export function useHistory(symbol, rangeKey, refreshMs = 60000) {
  const [state, setState] = useState({ meta: null, bars: [], loading: true, error: null });
  const cfg = INTERVAL_MAP[rangeKey] || INTERVAL_MAP['1M'];

  const load = useCallback(async () => {
    if (!symbol) {
      setState({ meta: null, bars: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get(
        `/markets/history?symbol=${encodeURIComponent(symbol)}&interval=${cfg.interval}&range=${cfg.range}`
      );
      setState({ meta: data.meta, bars: data.bars, loading: false, error: null });
    } catch (e) {
      setState({ meta: null, bars: [], loading: false, error: e.message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, rangeKey]);

  useEffect(() => {
    load();
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);

  return { ...state, reload: load };
}
