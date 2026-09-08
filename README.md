# Mock Market 📈

**Learn to trade with real market data — and fake money.** A practice-trading platform built for
absolute beginners. Live quotes and history for **US, European, UK, Asian & Chinese stocks, ETFs and
crypto**, paper-trading profiles you fund yourself, and a **Time Machine** that replays real prices
from any past date so you can see exactly how that “should have bought…” idea would have turned out.

> ⚠️ Nothing on this site involves real money. It exists to build confidence before trading for real.

---

## ✨ What’s inside

| | |
|---|---|
| 🌍 **Real market data** | 129 hand-picked assets (AAPL → Tencent → Moutai → BTC) with live + historical prices from Yahoo Finance — no API keys needed. |
| 🎭 **Paper profiles** | Create multiple practice accounts. Pick a name, avatar, currency (USD/EUR/GBP) and your starting pretend balance. |
| 📊 **Trade terminal** | Candlestick charts (1D→MAX), market & limit orders, positions with live P&L in your base currency, working orders, order history. |
| ⏪ **Time Machine** | “If I invested €1,000 into ASML on 16 March 2020…” — replays real daily prices to today or your chosen exit date, with total/annualized return, max drawdown, volatility and a beat-the-S&P-500 comparison. |
| 🔐 **Proper accounts** | Username + email + salted **scrypt** password hashing, httpOnly session cookies, rate-limited auth, server-side validation. |
| 👣 **Guided onboarding** | First-login wizard explains the concept and walks you through creating your first profile. |

## 🚀 Run it

Requires **Node.js 20+** (built & tested on Node 22).

```bash
npm install          # install everything
npm run build        # bundle the client (into /dist)
npm start            # serve API + app → http://127.0.0.1:4280
```

For development with hot reload:

```bash
npm run dev          # API on :4280 + Vite dev UI on http://127.0.0.1:5173
```

Other scripts:

```bash
npm run dev:server   # API only (auto-restart)
npm run dev:web      # Vite only
npm run verify:catalog   # re-check every universe symbol against Yahoo
npm run smoke        # end-to-end browser test (Playwright) → screenshots in .smoke/
npm run service      # run as a detached service with auto-restart (logs: /tmp/mm-server.log)
npm run service:stop # stop that service
```

## 🧱 How it’s built

- **Server** — Node + Express + better-sqlite3 (`server/`). Real files:
  - `server/db.js` — schema & prepared statements (users, sessions, profiles, positions, orders, equity history, caches, saved sims)
  - `server/lib/security.js` — salted scrypt hashing, session tokens, rate limiting
  - `server/lib/yahoo.js` — Yahoo Finance chart/quote client with caching & FX conversion
  - `server/lib/engine.js` — the paper-trading ledger (fills, cash, positions, poller for limit orders)
  - `server/lib/tm.js` — Time Machine simulation engine
  - `server/routes/*` — REST API under `/api`
- **Client** — React + Vite (`client/src/`), dark calm fintech design, TradingView `lightweight-charts`,
  zustand state, no heavy UI framework (custom CSS design system).
- **Data** — SQLite file at `server/data/mockmarket.db` (gitignored). Override location with `MM_DATA_DIR`.
- **Universe** — curated catalog in `shared/catalog.json`, used by both server and client.

### Notes on correctness
- Positions & P&L are settled in your profile currency. Foreign-currency assets are converted with
  live FX rates (Yahoo), so an EUR stock in a USD profile is valued in USD too.
- Orders fill at real market prices. Limit orders also give price improvement (they fill at the market
  price once your limit is crossed). When a market is closed, fills use the latest close and say so.
- The Time Machine is an analysis lab: results are quoted in the asset’s own currency, price-only,
  no fees — the cleanest way to judge a single decision.

## 🧪 Smoke test

`npm run smoke` boots a fresh server on a free port with a scratch database, drives headless Chromium
through the whole beginner journey (sign-up → onboarding → dashboard → markets → buy → portfolio →
Time Machine → second profile → sign-out/in → mobile layout) and drops screenshots into `.smoke/`.
It must print `✅ SMOKE PASSED` before shipping changes.

## 📁 Project layout

```
client/            React app (Vite)
server/            Express API + SQLite + engines
shared/catalog.json  the curated tradable universe
scripts/           verify-catalog, smoke (E2E), dev helpers
dist/              built client (created by npm run build, gitignored)
.smoke/            QA screenshots (gitignored)
```

---

Made for beginners: real markets, pretend money, zero risk — and a time machine to learn from the past.
