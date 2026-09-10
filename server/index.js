import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, sql } from './db.js';
import { ApiError } from './lib/util.js';
import { tickOpenOrders, recordEquityPoint } from './lib/engine.js';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import marketRoutes from './routes/markets.js';
import tradingRoutes from './routes/trading.js';
import tmRoutes from './routes/timemachine.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 4280;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '300kb' }));

// Baseline security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'");
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/profiles/:profileId', tradingRoutes);
app.use('/api/time-machine', tmRoutes);
app.use('/api/admin', adminRoutes);

// API 404
app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: `No API route for ${req.method} ${req.path}` } });
});

// Error middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Request body is not valid JSON.' } });
  }
  console.error('[server error]', err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on our side. Please retry.' } });
});

// Static client
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ---- Background jobs ----

// Match open limit orders every ~45s.
setInterval(async () => {
  try {
    const r = await tickOpenOrders();
    if (r.filled > 0) console.log(`[engine] filled ${r.filled}/${r.tried} open limit orders`);
  } catch (e) {
    console.error('[engine] poll failed', e.message);
  }
}, 45 * 1000).unref();

// Opportunistic equity snapshots + cache hygiene every 10 minutes.
setInterval(async () => {
  try {
    const profileIds = db.prepare('SELECT id FROM profiles').all().map((r) => r.id);
    await Promise.allSettled(profileIds.map((id) => recordEquityPoint(id)));
    sql.deleteExpiredCache.run(Date.now() - 2 * 60 * 60 * 1000);
    sql.deleteExpiredSessions.run(Date.now());
  } catch (e) {
    console.error('[engine] housekeeping failed', e.message);
  }
}, 10 * 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`\n  Mock Market server listening on http://127.0.0.1:${PORT}`);
  console.log(`  API base: http://127.0.0.1:${PORT}/api  ·  client ${fs.existsSync(distDir) ? 'built ✓' : 'not built yet (run npm run build)'}\n`);
});
