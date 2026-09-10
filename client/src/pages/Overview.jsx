import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wallet, TrendingUp, Banknote, PiggyBank, ArrowUpRight, ArrowDownRight, History,
  Plus, ChevronRight, Sparkles, Globe2, Clock3, EyeOff, LineChart, Target,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import api from '../lib/api';
import { useQuotes } from '../lib/market';
import { money, pct, signCls, fmtTime, REGION_LABELS } from '../lib/format';
import { useAsset } from '../lib/catalog';
import { AssetPicker } from '../components/AssetPicker';
import { Spark } from '../components/Bits';
import { Avatar } from '../components/ProfileForm';
import { Modal } from '../components/Modal';

const STRIP = ['AAPL', 'NVDA', 'TSLA', 'BTC-USD', 'SPY', 'ASML.AS', '0700.HK', 'SAP.DE'];

export default function OverviewPage() {
  const { user, activeProfile } = useAuth();
  const profile = activeProfile();
  const nav = useNavigate();
  const [overview, setOverview] = useState(null);
  const [orders, setOrders] = useState([]);
  const [equity, setEquity] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const isNew = () => { try { return sessionStorage.getItem('mm.welcome') !== '1'; } catch { return false; } };

  const load = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const [ov, or, eq] = await Promise.all([
        api.get(`/profiles/${profile.id}/overview`),
        api.get(`/profiles/${profile.id}/orders?limit=6`),
        api.get(`/profiles/${profile.id}/equity`),
      ]);
      setOverview(ov.overview);
      setOrders(or.orders);
      setEquity(eq.points);
    } catch {
      // Transient API/quote hiccup — keep whatever we already showed and retry on the next poll.
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 25000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    if (profile && isNew() && !busy && overview) {
      setShowWelcome(true);
      try { sessionStorage.setItem('mm.welcome', '1'); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview]);

  const equitySeries = useMemo(() => equity.map((p) => p.value), [equity]);
  const eqStart = equity.length ? equity[0].value : profile?.cash;
  const eqChange = eqStart ? ((equitySeries[equitySeries.length - 1] - eqStart) / eqStart) * 100 : 0;

  const go = (sym) => nav(`/app/trade/${sym}`);

  if (!profile) {
    return (
      <div className="page">
        <div className="card empty" style={{ padding: 60 }}>
          <div className="ico"><Wallet size={24} /></div>
          <h3>No practice profile yet</h3>
          <p>Create your first profile to start trading with paper money.</p>
          <Link to="/onboarding" className="btn btn-primary">Create a profile <ArrowUpRight size={15} /></Link>
        </div>
      </div>
    );
  }

  const o = overview;

  return (
    <div className="page">
      <WelcomeModal open={showWelcome} onClose={() => setShowWelcome(false)} onExplore={() => { setShowWelcome(false); nav('/app/markets'); }} onTime={() => { setShowWelcome(false); nav('/app/timemachine'); }} />

      <div className="page-head">
        <div>
          <div className="row gap1">
            <Avatar emoji={profile.emoji} color={profile.color} size={34} />
            <div>
              <h1 className="page-title">Good {greeting()}, {user?.username}</h1>
              <p className="page-sub">Practicing as <b>{profile.name}</b> · paper trading, real prices</p>
            </div>
          </div>
        </div>
        <div style={{ width: 'min(340px, 100%)' }}>
          <AssetPicker onChange={go} placeholder="Jump to an asset…" compact />
        </div>
      </div>

      {/* stats */}
      <div className="statgrid">
        <Stat k="Portfolio value" value={o?.totalValue} ccy={profile.baseCurrency} icon={LineChart} hint={o ? `${money(o.cash, profile.baseCurrency)} cash + ${o.positionCount} position${o.positionCount === 1 ? '' : 's'}` : undefined} />
        <Stat k="Cash available" value={o?.cash} ccy={profile.baseCurrency} icon={Banknote} hint="Ready to deploy" />
        <Stat k="Unrealized P&L" value={o?.unrealized} ccy={profile.baseCurrency} colored icon={TrendingUp} hint={o && o.unrealized != null ? `${o.unrealized > 0 ? '▲' : o.unrealized < 0 ? '▼' : ''} ${money(o.dayPnl, profile.baseCurrency)} today` : undefined} />
        <Stat k="Realized P&L" value={o?.realized} ccy={profile.baseCurrency} colored icon={PiggyBank} hint="Closed trades only" />
      </div>

      {/* strip */}
      <div className="quick-nav">
        {STRIP.map((s) => <StripChip key={s} symbol={s} onOpen={go} />)}
      </div>

      <div className="row" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
        {/* holdings */}
        <div className="card grow" style={{ minWidth: 320, padding: 18 }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 16 }}>Holdings</h3>
            <Link to="/app/portfolio" className="btn btn-ghost btn-sm">Portfolio <ChevronRight size={14} /></Link>
          </div>
          {o?.positions?.length ? (
            <div className="col gap1">
              {o.positions.slice(0, 6).map((p) => (
                <button key={p.symbol} className="pos-mini" onClick={() => go(p.symbol)}>
                  <div className="sym-ico">{p.symbol.slice(0, 4)}</div>
                  <span className="grow" style={{ textAlign: 'left' }}>
                    <span className="pm-name">{p.symbol}</span>
                    <span className="pm-cash mut">{p.qty} · {money(p.valueBase, profile.baseCurrency)}</span>
                  </span>
                  <span className="col gap0" style={{ alignItems: 'flex-end' }}>
                    <span className={`num ${signCls(p.unrealizedBase)}`} style={{ fontWeight: 700 }}>{money(p.unrealizedBase, profile.baseCurrency)}</span>
                    <span className={`num ${signCls(p.unrealizedBase)}`} style={{ fontSize: 12 }}>{pct(p.returnPct)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyMini icon={Wallet} title="Nothing held yet"
              text="Find something you believe in and buy your first paper shares — it only takes a few seconds.">
              <Link to="/app/markets" className="btn btn-primary btn-sm"><Plus size={14} /> Browse markets</Link>
            </EmptyMini>
          )}
        </div>

        {/* performance */}
        <div className="card" style={{ minWidth: 270, padding: 18 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Your equity curve</h3>
          {equitySeries.length > 1 ? (
            <>
              <Spark points={equitySeries} width={260} height={110} stroke="var(--brand-1)" />
              <div className="mini-row" style={{ marginTop: 8 }}>
                <span className="mut">Since profile start</span>
                <span className={`num ${signCls(eqChange)}`} style={{ fontWeight: 700 }}>{pct(eqChange)}</span>
              </div>
            </>
          ) : (
            <EmptyMini icon={LineChart} title="Watch it grow" text="Your portfolio value over time appears here as you trade." />
          )}
        </div>

        {/* recent orders */}
        <div className="card" style={{ minWidth: 300, padding: 18 }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 16 }}>Recent orders</h3>
            <Link to="/app/portfolio" className="btn btn-ghost btn-sm">All orders</Link>
          </div>
          {orders.length ? (
            <div className="col gap1">
              {orders.slice(0, 5).map((ord) => (
                <div key={ord.id} className="mini-row" style={{ gap: 10 }}>
                  <span className={`st-badge st-${ord.status}`} style={{ textTransform: 'uppercase' }}>{ord.side}</span>
                  <span className="grow"><b>{ord.symbol}</b> <span className="mut">{ord.qty}</span></span>
                  <span className={`num ${ord.side === 'buy' ? 'down' : 'up'}`}>{money(Math.abs(ord.cash_delta_base || 0), profile.baseCurrency)}</span>
                  <span className="mut" style={{ fontSize: 11.5 }}>{fmtTime(ord.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyMini icon={History} title="No orders yet" text="Your buying & selling history lands here." />
          )}
        </div>
      </div>

      {/* time machine promo */}
      <button className="tm-promo" onClick={() => nav('/app/timemachine')}>
        <span className="tm-promo-ico"><Clock3 size={22} /></span>
        <span className="grow" style={{ textAlign: 'left' }}>
          <b>Time Machine — “I should have bought…”</b>
          <span className="mut">See how much you would have made. Invest in any past date and watch it replay.</span>
        </span>
        <span className="btn btn-soft btn-sm">Open <ArrowUpRight size={14} /></span>
      </button>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'up late' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

function Stat({ k, value, ccy, icon: Icon, colored, hint }) {
  return (
    <div className="card stat">
      <span className="k">{k} {Icon && <Icon size={13} className="mini-ico" />}</span>
      <span className={`v num ${colored && value != null ? signCls(value) : ''}`}>
        {value != null ? money(value, ccy) : <SkeletonLine w={90} />}
      </span>
      {hint && <span className="d mut">{hint}</span>}
    </div>
  );
}

function StripChip({ symbol, onOpen }) {
  const { quotes } = useQuotes([symbol], { refreshMs: 45000 });
  const q = quotes.get(symbol);
  const asset = useAsset(symbol);
  return (
    <button className="chip qchip" onClick={() => onOpen(symbol)} title={asset?.n}>
      <span className="sym-ico" style={{ width: 24, height: 24, fontSize: 9 }}>{symbol.slice(0, 3)}</span>
      <span className="q-sym">{symbol}</span>
      {q ? (
        <span className={`q-chg ${signCls(q.changePct)}`}>{pct(q.changePct)}</span>
      ) : (
        <span className="q-chg mut">…</span>
      )}
    </button>
  );
}

function EmptyMini({ icon: Icon, title, text, children }) {
  return (
    <div className="empty" style={{ padding: '22px 8px' }}>
      <div className="ico" style={{ width: 42, height: 42 }}><Icon size={19} /></div>
      <div style={{ textAlign: 'center' }}>
        <b style={{ color: 'var(--text-2)' }}>{title}</b>
        <p style={{ fontSize: 13, marginTop: 4 }}>{text}</p>
      </div>
      {children}
    </div>
  );
}

function SkeletonLine({ w = 80 }) {
  return <span className="skeleton" style={{ display: 'inline-block', width: w, height: 22, verticalAlign: 'middle' }} />;
}

function WelcomeModal({ open, onClose, onExplore, onTime }) {
  if (!open) return null;
  const tips = [
    { icon: Globe2, title: 'Browse the real markets', text: 'US, European, Asian stocks, ETFs and crypto — all live. Try the Markets tab.' },
    { icon: LineChart, title: 'Make your first paper trade', text: 'Open any asset, hit Buy, and confirm. No real money involved — ever.' },
    { icon: Clock3, title: 'Then try the Time Machine', text: 'Invest in a past date and watch the outcome replay with real prices.' },
    { icon: Target, title: 'Create extra profiles', text: 'A cautious account and a bold one? Test strategies side by side.' },
  ];
  return (
    <Modal open={open} onClose={onClose} title="You’re in! Quick orientation">
      <div className="welcome-banner">
        <div className="wl-list">
          {tips.map((t, i) => (
            <div className="wl-item" key={i}>
              <span className="wl-ico"><t.icon size={16} /></span>
              <span><b>{t.title}</b><p>{t.text}</p></span>
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" onClick={onTime}><Clock3 size={15} /> Take me to Time Machine</button>
          <button className="btn btn-primary" onClick={onExplore}>Start trading <ArrowUpRight size={15} /></button>
        </div>
      </div>
    </Modal>
  );
}
