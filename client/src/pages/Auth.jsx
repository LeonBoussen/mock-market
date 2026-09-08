import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../store/auth';
import { Logo } from '../components/Bits';

function AuthShell({ title, sub, children, side }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card-side">
        <div className="auth-form">
          <Link to="/"><Logo /></Link>
          <div style={{ marginTop: 8 }}>
            <h1 className="auth-h1">{title}</h1>
            <p className="field-hint" style={{ marginTop: 6 }}>{sub}</p>
          </div>
          {children}
        </div>
      </div>
      <div className="auth-quote-side">
        <div className="auth-q">
          “If I’d bought Tesla in March 2020, I’d have made 10x… probably.”
          <small>The Time Machine finds out. Paper money first, real confidence later.</small>
        </div>
        <div className="auth-mini-stats">
          <span>🌍 Real market data</span>
          <span>⏪ Trade the past</span>
          <span>🎯 No risk</span>
        </div>
      </div>
    </div>
  );
}

function PwInput({ id, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button type="button" className="icon-btn" tabIndex={-1} onClick={() => setShow(!show)} aria-label="Toggle password visibility">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function SigninPage() {
  const login = useAuth((s) => s.login);
  const nav = useNavigate();
  const loc = useLocation();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(id, pw);
      const { profiles } = useAuth.getState();
      nav(profiles.length ? (loc.state?.from || '/app') : '/onboarding');
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      sub="Sign in to keep practicing with real market data."
      side
    >
      <form onSubmit={submit} className="col" noValidate>
        <div className="field">
          <label htmlFor="si-id">Username or email</label>
          <input id="si-id" className="input" value={id} onChange={(e) => setId(e.target.value)}
            autoComplete="username" placeholder="alex_trader" autoFocus />
        </div>
        <div className="field">
          <label htmlFor="si-pw">Password</label>
          <PwInput id="si-pw" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Your password" autoComplete="current-password" />
        </div>
        {err && <p className="field-error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy || !id || !pw}>
          {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
        </button>
      </form>
      <p className="field-hint" style={{ textAlign: 'center' }}>
        New to Mock Market? <Link to="/signup" style={{ color: 'var(--brand-1)', fontWeight: 650 }}>Create a free account</Link>
      </p>
    </AuthShell>
  );
}

export function SignupPage() {
  const signup = useAuth((s) => s.signup);
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (f.password !== f.confirm) return setErr('Passwords do not match.');
    if (f.password.length < 10 || !/[a-z]/.test(f.password) || !/[A-Z]/.test(f.password) || !/[0-9]/.test(f.password)) {
      return setErr('Password needs 10+ characters with upper & lower case letters and a number.');
    }
    setBusy(true);
    try {
      await signup(f.username.trim(), f.email.trim(), f.password);
      nav('/onboarding');
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      sub="One account. As many practice profiles as you like."
    >
      <form onSubmit={submit} className="col" noValidate>
        <div className="field">
          <label htmlFor="su-u">Username</label>
          <input id="su-u" className="input" value={f.username} onChange={set('username')}
            autoComplete="username" placeholder="alex_trader" autoFocus />
          <span className="field-hint">3–24 letters, numbers or underscores.</span>
        </div>
        <div className="field">
          <label htmlFor="su-e">Email</label>
          <input id="su-e" className="input" type="email" value={f.email} onChange={set('email')}
            autoComplete="email" placeholder="you@example.com" />
        </div>
        <div className="field">
          <label htmlFor="su-p1">Password</label>
          <PwInput id="su-p1" value={f.password} onChange={set('password')} placeholder="Create a strong password" autoComplete="new-password" />
          <span className="field-hint">10+ characters, upper &amp; lower case and a number. Hashed &amp; salted — never stored in plain text.</span>
        </div>
        <div className="field">
          <label htmlFor="su-p2">Confirm password</label>
          <PwInput id="su-p2" value={f.confirm} onChange={set('confirm')} placeholder="Repeat your password" autoComplete="new-password" />
        </div>
        {err && <p className="field-error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'Creating account…' : 'Create my free account'} <ArrowRight size={16} />
        </button>
      </form>
      <p className="field-hint" style={{ textAlign: 'center' }}>
        Already have an account? <Link to="/signin" style={{ color: 'var(--brand-1)', fontWeight: 650 }}>Sign in</Link>
      </p>
    </AuthShell>
  );
}
