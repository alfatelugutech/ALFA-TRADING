## Frontend (Next.js on Vercel)

Production UI for Zerodha Auto Trader: dashboard, market data, options trading and builder, portfolio, orders, analytics, risk management, with Light/Dark themes and Compact density mode.

### Local dev
```bash
npm i
npm run dev
```

Set `NEXT_PUBLIC_BACKEND_URL` in `.env.local`, e.g. `https://zerodha-auto-backend.onrender.com`.

### Zerodha Login via Frontend
- Home page shows a "Login with Zerodha" button.
- After login, Zerodha redirects back to `/zerodha-callback?request_token=...` on Vercel.
- The callback page will call backend `/auth/exchange` to complete login and refresh instruments.
- Make sure your Redirect URL in Kite Developer is set to your Vercel callback, e.g. `https://your-app.vercel.app/zerodha-callback`.

### Features
- Watchlist with subscribe/unsubscribe, snapshot LTP
- SMA/EMA start/stop, AI one‑click trading with capital and risk config
- Trading Mode switch (Paper/Live)
- Positions & PnL view, Exit and Exit All
- Orders page with auto refresh, filters, CSV/PDF export, Reset paper, Demat orders
- Options Trading: expiries, chain with LTP, select and trade, ATM buy/sell
- Options Builder: multi‑leg setup, preview/execute
- Risk page: SL, TP, Trailing stop
- Header menus, Light theme toggle, Compact density toggle


