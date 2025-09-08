"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import CandleChart from "../components/CandleChart";

type Tick = { instrument_token: number; last_price?: number; last_traded_price?: number; ltp?: number; symbol?: string; };
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function MarketData() {
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<any[]>([]);
  const [symbols, setSymbols] = useState<string>("TCS INFY RELIANCE");
  const [ticks, setTicks] = useState<Tick[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [chartSym, setChartSym] = useState<string>("");
  const [chartPrices, setChartPrices] = useState<number[]>([]);
  const [chartTimes, setChartTimes] = useState<string[]>([]);

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

  // Simple mini chart updater for a selected symbol
  useEffect(() => {
    if (!chartSym) return;
    const run = async () => {
      try {
        const data = await (await fetch(backendUrl + "/ltp?symbols=" + encodeURIComponent(chartSym) + "&exchange=NSE")).json();
        const price = Number((data || {})[chartSym] || 0);
        const now = new Date();
        const ts = now.toLocaleTimeString();
        setChartPrices((arr) => [...arr.slice(-59), price]);
        setChartTimes((arr) => [...arr.slice(-59), ts]);
      } catch {}
    };
    run();
    const id = setInterval(run, 5000);
    return () => clearInterval(id);
  }, [chartSym]);

  const rows = useMemo(() => {
    const allow = new Set(symbols.split(/\s+/).filter(Boolean).map((s) => s.toUpperCase()));
    const merged: Tick[] = [...ticks];
    if (chartSym && chartPrices.length) {
      merged.push({ instrument_token: 0, ltp: chartPrices[chartPrices.length - 1], symbol: chartSym });
    }
    return merged
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

      {/* Quick Live Chart */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input placeholder="Symbol for chart (e.g., TCS)" value={chartSym} onChange={(e)=>{ setChartPrices([]); setChartTimes([]); setChartSym(e.target.value.toUpperCase()); }} style={{ width: 260, padding: 8 }} />
          <button className="btn" onClick={()=>{ setChartPrices([]); setChartTimes([]); }}>Clear</button>
        </div>
        {chartSym && (
          <div style={{ width: "100%", height: 180 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
              <b>{chartSym}</b>
              <span>Price: {chartPrices.length ? Number(chartPrices[chartPrices.length-1]).toFixed(2) : "-"} · Updated: {chartTimes[chartTimes.length-1] || "-"}</span>
            </div>
            <svg viewBox="0 0 600 180" preserveAspectRatio="none" style={{ width: "100%", height: 180 }}>
              <polyline fill="none" stroke="#60a5fa" strokeWidth="2" points={chartPrices.map((p, i) => `${(i/(Math.max(1,chartPrices.length-1)))*600},${180 - ((p - Math.min(...chartPrices)) / Math.max(1,(Math.max(...chartPrices)-Math.min(...chartPrices)))) * 160 - 10}`).join(" ")} />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)" }}>
              {chartTimes.slice(-6).map((t,i)=>(<span key={i}>{t}</span>))}
            </div>
          </div>
        )}
      </div>

      {/* Candlestick Chart */}
      {chartSym && (
        <div style={{ marginTop: 16 }}>
          <CandleChart symbol={chartSym} exchange="NSE" />
        </div>
      )}
    </main>
  );
}


