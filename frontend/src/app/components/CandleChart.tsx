"use client";

import React, { useEffect, useMemo, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume: number };

export default function CandleChart({ symbol, exchange = "NSE" }: { symbol: string; exchange?: string }) {
  const [interval, setIntervalStr] = useState<string>("5minute");
  const [candles, setCandles] = useState<Candle[]>([]);

  const load = async () => {
    if (!symbol) return;
    const url = new URL(`${backendUrl}/history`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("exchange", exchange);
    url.searchParams.set("interval", interval);
    url.searchParams.set("count", "120");
    const data = await (await fetch(url.toString())).json();
    setCandles(data?.candles || []);
  };

  useEffect(() => { load(); }, [symbol, exchange, interval]);

  const { min, max } = useMemo(() => {
    const vals = candles.flatMap((c) => [c.low, c.high]);
    const mi = Math.min(...(vals.length ? vals : [0]));
    const ma = Math.max(...(vals.length ? vals : [1]));
    return { min: mi, max: ma };
  }, [candles]);

  const scaleY = (price: number) => {
    const denom = Math.max(1, max - min);
    return 260 - ((price - min) / denom) * 240 - 10;
  };

  const w = 600;
  const h = 260;
  const barW = Math.max(2, Math.floor((w - 40) / Math.max(1, candles.length)));

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <b>{symbol} • {interval}</b>
        <select value={interval} onChange={(e)=>setIntervalStr(e.target.value)}>
          <option value="minute">1m</option>
          <option value="3minute">3m</option>
          <option value="5minute">5m</option>
          <option value="10minute">10m</option>
          <option value="15minute">15m</option>
          <option value="30minute">30m</option>
          <option value="60minute">60m</option>
          <option value="day">1D</option>
        </select>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h }}>
        {candles.map((c, i) => {
          const x = 20 + i * barW + Math.floor(barW / 2);
          const color = c.close >= c.open ? "#22c55e" : "#ef4444";
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={scaleY(c.high)} y2={scaleY(c.low)} stroke={color} strokeWidth={1} />
              <rect x={x - Math.floor(barW / 2)} y={Math.min(scaleY(c.open), scaleY(c.close))} width={barW - 1} height={Math.max(2, Math.abs(scaleY(c.close) - scaleY(c.open)))} fill={color} />
            </g>
          );
        })}
        <rect x={0} y={0} width={w} height={h} fill="transparent" stroke="rgba(255,255,255,.06)" />
      </svg>
    </div>
  );
}


