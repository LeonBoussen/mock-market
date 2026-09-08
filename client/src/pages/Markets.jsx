import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpDown, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useCatalog } from '../lib/catalog';
import { useQuotes } from '../lib/market';
import { price, pct, signCls, compact } from '../lib/format';
import { AssetPicker } from '../components/AssetPicker';

const REGIONS = [
  { key: 'all', label: 'All markets' },
  { key: 'us', label: '🇺🇸 US' },
  { key: 'eu', label: '🇪🇺 Europe' },
  { key: 'uk', label: '🇬🇧 UK' },
  { key: 'asia', label: '🌏 Asia' },
  { key: 'crypto', label: '🪙 Crypto' },
];
const TYPES = [
  { key: 'all', label: 'All types' },
  { key: 'stock', label: 'Stocks' },
  { key: 'etf', label: 'ETFs' },
  { key: 'crypto', label: 'Crypto' },
];

export default function MarketsPage() {
  const { search, bySymbol } = useCatalog();
  const nav = useNavigate();
  const [region, setRegion] = useState('all');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('mkt'); // mkt | name | price | chg
  const [dir, setDir] = useState(1);
  const [picked, setPicked] = useState(null);

  const matches = useMemo(() => search(query, { region, type }), [query, region, type, search]);
  const visible = matches.slice(0, 40);
  const symbols = visible.map((i) => i.s);
  const { quotes } = useQuotes(symbols, { refreshMs: 30000 });

  const rows = useMemo(() => {
    const arr = visible.map((i) => ({ ...i, q: quotes.get(i.s) }));
    const sorted = [...arr].sort((a, b) => {
      const qa = a.q; const qb = b.q;
      if (sortKey === 'name') return a.n.localeCompare(b.n) * dir;
      if (sortKey === 'price') return ((qa?.price ?? -1) - (qb?.price ?? -1)) * dir;
      if (sortKey === 'chg') return (((qa?.changePct ?? -1e9) - (qb?.changePct ?? -1e9)) * dir);
      return ((qa ? 1 : 0) - (qb ? 1 : 0)) * -1 || (qa?.symbol || a.s).localeCompare(qb?.symbol || b.s);
    });
    return sorted;
  }, [visible, quotes, sortKey, dir]);

  const setSort = (k) => {
    if (sortKey === k) setDir((d) => -d);
    else { setSortKey(k); setDir(k === 'name' ? 1 : -1); }
  };

  const go = (symbol) => nav(`/app/trade/${symbol}`);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Markets</h1>
          <p className="page-sub">Every asset is tradable with paper money — live prices from the real exchanges.</p>
        </div>
        <div style={{ width: 'min(360px, 100%)' }}>
          <AssetPicker onChange={go} placeholder="Search 129 assets…" />
        </div>
      </div>

      <div className="filterbar">
        <div className="seg" role="tablist" aria-label="Region">
          {REGIONS.map((r) => (
            <button key={r.key} className={region === r.key ? 'on' : ''} onClick={() => setRegion(r.key)}>{r.label}</button>
          ))}
        </div>
        <div className="seg" role="tablist" aria-label="Type">
          {TYPES.map((t) => (
            <button key={t.key} className={type === t.key ? 'on' : ''} onClick={() => setType(t.key)}>{t.label}</button>
          ))}
        </div>
        <div className="mut" style={{ marginLeft: 'auto', fontSize: 13 }}>
          {visible.length < matches.length ? `showing ${visible.length} of ${matches.length} — search or filter for more` : `${matches.length} assets`}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <Th label="Asset" sort="name" cur={sortKey} dir={dir} onClick={() => setSort('name')} />
              <th>Type · Market</th>
              <Th r label="Last price" sort="price" cur={sortKey} dir={dir} onClick={() => setSort('price')} />
              <Th r label="Today" sort="chg" cur={sortKey} dir={dir} onClick={() => setSort('chg')} />
              <th className="r nw">Prev close</th>
              <th className="r nw">Volume</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const q = i.q;
              const sym = q?.symbol || i.s;
              return (
                <tr key={i.s} className="clickable" onClick={() => go(i.s)}>
                  <td>
                    <div className="sym-cell">
                      <span className={`sym-ico ${i.type}`}>{i.s.replace(/[.-].*$/, '').slice(0, 4)}</span>
                      <span>
                        <div className="nm">{i.n}</div>
                        <div className="ex">{i.s}</div>
                      </span>
                    </div>
                  </td>
                  <td className="mut nw" style={{ fontSize: 12.5 }}>
                    {i.type} · {i.ex}
                  </td>
                  <td className="r num" style={{ fontWeight: 650 }}>{q ? price(q.price, q.currency) : '—'}</td>
                  <td className="r">{q ? <span className={`pct-badge ${signCls(q.changePct)}`}>{pct(q.changePct)}</span> : '—'}</td>
                  <td className="r num mut">{q ? price(q.prevClose, q.currency) : '—'}</td>
                  <td className="r num mut">{q ? compact(q.volume) : '—'}</td>
                  <td>
                    <span className="btn btn-soft btn-sm" style={{ pointerEvents: 'none' }}>Trade</span>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={7}><div className="empty">Nothing matches — try a different search or market.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, r, sort, cur, dir, onClick }) {
  const active = cur === sort;
  return (
    <th className={r ? 'r nw' : 'nw'} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={onClick}>
      {children} <ArrowUpDown size={11} style={{ opacity: active ? 1 : 0.35, verticalAlign: '-1px', transform: dir === 1 ? 'none' : 'rotate(180deg)' }} />
    </th>
  );
}
