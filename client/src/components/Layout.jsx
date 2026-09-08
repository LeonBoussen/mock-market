import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, CandlestickChart, History, Wallet, Globe2,
  ChevronDown, Plus, Settings, LogOut, KeyRound, RotateCcw, Trash2, ShieldCheck, UserRound, Check,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import { useToasts } from '../store/ui';
import api, { ApiError } from '../lib/api';
import { money } from '../lib/format';
import { Logo } from './Bits';
import { Modal, Confirm } from './Modal';
import { NewProfileForm, Avatar, EMOJIS, COLORS } from './ProfileForm';
import { AssetPicker } from './AssetPicker';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/markets', label: 'Markets', icon: Globe2 },
  { to: '/app/trade', label: 'Trade', icon: CandlestickChart },
  { to: '/app/timemachine', label: 'Time Machine', icon: History },
  { to: '/app/portfolio', label: 'Portfolio', icon: Wallet },
];

function useQuickGo() {
  const nav = useNavigate();
  return (symbol) => nav(`/app/trade/${symbol}`);
}

export function AppLayout() {
  const { activeProfile, profiles, logout } = useAuth();
  const toasts = useToasts();
  const nav = useNavigate();
  const goAsset = useQuickGo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const active = activeProfile();
  const p = active;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/app" className="side-brand">
          <Logo size={28} />
        </Link>

        <nav className="side-nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `side-link ${isActive ? 'on' : ''}`}>
              <item.icon size={17.5} />
              <span>{item.label}</span>
              {item.label === 'Time Machine' && <span className="side-new">new</span>}
            </NavLink>
          ))}
        </nav>

        <div className="side-foot">
          {p && (
            <button className="profile-card" onClick={() => setMenuOpen(true)}>
              <Avatar emoji={p.emoji} color={p.color} size={38} />
              <span className="pc-meta">
                <span className="pc-name trunc">{p.name}</span>
                <span className="pc-cash num">{money(p.cash, p.baseCurrency)}</span>
              </span>
              <ChevronDown size={15} className="mut" />
            </button>
          )}
        </div>
      </aside>

      <header className="topbar">
        <div className="tb-left">
          <Link to="/app" className="tb-brand-mobile"><Logo size={24} /></Link>
        </div>
        <div className="tb-search">
          <AssetPicker onChange={goAsset} placeholder="Find an asset to trade…" compact />
        </div>
        <div className="tb-right">
          <span className="tb-chip chip" onClick={() => setMenuOpen(true)} title="Switch profile">
            <Avatar emoji={p?.emoji || '🦊'} color={p?.color || '#5b8cff'} size={26} />
            {p?.name && <span className="tb-pname trunc">{p.name}</span>}
          </span>
          <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
          <button className="icon-btn" title="Sign out"
            onClick={async () => { await logout(); nav('/'); }}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <ProfileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onCreate={() => { setMenuOpen(false); setNewProfileOpen(true); }}
      />

      <Modal open={newProfileOpen} onClose={() => setNewProfileOpen(false)} title="New practice profile">
        <NewProfileForm
          embedded
          onSubmit={async (v) => {
            const { profile } = await api.post('/profiles', v);
            useAuth.getState().applyProfiles([...profiles, profile]);
            useAuth.getState().setActiveProfile(profile.id);
            setNewProfileOpen(false);
            toasts.ok(`Profile “${profile.name}” created with ${money(profile.cash, profile.baseCurrency)}.`);
          }}
        />
      </Modal>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/* ---------------- Profile switcher menu ---------------- */

function ProfileMenu({ open, onClose, onCreate }) {
  const { profiles, activeProfileId, setActiveProfile } = useAuth();
  const active = useAuth((s) => s.activeProfile());

  return (
    <Modal open={open} onClose={onClose} title="Your profiles">
      <div className="pm-list">
        {profiles.map((prof) => (
          <button key={prof.id}
            className={`pm-row ${prof.id === activeProfileId ? 'on' : ''}`}
            onClick={() => { setActiveProfile(prof.id); onClose(); }}>
            <Avatar emoji={prof.emoji} color={prof.color} size={36} />
            <span className="grow col gap0" style={{ textAlign: 'left' }}>
              <span className="pm-name">{prof.name}</span>
              <span className="pm-cash num t2">{money(prof.cash, prof.baseCurrency)} available</span>
            </span>
            {prof.id === activeProfileId && <Check size={17} className="up" />}
          </button>
        ))}
      </div>
      <button className="btn btn-soft btn-lg" style={{ width: '100%', marginTop: 8 }} onClick={onCreate}>
        <Plus size={17} /> New practice profile
      </button>
      <p className="field-hint" style={{ marginTop: 10, textAlign: 'center' }}>
        {active ? `Currently trading as “${active.name}”. Each profile is an independent practice account.` : ''}
      </p>
    </Modal>
  );
}

/* ---------------- Settings sheet ---------------- */

function SettingsSheet({ open, onClose }) {
  const { user, profiles, activeProfileId, applyProfiles, patchProfile, logout, setActiveProfile } = useAuth();
  const toasts = useToasts();
  const nav = useNavigate();
  const active = useAuth((s) => s.activeProfile());

  const [tab, setTab] = useState('profile');
  const [name, setName] = useState(active?.name || '');
  const [emoji, setEmoji] = useState(active?.emoji || '🦊');
  const [color, setColor] = useState(active?.color || '#5b8cff');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [pw, setPw] = useState({ current: '', next: '', next2: '' });
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setErr('');
    if (!active) return;
    if (!name.trim()) return setErr('Name cannot be empty.');
    setBusy(true);
    try {
      const { profile } = await api.patch(`/profiles/${active.id}`, { name: name.trim(), emoji, color });
      patchProfile(profile);
      toasts.ok('Profile updated.');
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwErr('');
    if (pw.next !== pw.next2) return setPwErr('New passwords do not match.');
    setPwBusy(true);
    try {
      await api.patch('/auth/password', { current: pw.current, next: pw.next });
      toasts.ok('Password changed.');
      setPw({ current: '', next: '', next2: '' });
    } catch (ex) {
      setPwErr(ex.message);
    } finally {
      setPwBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const { profile } = await api.post(`/profiles/${active.id}/reset`);
      patchProfile(profile);
      toasts.ok(`“${profile.name}” reset to ${money(profile.cash, profile.baseCurrency)}.`);
      setResetOpen(false);
    } catch (ex) {
      toasts.err(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    setDeleteBusy(true);
    try {
      await api.del(`/profiles/${active.id}`);
      const remaining = profiles.filter((p) => p.id !== active.id);
      applyProfiles(remaining);
      setDeleteOpen(false);
      toasts.ok('Profile deleted.');
      if (!remaining.length) nav('/onboarding');
    } catch (ex) {
      toasts.err(ex.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!active) return null;

  return (
    <>
      <Modal open={open} onClose={onClose} title="Settings" wide>
        <div className="set-tabs seg">
          <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>Profile</button>
          <button className={tab === 'account' ? 'on' : ''} onClick={() => setTab('account')}>Account &amp; security</button>
        </div>

        {tab === 'profile' ? (
          <form onSubmit={saveProfile} className="np-form" style={{ marginTop: 16 }}>
            <div className="set-row">
              <div className="field grow">
                <label>Profile name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
              </div>
              <div className="field">
                <label>Avatar</label>
                <div className="emoji-grid">
                  {EMOJIS.slice(0, 10).map((em) => (
                    <button key={em} type="button" className={`emoji-opt ${em === emoji ? 'on' : ''}`} onClick={() => setEmoji(em)}>{em}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label>Accent color</label>
              <div className="color-grid">
                {COLORS.map((c) => (
                  <button key={c} type="button" className={`color-opt ${c === color ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
            {err && <p className="field-error">{err}</p>}
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>

            <hr className="divider" />
            <div className="danger-zone">
              <div className="row between">
                <div>
                  <strong>Reset this profile</strong>
                  <p className="field-hint">Clears positions &amp; open orders and restores {money(active.startingBalance, active.baseCurrency)}.</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setResetOpen(true)}>
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
              <div className="row between" style={{ marginTop: 10 }}>
                <div>
                  <strong style={{ color: 'var(--down)' }}>Delete this profile</strong>
                  <p className="field-hint">Removes its orders and history permanently.</p>
                </div>
                <button className="btn btn-sell btn-sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div style={{ marginTop: 16 }} className="col gap2">
            <div className="acc-row">
              <ShieldCheck size={20} className="up" />
              <div className="grow">
                <strong>{user?.username}</strong>
                <p className="field-hint">{user?.email}</p>
              </div>
              <span className="badge up"><ShieldCheck size={11} /> secured</span>
            </div>

            <form onSubmit={changePassword} className="col gap1" style={{ maxWidth: 420 }}>
              <strong><KeyRound size={15} style={{ verticalAlign: '-2px' }} /> Change password</strong>
              <input className="input" type="password" autoComplete="current-password" placeholder="Current password"
                value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              <input className="input" type="password" autoComplete="new-password" placeholder="New password (10+ chars, upper & lower + number)"
                value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <input className="input" type="password" autoComplete="new-password" placeholder="Repeat new password"
                value={pw.next2} onChange={(e) => setPw({ ...pw, next2: e.target.value })} />
              {pwErr && <p className="field-error">{pwErr}</p>}
              <button className="btn btn-soft" style={{ alignSelf: 'flex-start' }} disabled={pwBusy}>
                {pwBusy ? 'Updating…' : 'Update password'}
              </button>
            </form>

            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={async () => { await logout(); nav('/'); }}>
              <LogOut size={15} /> Sign out of {user?.username}
            </button>
          </div>
        )}
      </Modal>

      <Confirm
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={reset}
        title="Reset this profile?"
        message={`All positions and open orders on “${active.name}” will be cleared. Your balance returns to ${money(active.startingBalance, active.baseCurrency)}. Order history stays.`}
        confirmLabel="Reset profile"
        busy={busy}
      />
      <Confirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={del}
        title="Delete this profile?"
        message={`“${active.name}” and all of its history will be gone forever. This cannot be undone.`}
        confirmLabel="Delete profile"
        danger
        busy={deleteBusy}
      />
    </>
  );
}

export { UserRound };
