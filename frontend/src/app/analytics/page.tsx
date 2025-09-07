"use client";

import { useEffect, useMemo, useState } from "react";

type OrderRec = { ts: number; symbol: string; side: string; quantity: number; price: number; dry_run: boolean };
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function Analytics() {
  const [orders, setOrders] = useState<OrderRec[]>([]);
  const [pnl, setPnl] = useState<{ realized: number; unrealized: number } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const load = async () => {
    setLoading(true);
    try {
      const oResp = await fetch(backendUrl + "/orders");
      const o = await oResp.json();
      setOrders(Array.isArray(o) ? o : []);
    } catch { setOrders([]); }
    try {
      const pResp = await fetch(backendUrl + "/pnl");
      const p = await pResp.json();
      setPnl(p);
    } catch { setPnl(null); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const kpis = useMemo(() => {
    const total = orders.length;
    const buys = orders.filter((o) => o.side === "BUY").length;
    const sells = orders.filter((o) => o.side === "SELL").length;
    const live = orders.filter((o) => !o.dry_run).length;
    const paper = total - live;
    const symCount: Record<string, number> = {};
    for (const o of orders) symCount[o.symbol] = (symCount[o.symbol] || 0) + 1;
    const top = Object.entries(symCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { total, buys, sells, live, paper, top };
  }, [orders]);

  return (
    <main>
      <h2>Analytics</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={load} style={{ padding: "8px 12px" }}>{loading ? "Loading..." : "Refresh"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <div className="card"><div>Total Orders</div><div style={{ fontSize: 24, fontWeight: 700 }}>{kpis.total}</div></div>
        <div className="card"><div>BUY / SELL</div><div style={{ fontSize: 24, fontWeight: 700 }}>{kpis.buys} / {kpis.sells}</div></div>
        <div className="card"><div>LIVE / PAPER</div><div style={{ fontSize: 24, fontWeight: 700 }}>{kpis.live} / {kpis.paper}</div></div>
        <div className="card"><div>PNL (R/U)</div><div style={{ fontSize: 24, fontWeight: 700 }}>{pnl ? `${pnl.realized.toFixed(2)} / ${pnl.unrealized.toFixed(2)}` : "-"}</div></div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h4>Top Symbols (by orders)</h4>
        <table className="table">
          <thead><tr><th>Symbol</th><th style={{ textAlign: "right" }}>Count</th></tr></thead>
          <tbody>
            {kpis.top.map(([sym, cnt]) => (
              <tr key={sym}><td>{sym}</td><td style={{ textAlign: "right" }}>{cnt as number}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}


