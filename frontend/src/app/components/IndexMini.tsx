"use client";

import React, { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function IndexMini({ title, kiteKey }: { title: string; kiteKey: string }) {
  const [prices, setPrices] = useState<number[]>([]);
  const [times, setTimes] = useState<string[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await (await fetch(`${backendUrl}/quote?keys=${encodeURIComponent(kiteKey)}`)).json();
        const p = Number((data || {})[kiteKey] || 0);
        const ts = new Date().toLocaleTimeString();
        setPrices((arr) => [...arr.slice(-59), p]);
        setTimes((arr) => [...arr.slice(-59), ts]);
      } catch {}
    };
    run();
    const id = setInterval(run, 5000);
    return () => clearInterval(id);
  }, [kiteKey]);

  const min = Math.min(...(prices.length ? prices : [0]));
  const max = Math.max(...(prices.length ? prices : [1]));
  const denom = Math.max(1, max - min);
  const pts = prices.map((p, i) => `${(i / Math.max(1, prices.length - 1)) * 280},${120 - ((p - min) / denom) * 100 - 10}`).join(" ");

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <b>{title}</b>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>{prices[prices.length - 1]?.toFixed(2) || "-"}</span>
      </div>
      <svg viewBox="0 0 280 120" preserveAspectRatio="none" style={{ width: "100%", height: 120 }}>
        <polyline fill="none" stroke="#22c55e" strokeWidth="2" points={pts} />
      </svg>
    </div>
  );
}


