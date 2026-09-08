import { useMemo } from 'react';
import catalog from '@shared/catalog.json';

export const CATALOG = catalog.items;

export function useCatalog() {
  return useMemo(() => {
    const bySymbol = new Map(CATALOG.map((i) => [i.s, i]));
    const search = (q, { region = 'all', type = 'all' } = {}) => {
      const t = (q || '').trim().toLowerCase();
      let list = CATALOG;
      if (region && region !== 'all') list = list.filter((i) => i.region === region);
      if (type && type !== 'all') list = list.filter((i) => i.type === type);
      if (!t) return list;
      return list
        .filter((i) => i.s.toLowerCase().includes(t) || i.n.toLowerCase().includes(t))
        .sort((a, b) => {
          const as = a.s.toLowerCase().startsWith(t) ? 0 : 1;
          const bs = b.s.toLowerCase().startsWith(t) ? 0 : 1;
          return as - bs;
        });
    };
    return { items: CATALOG, bySymbol, search };
  }, []);
}

export function useAsset(symbol) {
  const { bySymbol } = useCatalog();
  return bySymbol.get(symbol) || null;
}
