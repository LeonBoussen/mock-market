import { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCcw, Users, Wallet, TrendingUp, Database, BookOpen } from 'lucide-react';
import api from '../lib/api';
import { useToasts } from '../store/ui';
import { useAuth } from '../store/auth';
import { Confirm } from '../components/Modal';

function Stat({ k, v, icon: Icon }) {
  return (
    <div className="card stat">
      <span className="k">{k} {Icon && <Icon size={13} className="mini-ico" />}</span>
      <span className="v num">{v}</span>
    </div>
  );
}

export default function AdminPage() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const toasts = useToasts();
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    try {
      const data = await api.get('/admin/stats');
      setStats(data.stats);
    } catch (e) {
      toasts.err(e.message);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doReset = async () => {
    setBusy(true);
    try {
      await api.post('/admin/reset');
      toasts.ok('All data wiped. The next account to sign up will be admin.');
      setConfirmOpen(false);
      setStats(null);
      await logout();
    } catch (e) {
      toasts.err(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="badge brand" style={{ marginBottom: 8 }}><ShieldCheck size={12} /> Admin</span>
          <h1 className="page-title">Server administration</h1>
          <p className="page-sub">Signed in as <b>{user?.username}</b> — you have full control over this test server.</p>
        </div>
      </div>

      <div className="statgrid">
        <Stat k="Users" v={stats?.users ?? '—'} icon={Users} />
        <Stat k="Admins" v={stats?.admins ?? '—'} icon={ShieldCheck} />
        <Stat k="Profiles" v={stats?.profiles ?? '—'} icon={Wallet} />
        <Stat k="Positions" v={stats?.positions ?? '—'} icon={TrendingUp} />
        <Stat k="Orders" v={stats != null ? `${stats.openOrders} open / ${stats.orders} total` : '—'} icon={Database} />
        <Stat k="Saved sims" v={stats?.sims ?? '—'} icon={BookOpen} />
      </div>

      <div className="row wrap gap2" style={{ alignItems: 'stretch' }}>
        <div className="card card-pad grow" style={{ minWidth: 300 }}>
          <h3 style={{ fontSize: 16, marginBottom: 10 }}><BookOpen size={15} style={{ verticalAlign: '-2px' }} /> Guide</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.6 }}>
            <li><b>First account is admin.</b> On a fresh or reset database, the very first account created is automatically granted admin.</li>
            <li><b>Reset from the CLI.</b> Run <code>npm run reset</code> (or <code>node scripts/reset-db.js</code>) to wipe everything for a clean test run.</li>
            <li><b>Reset from here.</b> The button below wipes all data and signs you out — the next sign-up becomes admin.</li>
            <li><b>Test flows safely.</b> Resetting clears users, profiles, orders, positions, saved time-machine sims and all market/FX caches.</li>
          </ul>
        </div>

        <div className="card card-pad" style={{ minWidth: 300, borderColor: 'rgba(248,113,113,0.35)' }}>
          <h3 style={{ fontSize: 16, marginBottom: 10, color: 'var(--down)' }}>Danger zone</h3>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Permanently delete every account, profile, order and cached price on this server. This cannot be undone.
          </p>
          <button className="btn btn-sell" onClick={() => setConfirmOpen(true)}>
            <RefreshCcw size={15} /> Reset all data
          </button>
        </div>
      </div>

      <Confirm
        open={confirmOpen}
        onClose={busy ? undefined : () => setConfirmOpen(false)}
        onConfirm={doReset}
        title="Reset all server data?"
        message="Every user, profile, position, order, saved simulation and cache will be deleted, and you will be signed out. The first account created afterwards becomes the new admin."
        confirmLabel="Reset everything"
        danger
        busy={busy}
      />
    </div>
  );
}
