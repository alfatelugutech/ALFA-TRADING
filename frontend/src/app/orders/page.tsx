"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";

type OrderRec = {
  ts: number;
  symbol: string;
  exchange: string;
  side: string;
  quantity: number;
  price: number;
  dry_run: boolean;
  source: string;
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRec[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [auto, setAuto] = useState<boolean>(true);
  const [intervalMs, setIntervalMs] = useState<number>(5000);
  const [side, setSide] = useState<string>("ALL");
  const [query, setQuery] = useState<string>("");
  const [demat, setDemat] = useState<any[]>([]);
  const [resetCash, setResetCash] = useState<string>("");
  const [strategyStats, setStrategyStats] = useState<any>({});
  const [pnl, setPnl] = useState<{ 
    realized: number; 
    unrealized: number; 
    total: number;
    paper: { realized: number; unrealized: number; total: number };
    live: { realized: number; unrealized: number; total: number };
  } | null>(null);
  const [positions, setPositions] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await (await fetch(backendUrl + "/orders"))?.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
    
    // Load PnL data
    try {
      const pnlData = await (await fetch(backendUrl + "/pnl"))?.json();
      setPnl(pnlData);
    } catch {
      setPnl(null);
    }
    
    // Load positions data
    try {
      const posData = await (await fetch(backendUrl + "/positions"))?.json();
      setPositions(posData.positions || []);
    } catch {
      setPositions([]);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, [auto, intervalMs]);

  const filtered = useMemo(() => {
    return orders
      .filter((o) => (side === "ALL" ? true : o.side === side))
      .filter((o) => (query ? o.symbol.toUpperCase().includes(query.toUpperCase()) : true))
      .slice(-500)
      .reverse();
  }, [orders, side, query]);

  const exportCsv = () => {
    if (!filtered.length) return;
    const header = ["time","side","symbol","qty","price","mode","source"];
    const rows = filtered.map((o)=>[
      new Date(o.ts).toISOString(),
      o.side,
      o.symbol,
      String(o.quantity),
      o.price.toFixed(2),
      o.dry_run ? "PAPER" : "LIVE",
      o.source,
    ]);
    const csv = [header, ...rows].map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = filtered
      .map(
        (o) =>
          `<tr><td>${new Date(o.ts).toLocaleString()}</td><td>${o.side}</td><td>${o.symbol}</td><td style="text-align:right">${o.quantity}</td><td style="text-align:right">${o.price.toFixed(2)}</td><td style="text-align:center">${o.dry_run ? "PAPER" : "LIVE"}</td><td>${o.source}</td></tr>`
      )
      .join("");
    w.document.write(
      `<html><head><title>Orders</title></head><body><h3>Orders</h3><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%"><thead><tr><th>Time</th><th>Side</th><th>Symbol</th><th>Qty</th><th>Price</th><th>Mode</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table><script>window.print();</script></body></html>`
    );
    w.document.close();
  };

  const loadDemat = async () => {
    try {
      const d = await (await fetch(backendUrl + "/broker/orders")).json();
      setDemat(Array.isArray(d) ? d : []);
    } catch { setDemat([]); }
  };

  const resetPaper = async () => {
    await fetch(backendUrl + "/paper/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cash: resetCash ? Number(resetCash) : undefined, clear_orders: true }),
    });
    setResetCash("");
    load();
  };

  const loadStrategyStats = async () => {
    try {
      const s = await (await fetch(backendUrl + "/reports/strategy")).json();
      setStrategyStats(s || {});
    } catch { setStrategyStats({}); }
  };

  return (
    <main style={{ maxWidth: 1000, margin: "20px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Orders</h2>
        <a href="/" style={{ color: "#0969da", textDecoration: "none" }}>Home</a>
      </div>

      {/* Profit/Loss Summary */}
      {pnl && (
        <div style={{ marginBottom: 16 }}>
          {/* Main P&L Summary */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(4, 1fr)", 
            gap: 16, 
            marginBottom: 12,
            padding: 16,
            backgroundColor: "#f8f9fa",
            borderRadius: 8,
            border: "1px solid #e9ecef"
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.9em", color: "#6c757d", marginBottom: 4 }}>Realized P&L</div>
              <div style={{ 
                fontSize: "1.5em", 
                fontWeight: "bold",
                color: pnl.realized >= 0 ? "#28a745" : "#dc3545"
              }}>
                ₹{pnl.realized.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.9em", color: "#6c757d", marginBottom: 4 }}>Unrealized P&L</div>
              <div style={{ 
                fontSize: "1.5em", 
                fontWeight: "bold",
                color: pnl.unrealized >= 0 ? "#28a745" : "#dc3545"
              }}>
                ₹{pnl.unrealized.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.9em", color: "#6c757d", marginBottom: 4 }}>Total P&L</div>
              <div style={{ 
                fontSize: "1.5em", 
                fontWeight: "bold",
                color: pnl.total >= 0 ? "#28a745" : "#dc3545"
              }}>
                ₹{pnl.total.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.9em", color: "#6c757d", marginBottom: 4 }}>Total Trades</div>
              <div style={{ fontSize: "1.5em", fontWeight: "bold", color: "#007bff" }}>
                {orders.length}
              </div>
            </div>
          </div>
          
          {/* Paper vs Live Trading Breakdown */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "1fr 1fr", 
            gap: 12,
            padding: 12,
            backgroundColor: "#ffffff",
            borderRadius: 8,
            border: "1px solid #e9ecef"
          }}>
            <div>
              <h4 style={{ margin: "0 0 8px 0", color: "#6c757d" }}>📄 Paper Trading</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: "0.9em" }}>
                <div>
                  <div style={{ color: "#6c757d" }}>Realized</div>
                  <div style={{ 
                    fontWeight: "bold",
                    color: pnl.paper.realized >= 0 ? "#28a745" : "#dc3545"
                  }}>
                    ₹{pnl.paper.realized.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#6c757d" }}>Unrealized</div>
                  <div style={{ 
                    fontWeight: "bold",
                    color: pnl.paper.unrealized >= 0 ? "#28a745" : "#dc3545"
                  }}>
                    ₹{pnl.paper.unrealized.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#6c757d" }}>Total</div>
                  <div style={{ 
                    fontWeight: "bold",
                    color: pnl.paper.total >= 0 ? "#28a745" : "#dc3545"
                  }}>
                    ₹{pnl.paper.total.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h4 style={{ margin: "0 0 8px 0", color: "#6c757d" }}>💰 Live Trading</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: "0.9em" }}>
                <div>
                  <div style={{ color: "#6c757d" }}>Realized</div>
                  <div style={{ 
                    fontWeight: "bold",
                    color: pnl.live.realized >= 0 ? "#28a745" : "#dc3545"
                  }}>
                    ₹{pnl.live.realized.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#6c757d" }}>Unrealized</div>
                  <div style={{ 
                    fontWeight: "bold",
                    color: pnl.live.unrealized >= 0 ? "#28a745" : "#dc3545"
                  }}>
                    ₹{pnl.live.unrealized.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "#6c757d" }}>Total</div>
                  <div style={{ 
                    fontWeight: "bold",
                    color: pnl.live.total >= 0 ? "#28a745" : "#dc3545"
                  }}>
                    ₹{pnl.live.total.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <button onClick={load} style={{ padding: "6px 10px" }}>{loading ? "Loading..." : "Refresh"}</button>
        <label>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ marginRight: 6 }} />
          Auto refresh
        </label>
        <input
          type="number"
          value={intervalMs}
          onChange={(e) => setIntervalMs(Number(e.target.value || 5000))}
          style={{ width: 100, padding: 6 }}
        />
        <select value={side} onChange={(e) => setSide(e.target.value)}>
          <option value="ALL">ALL</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <input
          placeholder="Search symbol"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, padding: 6 }}
        />
        <button onClick={exportCsv} style={{ padding: "6px 10px" }}>Export CSV</button>
        <button onClick={exportPdf} style={{ padding: "6px 10px" }}>Export PDF</button>
        <input placeholder="Reset cash" value={resetCash} onChange={(e)=>setResetCash(e.target.value)} style={{ width: 120, padding: 6 }} />
        <button onClick={resetPaper} style={{ padding: "6px 10px" }}>Reset Paper</button>
        <button onClick={loadDemat} style={{ padding: "6px 10px" }}>Load Demat Orders</button>
        <button onClick={loadStrategyStats} style={{ padding: "6px 10px" }}>Strategy Report</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Time</th>
            <th style={{ textAlign: "left" }}>Side</th>
            <th style={{ textAlign: "left" }}>Symbol</th>
            <th style={{ textAlign: "right" }}>Qty</th>
            <th style={{ textAlign: "right" }}>Price</th>
            <th style={{ textAlign: "center" }}>Mode</th>
            <th style={{ textAlign: "left" }}>Source</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((o) => (
            <tr key={`${o.ts}-${o.symbol}-${o.side}-${o.price}`}>
              <td>{new Date(o.ts).toLocaleString()}</td>
              <td style={{ color: o.side === "BUY" ? "#0a0" : "#a00" }}>{o.side}</td>
              <td>{o.symbol}</td>
              <td style={{ textAlign: "right" }}>{o.quantity}</td>
              <td style={{ textAlign: "right" }}>{o.price.toFixed(2)}</td>
              <td style={{ textAlign: "center" }}>{o.dry_run ? "PAPER" : "LIVE"}</td>
              <td>{o.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 12 }}>Showing {filtered.length} of {orders.length} orders</div>

      {/* Current Positions */}
      {positions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Current Positions</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Symbol</th>
                <th style={{ textAlign: "left" }}>Exchange</th>
                <th style={{ textAlign: "right" }}>Quantity</th>
                <th style={{ textAlign: "right" }}>Avg Price</th>
                <th style={{ textAlign: "right" }}>LTP</th>
                <th style={{ textAlign: "right" }}>Unrealized P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, index) => (
                <tr key={index}>
                  <td>{pos.symbol}</td>
                  <td>{pos.exchange}</td>
                  <td style={{ textAlign: "right" }}>{pos.quantity}</td>
                  <td style={{ textAlign: "right" }}>₹{pos.avg_price.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>₹{pos.ltp.toFixed(2)}</td>
                  <td style={{ 
                    textAlign: "right", 
                    color: pos.unrealized >= 0 ? "#28a745" : "#dc3545",
                    fontWeight: "bold"
                  }}>
                    ₹{pos.unrealized.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {demat.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Demat Orders</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Order ID</th>
                <th style={{ textAlign: "left" }}>Symbol</th>
                <th style={{ textAlign: "left" }}>Side</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "left" }}>Status</th>
                <th style={{ textAlign: "left" }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {demat.slice(0, 200).map((o: any) => (
                <tr key={o.order_id}>
                  <td>{o.order_id}</td>
                  <td>{o.tradingsymbol}</td>
                  <td>{o.transaction_type}</td>
                  <td style={{ textAlign: "right" }}>{o.quantity}</td>
                  <td style={{ textAlign: "right" }}>{Number(o.price || o.average_price || 0).toFixed(2)}</td>
                  <td>{o.status}</td>
                  <td>{o.order_timestamp || o.exchange_timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {Object.keys(strategyStats).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Strategy Profit Report</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>Strategy</th><th style={{ textAlign: "right" }}>Trades</th><th style={{ textAlign: "right" }}>Buy Amt</th><th style={{ textAlign: "right" }}>Sell Amt</th><th style={{ textAlign: "right" }}>Profit</th></tr></thead>
            <tbody>
              {Object.entries(strategyStats).map(([name, v]: any) => (
                <tr key={name}><td>{name}</td><td style={{ textAlign: "right" }}>{v.trades}</td><td style={{ textAlign: "right" }}>{Number(v.buy).toFixed(2)}</td><td style={{ textAlign: "right" }}>{Number(v.sell).toFixed(2)}</td><td style={{ textAlign: "right", color: Number(v.profit) >= 0 ? "#0a0" : "#a00" }}>{Number(v.profit).toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}


