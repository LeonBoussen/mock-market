import { Link } from 'react-router-dom';
import { Sparkles, Clock3, Wallet, ShieldCheck, TrendingUp, Globe2, ArrowRight, PlayCircle, Layers } from 'lucide-react';
import { useAuth } from '../store/auth';
import { Logo } from '../components/Bits';

const FEATURES = [
  {
    icon: Globe2,
    title: 'Real market data',
    text: 'Live and historical prices for US, European & Asian stocks, ETFs and crypto. The market is real — only the money is fake.',
  },
  {
    icon: Clock3,
    title: 'The Time Machine',
    text: 'Wind back the clock, “invest” in any asset on any past date, and watch exactly what would have happened — up to today or your own chosen exit.',
  },
  {
    icon: Wallet,
    title: 'Practice profiles',
    text: 'Create multiple paper accounts with the starting money you choose. Test a cautious style and a bold one side by side.',
  },
  {
    icon: ShieldCheck,
    title: 'Zero risk, zero fees',
    text: 'No real money ever leaves your pocket. Make mistakes, learn the ropes, and build confidence before you trade for real.',
  },
];

const HERO_STATS = [
  { icon: Globe2, b: '1,000+', s: 'Assets you can search…', small: true },
  { icon: Clock3, b: '31 years', s: 'of history to explore' },
  { icon: Wallet, b: '∞', s: 'profiles & paper money' },
];

export default function LandingPage() {
  const status = useAuth((s) => s.status);
  const authed = status === 'auth';
  const cta = authed ? (
    <>
      <Link to="/app" className="btn btn-primary btn-lg">Open your dashboard <ArrowRight size={17} /></Link>
    </>
  ) : (
    <>
      <Link to="/signup" className="btn btn-primary btn-lg">Start practicing — it’s free <ArrowRight size={17} /></Link>
      <Link to="/signin" className="btn btn-ghost btn-lg">I have an account</Link>
    </>
  );

  return (
    <div className="landing">
      <div className="bg-glow" />
      <nav className="land-nav">
        <Logo />
        <div className="row">
          {authed ? (
            <Link to="/app" className="btn btn-primary btn-sm">Dashboard</Link>
          ) : (
            <>
              <Link to="/signin" className="btn btn-ghost btn-sm">Sign in</Link>
              <Link to="/signup" className="btn btn-primary btn-sm">Create account</Link>
            </>
          )}
        </div>
      </nav>

      <section className="land-hero">
        <span className="badge brand land-eyebrow"><Sparkles size={12} /> Built for absolute beginners</span>
        <h1 className="hero-title">
          Learn to trade with<br />
          <span className="grad-text">real markets &amp; fake money.</span>
        </h1>
        <p className="hero-sub">
          Mock Market gives you live stock, ETF and crypto prices, a paper-trading account you fund yourself,
          and a <strong>Time Machine</strong> that replays the past — so you can see exactly how yesterday’s
          good idea would have turned out.
        </p>
        <div className="hero-cta">{cta}</div>
        <div className="hero-stats">
          {HERO_STATS.slice(1).map((s, i) => (
            <div className="hstat" key={i}>
              <b>{s.b}</b>
              <span>{s.s}</span>
            </div>
          ))}
        </div>

        <div className="hero-visual">
          <DemoVisual />
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div className="card feature" key={f.title}>
            <div className="f-ico"><f.icon size={20} /></div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <section className="land-hero" style={{ paddingTop: 20 }}>
        <div className="card card-pad" style={{ textAlign: 'center', padding: '44px 28px' }}>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', letterSpacing: '-0.03em' }}>
            <span className="grad-text">Curious how the Time Machine works?</span>
          </h2>
          <p className="hero-sub" style={{ margin: '10px auto 0', textAlign: 'center' }}>
            Pick an asset, pick a past date, type in how much you wish you’d invested — and Mock Market
            replays the real prices day by day.
          </p>
          <div className="row center" style={{ marginTop: 20, justifyContent: 'center' }}>
            {authed
              ? <Link to="/app/timemachine" className="btn btn-primary btn-lg"><Clock3 size={17} /> Try the Time Machine</Link>
              : <Link to="/signup" className="btn btn-primary btn-lg"><PlayCircle size={17} /> Create a free account</Link>}
          </div>
        </div>
      </section>

      <footer className="land-foot">
        <Logo size={20} wordmark />
        <p style={{ marginTop: 10 }}>Mock Market is a practice simulator — all trading is fictional and no real money is involved.<br />© {new Date().getFullYear()} Mock Market</p>
      </footer>
    </div>
  );
}

function DemoVisual() {
  return (
    <div className="demo" aria-hidden>
      <div className="demo-tabs">
        <span className="on"><TrendingUp size={13} /> AAPL</span>
        <span>TSLA</span>
        <span>BTC-USD</span>
        <span className="demo-time"><Clock3 size={13} /> Time Machine</span>
      </div>
      <div className="demo-body">
        <div className="demo-left">
          <div className="demo-price num">$316.67</div>
          <div className="demo-chg num down">−1.03% today</div>
          <DemoSpark />
        </div>
        <div className="demo-right">
          <div className="demo-card">
            <div className="mut" style={{ fontSize: 11 }}>IF I HAD INVESTED</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 800 }}>$1,000</div>
            <div className="mut" style={{ fontSize: 11, marginTop: 6 }}>INTO <b>AAPL</b> ON</div>
            <div className="num" style={{ fontSize: 16, fontWeight: 700 }}>March 16, 2020</div>
          </div>
          <div className="demo-result">
            <div className="mut" style={{ fontSize: 11 }}>TODAY IT WOULD BE</div>
            <div className="num" style={{ fontSize: 30, fontWeight: 800, color: 'var(--up)' }}>+$4,229</div>
            <div className="demo-bar"><div style={{ width: '80%', background: 'var(--brand-grad)' }} /></div>
            <div className="num" style={{ fontSize: 13, color: 'var(--text-2)' }}>+422.9% · beats S&amp;P 500 by +203pp</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoSpark() {
  // deterministic pseudo sparkline (AAPL-like)
  const pts = [];
  let v = 40;
  for (let i = 0; i < 48; i++) {
    v += Math.sin(i * 0.55) * 4 + (Math.sin(i * 0.13 + 2) * 8);
    pts.push(v);
  }
  const min = Math.min(...pts); const max = Math.max(...pts);
  const w = 320; const h = 130; const step = w / (pts.length - 1);
  const coords = pts.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / (max - min)) * h).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%' }}>
      <defs>
        <linearGradient id="demoFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b8cff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#5b8cff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0,${h} L${coords.join(' L')} L${w},${h} Z`} fill="url(#demoFill)" />
      <polyline points={coords.join(' ')} fill="none" stroke="#7c9aff" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
