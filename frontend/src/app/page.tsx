"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tick = {
  instrument_token: number;
  last_price?: number;
  last_traded_price?: number;
  ltp?: number;
  symbol?: string;
  updated_at?: number;
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function Home() {
  const [symbols, setSymbols] = useState<string>("TCS INFY RELIANCE");
  const [ticks, setTicks] = useState<Tick[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [loginUrl, setLoginUrl] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [results, setResults] = useState<{ tradingsymbol: string; exchange: string }[]>([]);
  const [exchange, setExchange] = useState<string>("NSE");
  const [mode, setMode] = useState<"ltp" | "full">("ltp");
  const [status, setStatus] = useState<{ auth: boolean } | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [dark, setDark] = useState<boolean>(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: "info" | "success" | "error" }[]>([]);

  useEffect(() => {
    const ws = new WebSocket(backendUrl.replace(/^http/, "ws") + "/ws/ticks");
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (Array.isArray(data.ticks)) {
          const ts = Date.now();
          setTicks(data.ticks.map((t: any) => ({ ...t, updated_at: ts })));
        }
      } catch {}
    };
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => {
      wsRef.current = null;
      setWsConnected(false);
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    // Prefetch login URL
    fetch(backendUrl + "/auth/login_url")
      .then((r) => r.json())
      .then((d) => setLoginUrl(d.url || ""))
      .catch(() => {});
    fetch(backendUrl + "/status")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setStatus(null));
  }, []);

  // Initialize watchlist from localStorage (or default from symbols input)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("watchlist");
      const ex = localStorage.getItem("exchange");
      const md = localStorage.getItem("mode") as any;
      if (saved) setWatchlist(JSON.parse(saved));
      else setWatchlist(symbols.split(/\s+/).filter(Boolean));
      if (ex) setExchange(ex);
      if (md === "ltp" || md === "full") setMode(md);
    } catch {}
  }, []);

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem("watchlist", JSON.stringify(watchlist));
      localStorage.setItem("exchange", exchange);
      localStorage.setItem("mode", mode);
      localStorage.setItem("dark", dark ? "1" : "0");
    } catch {}
  }, [watchlist, exchange, mode, dark]);

  useEffect(() => {
    try {
      const d = localStorage.getItem("dark");
      if (d === "1") setDark(true);
    } catch {}
  }, []);

  const pushToast = (text: string, kind: "info" | "success" | "error" = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  const subscribeSymbols = async (list: string[]) => {
    if (!list.length) return;
    try {
      await fetch(backendUrl + "/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: list, exchange, mode }),
      });
      pushToast(`Subscribed ${list.length} symbol(s)`, "success");
    } catch {
      pushToast("Subscribe failed", "error");
    }
  };

  const unsubscribeSymbols = async (list: string[]) => {
    if (!list.length) return;
    try {
      await fetch(backendUrl + "/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: list, exchange, mode }),
      });
      pushToast(`Unsubscribed ${list.length} symbol(s)`, "success");
    } catch {
      pushToast("Unsubscribe failed", "error");
    }
  };

  const subscribe = async () => {
    const list = symbols.split(/\s+/).filter(Boolean);
    await subscribeSymbols(list);
    // Merge into watchlist
    const merged = Array.from(new Set([...(watchlist || []), ...list.map((s) => s.toUpperCase())]));
    setWatchlist(merged);
  };

  const subscribeWatchlist = async () => {
    if (!watchlist.length) return;
    await subscribeSymbols(watchlist);
  };

  const unsubscribeAll = async () => {
    if (!watchlist.length) return;
    await unsubscribeSymbols(watchlist);
  };

  const clearWatchlist = async () => {
    await unsubscribeAll();
    setWatchlist([]);
    setTicks([]);
  };

  const addSymbol = (sym: string) => {
    const up = sym.toUpperCase();
    if (!up) return;
    if (watchlist.includes(up)) return;
    setWatchlist([...watchlist, up]);
  };

  const loadLtpSnapshot = async () => {
    const list = watchlist.length ? watchlist : symbols.split(/\s+/).filter(Boolean);
    if (!list.length) return;
    const url = new URL(backendUrl + "/ltp");
    url.searchParams.set("symbols", list.join(","));
    url.searchParams.set("exchange", exchange);
    const data = await (await fetch(url.toString())).json();
    const rows: Tick[] = Object.entries(data || {}).map(([sym, price]) => ({
      instrument_token: 0,
      ltp: Number(price || 0),
      symbol: sym,
    }));
    setTicks(rows);
  };

  const rows = useMemo(() => {
    return ticks
      .slice()
      .sort((a, b) => (a.symbol || "").localeCompare(b.symbol || ""))
      .map((t) => {
        const price = t.last_price ?? t.last_traded_price ?? t.ltp ?? 0;
        const updated = t.updated_at ? new Date(t.updated_at).toLocaleTimeString() : "-";
        return (
          <tr key={t.instrument_token}>
            <td>{t.symbol}</td>
            <td style={{ textAlign: "right" }}>{price.toFixed(2)}</td>
            <td style={{ textAlign: "center", fontSize: 12 }}>{exchange}/{mode.toUpperCase()}</td>
            <td style={{ textAlign: "center", fontSize: 12 }}>{updated}</td>
          </tr>
        );
      });
  }, [ticks, exchange, mode]);

  const runSearch = async () => {
    if (!search.trim()) return;
    const url = new URL(backendUrl + "/symbols/search");
    url.searchParams.set("q", search.trim());
    url.searchParams.set("exchange", "NSE");
    const resp = await fetch(url.toString());
    const data = await resp.json();
    setResults(data || []);
  };

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "20px auto",
        fontFamily: "sans-serif",
        color: dark ? "#e6edf3" : "#111",
        background: dark ? "#0d1117" : "#fff",
        minHeight: "100vh",
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2>Zerodha Live Ticks</h2>
        <a
          href={loginUrl || "#"}
          style={{ textDecoration: "none", background: "#0969da", color: "#fff", padding: "8px 12px", borderRadius: 6 }}
        >
          Login with Zerodha
        </a>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} style={{ marginRight: 6 }} />
          Dark mode
        </label>
      </div>
      {status && (
        <div style={{ marginBottom: 8, fontSize: 12, color: status.auth ? "#0a0" : "#a00" }}>
          {status.auth ? "Authenticated" : "Not authenticated"} · WS {wsConnected ? "Connected" : "Disconnected"} · Mode {status.dry_run ? "Paper" : "Live"}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <select value={exchange} onChange={(e) => setExchange(e.target.value)}>
          <option value="NSE">NSE</option>
          <option value="BSE">BSE</option>
          <option value="NFO">NFO</option>
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as any)}>
          <option value="ltp">LTP</option>
          <option value="full">Full</option>
        </select>
        <input
          value={symbols}
          onChange={(e) => setSymbols(e.target.value)}
          style={{ flex: 1, padding: 8 }}
          placeholder="Symbols e.g. TCS INFY RELIANCE"
        />
        <button onClick={subscribe} style={{ padding: "8px 12px" }}>
          Subscribe
        </button>
        <button onClick={subscribeWatchlist} style={{ padding: "8px 12px" }}>
          Subscribe Watchlist
        </button>
        <button onClick={loadLtpSnapshot} style={{ padding: "8px 12px" }}>
          Snapshot LTP
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: 8 }}
          placeholder="Search symbol by name or code (NSE)"
        />
        <button onClick={runSearch} style={{ padding: "8px 12px" }}>
          Search
        </button>
        <button
          onClick={async () => {
            const short = Number(prompt("Short SMA", "20") || 20);
            const long = Number(prompt("Long SMA", "50") || 50);
            const live = confirm("Live trading? OK for Live, Cancel for Paper");
            const list = watchlist.length ? watchlist : symbols.split(/\s+/).filter(Boolean);
            await fetch(backendUrl + "/strategy/sma/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ symbols: list, exchange, short, long, live }),
            });
            pushToast(`SMA started (${short}/${long}) ${live ? "LIVE" : "PAPER"}`, "success");
          }}
          style={{ padding: "8px 12px" }}
        >
          Start SMA
        </button>
        <button
          onClick={async () => {
            await fetch(backendUrl + "/strategy/stop", { method: "POST" });
            pushToast("Strategy stopped", "success");
          }}
          style={{ padding: "8px 12px" }}
        >
          Stop SMA
        </button>
        <button
          onClick={async () => {
            const wantLive = confirm("Switch to LIVE mode? (Cancel switches to PAPER)");
            await fetch(backendUrl + "/config/dry_run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ value: !wantLive ? true : false }),
            });
            pushToast(wantLive ? "Live mode set" : "Paper mode set", "success");
          }}
          style={{ padding: "8px 12px" }}
        >
          Toggle Paper/Live
        </button>
      </div>
      {results.length > 0 && (
        <div style={{ marginBottom: 12, fontSize: 14 }}>
          <b>Results:</b>{" "}
          {results.map((r) => (
            <button
              key={r.tradingsymbol}
              onClick={() => addSymbol(r.tradingsymbol)}
              style={{ marginRight: 6, padding: "4px 8px" }}
            >
              {r.tradingsymbol}
            </button>
          ))}
        </div>
      )}
      {watchlist.length > 0 && (
        <div style={{ marginBottom: 12, fontSize: 14 }}>
          <b>Watchlist:</b>{" "}
          {watchlist.map((s) => (
            <span key={s} style={{ border: "1px solid #ccc", padding: "2px 6px", borderRadius: 12, marginRight: 6 }}>
              {s}{" "}
              <button onClick={() => subscribeSymbols([s])} style={{ marginLeft: 4 }}>▶</button>
              <button onClick={() => unsubscribeSymbols([s])} style={{ marginLeft: 4 }}>⏸</button>
              <button onClick={() => setWatchlist(watchlist.filter((x) => x !== s))} style={{ marginLeft: 4 }}>
                ×
              </button>
            </span>
          ))}
          <button onClick={unsubscribeAll} style={{ marginLeft: 12, padding: "4px 8px" }}>Unsubscribe All</button>
          <button onClick={clearWatchlist} style={{ marginLeft: 6, padding: "4px 8px" }}>Clear</button>
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Symbol</th>
            <th style={{ textAlign: "right" }}>Price</th>
            <th style={{ textAlign: "center" }}>X/M</th>
            <th style={{ textAlign: "center" }}>Updated</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button
          onClick={async () => {
            const data = await (await fetch(backendUrl + "/pnl")).json();
            pushToast(`PnL → Realized: ${data.realized}, Unrealized: ${data.unrealized}`, "info");
          }}
          style={{ padding: "8px 12px" }}
        >
          Refresh PnL
        </button>
        <button
          onClick={async () => {
            const data = await (await fetch(backendUrl + "/orders")).json();
            const last = data.slice(-5).map((o: any) => `${o.side} ${o.symbol} @ ${o.price}`).join(" | ");
            pushToast(last || "No orders yet", "info");
          }}
          style={{ padding: "8px 12px" }}
        >
          Show Last Orders
        </button>
      </div>

      <div style={{ position: "fixed", top: 16, right: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: t.kind === "error" ? "#fee2e2" : t.kind === "success" ? "#dcfce7" : "#e5e7eb",
              color: "#111",
              padding: "8px 12px",
              borderRadius: 8,
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              minWidth: 220,
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}


