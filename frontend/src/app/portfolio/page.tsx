"use client";

import { useEffect, useState } from "react";

type PositionRec = { symbol: string; quantity: number; avg_price: number; ltp: number; unrealized: number };
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function Portfolio() {
  const [positions, setPositions] = useState<PositionRec[]>([]);
  const [pnl, setPnl] = useState<{ realized: number; unrealized: number } | null>(null);

  const load = async () => {
    setPositions(await (await fetch(backendUrl + "/positions")).json());
    setPnl(await (await fetch(backendUrl + "/pnl")).json());
  };

  useEffect(() => {
    load();
  }, []);

  const exportCsv = () => {
    if (!positions.length) return;
    const header = ["symbol","quantity","avg_price","ltp","unrealized"];
    const rows = positions.map(p => [p.symbol, String(p.quantity), p.avg_price.toFixed(2), p.ltp.toFixed(2), p.unrealized.toFixed(2)]);
    const csv = [header, ...rows].map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <h2>Portfolio</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={load} style={{ padding: "8px 12px" }}>Refresh</button>
        <button onClick={exportCsv} style={{ padding: "8px 12px" }}>Export CSV</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Symbol</th>
            <th style={{ textAlign: "right" }}>Qty</th>
            <th style={{ textAlign: "right" }}>Avg</th>
            <th style={{ textAlign: "right" }}>LTP</th>
            <th style={{ textAlign: "right" }}>Unrealized</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
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
      <div style={{ marginTop: 12, fontWeight: 600 }}>
        {pnl ? `Realized: ${pnl.realized.toFixed(2)} | Unrealized: ${pnl.unrealized.toFixed(2)}` : ""}
      </div>
    </main>
  );
}


