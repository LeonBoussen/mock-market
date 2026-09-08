import crypto from 'node:crypto';
import { db, sql } from '../db.js';

// ---------- Password hashing (salted scrypt, memory-hard) ----------

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = stored.split('$');
    if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
    const [, N, r, p, saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------- Sessions ----------

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function sha256hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  sql.insertSession.run(sha256hex(token), userId, now, now + SESSION_TTL_MS);
  return token;
}

export function destroySession(token) {
  if (token) sql.deleteSession.run(sha256hex(token));
}

export function sessionUser(token) {
  if (!token) return null;
  const row = sql.sessionByHash.get(sha256hex(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    sql.deleteSession.run(row.token_hash);
    return null;
  }
  return sql.userById.get(row.user_id);
}

// ---------- Cookie helpers ----------

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token) {
  return `mm_sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function clearSessionCookie() {
  return 'mm_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

// ---------- Auth middleware ----------

export function requireAuth(req, res, next) {
  const token = parseCookies(req.headers.cookie || '').mm_sess;
  const user = sessionUser(token);
  if (!user) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in to continue.' } });
  }
  req.auth = { user, token };
  next();
}

// ---------- Rate limiting (per IP + scope, in-memory sliding window) ----------

const buckets = new Map();
const RATE_LIMITS = {
  auth: { windowMs: 10 * 60 * 1000, max: 40 }, // login/signup attempts per IP per 10 min
  general: { windowMs: 60 * 1000, max: 300 },
};

export function rateLimit(scope) {
  const cfg = RATE_LIMITS[scope] ?? RATE_LIMITS.general;
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${scope}:${ip}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + cfg.windowMs });
      return next();
    }
    b.count += 1;
    if (b.count > cfg.max) {
      return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many attempts. Please try again in a few minutes.' } });
    }
    next();
  };
}

// Keep the map from growing forever
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}, 10 * 60 * 1000).unref();
