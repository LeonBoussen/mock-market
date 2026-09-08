import { useEffect, useMemo, useState } from 'react';
import {
  Clock3, Rocket, Trash2, BookmarkPlus, Trophy, TrendingDown, Play, Wand2, ChevronRight, CalendarDays, Flag, Crown,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import api from '../lib/api';
import { useAsset } from '../lib/catalog';
import { money, pct, signCls, price, fmtDate, todayYmd, ccy } from '../lib/format';
import { useToasts } from '../store/ui';
import { AssetPicker } from '../components/AssetPicker';
import ChartCandles from '../components/ChartCandles';
import { Confirm } from '../components/Modal';

const PRESETS_AMOUNT = [500, 1000, 5000, 10000, 50000];

function ymdAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export default function TimeMachinePage() {
  const { user } = useAuth();
  const toasts = useToasts();
  const assetItem = null;

  const [symbol, setSymbol] = useState('AAPL');
  const asset = useAsset(symbol);

  const [amount, setAmount] = useState(1000);
  const [startDate, setStartDate] = useState(ymdAgo(2));
  const [holdToToday, setHoldToToday] = useState(true);
  const [exitDate, setExitDate] = useState('');
  const [running, setRunning] = useState(false);
  const [sim, setSim] = useState(null); // {result, series}
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const today = todayYmd();

  const loadSaved = async () => {
    try {
      const data = await api.get('/time-machine/sims');
      setSaved(data.sims);
    } catch (e) {
      toasts.err(e.message);
    }
  };

  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (overrides = {}) => {
    setRunning(true);
    setSim(null);
    try {
      const body = {
        symbol,
        amount,
        startDate,
        exitDate: holdToToday ? null : exitDate || null,
        ...overrides,
      };
      const data = await api.post('/time-machine/simulate', body);
      setSim(data);
    } catch (e) {
      toasts.err(e.message);
    } finally {
      setRunning(false);
    }
  };

  const example = () => {
    setSymbol('AAPL');
    setAmount(1000);
    setStartDate('2020-03-16');
    setHoldToToday(true);
    setTimeout(() => run({ symbol: 'AAPL', amount: 1000, startDate: '2020-03-16', exitDate: null }), 30);
  };

  const saveSim = async () => {
    if (!sim) return;
    setSaving(true);
    try {
      await api.post('/time-machine/sims', {
        symbol, amount, startDate: sim.result.entryDate, exitDate: sim.result.exitDate === sim.result.latestAvailableDate && holdToToday ? null : sim.result.exitDate,
      });
      toasts.ok('Saved to your time travel log.');
      loadSaved();
    } catch (e) {
      toasts.err(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openSaved = async (id) => {
    try {
      const data = await api.get(`/time-machine/sims/${id}`);
      setSim({ result: data.sim.result, series: data.sim.series });
      setSymbol(data.sim.result.symbol);
    } catch (e) {
      toasts.err(e.message);
    }
  };

  const removeSim = async (id) => {
    try {
      await api.del(`/time-machine/sims/${id}`);
      setSaved((s) => s.filter((x) => x.id !== id));
      setDeleteTarget(null);
      toasts.ok('Simulation removed.');
    } catch (e) {
      toasts.err(e.message);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="badge brand" style={{ marginBottom: 8 }}><Clock3 size={12} /> The Time Machine</span>
          <h1 className="page-title">What if you’d bought {asset?.n || symbol}…</h1>
          <p className="page-sub">Back then?</p>
        </div>
        <button className="btn btn-ghost" onClick={example}><Wand2 size={15} /> Try an example</button>
      </div>

      <div className="tm-grid">
        {/* ---- config ---- */}
        <div className="card tm-config">
          <div className="field">
            <label>1 · Pick an asset</label>
            <AssetPicker value={symbol} onChange={(s) => setSymbol(s)} placeholder="Which asset were you right about?" />
          </div>

          <div className="date-row">
            <div className="field grow">
              <label>2 · Invest back on</label>
              <input type="date" className="input num" max={today} min="1995-01-01"
                value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field" style={{ maxWidth: 200 }}>
              <label>How much?</label>
              <div className="input-wrap">
                <span className="unit">{ccy(asset?.c || 'USD')}</span>
                <input className="input with-unit num" inputMode="decimal" value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="presets">
            {PRESETS_AMOUNT.map((v) => (
              <button key={v} className={`chip ${amount === v ? 'on' : ''}`} onClick={() => setAmount(v)}>{money(v, asset?.c || 'USD', { min: 0, max: 0 })}</button>
            ))}
          </div>

          <div className="date-presets">
            {[[1, '1y ago'], [3, '3y ago'], [5, '5y ago'], [8, '8y ago']].map(([y, l]) => (
              <button key={y} className={`chip ${startDate === ymdAgo(y) ? 'on' : ''}`} onClick={() => setStartDate(ymdAgo(y))}>{l}</button>
            ))}
            <button className={`chip ${startDate === '2020-03-16' ? 'on' : ''}`} onClick={() => setStartDate('2020-03-16')}>Mar 2020 crash</button>
            <button className={`chip ${startDate === '2021-11-08' ? 'on' : ''}`} onClick={() => setStartDate('2021-11-08')}>Crypto top 2021</button>
          </div>

          <div className="field">
            <label>3 · And hold until…</label>
            <div className="row">
              <div className="seg" style={{ flex: 1 }}>
                <button className={holdToToday ? 'on' : ''} onClick={() => setHoldToToday(true)}>Today</button>
                <button className={!holdToToday ? 'on' : ''} onClick={() => setHoldToToday(false)}>A chosen date</button>
              </div>
              {!holdToToday && (
                <input type="date" className="input num" style={{ maxWidth: 190 }} min={startDate} max={today}
                  value={exitDate || ymdAgo(1)} onChange={(e) => setExitDate(e.target.value)} />
              )}
            </div>
            <span className="field-hint">The outcome replays using real daily prices between the two dates.</span>
          </div>

          <button className="btn btn-primary btn-lg" disabled={running || !asset} onClick={() => run()}>
            {running ? <span className="spin" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Play size={17} />}
            {running ? 'Rewinding history…' : `Run the simulation`}
          </button>
        </div>

        {/* ---- result ---- */}
        <div className="tm-result">
          {!sim && !running && (
            <div className="card empty" style={{ minHeight: 380 }}>
              <div className="ico" style={{ width: 64, height: 64 }}><Clock3 size={26} /></div>
              <h3>Ready to travel?</h3>
              <p style={{ maxWidth: 380, textAlign: 'center' }}>
                Set the asset, the date you wish you’d bought it, and how much you would have invested.
                Mock Market replays the real prices — day by day — to today.
              </p>
              <button className="btn btn-primary" onClick={example}><Wand2 size={15} /> Show me an example</button>
            </div>
          )}
          {running && (
            <div className="card empty" style={{ minHeight: 380 }}>
              <div className="spin" />
              <p>Fetching {asset?.n || symbol} history from {startDate} → today…</p>
            </div>
          )}

          {sim && <SimResult sim={sim} currency={sim.result.currency} symbol={sim.result.symbol} onSave={saveSim} saving={saving}
            onExample={example} gmtoffset={sim.result.gmtoffset} />}
        </div>
      </div>

      {/* ---- saved ---- */}
      <div>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 17 }}>Your time travel log</h2>
          <span className="mut" style={{ fontSize: 13 }}>{saved.length} saved</span>
        </div>
        {saved.length ? (
          <div className="tm-saved">
            {saved.map((s) => (
              <div className="card" key={s.id} style={{ overflow: 'hidden' }}>
                <button className="sim-card" onClick={() => openSaved(s.id)}>
                  <div className="row between">
                    <span className="num" style={{ fontWeight: 800, fontSize: 16 }}>{s.symbol}</span>
                    <span className={`num ${signCls(s.pnl)}`} style={{ fontWeight: 800 }}>{pct(s.pnl_pct)}</span>
                  </div>
                  <div className="mut" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {money(s.amount, s.currency, { min: 0, max: 0 })} on {s.startDate} → {s.exitDate}
                  </div>
                  <div className={`num ${signCls(s.pnl)}`} style={{ fontWeight: 750, marginTop: 6 }}>{money(s.pnl, s.currency)}</div>
                  <div className="mut" style={{ fontSize: 12, marginTop: 3 }}>{s.days} days · saved {fmtDate(s.createdAt)}</div>
                </button>
                <div style={{ borderTop: '1px solid var(--line-1)' }}>
                  <button className="icon-btn" style={{ width: '100%', borderRadius: 0, padding: '7px 0', fontSize: 12 }} onClick={() => setDeleteTarget(s)}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card empty" style={{ padding: '26px 16px' }}>
            <div className="ico"><BookmarkPlus size={19} /></div>
            <p style={{ fontSize: 13.5, maxWidth: 420 }}>Run a simulation and hit “save” to keep it here — build your own library of “should have bought” moments.</p>
          </div>
        )}
      </div>

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && removeSim(deleteTarget.id)}
        title="Delete this saved simulation?"
        message={deleteTarget ? `“${money(deleteTarget.amount, deleteTarget.currency, { min: 0, max: 0 })} into ${deleteTarget.symbol} on ${deleteTarget.startDate}” will be removed.` : ''}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function SimResult({ sim, symbol, onSave, saving, onExample, gmtoffset }) {
  const r = sim.result;
  const up = r.pnl >= 0;

  // marker times must be real timestamps present in the series
  const markers = useMemo(() => {
    const dateOf = (ms) => new Date(ms + (gmtoffset || 0) * 1000).toISOString().slice(0, 10);
    const findMs = (dateStr) => {
      for (const b of sim.series) if (dateOf(b.t) === dateStr) return b.t;
      return sim.series[0]?.t;
    };
    return [
      { time: findMs(r.entryDate), position: 'belowBar', color: '#34d399', shape: 'arrowUp', text: `Invested ${money(r.amount, r.currency, { min: 0, max: 0 })}` },
      { time: findMs(r.exitDate), position: 'aboveBar', color: up ? '#8a63ff' : '#f87171', shape: 'arrowDown', text: `${up ? 'Exited' : 'Ouch'} — ${money(r.amount + r.pnl, r.currency)}` },
    ];
  }, [sim, r, up, gmtoffset]);

  const bench = r.benchmark;

  return (
    <div className="col gap2">
      <div className="card tm-hero">
        <div className="row between wrap gap1">
          <div>
            <div className="row gap1">
              <span className="num" style={{ fontSize: 19, fontWeight: 800 }}>{symbol}</span>
              <span className="badge flat-c">{r.entryDate} → {r.exitDate}</span>
              <span className="badge flat-c">{r.days} days</span>
            </div>
            <div className="mut" style={{ marginTop: 3 }}>
              You would have invested <b>{money(r.amount, r.currency, { min: 0, max: 0 })}</b> at {price(r.entryPrice, r.currency)}
            </div>
          </div>
          <div className="row gap2">
            <div style={{ textAlign: 'right' }}>
              <div className={`big num ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{money(r.pnl, r.currency)}</div>
              <div className={`num ${up ? 'up' : 'down'}`} style={{ fontWeight: 800 }}>{pct(r.pnlPct)}</div>
            </div>
            <div style={{ textAlign: 'right', borderLeft: '1px solid var(--line-1)', paddingLeft: 16 }}>
              <div className="est-label">Ended worth</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 800 }}>{money(r.endValue, r.currency)}</div>
              <div className="mut" style={{ fontSize: 12 }}>{r.qty?.toLocaleString('en-US', { maximumFractionDigits: 4 })} shares</div>
            </div>
          </div>
        </div>

        {bench && (
          <div className={`badge ${bench.beat ? 'up' : 'down'}`} style={{ alignSelf: 'flex-start' }}>
            {bench.beat ? <Trophy size={12} /> : <TrendingDown size={12} />}
            {bench.beat ? `Beat the S&P 500 by ${pct(bench.pct - r.pnlPct, false, 1)}` : `Trailed the S&P 500 (${pct(bench.pct, false, 1)} vs your ${pct(r.pnlPct, false, 1)})`}
          </div>
        )}
      </div>

      <ChartCandles bars={sim.series} meta={{ gmtoffset, name: symbol }} height={330} markers={markers} />

      <div className="tm-metrics">
        <Metric k="Entry price" v={price(r.entryPrice, r.currency)} sub={`on ${r.entryDate}`} />
        <Metric k="Exit price" v={price(r.exitPrice, r.currency)} sub={`on ${r.exitDate}`} />
        <Metric k="Total return" v={pct(r.pnlPct)} tone={up ? 'up' : 'down'} sub="price only" />
        <Metric k="Annualized" v={r.annualizedPct != null ? pct(r.annualizedPct) : '—'} tone={r.annualizedPct > 0 ? 'up' : 'down'} sub={r.annualizedPct != null ? 'per year' : 'under a year'} />
        <Metric k="Max drawdown" v={pct(r.maxDrawdownPct, false)} tone="down" sub="biggest dip along the way" />
        <Metric k="Volatility" v={pct(r.volatilityPct, false)} sub="annualized" />
      </div>

      <div className="row wrap gap1">
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : <><BookmarkPlus size={16} /> Save this “what if”</>}
        </button>
        <button className="btn btn-ghost" onClick={onExample}><Wand2 size={15} /> Try another example</button>
        <span className="field-hint" style={{ alignSelf: 'center', marginLeft: 'auto' }}>
          Based on real {r.currency} daily closes · no fees, no real money
        </span>
      </div>
    </div>
  );
}

function Metric({ k, v, sub, tone }) {
  return (
    <div className="card tm-metric">
      <div className="k">{k}</div>
      <div className={`v num ${tone === 'up' ? 'up' : tone === 'down' ? 'down' : ''}`}>{v}</div>
      {sub && <div className="mut" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}
