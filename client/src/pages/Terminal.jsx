import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Zap, ListOrdered, X, AlertTriangle, CheckCircle2, ArrowUpDown, Clock3, Info,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import api from '../lib/api';
import { useHistory, useQuote, RANGE_KEYS } from '../lib/market';
import { useAsset } from '../lib/catalog';
import { price, money, pct, signCls, fmtTime, ccy } from '../lib/format';
import { useToasts } from '../store/ui';
import { AssetPicker } from '../components/AssetPicker';
import ChartCandles from '../components/ChartCandles';
import { Confirm } from '../components/Modal';

export default function TerminalPage() {
  const { symbol } = useParams();
  const nav = useNavigate();
  const [active, setActive] = useState((symbol || 'AAPL').toUpperCase());
  useEffect(() => { if (symbol) setActive(symbol.toUpperCase()); }, [symbol]);
  const asset = useAsset(active);

  return (
    <div className="page">
      {asset && (
        <Terminal key={active} symbol={active} onPick={(s) => { setActive(s); nav(`/app/trade/${s}`); }} />
      )}
    </div>
  );
}

function Terminal({ symbol, onPick }) {
  const { activeProfile } = useAuth();
  const profile = activeProfile();
  const asset = useAsset(symbol);
  const { quote } = useQuote(symbol, 15000);
  const [rangeKey, setRangeKey] = useState('1M');
  const history = useHistory(symbol, rangeKey, rangeKey === '1D' || rangeKey === '5D' ? 45000 : 120000);
  const toasts = useToasts();

  const [overview, setOverview] = useState(null);
  const [orders, setOrders] = useState([]);
  const [reloadTick, setReloadTick] = useState(0);

  const refresh = async () => {
    if (!profile) return;
    try {
      const [ov, or] = await Promise.all([
        api.get(`/profiles/${profile.id}/overview`),
        api.get(`/profiles/${profile.id}/orders?limit=30`),
      ]);
      setOverview(ov.overview);
      setOrders(or.orders);
    } catch (e) {
      toasts.err(e.message);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 25000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, reloadTick]);

  const markers = useMemo(() => {
    // mark recent buys/sells for this symbol on the chart
    const mine = orders.filter((o) => o.symbol === symbol && o.status === 'filled' && o.filled_at);
    if (!mine.length) return [];
    return mine.slice(-6).map((o) => ({
      time: o.filled_at,
      position: o.side === 'buy' ? 'belowBar' : 'aboveBar',
      color: o.side === 'buy' ? '#34d399' : '#f87171',
      shape: o.side === 'buy' ? 'arrowUp' : 'arrowDown',
      text: `${o.side === 'buy' ? 'B' : 'S'} ${o.qty} @ ${fmtP(o.fill_price)}`,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, symbol]);

  if (!profile) return null;

  const myPos = overview?.positions?.find((p) => p.symbol === symbol);
  const openOrders = orders.filter((o) => o.symbol === symbol && o.status === 'open');

  return (
    <div className="col gap2">
      <div className="page-head">
        <div className="row gap2">
          <div style={{ minWidth: 300 }}>
            <AssetPicker value={symbol} onChange={onPick} compact placeholder="Switch asset…" />
          </div>
          {quote && (
            <div className="row gap2" style={{ marginLeft: 6 }}>
              <div>
                <div className="num" style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.03em' }}>{price(quote.price, quote.currency)}</div>
                <div className={`num ${signCls(quote.changePct)}`} style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {pct(quote.changePct)} today
                </div>
              </div>
              <div className="col gap0" style={{ borderLeft: '1px solid var(--line-1)', paddingLeft: 16 }}>
                <MiniStat k="High" v={quote.high != null ? price(quote.high, quote.currency) : '—'} />
                <MiniStat k="Low" v={quote.low != null ? price(quote.low, quote.currency) : '—'} />
              </div>
              <div className="col gap0" style={{ borderLeft: '1px solid var(--line-1)', paddingLeft: 16 }}>
                <MiniStat k="Prev close" v={price(quote.prevClose, quote.currency)} />
                <MiniStat k={quote.marketState === 'REGULAR' ? 'Market' : 'Status'} v={marketLabel(quote.marketState)} colored={quote.marketState === 'REGULAR' ? 'var(--up)' : undefined} />
              </div>
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span className="badge flat-c">Paper trade · {asset.type} · {asset.ex}</span>
        </div>
      </div>

      <div className="terminal-grid">
        <div className="col gap2">
          <div>
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="card-title">{symbol} · {asset.n}</span>
              <div className="seg">
                {RANGE_KEYS.map((r) => (
                  <button key={r} className={rangeKey === r ? 'on' : ''} onClick={() => setRangeKey(r)}>{r}</button>
                ))}
              </div>
            </div>
            {history.error ? (
              <div className="card empty"><div className="ico"><AlertTriangle size={22} /></div><p>{history.error}</p>
                <button className="btn btn-soft" onClick={history.reload}>Retry</button></div>
            ) : (
              <ChartCandles
                bars={history.bars}
                meta={history.meta}
                height={440}
                markers={markers}
                key={`${symbol}-${rangeKey}`}
              />
            )}
          </div>

          {/* positions & open orders for this asset */}
          <div className="card" style={{ padding: 16 }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <h3 style={{ fontSize: 15.5 }}>Your {symbol} activity</h3>
              <span className="mut" style={{ fontSize: 12.5 }}>Live · refreshes every few seconds</span>
            </div>
            {!myPos && !openOrders.length ? (
              <div className="empty" style={{ padding: '26px 10px' }}>
                <div className="ico"><ListOrdered size={19} /></div>
                <p style={{ fontSize: 13.5, maxWidth: 420 }}>No open position for {symbol} yet. Use the order panel to buy your first shares — fills and working orders show up here.</p>
              </div>
            ) : (
              <div className="row wrap gap2">
                {myPos && (
                  <div className="col gap1 grow" style={{ minWidth: 260 }}>
                    <span className="card-title">Position</span>
                    <div className="row between">
                      <div>
                        <div className="num" style={{ fontWeight: 800, fontSize: 19 }}>{myPos.qty} <span className="mut" style={{ fontSize: 13 }}>shares</span></div>
                        <div className="mut" style={{ fontSize: 12.5 }}>avg {price(myPos.avgPrice, myPos.currency)} · now {price(myPos.lastPrice, myPos.currency)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className={`num ${signCls(myPos.unrealizedBase)}`} style={{ fontWeight: 800 }}>{money(myPos.unrealizedBase, profile.baseCurrency)}</div>
                        <div className={`num ${signCls(myPos.returnPct)}`} style={{ fontSize: 13 }}>{pct(myPos.returnPct)}</div>
                      </div>
                    </div>
                    <div className="row">
                      <span className="badge up">asset return {pct(myPos.priceReturnPct)}</span>
                      <button className="btn btn-sell btn-sm" style={{ marginLeft: 'auto' }} onClick={() => doSellAll(toasts, profile, myPos, refresh, setReloadTick)}>
                        Sell all {myPos.qty}
                      </button>
                    </div>
                  </div>
                )}
                {openOrders.length > 0 && (
                  <div className="grow" style={{ minWidth: 240 }}>
                    <span className="card-title">Working orders</span>
                    <div className="col gap1" style={{ marginTop: 8 }}>
                      {openOrders.map((o) => (
                        <div key={o.id} className="mini-row" style={{ border: '1px solid var(--line-1)', borderRadius: 10, padding: '8px 10px', gap: 8 }}>
                          <span className="st-badge st-open">{o.side}</span>
                          <span className="num grow">{o.kind} @ {price(o.limit_price, o.currency)}</span>
                          <button className="icon-btn" title="Cancel order" onClick={() => cancelOne(toasts, profile, o, refresh, setReloadTick)}><X size={15} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="col gap2">
          <OrderTicket profile={profile} symbol={symbol} asset={asset} quote={quote}
            onDone={() => { setReloadTick((n) => n + 1); }} cash={overview?.cash} heldQty={myPos?.qty} />
          <div className="card card-pad" style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'flex', gap: 10 }}>
            <Info size={16} style={{ flex: 'none', color: 'var(--brand-1)', marginTop: 1 }} />
            <span>All trades fill against real market prices but use <b>{profile.baseCurrency}</b> paper money. No fees, no real risk — mistakes welcome.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

async function doSellAll(toasts, profile, pos, refresh, bump) {
  try {
    const res = await api.post(`/profiles/${profile.id}/orders`, {
      symbol: pos.symbol, side: 'sell', kind: 'market', qty: pos.qty,
    });
    toasts.ok(`Sold ${pos.qty} ${pos.symbol}${res.order.note ? ' — ' + res.order.note : ''}.`);
    refresh(); bump((n) => n + 1);
  } catch (e) {
    toasts.err(e.message);
  }
}

async function cancelOne(toasts, profile, order, refresh, bump) {
  try {
    await api.del(`/profiles/${profile.id}/orders/${order.id}`);
    toasts.ok(`Order ${order.id} canceled.`);
    refresh(); bump((n) => n + 1);
  } catch (e) {
    toasts.err(e.message);
  }
}

function fmtP(v) { return typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'; }

function MiniStat({ k, v, colored }) {
  return (
    <div className="mini-row" style={{ gap: 14, minWidth: 110 }}>
      <span className="mut" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</span>
      <span className="num" style={{ fontWeight: 700, color: colored || 'var(--text-1)', fontSize: 13 }}>{v}</span>
    </div>
  );
}

function marketLabel(s) {
  return ({ REGULAR: 'Open', CLOSED: 'Closed', PRE: 'Pre-market', POST: 'After-hours' })[s] || s;
}

/* ---------------- Order ticket ---------------- */

function OrderTicket({ profile, symbol, asset, quote, cash, heldQty, onDone }) {
  const toasts = useToasts();
  const [side, setSide] = useState('buy');
  const [kind, setKind] = useState('market');
  const [qtyText, setQtyText] = useState('');
  const [limitText, setLimitText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [qtyMode, setQtyMode] = useState('qty'); // qty | invest

  const base = profile.baseCurrency;
  const priceNow = quote?.price;
  const currency = quote?.currency || asset.c;

  const parsedQty = Number(qtyText);
  const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 0;
  const limit = Number.isFinite(Number(limitText)) && Number(limitText) > 0 ? Number(limitText) : null;

  // For buys in instrument currency estimate cost in base via quote currency match; no FX client-side:
  // the server settles in base. We show a server-agnostic estimate when currencies match.
  const sameCcy = currency === base;
  const effPrice = kind === 'limit' && limit ? limit : priceNow || 0;
  const estCost = side === 'buy' ? qty * effPrice : 0;
  const estBase = sameCcy ? estCost : null;

  const affordability = side === 'buy' && cash != null ? qty * effPrice <= (sameCcy ? cash : Infinity) : true;
  const qtyOk = qty > 0 && (kind === 'market' || limit > 0);
  const canSubmit = qtyOk && affordability && priceNow != null && !busy;

  // % of buying power influence
  const influence = (frac) => {
    if (side === 'buy') {
      const targetBase = (cash || 0) * frac;
      const q = sameCcy && priceNow ? targetBase / priceNow : null;
      if (q == null) return;
      setQtyText(String(roundSmart(q)));
      setQtyMode('qty');
    } else {
      if (!heldQty) return;
      setQtyText(String(roundSmart(heldQty * frac, 6)));
      setQtyMode('qty');
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const body = { symbol, side, kind, qty };
      if (kind === 'limit') body.limitPrice = limit;
      if (!body.qty || body.qty <= 0) throw new Error('Enter a quantity.');
      const res = await api.post(`/profiles/${profile.id}/orders`, body);
      const o = res.order;
      const verb = o.status === 'filled' ? (side === 'buy' ? 'Bought' : 'Sold') : 'Order placed';
      toasts.ok(o.status === 'filled'
        ? `${verb} ${o.qty} ${o.symbol} @ ${fmtP(o.fill_price)} ${currency}${o.note ? ' — ' + o.note : ''}.`
        : `${verb}: ${o.side} ${o.qty} ${o.symbol} at limit ${fmtP(o.limit_price)}. You'll be notified when it fills.`);
      setQtyText(''); setLimitText(''); setQtyMode('qty');
      setConfirmOpen(false);
      onDone();
    } catch (e) {
      toasts.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = () => {
    if (qtyMode === 'invest' && side === 'buy' && sameCcy && priceNow) {
      const invest = Number(qtyText);
      if (!(Number.isFinite(invest) && invest > 0)) return toasts.err('Enter the amount you want to invest.');
      setQtyText(String(roundSmart(invest / (kind === 'limit' && limit ? limit : priceNow), 6)));
    }
    setConfirmOpen(true);
  };

  return (
    <div className="card ticket">
      <div className="tkt-price-row">
        <span className="tkt-price num">{priceNow ? price(priceNow, currency) : '—'}</span>
        <span className={`tkt-chg ${quote ? signCls(quote.changePct) : ''}`}>
          {quote ? `${pct(quote.changePct)} today` : 'loading price…'}
        </span>
        {!sameCcy && quote && (
          <span className="field-hint">Settled in {currency}, shown in your {base} balance.</span>
        )}
      </div>

      <div className="seg" style={{ width: '100%' }}>
        <button className={side === 'buy' ? 'on buy-on' : ''} style={{ flex: 1 }} onClick={() => setSide('buy')}>Buy</button>
        <button className={side === 'sell' ? 'on sell-on' : ''} style={{ flex: 1 }} onClick={() => setSide('sell')}>Sell</button>
      </div>

      <div className="seg" style={{ width: '100%' }}>
        <button className={kind === 'market' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setKind('market')}>Market</button>
        <button className={kind === 'limit' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setKind('limit')}>Limit</button>
      </div>

      {kind === 'limit' && (
        <div className="field">
          <label htmlFor="tkt-limit">Limit price ({ccy(currency).trim() || currency})</label>
          <div className="input-wrap">
            <span className="unit">{ccy(currency)}</span>
            <input id="tkt-limit" className="input with-unit num" inputMode="decimal" placeholder={priceNow ? `market ${price(priceNow, currency)}` : 'e.g. 100'}
              value={limitText} onChange={(e) => setLimitText(e.target.value)} />
          </div>
          {quote && (
            <span className="field-hint">
              A buy fills when the price is at or below the limit; a sell fills at or above.
            </span>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="tkt-qty">{qtyMode === 'invest' ? 'Invest amount' : 'Quantity'}</label>
        {side === 'buy' && sameCcy && (
          <div className="seg" style={{ marginBottom: 8 }}>
            <button className={qtyMode === 'qty' ? 'on' : ''} onClick={() => setQtyMode('qty')}>Shares</button>
            <button className={qtyMode === 'invest' ? 'on' : ''} onClick={() => setQtyMode('invest')}>{ccy(base)} amount</button>
          </div>
        )}
        <div className="input-wrap">
          {qtyMode !== 'invest' && <span className="unit">{priceNow && asset.type !== 'crypto' ? '' : ''}</span>}
          <input id="tkt-qty" className="input num" inputMode="decimal"
            placeholder={qtyMode === 'invest' ? `e.g. 1,000 ${base}` : side === 'sell' && heldQty ? `You hold ${heldQty}` : 'e.g. 3'}
            value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
        </div>
      </div>

      <div className="influence">
        <button className="chip" onClick={() => influence(0.25)}>25%</button>
        <button className="chip" onClick={() => influence(0.5)}>50%</button>
        <button className="chip" onClick={() => influence(1)}>Max</button>
        {side === 'sell' && heldQty ? <button className="chip" onClick={() => { setQtyText(String(heldQty)); setQtyMode('qty'); }}>All</button> : null}
      </div>

      <div className="col">
        <div className="mkt-val">
          <span className="est-label">{kind === 'limit' ? 'Worst case' : 'Estimated total'}</span>
          <span className="num" style={{ fontWeight: 700 }}>
            {estCost > 0 ? (estBase != null ? money(estBase, base) : `${qty} × ${price(effPrice, currency)}`) : '—'}
          </span>
        </div>
        <div className="mini-row"><span className="mut">Cash available</span><span className="num">{cash != null ? money(cash, base) : '—'}</span></div>
        {side === 'sell' && <div className="mini-row"><span className="mut">Held by you</span><span className="num">{heldQty ?? 0} {symbol}</span></div>}
        {side === 'buy' && !affordability && cash != null && (
          <p className="field-error" style={{ margin: 0 }}>That’s more than your available cash.</p>
        )}
        {priceNow == null && <p className="field-hint">Fetching the live price…</p>}
      </div>

      <button className={`btn submit-btn ${side === 'buy' ? 'btn-buy' : 'btn-sell'}`}
        style={{ fontSize: 15.5, fontWeight: 800 }}
        disabled={!canSubmit}
        onClick={openConfirm}>
        {side === 'buy' ? 'Buy' : 'Sell'} {symbol} {kind === 'limit' && limit ? `limit ${fmtP(limit)}` : kind === 'limit' ? 'limit' : 'market'}
      </button>

      <Confirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        busy={busy}
        title={`${side === 'buy' ? 'Buy' : 'Sell'} ${qty || '—'} ${symbol}?`}
        message={
          <span>
            {side === 'buy'
              ? <>You’re about to spend about <b>{sameCcy && estCost ? money(estCost, base) : `${price(effPrice, currency)} × ${qty}`}</b> of paper money on {qty} {symbol}.</>
              : <>You’re about to sell {qty} {symbol} from this practice profile.</>}{' '}
            <span style={{ color: 'var(--text-3)' }}>This is a simulated trade — no real money moves.</span>
          </span>
        }
        confirmLabel={side === 'buy' ? 'Confirm buy' : 'Confirm sell'}
        danger={side === 'sell'}
      />
    </div>
  );
}

function roundSmart(n, d = 6) {
  const p = Math.pow(10, d);
  const r = Math.round(n * p) / p;
  return r > 0 ? r : 0;
}
