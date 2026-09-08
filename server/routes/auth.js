import { Router } from 'express';
import { z } from 'zod';
import { db, sql } from '../db.js';
import { hashPassword, verifyPassword, createSession, destroySession, sessionCookie, clearSessionCookie, requireAuth, parseCookies, sessionUser, rateLimit } from '../lib/security.js';
import { ah, ok, ApiError } from '../lib/util.js';

const router = Router();

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;
const passwordCheck = (p) =>
  typeof p === 'string' && p.length >= 10 && p.length <= 128 &&
  /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p);

const signupSchema = z.object({
  username: z.string().regex(USERNAME_RE, 'Username: 3–24 letters, numbers or underscores.'),
  email: z.string().email('Enter a valid email address.').max(190),
  password: z.string().refine(passwordCheck, 'Password must be 10+ characters with upper & lower case letters and a number.'),
});

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, createdAt: u.created_at };
}

function profilePublic(p) {
  return {
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    color: p.color,
    baseCurrency: p.base_currency,
    startingBalance: p.starting_balance,
    cash: p.cash,
    realized: p.realized_base,
    createdAt: p.created_at,
  };
}

router.post('/signup', rateLimit('auth'), ah(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'validation', message: parsed.error.issues[0].message } });
  }
  const { username, email, password } = parsed.data;
  const uname = username.trim();
  const mail = email.trim().toLowerCase();

  if (sql.userByUsername.get(uname)) throw new ApiError(409, 'username_taken', 'That username is already taken.');
  if (sql.userByEmail.get(mail)) throw new ApiError(409, 'email_taken', 'An account with that email already exists.');

  const info = sql.insertUser.run(uname, mail, hashPassword(password), Date.now());
  const user = sql.userById.get(info.lastInsertRowid);
  const token = createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(token));
  ok(res, { user: publicUser(user) }, 201);
}));

router.post('/login', rateLimit('auth'), ah(async (req, res) => {
  const parsed = z.object({
    usernameOrEmail: z.string().min(1).max(190),
    password: z.string().min(1).max(200),
  }).safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, 'validation', 'Enter your username or email and password.');

  const id = parsed.data.usernameOrEmail.trim();
  const user = sql.userByUsername.get(id) || sql.userByEmail.get(id.toLowerCase());
  const okAuth = user && verifyPassword(parsed.data.password, user.pass_hash);
  if (!okAuth) throw new ApiError(401, 'bad_credentials', 'Incorrect username/email or password.');

  const token = createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(token));
  ok(res, { user: publicUser(user) });
}));

router.post('/logout', requireAuth, ah(async (req, res) => {
  const token = parseCookies(req.headers.cookie || '').mm_sess;
  destroySession(token);
  res.setHeader('Set-Cookie', clearSessionCookie());
  ok(res, { loggedOut: true });
}));

router.get('/me', ah(async (req, res) => {
  const token = parseCookies(req.headers.cookie || '').mm_sess;
  const user = token ? sessionUser(token) : null;
  if (!user) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
  const profiles = sql.profilesForUser.all(user.id).map(profilePublic);
  ok(res, { user: publicUser(user), profiles });
}));

router.patch('/password', requireAuth, ah(async (req, res) => {
  const parsed = z.object({
    current: z.string().min(1).max(200),
    next: z.string().refine(passwordCheck, 'New password must be 10+ characters with upper & lower case and a number.'),
  }).safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.issues[0].message);
  const user = req.auth.user;
  if (!verifyPassword(parsed.data.current, user.pass_hash)) throw new ApiError(401, 'bad_password', 'Current password is incorrect.');
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(parsed.data.next), user.id);
  ok(res, { updated: true });
}));

export default router;
export { publicUser, profilePublic };
