## Frontend (Next.js on Vercel)

This is a minimal Next.js app to display live ticks from the backend WebSocket and basic subscribe controls.

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


