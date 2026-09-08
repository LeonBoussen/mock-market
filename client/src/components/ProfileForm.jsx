import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { money } from '../lib/format';

export const EMOJIS = ['🦊', '🚀', '🐻', '💎', '🦁', '🌙', '🎯', '🐙', '🌊', '🍀', '🪙', '🔥', '👾', '🧭', '🦉', '⚡'];
export const COLORS = ['#5b8cff', '#8a63ff', '#22d3ee', '#34d399', '#f59e0b', '#f87171', '#ec4899', '#a3e635', '#f97316', '#64748b'];
export const CURRENCIES = [
  { code: 'USD', label: 'US Dollar', sym: '$' },
  { code: 'EUR', label: 'Euro', sym: '€' },
  { code: 'GBP', label: 'British Pound', sym: '£' },
];
export const AMOUNT_PRESETS = [500, 1000, 5000, 10000, 50000, 100000, 1000000];

export function Avatar({ emoji, color, size = 40, className = '' }) {
  return (
    <span
      className={`avatar ${className}`}
      style={{
        width: size, height: size, fontSize: size * 0.5, lineHeight: `${size}px`, textAlign: 'center',
        background: `linear-gradient(140deg, ${color}33, ${color}18)`,
        border: `1px solid ${color}55`,
      }}
      aria-hidden
    >
      {emoji}
    </span>
  );
}

export function NewProfileForm({ onSubmit, busy, submitLabel = 'Create profile', initial = {}, embedded = false }) {
  const [name, setName] = useState(initial.name || '');
  const [emoji, setEmoji] = useState(initial.emoji || '🦊');
  const [color, setColor] = useState(initial.color || '#5b8cff');
  const [currency, setCurrency] = useState(initial.currency || 'USD');
  const [amount, setAmount] = useState(initial.amount || 10000);
  const [amountInput, setAmountInput] = useState(String(initial.amount || 10000));
  const [err, setErr] = useState('');

  const applyAmount = (v) => {
    setAmountInput(String(v));
    setAmount(v);
    setErr('');
  };

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amountInput);
    if (!name.trim()) return setErr('Give your profile a name — like “Main practice”.');
    if (!Number.isFinite(n) || n < 10) return setErr('Starting amount must be at least 10.');
    setErr('');
    try {
      await onSubmit({ name: name.trim(), emoji, color, baseCurrency: currency, startingAmount: Math.round(n * 100) / 100 });
    } catch (ex) {
      setErr(ex.message || 'Could not create the profile.');
    }
  };

  return (
    <form className={embedded ? 'np-form' : 'card card-pad np-form'} onSubmit={submit} noValidate>
      <div className="np-avatar-preview">
        <Avatar emoji={emoji} color={color} size={58} />
      </div>

      <div className="field">
        <label htmlFor="np-name">Profile name</label>
        <input id="np-name" className="input" maxLength={32} value={name} placeholder="e.g. My first account"
          onChange={(e) => setName(e.target.value)} autoFocus={!embedded} />
      </div>

      <div className="field">
        <label>Avatar</label>
        <div className="emoji-grid" role="radiogroup" aria-label="Pick an avatar">
          {EMOJIS.map((em) => (
            <button key={em} type="button" className={`emoji-opt ${em === emoji ? 'on' : ''}`}
              onClick={() => setEmoji(em)} aria-label={em}>{em}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Accent color</label>
        <div className="color-grid">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`color ${c}`}
              className={`color-opt ${c === color ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)} />
          ))}
        </div>
      </div>

      <div className="np-row2">
        <div className="field grow">
          <label htmlFor="np-cur">Currency</label>
          <select id="np-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.sym} {c.code} — {c.label}</option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="np-amt">Starting paper money</label>
          <div className="input-wrap">
            <span className="unit">{CURRENCIES.find((c) => c.code === currency)?.sym}</span>
            <input id="np-amt" className="input with-unit num" inputMode="decimal" value={amountInput}
              onChange={(e) => { setAmountInput(e.target.value); setErr(''); }} />
          </div>
        </div>
      </div>

      <div className="presets">
        {AMOUNT_PRESETS.slice(0, 6).map((v) => (
          <button type="button" key={v} className={`chip ${amount === v ? 'on' : ''}`} onClick={() => applyAmount(v)}>
            {money(v, currency, { min: 0, max: 0 })}
          </button>
        ))}
      </div>
      <p className="field-hint">
        <Wallet size={12} style={{ verticalAlign: '-2px' }} /> It’s play money — but pick a number that feels like a real account to you.
      </p>

      {err && <p className="field-error" role="alert">{err}</p>}

      <button type="submit" className="btn btn-primary btn-lg" disabled={busy} style={{ marginTop: 6 }}>
        {busy ? 'Creating…' : submitLabel}
      </button>
    </form>
  );
}
