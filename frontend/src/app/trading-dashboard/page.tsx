"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
// Lazy-load CandleChart to isolate any rendering issues
const CandleChart = dynamic(() => import("../components/CandleChart"), { ssr: false });

type Tick = {
  instrument_token: number;
  last_price?: number;
  last_traded_price?: number;
  ltp?: number;
  symbol?: string;
  updated_at?: number;
};

type OrderRec = {
  ts: number;
  symbol: string;
  exchange: string;
  side: string;
  quantity: number;
  price: number;
  dry_run: boolean;
  source: string;
  status?: string;
};

type PositionRec = {
  symbol: string;
  quantity: number;
  avg_price: number;
  ltp: number;
  unrealized: number;
  day_change?: number;
  day_change_percent?: number;
};

type PnLState = {
  realized: number;
  unrealized: number;
  total: number;
};

// Use env if provided, otherwise fall back to current origin (works on Vercel)
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function TradingDashboard() {
  // Local error boundary to prevent full-page crash
  // Note: React class components can't be defined inside a component, so we use try/catch guards in effects and rendering helpers
  const [activeTab, setActiveTab] = useState<"overview" | "positions" | "orders" | "watchlist" | "charts">("overview");
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [orders, setOrders] = useState<OrderRec[]>([]);
  const [positions, setPositions] = useState<PositionRec[]>([]);
  const [pnlState, setPnlState] = useState<PnLState | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("NIFTY 50");
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isPaper, setIsPaper] = useState<boolean>(true);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: "info" | "success" | "error" }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket connection for live data (safe on Vercel without env)
  useEffect(() => {
    try {
      const base = (process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== "undefined" ? window.location.origin : ""));
      if (!base) { setWsConnected(false); return; }
      let ws: WebSocket | null = null;
      try {
        const wsUrl = base.replace(/^http/, "ws") + "/ws/ticks";
        ws = new WebSocket(wsUrl);
      } catch {
        setWsConnected(false);
        return;
      }
      wsRef.current = ws;
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (Array.isArray(data.ticks)) {
            const ts = Date.now();
            setTicks(data.ticks.map((t: any) => ({ ...t, updated_at: ts })));
          }
        } catch {}
      };
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        wsRef.current = null;
        setWsConnected(false);
      };
      return () => { try { ws?.close(); } catch {} };
    } catch {
      setWsConnected(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    loadPositions();
    loadOrders();
    loadPnL();
    loadWatchlist();
    loadStatus();
  }, []);

  const pushToast = (text: string, kind: "info" | "success" | "error" = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  const api = (path: string) => (process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== "undefined" ? window.location.origin : "")) + path;

  const loadPositions = async () => {
    try {
      const resp = await fetch(api("/positions"));
      const data = await resp.json();
      setPositions(data || []);
    } catch (error) {
      pushToast("Failed to load positions", "error");
    }
  };

  const loadOrders = async () => {
    try {
      const resp = await fetch(api("/orders"));
      const data = await resp.json();
      setOrders(data || []);
    } catch (error) {
      pushToast("Failed to load orders", "error");
    }
  };

  const loadPnL = async () => {
    try {
      const resp = await fetch(api("/pnl"));
      const data = await resp.json();
      setPnlState(data);
    } catch (error) {
      pushToast("Failed to load P&L", "error");
    }
  };

  const loadWatchlist = async () => {
    try {
      const saved = localStorage.getItem("watchlist");
      if (saved) {
        setWatchlist(JSON.parse(saved));
      }
    } catch {}
  };

  const loadStatus = async () => {
    try {
      const resp = await fetch(api("/status/all"));
      const data = await resp.json();
      if (typeof data?.dry_run === "boolean") setIsPaper(!!data.dry_run);
    } catch {}
  };

  const exitAllPositions = async () => {
    try {
      await fetch(api("/squareoff/all"), { method: "POST" });
      pushToast("Exit All triggered", "success");
      loadPositions();
    } catch (error) {
      pushToast("Failed to exit all positions", "error");
    }
  };

  const exitPosition = async (symbol: string) => {
    try {
      await fetch(api("/squareoff"), { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ symbol }) 
      });
      pushToast(`Exited ${symbol}`, "success");
      loadPositions();
    } catch (error) {
      pushToast(`Failed to exit ${symbol}`, "error");
    }
  };

  const togglePaperLive = async () => {
    try {
      const wantLive = confirm("Switch to LIVE mode? (Cancel switches to PAPER)");
      await fetch(api("/config/dry_run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: !wantLive }),
      });
      setIsPaper(!wantLive);
      pushToast(wantLive ? "Live mode set" : "Paper mode set", "success");
    } catch (error) {
      pushToast("Failed to toggle mode", "error");
    }
  };

  const getCurrentPrice = (symbol: string): number => {
    try {
      const tick = ticks.find(t => t.symbol === symbol);
      return tick ? (tick.last_price ?? tick.last_traded_price ?? tick.ltp ?? 0) : 0;
    } catch {
      return 0;
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatNumber = (value: number, decimals: number = 2): string => {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  };

  return (
    <div className="trading-dashboard" style={{ 
      display: "grid", 
      gridTemplateColumns: "1fr 1fr 1fr", 
      gridTemplateRows: "auto auto 1fr", 
      gap: "12px", 
      height: "100vh",
      padding: "12px",
      backgroundColor: "#f8f9fa"
    }}>
      {/* Header */}
      <div style={{ 
        gridColumn: "1 / -1", 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        backgroundColor: "white",
        padding: "12px 16px",
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>Trading Terminal</h1>
          <div style={{ fontSize: "14px", color: "#666" }}>
            {wsConnected ? "🟢 Connected" : "🔴 Disconnected"} · 
            {isPaper ? " 📄 Paper Trading" : " 🔴 Live Trading"} · 
            {new Date().toLocaleTimeString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button 
            onClick={togglePaperLive}
            style={{
              padding: "8px 16px",
              backgroundColor: isPaper ? "#28a745" : "#dc3545",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            {isPaper ? "Switch to Live" : "Switch to Paper"}
          </button>
          <button 
            onClick={() => { loadPositions(); loadOrders(); loadPnL(); }}
            style={{
              padding: "8px 16px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Refresh All
          </button>
        </div>
      </div>

      {/* P&L Summary */}
      <div style={{ 
        backgroundColor: "white", 
        padding: "16px", 
        borderRadius: "8px", 
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>P&L Summary</h3>
        {pnlState ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Realized:</span>
              <span style={{ color: pnlState.realized >= 0 ? "#28a745" : "#dc3545", fontWeight: "bold" }}>
                {formatCurrency(pnlState.realized)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Unrealized:</span>
              <span style={{ color: pnlState.unrealized >= 0 ? "#28a745" : "#dc3545", fontWeight: "bold" }}>
                {formatCurrency(pnlState.unrealized)}
              </span>
            </div>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              paddingTop: "8px", 
              borderTop: "1px solid #eee",
              fontWeight: "bold",
              fontSize: "16px"
            }}>
              <span>Total:</span>
              <span style={{ color: pnlState.total >= 0 ? "#28a745" : "#dc3545" }}>
                {formatCurrency(pnlState.total)}
              </span>
            </div>
          </div>
        ) : (
          <div>Loading P&L...</div>
        )}
      </div>

      {/* Market Overview */}
      <div style={{ 
        backgroundColor: "white", 
        padding: "16px", 
        borderRadius: "8px", 
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Market Overview</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          {["NIFTY 50", "BANKNIFTY", "SENSEX"].map(symbol => {
            const price = getCurrentPrice(symbol);
            return (
              <div key={symbol} style={{ 
                padding: "8px", 
                backgroundColor: "#f8f9fa", 
                borderRadius: "4px",
                textAlign: "center"
              }}>
                <div style={{ fontSize: "12px", color: "#666" }}>{symbol}</div>
                <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                  {price > 0 ? formatNumber(price) : "N/A"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ 
        backgroundColor: "white", 
        padding: "16px", 
        borderRadius: "8px", 
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Quick Actions</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button 
            onClick={exitAllPositions}
            style={{
              padding: "8px 12px",
              backgroundColor: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Exit All Positions
          </button>
          <button 
            onClick={() => setActiveTab("watchlist")}
            style={{
              padding: "8px 12px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Manage Watchlist
          </button>
          <button 
            onClick={() => setActiveTab("charts")}
            style={{
              padding: "8px 12px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            View Charts
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ 
        gridColumn: "1 / -1",
        display: "flex",
        gap: "4px",
        backgroundColor: "white",
        padding: "8px",
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        {[
          { key: "overview", label: "Overview" },
          { key: "positions", label: "Positions" },
          { key: "orders", label: "Orders" },
          { key: "watchlist", label: "Watchlist" },
          { key: "charts", label: "Charts" }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: "8px 16px",
              backgroundColor: activeTab === tab.key ? "#007bff" : "transparent",
              color: activeTab === tab.key ? "white" : "#333",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: activeTab === tab.key ? "bold" : "normal"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div style={{ 
        gridColumn: "1 / -1",
        backgroundColor: "white",
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        overflow: "hidden"
      }}>
        {activeTab === "overview" && (
          <div style={{ padding: "16px" }}>
            <h3>Portfolio Overview</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <h4>Recent Positions</h4>
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {positions.slice(0, 5).map(pos => (
                    <div key={pos.symbol} style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      padding: "8px",
                      borderBottom: "1px solid #eee"
                    }}>
                      <span>{pos.symbol}</span>
                      <span style={{ color: pos.unrealized >= 0 ? "#28a745" : "#dc3545" }}>
                        {formatCurrency(pos.unrealized)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4>Recent Orders</h4>
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {orders.slice(-5).reverse().map(order => (
                    <div key={`${order.ts}-${order.symbol}`} style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      padding: "8px",
                      borderBottom: "1px solid #eee"
                    }}>
                      <span>{order.symbol} {order.side}</span>
                      <span style={{ color: order.side === "BUY" ? "#28a745" : "#dc3545" }}>
                        {formatCurrency(order.price * order.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "positions" && (
          <div style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3>Positions</h3>
              <button 
                onClick={loadPositions}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Refresh
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8f9fa" }}>
                    <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Symbol</th>
                    <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Qty</th>
                    <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Avg Price</th>
                    <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>LTP</th>
                    <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Unrealized P&L</th>
                    <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(pos => (
                    <tr key={pos.symbol}>
                      <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{pos.symbol}</td>
                      <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {pos.quantity}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {formatCurrency(pos.avg_price)}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {formatCurrency(pos.ltp)}
                      </td>
                      <td style={{ 
                        padding: "8px", 
                        textAlign: "right", 
                        borderBottom: "1px solid #eee",
                        color: pos.unrealized >= 0 ? "#28a745" : "#dc3545",
                        fontWeight: "bold"
                      }}>
                        {formatCurrency(pos.unrealized)}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                        <button 
                          onClick={() => exitPosition(pos.symbol)}
                          style={{
                            padding: "4px 8px",
                            backgroundColor: "#dc3545",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "12px"
                          }}
                        >
                          Exit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {positions.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                  No positions found
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "orders" && (
          <div style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3>Orders</h3>
              <button 
                onClick={loadOrders}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Refresh
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8f9fa" }}>
                    <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Time</th>
                    <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Symbol</th>
                    <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Side</th>
                    <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Qty</th>
                    <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Price</th>
                    <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Mode</th>
                    <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(-50).reverse().map(order => (
                    <tr key={`${order.ts}-${order.symbol}-${order.side}`}>
                      <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                        {new Date(order.ts).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{order.symbol}</td>
                      <td style={{ 
                        padding: "8px", 
                        borderBottom: "1px solid #eee",
                        color: order.side === "BUY" ? "#28a745" : "#dc3545",
                        fontWeight: "bold"
                      }}>
                        {order.side}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {order.quantity}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {formatCurrency(order.price)}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                        {order.dry_run ? "PAPER" : "LIVE"}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{order.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {orders.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                  No orders found
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "watchlist" && (
          <div style={{ padding: "16px" }}>
            <h3>Watchlist</h3>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input
                type="text"
                placeholder="Add symbol (e.g., TCS)"
                style={{ flex: 1, padding: "8px", border: "1px solid #ddd", borderRadius: "4px" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const symbol = e.currentTarget.value.toUpperCase().trim();
                    if (symbol && !watchlist.includes(symbol)) {
                      setWatchlist([...watchlist, symbol]);
                      e.currentTarget.value = "";
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  const input = document.querySelector('input[placeholder="Add symbol (e.g., TCS)"]') as HTMLInputElement;
                  const symbol = input.value.toUpperCase().trim();
                  if (symbol && !watchlist.includes(symbol)) {
                    setWatchlist([...watchlist, symbol]);
                    input.value = "";
                  }
                }}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Add
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
              {watchlist.map(symbol => {
                const price = getCurrentPrice(symbol);
                return (
                  <div key={symbol} style={{ 
                    padding: "12px", 
                    backgroundColor: "#f8f9fa", 
                    borderRadius: "4px",
                    border: "1px solid #ddd"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: "bold" }}>{symbol}</span>
                      <button
                        onClick={() => setWatchlist(watchlist.filter(s => s !== symbol))}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#dc3545",
                          cursor: "pointer",
                          fontSize: "16px"
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ fontSize: "14px", color: "#666", marginTop: "4px" }}>
                      {price > 0 ? formatCurrency(price) : "N/A"}
                    </div>
                  </div>
                );
              })}
            </div>
            {watchlist.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                No symbols in watchlist
              </div>
            )}
          </div>
        )}

        {activeTab === "charts" && (
          <div style={{ padding: "16px" }}>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                style={{ padding: "8px", border: "1px solid #ddd", borderRadius: "4px" }}
              >
                {watchlist.map(symbol => (
                  <option key={symbol} value={symbol}>{symbol}</option>
                ))}
                <option value="NIFTY 50">NIFTY 50</option>
                <option value="BANKNIFTY">BANKNIFTY</option>
                <option value="SENSEX">SENSEX</option>
              </select>
              <button
                onClick={() => setWatchlist([...watchlist, selectedSymbol].filter((v, i, a) => a.indexOf(v) === i))}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                Add to Watchlist
              </button>
            </div>
            <div style={{ height: "400px", border: "1px solid #ddd", borderRadius: "4px" }}>
              {/* Safeguard render in case CandleChart fails */}
              {(() => {
                try {
                  return <CandleChart symbol={selectedSymbol} exchange="NSE" heikinAshi={true} />;
                } catch {
                  return <div style={{ padding: 12, color: "#666" }}>Chart unavailable</div>;
                }
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      <div style={{ 
        position: "fixed", 
        top: "16px", 
        right: "16px", 
        display: "flex", 
        flexDirection: "column", 
        gap: "8px",
        zIndex: 1000
      }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: t.kind === "error" ? "#fee2e2" : t.kind === "success" ? "#dcfce7" : "#e5e7eb",
              color: "#111",
              padding: "12px 16px",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              minWidth: "300px",
              border: `1px solid ${t.kind === "error" ? "#fecaca" : t.kind === "success" ? "#bbf7d0" : "#d1d5db"}`
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}