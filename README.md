## Zerodha Automated Trading Platform (Full‑Stack)

Production‑ready FastAPI backend + Next.js frontend for Zerodha automated and paper trading. Live market data via KiteTicker, order placement via REST, strategies (SMA/EMA), AI one‑click trading, options tools (chain/ATM), paper money, exports, and rich UI with dark/light themes.

### 1) Prerequisites
- Python 3.10+
- Zerodha account with Kite API access (get your API Key/Secret)
 - Node.js 18+
 - GitHub account (Render + Vercel deploy)

### 2) Quick Start (Windows PowerShell)
```powershell
cd "D:\PAPER TRADE"
py -3 -m venv .venv
./.venv/Scripts/Activate.ps1
pip install -r backend/requirements.txt
# Create .env in repo root and fill values (see keys below)
notepad .env   # ZERODHA_API_KEY, ZERODHA_API_SECRET, ZERODHA_USER_ID
```

### 3) Get Access Token (daily)
Zerodha requires a fresh access token each day after login.

```powershell
./.venv/Scripts/Activate.ps1
python backend/scripts/get_access_token.py
# Follow instructions in the terminal: open the login URL, authorize,
# paste the request_token back. The script will update ACCESS_TOKEN in .env
```

### 4) Download Instruments (auto + manual refresh)
```powershell
python backend/scripts/download_instruments.py
```
Backend also auto‑downloads instruments on boot if missing. Manual script refresh is available.

### 5) Run Example Strategy (SMA crossover, dry run by default)
```powershell
python backend/main.py --symbols TCS INFY RELIANCE --exchange NSE --short 20 --long 50 --ltp
```
Flags:
- `--symbols`: Space-separated list of trading symbols
- `--exchange`: Exchange code (NSE/BSE/NFO) default NSE
- `--short` and `--long`: SMA windows
- `--ltp` or `--full`: Streaming mode (LTP or full ticks)
- `--live`: Place real orders (omit for dry run)

### 6) Project Layout
```
backend/
  app/
    broker/
    market/
    strategies/
    utils/
    server/
    config.py
    logging_setup.py
  scripts/
  main.py
  requirements.txt
data/
render.yaml
frontend/
```

### 7) Backend API (FastAPI for Render)
- Start locally:
```powershell
.\.venv\Scripts\Activate.ps1
cd backend
uvicorn app.server.app:app --reload --port 10000
```
- REST:
  - POST `/subscribe` { symbols: ["TCS", "INFY"], exchange: "NSE", mode: "ltp"|"full" }
  - POST `/unsubscribe` { symbols: ["TCS"] }
  - POST `/order` { symbol: "TCS", exchange: "NSE", side: "BUY"|"SELL", quantity: 1 }
  - GET `/ltp?symbols=SBIN,RELIANCE&exchange=NSE`
  - GET `/positions`, GET `/pnl`, GET `/orders`
  - POST `/risk` { sl_pct, tp_pct, auto_close, trailing_stop_pct }
  - POST `/squareoff`, POST `/squareoff/all`
  - Strategy: POST `/strategy/sma/start`, POST `/strategy/ema/start`, POST `/strategy/stop`, GET `/strategy/status`
  - AI: POST `/ai/config`, POST `/ai/start`
  - Options: GET `/options/expiries`, GET `/options/chain`, POST `/options/atm_trade`
  - Schedule: GET/POST `/schedule` (auto start/stop, EOD square‑off)
- WS:
  - `ws://host/ws/ticks` → periodic snapshots `{ ticks: [...] }`

### 8) Frontend (Next.js on Vercel)
```
cd frontend
npm i
# Create .env.local and set NEXT_PUBLIC_BACKEND_URL to your Render backend URL
notepad .env.local
npm run dev
```
Set `NEXT_PUBLIC_BACKEND_URL` to your Render URL, e.g. `https://zerodha-auto-backend.onrender.com`.

Key pages/components:
- Dashboard: login, watchlist, subscribe/unsubscribe, strategies, AI controls, trading mode, positions & PnL, exports
- Market Data: subscribe/unsubscribe, snapshot
- Options Trading: expiries, chain with LTP, select contracts, ATM buy/sell with offset
- Options Builder: multi‑leg builder and execute
- Portfolio: positions table, PnL, paper cash/equity/UPL, Exit/Exit All
- Orders: filters, auto‑refresh, CSV/PDF export, Demat orders, Reset paper
- Risk: SL/TP/Trailing config
- Header: structured menus, Light theme toggle, Compact density toggle

### 9) Deployment
- Render: set `rootDir: backend` in `render.yaml`; env vars: `ZERODHA_API_KEY`, `ZERODHA_API_SECRET`, `ZERODHA_USER_ID`, `ALLOWED_ORIGINS` (`*` or your Vercel domain). Build command: `pip install -r requirements.txt`; Start: `uvicorn app.server.app:app --port 10000`.
- Vercel: project root `frontend/`; defaults detect Next.js. Ensure `NEXT_PUBLIC_BACKEND_URL` env is set to your Render URL.

### 10) Troubleshooting
- WebSocket shows 400 upgrade / no data: ensure Zerodha login done today; verify Redirect URL in Kite Developer matches Vercel `/zerodha-callback` exactly; restart Render service.
- Options expiries/chain empty: backend will auto‑refresh instruments; confirm NFO/BFO enabled; try again.
- Prices 0.00 in options: backend now falls back to `quote()` when `ltp()` doesn’t populate derivatives; also uses latest WS tick if available.
- Vercel build “next: command not found”: set Install: `npm install`; Build: `npm run build` (or reset to defaults).

### 11) Environment (.env at repo root)
```
ZERODHA_API_KEY=xxx
ZERODHA_API_SECRET=xxx
ZERODHA_USER_ID=xxx
ACCESS_TOKEN=
ALLOWED_ORIGINS=*
PAPER_STARTING_CASH=100000
AI_DEFAULT_SYMBOLS=TCS INFY RELIANCE
AI_OPTIONS_UNDERLYINGS=NIFTY BANKNIFTY
AI_TRADE_CAPITAL=10000
AI_RISK_PCT=0.01
TRAILING_STOP_PCT=0.02
```

### 12) Safety
- Paper mode by default. Use the UI Trading Mode or `/config/dry_run` to switch to live.
- Always validate strategy logic on paper before live execution.
- Daily login is required by Zerodha; automated interactive login is not supported by API. The helper script streamlines token update.
- Use `--live` to place orders. Without it, the runner prints intended orders (paper trade mode).
- Always test strategies in dry-run before going live.


