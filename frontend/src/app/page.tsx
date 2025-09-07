"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tick = {
  instrument_token: number;
  last_price?: number;
  last_traded_price?: number;
  ltp?: number;
  symbol?: string;
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

  useEffect(() => {
    const ws = new WebSocket(backendUrl.replace(/^http/, "ws") + "/ws/ticks");
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (Array.isArray(data.ticks)) {
          setTicks(data.ticks);
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
    } catch {}
  }, [watchlist, exchange, mode]);

  const subscribe = async () => {
    const list = symbols.split(/\s+/).filter(Boolean);
    await fetch(backendUrl + "/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: list, exchange, mode }),
    });
    // Merge into watchlist
    const merged = Array.from(new Set([...(watchlist || []), ...list.map((s) => s.toUpperCase())]));
    setWatchlist(merged);
  };

  const subscribeWatchlist = async () => {
    if (!watchlist.length) return;
    await fetch(backendUrl + "/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: watchlist, exchange, mode }),
    });
  };

  const unsubscribeAll = async () => {
    if (!watchlist.length) return;
    await fetch(backendUrl + "/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: watchlist, exchange, mode }),
    });
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
        return (
          <tr key={t.instrument_token}>
            <td>{t.symbol}</td>
            <td style={{ textAlign: "right" }}>{price.toFixed(2)}</td>
          </tr>
        );
      });
  }, [ticks]);

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
    <main style={{ maxWidth: 900, margin: "20px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2>Zerodha Live Ticks</h2>
        <a
          href={loginUrl || "#"}
          style={{ textDecoration: "none", background: "#0969da", color: "#fff", padding: "8px 12px", borderRadius: 6 }}
        >
          Login with Zerodha
        </a>
      </div>
      {status && (
        <div style={{ marginBottom: 8, fontSize: 12, color: status.auth ? "#0a0" : "#a00" }}>
          {status.auth ? "Authenticated" : "Not authenticated"} · WS {wsConnected ? "Connected" : "Disconnected"}
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
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </main>
  );
}


