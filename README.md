## Zerodha Automated Trading Platform (Python)

This project scaffolds a production-ready Python framework to build automated trading strategies on Zerodha Kite (Market data via KiteTicker, order placement via REST). Includes configuration management, auth helper, live ticker streaming, strategy base class, example strategy, and CLI runner.

### 1) Prerequisites
- Python 3.10+
- Zerodha account with Kite API access (get your API Key/Secret)

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

### 4) Download Instruments (once per day or when needed)
```powershell
python backend/scripts/download_instruments.py
```
This saves a fresh instruments CSV to `data/instruments.csv` for symbol lookup.

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

### 9) Notes
- Daily login is required by Zerodha; automated interactive login is not supported by API. The helper script streamlines token update.
- Use `--live` to place orders. Without it, the runner prints intended orders (paper trade mode).
- Always test strategies in dry-run before going live.


