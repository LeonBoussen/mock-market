import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.MM_DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'mockmarket.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  pass_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🦊',
  color TEXT NOT NULL DEFAULT '#7c8bff',
  base_currency TEXT NOT NULL DEFAULT 'USD',
  starting_balance REAL NOT NULL,
  cash REAL NOT NULL,
  realized_base REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  qty REAL NOT NULL,
  avg_price REAL NOT NULL,          -- average entry price in the instrument's currency
  avg_unit_cost_base REAL NOT NULL, -- average cost per unit converted to profile base currency
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, symbol)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  kind TEXT NOT NULL CHECK (kind IN ('market','limit')),
  qty REAL NOT NULL,
  limit_price REAL,
  status TEXT NOT NULL CHECK (status IN ('open','filled','canceled')),
  fill_price REAL,
  cash_delta_base REAL,
  realized_base REAL,
  note TEXT,
  created_at INTEGER NOT NULL,
  filled_at INTEGER,
  canceled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orders_profile ON orders(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS equity_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  value_base REAL NOT NULL,
  cash_base REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equity_profile ON equity_points(profile_id, ts);

CREATE TABLE IF NOT EXISTS market_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fx_cache (
  pair TEXT PRIMARY KEY,
  usd_per REAL NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'buy',
  amount REAL NOT NULL,
  start_date TEXT NOT NULL,
  exit_date TEXT,
  entry_price REAL NOT NULL,
  exit_price REAL NOT NULL,
  pnl REAL NOT NULL,
  pnl_pct REAL NOT NULL,
  days INTEGER NOT NULL,
  currency TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// Migration for databases created before the admin flag existed.
{
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('is_admin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  }
}

export const sql = {
  userByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
  insertUser: db.prepare('INSERT INTO users (username, email, pass_hash, is_admin, created_at) VALUES (?,?,?,?,?)'),
  sessionByHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),

  profilesForUser: db.prepare('SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC'),
  profileById: db.prepare('SELECT * FROM profiles WHERE id = ?'),
  insertProfile: db.prepare(
    'INSERT INTO profiles (user_id, name, emoji, color, base_currency, starting_balance, cash, realized_base, created_at) VALUES (?,?,?,?,?,?,?,0,?)'
  ),
  updateProfile: db.prepare(
    'UPDATE profiles SET name = COALESCE(?, name), emoji = COALESCE(?, emoji), color = COALESCE(?, color) WHERE id = ?'
  ),
  adjustCash: db.prepare('UPDATE profiles SET cash = cash + ? WHERE id = ?'),
  deleteProfile: db.prepare('DELETE FROM profiles WHERE id = ?'),
  resetProfileCash: db.prepare('UPDATE profiles SET cash = starting_balance, realized_base = 0 WHERE id = ?'),
  clearProfilePositions: db.prepare('DELETE FROM positions WHERE profile_id = ?'),
  cancelOpenOrders: db.prepare("UPDATE orders SET status='canceled', canceled_at = ? WHERE profile_id = ? AND status='open'"),

  positionByKey: db.prepare('SELECT * FROM positions WHERE profile_id = ? AND symbol = ?'),
  upsertPosition: db.prepare(
    'INSERT INTO positions (profile_id, symbol, qty, avg_price, avg_unit_cost_base, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(profile_id, symbol) DO UPDATE SET qty = excluded.qty, avg_price = excluded.avg_price, avg_unit_cost_base = excluded.avg_unit_cost_base, updated_at = excluded.updated_at'
  ),
  deletePosition: db.prepare('DELETE FROM positions WHERE profile_id = ? AND symbol = ?'),
  positionsForProfile: db.prepare('SELECT * FROM positions WHERE profile_id = ? ORDER BY updated_at DESC'),

  insertOrder: db.prepare(
    'INSERT INTO orders (profile_id, symbol, side, kind, qty, limit_price, status, fill_price, cash_delta_base, realized_base, note, created_at, filled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ),
  orderById: db.prepare('SELECT * FROM orders WHERE id = ?'),
  openOrdersForProfile: db.prepare("SELECT * FROM orders WHERE profile_id = ? AND status='open' ORDER BY created_at ASC"),
  allOpenOrders: db.prepare("SELECT * FROM orders WHERE status='open' ORDER BY created_at ASC"),
  ordersForProfile: db.prepare(
    'SELECT * FROM orders WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?'
  ),
  markOrderFilled: db.prepare(
    "UPDATE orders SET status='filled', fill_price = ?, cash_delta_base = ?, realized_base = ?, note = ?, filled_at = ? WHERE id = ?"
  ),
  markOrderCanceled: db.prepare("UPDATE orders SET status='canceled', canceled_at = ? WHERE id = ?"),
  addRealized: db.prepare('UPDATE profiles SET realized_base = realized_base + ? WHERE id = ?'),

  insertEquity: db.prepare('INSERT INTO equity_points (profile_id, ts, value_base, cash_base) VALUES (?,?,?,?)'),
  latestEquity: db.prepare('SELECT ts FROM equity_points WHERE profile_id = ? ORDER BY ts DESC LIMIT 1'),
  equitySeries: db.prepare('SELECT ts, value_base, cash_base FROM equity_points WHERE profile_id = ? ORDER BY ts ASC'),

  getCache: db.prepare('SELECT payload, fetched_at FROM market_cache WHERE cache_key = ?'),
  setCache: db.prepare('INSERT INTO market_cache (cache_key, payload, fetched_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at'),
  deleteExpiredCache: db.prepare('DELETE FROM market_cache WHERE fetched_at < ?'),

  getFx: db.prepare('SELECT usd_per, fetched_at FROM fx_cache WHERE pair = ?'),
  setFx: db.prepare('INSERT INTO fx_cache (pair, usd_per, fetched_at) VALUES (?,?,?) ON CONFLICT(pair) DO UPDATE SET usd_per = excluded.usd_per, fetched_at = excluded.fetched_at'),

  insertSim: db.prepare(
    'INSERT INTO sims (user_id, symbol, side, amount, start_date, exit_date, entry_price, exit_price, pnl, pnl_pct, days, currency, payload, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ),
  simsForUser: db.prepare('SELECT * FROM sims WHERE user_id = ? ORDER BY created_at DESC'),
  simById: db.prepare('SELECT * FROM sims WHERE id = ?'),
  deleteSim: db.prepare('DELETE FROM sims WHERE id = ?'),
};
