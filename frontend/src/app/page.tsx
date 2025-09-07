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

type OrderRec = {
  ts: number;
  symbol: string;
  exchange: string;
  side: string;
  quantity: number;
  price: number;
  dry_run: boolean;
  source: string;
};

type PositionRec = {
  symbol: string;
  quantity: number;
  avg_price: number;
  ltp: number;
  unrealized: number;
};

type ChainRec = { tradingsymbol: string; strike: number; instrument_token: number; type: string };

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
  const [orders, setOrders] = useState<OrderRec[]>([]);
  const [positions, setPositions] = useState<PositionRec[]>([]);
  const [pnlState, setPnlState] = useState<{ realized: number; unrealized: number } | null>(null);
  const [optUnder, setOptUnder] = useState<string>("NIFTY");
  const [optExp, setOptExp] = useState<string>("");
  const [optCount, setOptCount] = useState<number>(10);
  const [expiries, setExpiries] = useState<string[]>([]);
  const [chain, setChain] = useState<{ ce: ChainRec[]; pe: ChainRec[]; strikes: number[] }>({ ce: [], pe: [], strikes: [] });
  // Scheduler
  const [schedEnabled, setSchedEnabled] = useState<boolean>(false);
  const [schedStrategy, setSchedStrategy] = useState<string>("sma");
  const [schedShort, setSchedShort] = useState<number>(20);
  const [schedLong, setSchedLong] = useState<number>(50);
  const [schedLive, setSchedLive] = useState<boolean>(false);
  const [schedStart, setSchedStart] = useState<string>("09:15");
  const [schedStop, setSchedStop] = useState<string>("15:25");
  const [schedSquare, setSchedSquare] = useState<boolean>(true);
  const [schedSymbols, setSchedSymbols] = useState<string>("");
  const [aiActive, setAiActive] = useState<boolean>(false);
  const [aiCapital, setAiCapital] = useState<number>(10000);
  const [aiRisk, setAiRisk] = useState<number>(1);

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
    // Load schedule
    fetch(backendUrl + "/schedule")
      .then((r) => r.json())
      .then((d) => {
        const c = d?.config || {};
        setSchedEnabled(!!c.enabled);
        setSchedStrategy(c.strategy || "sma");
        setSchedShort(Number(c.short || 20));
        setSchedLong(Number(c.long || 50));
        setSchedLive(!!c.live);
        setSchedStart(c.start || "09:15");
        setSchedStop(c.stop || "15:25");
        setSchedSquare(!!c.square_off_eod);
        setSchedSymbols((c.symbols || []).join(" "));
      })
      .catch(() => {});
    fetch(backendUrl + "/status/all")
      .then((r)=>r.json())
      .then((d)=>{
        if (d?.ai) {
          setAiActive(!!d.ai.active);
          setAiCapital(Number(d.ai.trade_capital || 10000));
          setAiRisk(Number((d.ai.risk_pct || 0.01) * 100));
        }
      }).catch(()=>{});
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
    <main className={dark ? "dark" : ""} style={{ maxWidth: 1000, margin: "20px auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2>Zerodha Live Ticks</h2>
        <a
          href={loginUrl || "#"}
          style={{ textDecoration: "none", background: "#0969da", color: "#fff", padding: "8px 12px", borderRadius: 6 }}
        >
          Login with Zerodha
        </a>
      </div>
      <div className="card" style={{ marginBottom: 8 }}>
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
      <div className="card" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
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
      <div className="card" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
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
            const short = Number(prompt("Short EMA", "12") || 12);
            const long = Number(prompt("Long EMA", "26") || 26);
            const live = confirm("Live trading? OK for Live, Cancel for Paper");
            const list = watchlist.length ? watchlist : symbols.split(/\s+/).filter(Boolean);
            await fetch(backendUrl + "/strategy/ema/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ symbols: list, exchange, short, long, live }),
            });
            pushToast(`EMA started (${short}/${long}) ${live ? "LIVE" : "PAPER"}`, "success");
          }}
          style={{ padding: "8px 12px" }}
        >
          Start EMA
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
        <div className="card" style={{ marginBottom: 12, fontSize: 14 }}>
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
        <div className="card" style={{ marginBottom: 12, fontSize: 14 }}>
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
      <table className="table">
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
        <button
          onClick={async () => {
            const sl = Number(prompt("Stop-loss % (e.g., 2 for 2%)", "2") || 2) / 100;
            const tp = Number(prompt("Take-profit % (optional)", "0") || 0) / 100;
            const auto = confirm("Enable auto close? OK=yes, Cancel=no");
            await fetch(backendUrl + "/risk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sl_pct: sl, tp_pct: tp, auto_close: auto }),
            });
            pushToast("Risk settings updated", "success");
          }}
          style={{ padding: "8px 12px" }}
        >
          Risk Settings
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

      {/* Orders & PnL tables */}
      <section className="card" style={{ marginTop: 24 }}>
        <h3>Orders</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={async () => {
              const data = await (await fetch(backendUrl + "/orders")).json();
              setOrders(data);
            }}
            style={{ padding: "6px 10px" }}
          >
            Refresh
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setOrders(orders.slice().sort((a,b)=>a.ts-b.ts))}>Time</th>
              <th style={{ textAlign: "left" }}>Side</th>
              <th style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setOrders(orders.slice().sort((a,b)=>a.symbol.localeCompare(b.symbol)))}>Symbol</th>
              <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => setOrders(orders.slice().sort((a,b)=>a.quantity-b.quantity))}>Qty</th>
              <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => setOrders(orders.slice().sort((a,b)=>a.price-b.price))}>Price</th>
              <th style={{ textAlign: "center" }}>Mode</th>
              <th style={{ textAlign: "left" }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(-100).reverse().map((o) => (
              <tr key={`${o.ts}-${o.symbol}-${o.side}-${o.price}`}>
                <td>{new Date(o.ts).toLocaleTimeString()}</td>
                <td style={{ color: o.side === "BUY" ? "#0a0" : "#a00" }}>{o.side}</td>
                <td>{o.symbol}</td>
                <td style={{ textAlign: "right" }}>{o.quantity}</td>
                <td style={{ textAlign: "right" }}>{o.price.toFixed(2)}</td>
                <td style={{ textAlign: "center" }}>{o.dry_run ? "PAPER" : "LIVE"}</td>
                <td>{o.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 6, fontSize: 12 }}>Showing last {Math.min(orders.length, 100)} orders</div>
      </section>

      {/* Auto Trading Schedule */}
      <section className="card" style={{ marginTop: 24 }}>
        <h3>Auto Trading Schedule</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={schedEnabled} onChange={(e) => setSchedEnabled(e.target.checked)} /> Enabled
          </label>
          <select value={schedStrategy} onChange={(e) => setSchedStrategy(e.target.value)}>
            <option value="sma">SMA</option>
            <option value="ema">EMA</option>
          </select>
          <input value={schedShort} onChange={(e) => setSchedShort(Number(e.target.value || 20))} placeholder="Short" />
          <input value={schedLong} onChange={(e) => setSchedLong(Number(e.target.value || 50))} placeholder="Long" />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={schedLive} onChange={(e) => setSchedLive(e.target.checked)} /> Live
          </label>
          <div />
          <input value={schedStart} onChange={(e) => setSchedStart(e.target.value)} placeholder="Start HH:MM" />
          <input value={schedStop} onChange={(e) => setSchedStop(e.target.value)} placeholder="Stop HH:MM" />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={schedSquare} onChange={(e) => setSchedSquare(e.target.checked)} /> Square-off EOD
          </label>
          <input
            value={schedSymbols}
            onChange={(e) => setSchedSymbols(e.target.value)}
            placeholder="Symbols (space separated)"
            style={{ gridColumn: "1 / span 6" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="btn btn-primary"
            onClick={async () => {
              await fetch(backendUrl + "/schedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  enabled: schedEnabled,
                  strategy: schedStrategy,
                  symbols: schedSymbols.split(/\s+/).filter(Boolean),
                  exchange,
                  short: schedShort,
                  long: schedLong,
                  live: schedLive,
                  start: schedStart,
                  stop: schedStop,
                  square_off_eod: schedSquare,
                }),
              });
              pushToast("Schedule saved", "success");
            }}
          >
            Save Schedule
          </button>
          <button
            className="btn btn-success"
            onClick={async () => {
              const list = schedSymbols.split(/\s+/).filter(Boolean);
              if (!list.length) { pushToast("No symbols", "error"); return; }
              if (schedStrategy === "ema") {
                await fetch(backendUrl + "/strategy/ema/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: list, exchange, short: schedShort, long: schedLong, live: schedLive }) });
              } else {
                await fetch(backendUrl + "/strategy/sma/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: list, exchange, short: schedShort, long: schedLong, live: schedLive }) });
              }
              pushToast("Strategy started", "success");
            }}
          >
            Start Now
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await fetch(backendUrl + "/strategy/stop", { method: "POST" });
              pushToast("Strategy stopped", "success");
            }}
          >
            Stop Now
          </button>
        </div>
      </section>

      {/* AI Trading Controls */}
      <section className="card" style={{ marginTop: 24 }}>
        <h3>AI Trading</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={aiActive} onChange={(e)=>setAiActive(e.target.checked)} /> Enable AI
          </label>
          <input type="number" value={aiCapital} onChange={(e)=>setAiCapital(Number(e.target.value || 0))} placeholder="Trade capital" />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" value={aiRisk} onChange={(e)=>setAiRisk(Number(e.target.value || 0))} placeholder="Risk %" /> % per trade
          </div>
          <button className="btn btn-primary" onClick={async ()=>{
            await fetch(backendUrl + "/ai/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: aiActive, trade_capital: aiCapital, risk_pct: aiRisk/100 }) });
            pushToast("AI config saved", "success");
          }}>Save AI Config</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-success" onClick={async ()=>{
            // save + start
            await fetch(backendUrl + "/ai/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true, trade_capital: aiCapital, risk_pct: aiRisk/100 }) });
            await fetch(backendUrl + "/ai/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: "sma" }) });
            pushToast("AI trading started", "success");
          }}>Start AI</button>
          <button className="btn btn-danger" onClick={async ()=>{
            await fetch(backendUrl + "/ai/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false, trade_capital: aiCapital, risk_pct: aiRisk/100 }) });
            await fetch(backendUrl + "/strategy/stop", { method: "POST" });
            pushToast("AI trading stopped", "success");
          }}>Stop AI</button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h3>Positions & PnL</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={async () => setPositions(await (await fetch(backendUrl + "/positions")).json())} style={{ padding: "6px 10px" }}>Refresh Positions</button>
          <button onClick={async () => setPnlState(await (await fetch(backendUrl + "/pnl")).json())} style={{ padding: "6px 10px" }}>Refresh PnL</button>
          <button
            onClick={() => {
              if (!positions.length) { pushToast("No positions to export", "info"); return; }
              const header = ["symbol","quantity","avg_price","ltp","unrealized"];
              const rows = positions.map(p => [p.symbol, String(p.quantity), p.avg_price.toFixed(2), p.ltp.toFixed(2), p.unrealized.toFixed(2)]);
              const csv = [header, ...rows].map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `positions_${Date.now()}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{ padding: "6px 10px" }}
          >
            Export CSV
          </button>
          <button
            onClick={() => {
              if (!positions.length) { pushToast("No positions to export", "info"); return; }
              const rows = positions.map(p => `<tr><td>${p.symbol}</td><td style='text-align:right'>${p.quantity}</td><td style='text-align:right'>${p.avg_price.toFixed(2)}</td><td style='text-align:right'>${p.ltp.toFixed(2)}</td><td style='text-align:right'>${p.unrealized.toFixed(2)}</td></tr>`).join("");
              const w = window.open("", "_blank");
              if (!w) return;
              w.document.write(`<html><head><title>Positions</title></head><body><h3>Positions</h3><table border='1' cellspacing='0' cellpadding='4' style='border-collapse:collapse;width:100%'><thead><tr><th>Symbol</th><th>Qty</th><th>Avg</th><th>LTP</th><th>Unrealized</th></tr></thead><tbody>${rows}</tbody></table><script>window.print();</script></body></html>`);
              w.document.close();
            }}
            style={{ padding: "6px 10px" }}
          >
            Export PDF
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setPositions(positions.slice().sort((a,b)=>a.symbol.localeCompare(b.symbol)))}>Symbol</th>
              <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => setPositions(positions.slice().sort((a,b)=>a.quantity-b.quantity))}>Qty</th>
              <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => setPositions(positions.slice().sort((a,b)=>a.avg_price-b.avg_price))}>Avg</th>
              <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => setPositions(positions.slice().sort((a,b)=>a.ltp-b.ltp))}>LTP</th>
              <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => setPositions(positions.slice().sort((a,b)=>a.unrealized-b.unrealized))}>Unrealized</th>
            </tr>
          </thead>
          <tbody>
            {positions.slice(0, 100).map((p) => (
              <tr key={p.symbol}>
                <td>{p.symbol}</td>
                <td style={{ textAlign: "right" }}>{p.quantity}</td>
                <td style={{ textAlign: "right" }}>{p.avg_price.toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{p.ltp.toFixed(2)}</td>
                <td style={{ textAlign: "right", color: p.unrealized >= 0 ? "#0a0" : "#a00" }}>{p.unrealized.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 8, fontWeight: 600 }}>
          {pnlState ? `Realized: ${pnlState.realized.toFixed(2)} | Unrealized: ${pnlState.unrealized.toFixed(2)}` : ""}
        </div>
      </section>

      {/* Options Chain */}
      <section className="card" style={{ marginTop: 24 }}>
        <h3>Options Chain (NFO)</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <select value={optUnder} onChange={(e) => setOptUnder(e.target.value)}>
            <option value="NIFTY">NIFTY</option>
            <option value="BANKNIFTY">BANKNIFTY</option>
            <option value="SENSEX">SENSEX</option>
            <option value="FINNIFTY">FINNIFTY</option>
          </select>
          <select value={optExp} onChange={(e) => setOptExp(e.target.value)}>
            <option value="">Select expiry</option>
            {expiries.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <input value={optCount} onChange={(e) => setOptCount(Number(e.target.value || 10))} style={{ width: 80, padding: 6 }} />
          <button
            onClick={async () => {
              if (!optExp) {
                const exps = await (await fetch(`${backendUrl}/options/expiries?underlying=${optUnder}`)).json();
                setExpiries(exps);
              } else {
                const data = await (await fetch(`${backendUrl}/options/chain?underlying=${optUnder}&expiry=${optExp}&count=${optCount}`)).json();
                setChain(data);
              }
            }}
            style={{ padding: "6px 10px" }}
          >
            Load
          </button>
          <button
            onClick={() => {
              const list: string[] = [...(chain.ce || []), ...(chain.pe || [])].map((x: any) => x.tradingsymbol);
              const merged = Array.from(new Set([...(watchlist || []), ...list]));
              setWatchlist(merged);
              pushToast(`Added ${list.length} contracts to watchlist`, "success");
            }}
            style={{ padding: "6px 10px" }}
          >
            Add to Watchlist
          </button>
          <button
            onClick={() => {
              const rows = [
                ["type", "strike", "symbol", "instrument_token"],
                ...([...(chain.ce || []), ...(chain.pe || [])] as any[]).map((r: any) => [
                  r.type,
                  String(r.strike),
                  r.tradingsymbol,
                  String(r.instrument_token),
                ]),
              ];
              const csv = rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `options_${optUnder}_${optExp || 'exp'}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{ padding: "6px 10px" }}
          >
            Export CSV
          </button>
          <button
            onClick={() => {
              const rows = [...(chain.ce || []), ...(chain.pe || [])]
                .map((r: any) => `<tr><td>${r.type}</td><td style='text-align:right'>${Number(r.strike).toFixed(2)}</td><td>${r.tradingsymbol}</td><td>${r.instrument_token}</td></tr>`) 
                .join("");
              const w = window.open("", "_blank");
              if (!w) return;
              w.document.write(`<html><head><title>Options ${optUnder} ${optExp}</title></head><body><h3>Options ${optUnder} ${optExp}</h3><table border='1' cellspacing='0' cellpadding='4' style='border-collapse:collapse;width:100%'><thead><tr><th>Type</th><th>Strike</th><th>Symbol</th><th>Token</th></tr></thead><tbody>${rows}</tbody></table><script>window.print();</script></body></html>`);
              w.document.close();
            }}
            style={{ padding: "6px 10px" }}
          >
            Export PDF
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <h4>Calls (CE)</h4>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ textAlign: "right" }}>Strike</th>
                  <th style={{ textAlign: "left" }}>Symbol</th>
                </tr>
              </thead>
              <tbody>
                {chain.ce.map((r) => (
                  <tr key={r.tradingsymbol}>
                    <td style={{ textAlign: "right" }}>{r.strike.toFixed(2)}</td>
                    <td>{r.tradingsymbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4>Puts (PE)</h4>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ textAlign: "right" }}>Strike</th>
                  <th style={{ textAlign: "left" }}>Symbol</th>
                </tr>
              </thead>
              <tbody>
                {chain.pe.map((r) => (
                  <tr key={r.tradingsymbol}>
                    <td style={{ textAlign: "right" }}>{r.strike.toFixed(2)}</td>
                    <td>{r.tradingsymbol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}


