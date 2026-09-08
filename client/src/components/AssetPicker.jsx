import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, TrendingUp } from 'lucide-react';
import { useCatalog } from '../lib/catalog';

const REGION_TAG = { us: 'US', eu: 'EU', uk: 'UK', asia: 'APAC', crypto: '₿' };

export function AssetPicker({ value, onChange, autoFocus = false, placeholder = 'Search stocks, ETFs & crypto…', compact = false }) {
  const { search } = useCatalog();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const results = useMemo(() => search(q).slice(0, 14), [q, search]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (symbol) => {
    onChange?.(symbol);
    setOpen(false);
    setQ('');
  };

  return (
    <div className="asset-picker" ref={boxRef}>
      <div className="asset-search" onClick={() => setOpen(true)}>
        <Search size={15} className="mut" />
        <input
          className={compact ? 'compact' : ''}
          autoFocus={autoFocus}
          value={q}
          placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && results[0]) pick(results[0].s);
          }}
          aria-label="Search assets"
        />
        {value && !open && (
          <span className="asset-current" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
            {value}
          </span>
        )}
      </div>

      {open && (
        <div className="asset-menu">
          {results.length === 0 && <div className="asset-empty">No assets match “{q}”.</div>}
          {results.map((i) => (
            <button key={i.s} className="asset-opt" type="button" onClick={() => pick(i.s)}>
              <span className="asset-sym">{i.s}</span>
              <span className="asset-name trunc">{i.n}</span>
              <span className={`asset-tag tag-${i.type}`}>{REGION_TAG[i.region] || i.region}</span>
              {i.type === 'crypto' && <TrendingUp size={13} className="mut" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
