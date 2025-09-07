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
  const [symbols, setSymbols] = useState<string>("TCS INFY");
  const [ticks, setTicks] = useState<Tick[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

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
    ws.onclose = () => {
      wsRef.current = null;
    };
    return () => ws.close();
  }, []);

  const subscribe = async () => {
    const list = symbols.split(/\s+/).filter(Boolean);
    await fetch(backendUrl + "/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: list, exchange: "NSE", mode: "ltp" }),
    });
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

  return (
    <main style={{ maxWidth: 900, margin: "20px auto", fontFamily: "sans-serif" }}>
      <h2>Zerodha Live Ticks</h2>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <input
          value={symbols}
          onChange={(e) => setSymbols(e.target.value)}
          style={{ flex: 1, padding: 8 }}
          placeholder="Symbols e.g. TCS INFY RELIANCE"
        />
        <button onClick={subscribe} style={{ padding: "8px 12px" }}>
          Subscribe
        </button>
      </div>
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


