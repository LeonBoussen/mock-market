import { db, sql } from '../db.js';

// Wipe every row of user/app data so the server returns to a pristine state.
// Safe to call while the server is running (plain DELETEs, no file removal).
export function resetAllData() {
  const rows = db.transaction(() => {
    // Children first, then parents (also works without FK cascade).
    db.prepare('DELETE FROM equity_points').run();
    db.prepare('DELETE FROM positions').run();
    db.prepare('DELETE FROM orders').run();
    db.prepare('DELETE FROM sims').run();
    db.prepare('DELETE FROM profiles').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM market_cache').run();
    db.prepare('DELETE FROM fx_cache').run();

    // Restart AUTOINCREMENT ids from 1 so "first account" is deterministic again.
    db.prepare("DELETE FROM sqlite_sequence").run();

    const counts = {
      users: sql.userCount.get().n,
    };
    return counts;
  })();
  return rows;
}

// Aggregate numbers for the admin dashboard.
export function adminStats() {
  const one = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  return {
    users: one('users'),
    admins: db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n,
    profiles: one('profiles'),
    positions: one('positions'),
    orders: one('orders'),
    openOrders: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='open'").get().n,
    sims: one('sims'),
    equityPoints: one('equity_points'),
    marketCacheRows: one('market_cache'),
    fxCacheRows: one('fx_cache'),
  };
}
