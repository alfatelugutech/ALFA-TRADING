"use client";

import { useEffect, useState } from "react";

type PositionRec = { symbol: string; quantity: number; avg_price: number; ltp: number; unrealized: number };
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function Portfolio() {
  const [positions, setPositions] = useState<PositionRec[]>([]);
  const [pnl, setPnl] = useState<{ realized: number; unrealized: number } | null>(null);
  const [paper, setPaper] = useState<{ paper_cash: number; paper_equity: number; paper_unrealized: number } | null>(null);

  const load = async () => {
    try {
      const posResp = await fetch(backendUrl + "/positions");
      const pos = await posResp.json();
      if (Array.isArray(pos)) {
        setPositions(pos);
        setPaper(null);
      } else {
        setPositions(Array.isArray(pos.positions) ? pos.positions : []);
        setPaper(pos.paper || null);
      }
    } catch { setPositions([]); setPaper(null); }
    try {
      const p = await (await fetch(backendUrl + "/pnl")).json();
      setPnl(p);
    } catch { setPnl(null); }
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
        <button
          onClick={async ()=>{ await fetch((process.env.NEXT_PUBLIC_BACKEND_URL || "") + "/squareoff/all", { method: "POST" }); load(); }}
          style={{ padding: "8px 12px" }}
        >Exit All</button>
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
              <td style={{ textAlign: "right" }}>{Number(p.avg_price || 0).toFixed(2)}</td>
              <td style={{ textAlign: "right" }}>{Number(p.ltp || 0).toFixed(2)}</td>
              <td style={{ textAlign: "right", color: (p.unrealized || 0) >= 0 ? "#0a0" : "#a00" }}>{Number(p.unrealized || 0).toFixed(2)}</td>
              <td style={{ textAlign: "center" }}>
                <button
                  onClick={async ()=>{ await fetch((process.env.NEXT_PUBLIC_BACKEND_URL || "") + "/squareoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: p.symbol }) }); load(); }}
                  style={{ padding: "4px 8px" }}
                >Exit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontWeight: 600 }}>
        {pnl ? `Realized: ${pnl.realized.toFixed(2)} | Unrealized: ${pnl.unrealized.toFixed(2)}` : ""}
      </div>
      {paper && (
        <div style={{ marginTop: 6 }}>
          Paper Cash: {paper.paper_cash.toFixed(2)} | Paper Equity: {paper.paper_equity.toFixed(2)} | Paper UPL: {paper.paper_unrealized.toFixed(2)}
        </div>
      )}
    </main>
  );
}


