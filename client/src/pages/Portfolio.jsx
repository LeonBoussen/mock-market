import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, TrendingUp, LineChart, XCircle } from 'lucide-react';
import { useAuth } from '../store/auth';
import api from '../lib/api';
import { money, pct, signCls, price, fmtTime } from '../lib/format';
import { useToasts } from '../store/ui';
import { useAsset } from '../lib/catalog';

const TABS = ['Holdings', 'Performance', 'Order history'];

export default function PortfolioPage() {
  const { activeProfile } = useAuth();
  const profile = activeProfile();
  const toasts = useToasts();
  const nav = useNavigate();
  const [tab, setTab] = useState('Holdings');
  const [overview, setOverview] = useState(null);
  const [orders, setOrders] = useState([]);
  const [equity, setEquity] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const [ov, or, eq] = await Promise.all([
        api.get(`/profiles/${profile.id}/overview`),
        api.get(`/profiles/${profile.id}/orders?limit=200`),
        api.get(`/profiles/${profile.id}/equity`),
      ]);
      setOverview(ov.overview);
      setOrders(or.orders);
      setEquity(eq.points);
    } catch (e) {
      toasts.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  if (!profile) return null;

  const pos = overview?.positions || [];
  const cash = overview?.cash;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Portfolio</h1>
          <p className="page-sub">{profile.name} · {profile.baseCurrency} paper account</p>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => nav('/app/trade')}>Trade now</button>
        </div>
      </div>

      <div className="tabbar">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Holdings' && (
        <>
          <div className="statgrid">
            <MiniCard k="Total value" v={money(overview?.totalValue, profile.baseCurrency)} />
            <MiniCard k="Cash" v={money(cash, profile.baseCurrency)} />
            <MiniCard k="Market value" v={money(overview?.marketValue, profile.baseCurrency)} />
            <MiniCard k="Unrealized" v={money(overview?.unrealized, profile.baseCurrency)} colored={overview?.unrealized} />
            <MiniCard k="Realized" v={money(overview?.realized, profile.baseCurrency)} colored={overview?.realized} />
          </div>

          <div className="row wrap gap2" style={{ alignItems: 'flex-start' }}>
            <div className="card grow" style={{ minWidth: 460, overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="r">Qty</th>
                    <th className="r">Avg / Now</th>
                    <th className="r">Value</th>
                    <th className="r">Unrealized</th>
                    <th className="r">Return</th>
                    <th className="r nw">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map((p) => (
                    <tr key={p.symbol} className="clickable" onClick={() => nav(`/app/trade/${p.symbol}`)}>
                      <td>
                        <div className="sym-cell">
                          <span className={`sym-ico ${p.type}`}>{p.symbol.replace(/[.-].*$/, '').slice(0, 4)}</span>
                          <span><div className="nm">{p.name}</div><div className="ex">{p.symbol}</div></span>
                        </div>
                      </td>
                      <td className="r num">{p.qty}</td>
                      <td className="r num">{price(p.avgPrice, p.currency)}<div className="mut" style={{ fontSize: 12 }}>{price(p.lastPrice, p.currency)}</div></td>
                      <td className="r num" style={{ fontWeight: 700 }}>{money(p.valueBase, profile.baseCurrency)}</td>
                      <td className={`r num ${signCls(p.unrealizedBase)}`} style={{ fontWeight: 650 }}>{money(p.unrealizedBase, profile.baseCurrency)}</td>
                      <td className={`r num ${signCls(p.returnPct)}`} style={{ fontWeight: 650 }}>{pct(p.returnPct)}</td>
                      <td className="r num mut">{p.weightPct?.toFixed(1)}%</td>
                    </tr>
                  ))}
                  {!pos.length && (
                    <tr><td colSpan={7}><div className="empty"><div className="ico"><Wallet size={20} /></div>
                      <p>No positions yet. Head to Markets and buy your first paper shares.</p></div></td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card card-pad grow" style={{ minWidth: 260 }}>
              <h3 style={{ fontSize: 15.5, marginBottom: 12 }}>Allocation</h3>
              {pos.length ? (
                <div className="alloc">
                  {pos.slice(0, 8).map((p) => (
                    <div className="alloc-row" key={p.symbol}>
                      <span style={{ width: 52, fontWeight: 650 }} className="num">{p.symbol.replace(/[.-].*$/, '').slice(0, 4)}</span>
                      <div className="alloc-bar"><div style={{ width: `${p.weightPct || 0}%`, background: tokenColor(p.symbol) }} /></div>
                      <span className="num mut" style={{ width: 44, textAlign: 'right' }}>{p.weightPct?.toFixed(0)}%</span>
                    </div>
                  ))}
                  {cash > 0 && (
                    <div className="alloc-row">
                      <span className="mut" style={{ width: 52 }}>Cash</span>
                      <div className="alloc-bar"><div style={{ width: `${Math.max(1, (cash / (overview.totalValue || 1)) * 100)}%`, background: 'var(--text-3)' }} /></div>
                      <span className="num mut" style={{ width: 44, textAlign: 'right' }}>{((cash / (overview.totalValue || 1)) * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mut" style={{ fontSize: 13.5 }}>Buy something to see your allocation here.</p>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'Performance' && <PerformancePane equity={equity} overview={overview} profile={profile} />}

      {tab === 'Order history' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Status</th>
                <th>Side</th>
                <th>Asset</th>
                <th className="r">Qty</th>
                <th>Type</th>
                <th className="r">Fill price</th>
                <th className="r">Cash effect</th>
                <th className="r">Realized P&L</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><span className={`st-badge st-${o.status}`}>{o.status}</span></td>
                  <td><span className="badge up" style={{ minWidth: 44, justifyContent: 'center' }}>{o.side === 'buy' ? 'BUY' : 'SELL'}</span></td>
                  <td className="nw"><b>{o.symbol}</b></td>
                  <td className="r num">{o.qty}</td>
                  <td className="mut" style={{ textTransform: 'capitalize' }}>{o.kind}{o.kind === 'limit' && o.limit_price ? ` @ ${price(o.limit_price, o.currency)}` : ''}</td>
                  <td className="r num">{o.fill_price != null ? price(o.fill_price, o.currency) : '—'}</td>
                  <td className={`r num ${signCls(o.cash_delta_base)}`}>{o.cash_delta_base != null ? money(o.cash_delta_base, profile.baseCurrency) : '—'}</td>
                  <td className={`r num ${signCls(o.realized_base)}`}>{o.realized_base != null ? money(o.realized_base, profile.baseCurrency) : '—'}</td>
                  <td className="mut nw" style={{ fontSize: 12.5 }}>{fmtTime(o.filled_at || o.created_at)}</td>
                </tr>
              ))}
              {!orders.length && (
                <tr><td colSpan={9}><div className="empty"><div className="ico"><XCircle size={20} /></div>
                  <p>Nothing here yet — your first order will show up instantly.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MiniCard({ k, v, colored }) {
  const n = typeof colored === 'number' ? colored : 0;
  return (
    <div className="card stat">
      <span className="k">{k}</span>
      <span className={`v num ${colored != null ? signCls(n) : ''}`}>{v}</span>
    </div>
  );
}

function PerformancePane({ equity, overview, profile }) {
  const points = useMemo(() => equity, [equity]);
  const last = points.length ? points[points.length - 1] : null;
  const first = points.length ? points[0] : null;
  const total = first && last ? ((last.value - first.value) / first.value) * 100 : 0;

  return (
    <div className="col gap2">
      <div className="card stat">
        <span className="k">Total performance</span>
        <span className={`v num ${signCls(total)}`} style={{ fontSize: 30 }}>{pct(total)}</span>
        <span className="d mut">Since {points.length ? new Date(points[0].ts).toLocaleDateString() : 'profile start'}</span>
      </div>
      <div className="card perf-line-wrap">
        {points.length > 1 ? (
          <EquityChart points={points} currency={profile.baseCurrency} />
        ) : (
          <div className="empty" style={{ padding: '40px 20px' }}>
            <div className="ico"><LineChart size={20} /></div>
            <p>Trade a little and this becomes your equity curve over time. It updates after every fill and every few minutes while markets are open.</p>
          </div>
        )}
      </div>
      <div className="row wrap gap2">
        <div className="card card-pad grow" style={{ minWidth: 280 }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 10 }}>Snapshot</h3>
          <div className="col gap1">
            <Row k="Starting balance" v={money(profile.startingBalance, profile.baseCurrency)} />
            <Row k="Cash now" v={money(overview?.cash, profile.baseCurrency)} />
            <Row k="Total value" v={money(overview?.totalValue, profile.baseCurrency)} />
            <Row k="Open positions" v={String(overview?.positionCount ?? 0)} />
          </div>
        </div>
        <div className="card card-pad grow" style={{ minWidth: 280 }}>
          <h3 style={{ fontSize: 15.5, marginBottom: 10 }}>How the curve is built</h3>
          <p className="mut" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Your portfolio value = cash + every open position marked at the latest real market price,
            converted to your {profile.baseCurrency} balance. A point is recorded after each fill and
            periodically while you practice.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, hint }) {
  return (
    <div className="mini-row" style={{ fontSize: 14, padding: '6px 0' }}>
      <span className="mut">{k}</span>
      <span className="num" style={{ fontWeight: 700 }}>{v}</span>
    </div>
  );
}

function EquityChart({ points, currency }) {
  const W = 860; const H = 240; const PAD = 10;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const span = max - min || 1;
  const xs = (i) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const ys = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const pts = points.map((p, i) => `${xs(i).toFixed(1)},${ys(p.value).toFixed(1)}`).join(' ');
  const area = `M${xs(0).toFixed(1)},${H - PAD} L${pts} L${xs(points.length - 1).toFixed(1)},${H - PAD} Z`;
  const upDown = vals[vals.length - 1] >= vals[0];
  const col = upDown ? '#5b8cff' : '#f87171';
  const startLabel = new Date(points[0].ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const endLabel = new Date(points[points.length - 1].ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="none" role="img" aria-label="Portfolio equity over time">
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={col} stopOpacity="0.25" />
            <stop offset="1" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={PAD + (H - PAD * 2) * f} y2={PAD + (H - PAD * 2) * f} stroke="rgba(150,165,195,0.08)" />
        ))}
        <path d={area} fill="url(#eqFill)" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mini-row" style={{ padding: '0 4px' }}>
        <span className="mut">{startLabel}</span>
        <span className="num" style={{ fontWeight: 700 }}>{money(points[points.length - 1].value, currency)}</span>
        <span className="mut">{endLabel}</span>
      </div>
    </div>
  );
}

const COLORS = ['#5b8cff', '#8a63ff', '#22d3ee', '#34d399', '#f59e0b', '#f87171', '#ec4899', '#a3e635'];
function tokenColor(sym) {
  let h = 0;
  for (const ch of sym) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return COLORS[h % COLORS.length];
}
