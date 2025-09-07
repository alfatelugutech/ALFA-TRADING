"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tick = { instrument_token: number; last_price?: number; last_traded_price?: number; ltp?: number; symbol?: string; };
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function MarketData() {
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<any[]>([]);
  const [symbols, setSymbols] = useState<string>("TCS INFY RELIANCE");
  const [ticks, setTicks] = useState<Tick[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(backendUrl.replace(/^http/, "ws") + "/ws/ticks");
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (Array.isArray(data.ticks)) setTicks(data.ticks);
      } catch {}
    };
    ws.onclose = () => (wsRef.current = null);
    return () => ws.close();
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    const url = new URL(backendUrl + "/symbols/search");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("exchange", "NSE");
    const data = await (await fetch(url.toString())).json();
    setResults(data || []);
  };

  const subscribe = async () => {
    const list = symbols.split(/\s+/).filter(Boolean);
    await fetch(backendUrl + "/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: list, exchange: "NSE", mode: "ltp" }) });
  };
  const unsubscribe = async () => {
    const list = symbols.split(/\s+/).filter(Boolean);
    await fetch(backendUrl + "/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: list, exchange: "NSE", mode: "ltp" }) });
  };
  const ltp = async () => {
    const list = symbols.split(/\s+/).filter(Boolean);
    const url = new URL(backendUrl + "/ltp");
    url.searchParams.set("symbols", list.join(","));
    url.searchParams.set("exchange", "NSE");
    const data = await (await fetch(url.toString())).json();
    const rows: Tick[] = Object.entries(data || {}).map(([sym, price]) => ({ instrument_token: 0, ltp: Number(price || 0), symbol: sym }));
    setTicks(rows);
  };

  const rows = useMemo(() => {
    const allow = new Set(symbols.split(/\s+/).filter(Boolean).map((s) => s.toUpperCase()));
    return ticks
      .filter((t) => !allow.size || (t.symbol ? allow.has(String(t.symbol).toUpperCase()) : true))
      .slice(0, 200)
      .map((t) => {
        const price = t.last_price ?? t.last_traded_price ?? t.ltp ?? 0;
        return (
          <tr key={`${t.instrument_token}-${t.symbol}`}> 
            <td>{t.symbol}</td>
            <td style={{ textAlign: "right" }}>{price.toFixed(2)}</td>
          </tr>
        );
      });
  }, [ticks, symbols]);

  return (
    <main>
      <h2>Market Data</h2>
      <div className="card" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={symbols} onChange={(e) => setSymbols(e.target.value)} style={{ flex: 1, padding: 8 }} placeholder="Symbols e.g. TCS INFY RELIANCE" />
        <button className="btn btn-primary" onClick={subscribe}>Subscribe</button>
        <button className="btn" onClick={ltp}>Snapshot LTP</button>
        <button className="btn" onClick={unsubscribe}>Unsubscribe</button>
      </div>
      <div className="card" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, padding: 8 }} placeholder="Search NSE symbol or name" />
        <button className="btn" onClick={search}>Search</button>
      </div>
      {results.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>Results:</b> {results.map((r) => r.tradingsymbol).join(", ")}
        </div>
      )}
      <table className="table">
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


