import { useCallback, useEffect, useRef, useState } from 'react';
import api from './api';

// Fetch several quotes; returns a Map keyed by symbol. Polls every refreshMs.
export function useQuotes(symbols, { refreshMs = 30000 } = {}) {
  const [quotes, setQuotes] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const symbolsKey = (symbols || []).join(',');

  const load = useCallback(async () => {
    if (!symbols?.length) {
      setQuotes(new Map());
      setLoading(false);
      return;
    }
    const chunk = async (batch) => {
      const data = await api.get(`/markets/quotes?symbols=${encodeURIComponent(batch.join(','))}`);
      return data;
    };
    try {
      const all = new Map();
      const errs = [];
      const batches = [];
      for (let i = 0; i < symbols.length; i += 30) batches.push(symbols.slice(i, i + 30));
      for (const batch of batches) {
        const data = await chunk(batch);
        for (const q of data.quotes) all.set(q.symbol, q);
        errs.push(...(data.failed || []));
      }
      setQuotes((old) => {
        const merged = new Map(old);
        for (const [k, v] of all) merged.set(k, v);
        return merged;
      });
      setErrors(errs);
    } catch (e) {
      setErrors((x) => [...x, e.message]);
    } finally {
      setLoading(false);
    }
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
  '1M': { interval: '1h', range: '1mo' },
  '3M': { interval: '1h', range: '3mo' },
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
