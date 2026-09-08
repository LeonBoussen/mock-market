// End-to-end smoke test: boots a fresh API server + built client on a scratch port,
// walks the full beginner journey in headless Chromium, and saves screenshots to .smoke/.
//
//   node scripts/smoke.js            (requires: npm run build already done)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_SHOTS = path.join(root, '.smoke');
fs.mkdirSync(BASE_SHOTS, { recursive: true });

function netCheck(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

async function pickFreePort(from, to) {
  for (let p = from; p <= to; p++) {
    if (!(await netCheck(p))) return p;
  }
  throw new Error('no free port in range');
}

const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(root, '.pw-browsers');

function findChrome() {
  const candidates = [];
  const shells = path.join(browserPath, 'chromium_headless_shell-*');
  const full = path.join(browserPath, 'chromium-*');
  for (const base of [shells, full]) {
    if (!fs.existsSync(path.dirname(base))) continue;
    for (const dir of fs.readdirSync(path.dirname(base))) {
      if (!dir.startsWith(path.basename(base).replace('*', ''))) continue;
      const d = path.join(path.dirname(base), dir);
      for (const sub of ['chrome-headless-shell-linux-arm64/chrome-headless-shell', 'chrome-linux-arm64/chrome', 'chrome-headless-shell-linux/chrome-headless-shell', 'chrome-linux/chrome']) {
        const p = path.join(d, sub);
        if (fs.existsSync(p)) candidates.push(p);
      }
    }
  }
  return candidates[0] || null;
}
const chromeExec = findChrome();
console.log(chromeExec ? `using chromium: ${path.basename(path.dirname(path.dirname(chromeExec)))}` : 'WARN: no cached chromium found');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  return false;
}

let failCount = 0;
function check(label, cond, extra = '') {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failCount++;
    console.error(`  ✗ ${label} ${extra}`);
  }
}

async function main() {
  const PORT = await pickFreePort(4299, 4315);
  const BASE = `http://127.0.0.1:${PORT}`;
  const SHOTS = BASE_SHOTS;

  // fresh scratch data dir
  const dataDir = path.join('/tmp', `mm-smoke-${Date.now()}`);
  const api = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), MM_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const apiDone = new Promise((r) => api.once('exit', r));
  api.stdout.on('data', () => {});
  api.stderr.on('data', (d) => process.stderr.write(`[api] ${d}`));

  if (!(await waitForServer(`${BASE}/api/health`))) {
    console.error('Server failed to boot — aborting.');
    api.kill('SIGKILL');
    process.exit(1);
  }
  console.log(`API + client up at ${BASE}\n`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromeExec || undefined,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push('console: ' + m.text());
  });
  page.setDefaultTimeout(20000);

  const shot = async (name) => {
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
    console.log(`  📸 ${name}`);
  };

  try {
    // ---- Landing ----
    await page.goto(BASE, { waitUntil: 'networkidle' });
    check('landing loads', await page.getByRole('heading', { level: 1 }).isVisible());
    check('landing CTA', await page.getByRole('link', { name: /Start practicing/i }).first().isVisible());
    await shot('01-landing.png');

    // ---- Sign up ----
    await page.getByRole('link', { name: 'Create account' }).first().click();
    await page.waitForURL('**/signup');
    await page.getByLabel('Username').fill('nova_learner');
    await page.getByLabel('Email').fill('nova@example.com');
    await page.getByLabel('Password', { exact: true }).fill('PracticePass1');
    await page.getByLabel('Confirm password', { exact: true }).fill('PracticePass1');
    await page.getByRole('button', { name: /Create my free account/ }).click();
    await page.waitForURL('**/onboarding', { timeout: 15000 });
    check('signup → onboarding', true);

    // ---- Onboarding: explainer → profile → ready ----
    await page.getByRole('button', { name: /Sounds good/ }).click();
    await page.getByLabel('Profile name').fill('First steps');
    await page.getByRole('button', { name: '🪙' }).click();
    await page.getByRole('button', { name: /Create profile/ }).click();
    await page.getByRole('button', { name: /Take me to my dashboard/ }).click({ timeout: 25000 });
    await page.waitForURL('**/app', { timeout: 20000 });
    let dashOk = false;
    try {
      await page.getByText('Portfolio value').first().waitFor({ timeout: 20000 });
      dashOk = true;
    } catch { /* not found */ }
    check('onboarding creates profile & lands on dashboard', dashOk);
    await shot('02-dashboard.png');

    // Welcome modal
    if (await page.getByRole('button', { name: /Start trading/ }).first().isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /Start trading/ }).first().click();
    }

    // ---- Markets ----
    await page.getByRole('link', { name: 'Markets' }).click();
    await page.waitForURL('**/app/markets');
    await page.waitForSelector('table tbody tr', { timeout: 20000 });
    const rowCount = await page.locator('table tbody tr').count();
    check('markets lists assets', rowCount > 5, `(${rowCount} rows)`);
    await page.waitForFunction(() => {
      const cells = [...document.querySelectorAll('table tbody td:nth-child(3)')];
      return cells.some((c) => c.textContent.trim() !== '—' && c.textContent.includes('$'));
    }, undefined, { timeout: 25000 }).catch(() => {});
    await shot('03-markets.png');

    // open Apple terminal via the markets search (unique placeholder)
    await page.getByPlaceholder('Search 129 assets…').fill('apple');
    await page.locator('.asset-opt').first().click();
    await page.waitForURL('**/app/trade/AAPL', { timeout: 15000 });
    check('terminal opens for AAPL', await page.getByText('Apple').first().isVisible().catch(() => false));
    await page.waitForFunction(() => /^\$/.test((document.querySelector('.tkt-price')?.textContent || '').trim()), undefined, { timeout: 25000 }).catch(() => {});
    await shot('04-terminal.png');

    // ---- Buy market order ----
    await page.getByLabel('Quantity').fill('3');
    await page.getByRole('button', { name: /Buy AAPL market/ }).click();
    await page.getByRole('button', { name: 'Confirm buy' }).click();
    await page.waitForSelector('.toast', { timeout: 15000 });
    const toastText = (await page.locator('.toast').last().textContent()) || '';
    check('buy toast appears', /Bought 3 AAPL/i.test(toastText), toastText);
    await page.waitForFunction(() => document.body.textContent.includes('3 AAPL') || document.body.textContent.includes('3 shares'), undefined, { timeout: 15000 });
    await shot('05-terminal-after-buy.png');

    // ---- Orders visible in Portfolio ----
    await page.getByRole('link', { name: 'Portfolio' }).click();
    await page.waitForURL('**/app/portfolio');
    await page.getByRole('button', { name: 'Order history' }).click();
    await page.waitForSelector('table tbody tr');
    check('order history lists the buy', (await page.locator('table tbody').textContent()).includes('AAPL'));
    await page.getByRole('button', { name: 'Holdings' }).click();
    await page.waitForSelector('table tbody tr');
    check('holdings list the position', (await page.locator('table tbody').textContent()).includes('AAPL'));
    await shot('06-portfolio.png');

    // ---- Time machine ----
    await page.getByRole('link', { name: 'Time Machine' }).click();
    await page.waitForURL('**/app/timemachine');
    await page.getByRole('button', { name: /Show me an example/ }).first().click();
    await page.waitForSelector('.tm-hero .big', { timeout: 30000 });
    const bigText = (await page.locator('.tm-hero .big').textContent()) || '';
    check('time machine returns a result', /[+\-$]/.test(bigText), bigText);
    await page.waitForSelector('.chart-wrap canvas', { timeout: 15000 }).catch(() => {});
    await shot('07-timemachine-result.png');

    // Save the sim
    await page.getByRole('button', { name: /Save this/ }).click();
    await page.waitForSelector('.toast', { timeout: 15000 });
    await page.waitForFunction(() => document.body.textContent.includes('your time travel log'), undefined, { timeout: 15000 });
    check('simulation saved to log', (await page.locator('.tm-saved').count()) === 1);
    await shot('08-timemachine-saved.png');

    // ---- Second profile + currency + switching ----
    await page.getByTitle('Switch profile').click();
    await page.getByRole('button', { name: /New practice profile/ }).click();
    await page.getByLabel('Profile name').fill('Euro adventure');
    await page.getByLabel('Currency').selectOption('EUR');
    await page.locator('.modal').getByRole('button', { name: /Create profile/ }).click();
    await page.waitForSelector('.toast', { timeout: 15000 });
    await page.waitForFunction(() => document.body.textContent.includes('Euro adventure'), undefined, { timeout: 15000 });
    check('second profile created & active', (await page.locator('.pc-name').textContent()).includes('Euro adventure'));
    check('EUR currency applied', /€/.test(await page.locator('.pc-cash').textContent()));
    await shot('09-second-profile.png');

    // ---- Session persistence across reload ----
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.textContent.includes('Euro adventure'), undefined, { timeout: 15000 });
    check('session survives reload', (await page.locator('.pc-name').textContent()).includes('Euro adventure'));

    // ---- Sign out & sign back in ----
    await page.getByTitle('Sign out').click();
    let settled = false;
    for (let i = 0; i < 40; i++) {
      const u = page.url();
      if (u.includes('/signin') || u === `${BASE}/`) { settled = true; break; }
      await sleep(250);
    }
    if (!settled || !page.url().includes('/signin')) {
      const link = page.getByRole('link', { name: 'Sign in' }).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForURL('**/signin', { timeout: 15000 });
      }
    }
    await page.waitForSelector('#si-id', { timeout: 15000 });
    await page.locator('#si-id').fill('nova_learner');
    await page.locator('#si-pw').fill('PracticePass1');
    await page.getByRole('button', { name: /Sign in/ }).click();
    await page.waitForURL('**/app', { timeout: 15000 });
    check('sign back in lands on dashboard', await page.getByText('Portfolio value').first().isVisible().catch(() => false));
    await shot('10-signed-back-in.png');

    // ---- Mobile layout sanity ----
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.textContent.includes('Portfolio value'), undefined, { timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('mobile: no horizontal overflow', overflow <= 1, `(${overflow}px)`);
    const bottomNav = await page.locator('.side-link').count();
    check('mobile: bottom navigation present', bottomNav >= 5, `(${bottomNav} links)`);
    await shot('11-mobile.png');

    // console hygiene
    const realErrors = consoleErrors.filter(
      (e) => !/favicon|Failed to load resource|ERR_ABORTED/i.test(e)
    );
    check('no console/page errors', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));
    if (realErrors.length) console.log(realErrors.join('\n'));
  } catch (e) {
    console.error('\nSMOKE FAILED:', e.message);
    failCount++;
    await shot('99-failure.png').catch(() => {});
  } finally {
    await browser.close();
    api.kill('SIGKILL');
    await Promise.race([apiDone, sleep(1500)]);
  }

  console.log(`\n${failCount === 0 ? '✅ SMOKE PASSED' : `❌ SMOKE FAILED (${failCount} check(s))`}`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
