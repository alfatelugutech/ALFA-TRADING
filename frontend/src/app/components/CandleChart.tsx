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
  const rightAxis = 50; // reserved for price labels
  const leftPad = 20;
  const barW = Math.max(2, Math.floor(((w - rightAxis) - leftPad) / Math.max(1, candles.length)));

  const lastPrice = candles.length ? candles[candles.length - 1].close : undefined;
  const denom = Math.max(1, max - min);
  const yTicks = useMemo(() => {
    const ticks = 4;
    const arr: { y: number; val: number }[] = [];
    for (let i = 0; i <= ticks; i++) {
      const val = min + (denom * (i / ticks));
      arr.push({ y: scaleY(val), val });
    }
    return arr;
  }, [min, max]);

  const xTicks = useMemo(() => {
    const labels: { x: number; label: string }[] = [];
    if (!candles.length) return labels;
    const count = Math.min(6, candles.length);
    const step = Math.max(1, Math.floor(candles.length / count));
    for (let i = 0; i < candles.length; i += step) {
      const c = candles[i];
      const d = new Date(c.time);
      const label = interval === "day" ? d.toLocaleDateString() : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const x = leftPad + i * barW + Math.floor(barW / 2);
      labels.push({ x, label });
    }
    return labels;
  }, [candles, interval]);

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
        {/* Baseline when no data */}
        {candles.length === 0 && (
          <text x={w/2} y={h/2} textAnchor="middle" fill="var(--muted)" fontSize="12">No candles (check auth/market hours)</text>
        )}
        {/* Price axis on right */}
        {yTicks.map((t, idx) => (
          <g key={`yt-${idx}`}>
            <line x1={leftPad} x2={w - rightAxis} y1={t.y} y2={t.y} stroke="rgba(255,255,255,.05)" />
            <text x={w - 6} y={t.y + 4} textAnchor="end" fill="var(--muted)" fontSize="10">{t.val.toFixed(2)}</text>
          </g>
        ))}
        {/* Candles */}
        {candles.map((c, i) => {
          const x = leftPad + i * barW + Math.floor(barW / 2);
          const color = c.close >= c.open ? "#22c55e" : "#ef4444";
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={scaleY(c.high)} y2={scaleY(c.low)} stroke={color} strokeWidth={1} />
              <rect x={x - Math.floor(barW / 2)} y={Math.min(scaleY(c.open), scaleY(c.close))} width={barW - 1} height={Math.max(2, Math.abs(scaleY(c.close) - scaleY(c.open)))} fill={color} />
            </g>
          );
        })}
        {/* Last price marker */}
        {lastPrice !== undefined && (
          <g>
            <line x1={leftPad} x2={w - rightAxis} y1={scaleY(lastPrice)} y2={scaleY(lastPrice)} stroke="#60a5fa" strokeDasharray="4 4" />
            <rect x={w - rightAxis + 4} y={scaleY(lastPrice) - 10} width={rightAxis - 8} height={20} fill="#1f2937" stroke="#60a5fa" />
            <text x={w - 8} y={scaleY(lastPrice) + 5} textAnchor="end" fill="#60a5fa" fontSize={12}>{lastPrice.toFixed(2)}</text>
          </g>
        )}
        {/* Time axis */}
        {xTicks.map((t, idx) => (
          <text key={`xt-${idx}`} x={t.x} y={h - 4} textAnchor="middle" fill="var(--muted)" fontSize="10">{t.label}</text>
        ))}
        <rect x={0} y={0} width={w} height={h} fill="transparent" stroke="rgba(255,255,255,.06)" />
      </svg>
    </div>
  );
}


