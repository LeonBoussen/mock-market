// Verification: hit Yahoo Finance for every curated symbol and report failures.
// Run: node scripts/verify-catalog.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(path.join(root, 'shared/catalog.json'), 'utf8')).items;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function check(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(9000) });
      if (res.status === 429) {
        await sleep(2500 * attempt);
        continue;
      }
      if (!res.ok) return { ok: false, status: res.status };
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      const quote = json?.chart?.result?.[0]?.indicators?.quote?.[0];
      const closes = quote?.close ?? [];
      if (!meta || !Array.isArray(closes) || closes.filter((c) => c != null).length < 2) {
        return { ok: false, status: 'no-data' };
      }
      return { ok: true, currency: meta.currency ?? null, name: meta.longName ?? meta.shortName ?? null };
    } catch (e) {
      if (attempt === 4) return { ok: false, status: 'err:' + e.message.slice(0, 40) };
      await sleep(800 * attempt);
    }
  }
  return { ok: false, status: 'gave-up' };
}

const results = [];
for (const item of catalog) {
  const r = await check(item.s);
  results.push({ s: item.s, ...r, catalogCurrency: item.c });
  const flag = r.ok ? '.' : `FAIL(${r.status})`;
  process.stdout.write(flag);
  await sleep(120);
}
process.stdout.write('\n');

const failed = results.filter((r) => !r.ok);
const curMismatch = results.filter((r) => r.ok && r.currency && r.currency !== r.catalogCurrency);
console.log(`\nChecked ${results.length} symbols. Failed: ${failed.length}. Currency mismatches: ${curMismatch.length}`);
for (const f of failed) console.log('  FAIL', f.s, f.status);
for (const m of curMismatch) console.log('  CUR ', m.s, 'catalog=', m.catalogCurrency, 'yahoo=', m.currency);
