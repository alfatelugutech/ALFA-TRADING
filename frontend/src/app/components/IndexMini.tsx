"use client";

import React, { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function IndexMini({ title, kiteKey }: { title: string; kiteKey: string }) {
  const [prices, setPrices] = useState<number[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [err, setErr] = useState<string>("");
  const [interval, setIntervalStr] = useState<string>("day"); // minute|5minute|day

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        // Try candles first to support timeframe
        const url = new URL(`${backendUrl}/history`);
        url.searchParams.set("key", kiteKey);
        url.searchParams.set("interval", interval);
        url.searchParams.set("count", "60");
        const res = await fetch(url.toString());
        const data = await res.json();
        const candles = Array.isArray(data?.candles) ? data.candles : [];
        if (candles.length) {
          const p = candles.map((c: any) => Number(c.close || 0));
          const t = candles.map((c: any) => String(c.time || ""));
          if (!stopped) { setPrices(p); setTimes(t); setErr(""); }
          return;
        }
        // Fallback to quote for last price when no candles (off-market)
        const r = await fetch(`${backendUrl}/quote?keys=${encodeURIComponent(kiteKey)}`);
        const qd = await r.json();
        if (qd?.error) { if (!stopped) setErr(String(qd.error)); return; }
        const last = Number((qd || {})[kiteKey] || 0);
        const ts = new Date().toLocaleTimeString();
        if (!stopped) {
          setPrices((arr) => [...arr.slice(-59), last]);
          setTimes((arr) => [...arr.slice(-59), ts]);
          setErr("");
        }
      } catch {}
    };
    load();
    const id = setInterval(load, 5000);
    return () => { stopped = true; clearInterval(id); };
  }, [kiteKey, interval]);

  const min = Math.min(...(prices.length ? prices : [0]));
  const max = Math.max(...(prices.length ? prices : [1]));
  const denom = Math.max(1, max - min);
  const pts = prices.length > 0
    ? prices.map((p, i) => `${(i / Math.max(1, prices.length - 1)) * 280},${120 - ((p - min) / denom) * 100 - 10}`).join(" ")
    : "";

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <b>{title}</b>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select value={interval} onChange={(e)=>setIntervalStr(e.target.value)} style={{ fontSize: 12 }}>
            <option value="minute">1m</option>
            <option value="5minute">5m</option>
            <option value="day">1D</option>
          </select>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{prices.length ? prices[prices.length - 1].toFixed(2) : (err ? err : "-")}</span>
        </div>
      </div>
      <svg viewBox="0 0 280 120" preserveAspectRatio="none" style={{ width: "100%", height: 120 }}>
        {prices.length ? (
          <polyline fill="none" stroke="#22c55e" strokeWidth="2" points={pts} />
        ) : (
          <text x={140} y={60} textAnchor="middle" fill="var(--muted)" fontSize="10">No data</text>
        )}
      </svg>
    </div>
  );
}


