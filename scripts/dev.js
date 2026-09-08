// Runs the API server and the Vite dev server together for development.
import { spawn } from 'node:child_process';

const PORT = process.env.PORT || '4280';
const children = [];

const api = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', env: { ...process.env, PORT } });
children.push(api);
console.log(`\n[dev] API server on http://127.0.0.1:${PORT}\n`);

const vite = spawn('npx', ['vite', '--config', 'client/vite.config.js'], { stdio: 'inherit' });
children.push(vite);
console.log('[dev] Vite dev server (UI + HMR) — http://127.0.0.1:5173\n');

function shutdown() {
  for (const c of children) {
    try { c.kill('SIGTERM'); } catch { /* ignore */ }
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
