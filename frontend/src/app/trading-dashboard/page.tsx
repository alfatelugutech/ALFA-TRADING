"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

type StrategyStatus = {
  active: boolean;
  live: boolean;
  exchange: string;
  last_signals: any[];
};

type AIStatus = {
  active: boolean;
  capital: number;
  risk_pct: number;
  symbols: string[];
  active_strategies?: string[];
  total_trades?: number;
  successful_trades?: number;
  total_profit?: number;
  success_rate?: number;
  available_capital?: number;
  last_analysis?: string;
  strategy_performance?: any;
};

type PnLData = {
  realized: number;
  unrealized: number;
  total: number;
  paper: { realized: number; unrealized: number; total: number };
  live: { realized: number; unrealized: number; total: number };
};

export default function TradingDashboard() {
  const [strategyStatus, setStrategyStatus] = useState<StrategyStatus | null>(null);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [pnl, setPnl] = useState<PnLData | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load strategy status
      const strategyResp = await fetch(`${backendUrl}/strategy/status`);
      const strategyData = await strategyResp.json();
      setStrategyStatus(strategyData);

      // Load AI status
      const aiResp = await fetch(`${backendUrl}/ai/status`);
      const aiData = await aiResp.json();
      setAiStatus(aiData);

      // Load PnL
      const pnlResp = await fetch(`${backendUrl}/pnl`);
      const pnlData = await pnlResp.json();
      setPnl(pnlData);

      // Load recent orders
      const ordersResp = await fetch(`${backendUrl}/orders`);
      const ordersData = await ordersResp.json();
      setOrders(Array.isArray(ordersData) ? ordersData.slice(-10) : []);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const startSMAStrategy = async () => {
    try {
      await fetch(`${backendUrl}/strategy/sma/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"],
          exchange: "NSE",
          short: 20,
          long: 50,
          live: false
        }),
      });
      await loadData();
      alert("SMA Strategy started successfully!");
    } catch (error) {
      alert("Failed to start SMA strategy");
    }
  };

  const startEMAStrategy = async () => {
    try {
      await fetch(`${backendUrl}/strategy/ema/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"],
          exchange: "NSE",
          short: 12,
          long: 26,
          live: false
        }),
      });
      await loadData();
      alert("EMA Strategy started successfully!");
    } catch (error) {
      alert("Failed to start EMA strategy");
    }
  };

  const startRSIStrategy = async () => {
    try {
      await fetch(`${backendUrl}/strategy/rsi/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"],
          exchange: "NSE",
          period: 14,
          oversold: 30,
          overbought: 70,
          live: false
        }),
      });
      await loadData();
      alert("RSI Strategy started successfully!");
    } catch (error) {
      alert("Failed to start RSI strategy");
    }
  };

  const stopStrategy = async () => {
    try {
      await fetch(`${backendUrl}/strategy/stop`, { method: "POST" });
      await loadData();
      alert("Strategy stopped successfully!");
    } catch (error) {
      alert("Failed to stop strategy");
    }
  };

  const startAITrading = async () => {
    try {
      await fetch(`${backendUrl}/ai/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          live: false,
          capital: 100000,
          max_strategies: 3
        }),
      });
      await loadData();
      alert("AI Trading started successfully!");
    } catch (error) {
      alert("Failed to start AI trading");
    }
  };

  const stopAITrading = async () => {
    try {
      await fetch(`${backendUrl}/ai/stop`, { method: "POST" });
      await loadData();
      alert("AI Trading stopped successfully!");
    } catch (error) {
      alert("Failed to stop AI trading");
    }
  };

  return (
    <main style={{ maxWidth: 1200, margin: "20px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1>🚀 Trading Dashboard</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)} 
            />
            Auto Refresh
          </label>
          <button onClick={loadData} disabled={loading} style={{ padding: "8px 16px" }}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <a href="/" style={{ color: "#0969da", textDecoration: "none" }}>Home</a>
        </div>
      </div>

      {/* Status Overview */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(4, 1fr)", 
        gap: 16, 
        marginBottom: 20 
      }}>
        <div style={{ 
          padding: 16, 
          backgroundColor: strategyStatus?.active ? "#d4edda" : "#f8d7da", 
          borderRadius: 8, 
          border: `1px solid ${strategyStatus?.active ? "#c3e6cb" : "#f5c6cb"}`,
          textAlign: "center"
        }}>
          <div style={{ fontSize: "0.9em", color: "#6c757d", marginBottom: 4 }}>Strategy Status</div>
          <div style={{ 
            fontSize: "1.2em", 
            fontWeight: "bold",
            color: strategyStatus?.active ? "#155724" : "#721c24"
          }}>
            {strategyStatus?.active ? "🟢 ACTIVE" : "🔴 INACTIVE"}
          </div>
          <div style={{ fontSize: "0.8em", color: "#6c757d" }}>
            {strategyStatus?.live ? "LIVE" : "PAPER"} Trading
          </div>
        </div>

        <div style={{ 
          padding: 16, 
          backgroundColor: aiStatus?.active ? "#d4edda" : "#f8d7da", 
          borderRadius: 8, 
          border: `1px solid ${aiStatus?.active ? "#c3e6cb" : "#f5c6cb"}`,
          textAlign: "center"
        }}>
          <div style={{ fontSize: "0.9em", color: "#6c757d", marginBottom: 4 }}>AI Trading</div>
          <div style={{ 
            fontSize: "1.2em", 
            fontWeight: "bold",
            color: aiStatus?.active ? "#155724" : "#721c24"
          }}>
            {aiStatus?.active ? "🤖 ACTIVE" : "⏸️ INACTIVE"}
          </div>
          <div style={{ fontSize: "0.8em", color: "#6c757d" }}>
            {aiStatus?.active_strategies?.length || 0} Strategies
          </div>
        </div>

        <div style={{ 
          padding: 16, 
          backgroundColor: "#e2e3e5", 
          borderRadius: 8, 
          border: "1px solid #d6d8db",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "0.9em", color: "#6c757d", marginBottom: 4 }}>Total P&L</div>
          <div style={{ 
            fontSize: "1.2em", 
            fontWeight: "bold",
            color: pnl?.total && pnl.total >= 0 ? "#28a745" : "#dc3545"
          }}>
            ₹{pnl?.total?.toLocaleString() || "0"}
          </div>
          <div style={{ fontSize: "0.8em", color: "#6c757d" }}>
            {orders.length} Recent Trades
          </div>
        </div>

        <div style={{ 
          padding: 16, 
          backgroundColor: "#e2e3e5", 
          borderRadius: 8, 
          border: "1px solid #d6d8db",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "0.9em", color: "#6c757d", marginBottom: 4 }}>Success Rate</div>
          <div style={{ 
            fontSize: "1.2em", 
            fontWeight: "bold",
            color: aiStatus?.success_rate && aiStatus.success_rate >= 50 ? "#28a745" : "#dc3545"
          }}>
            {aiStatus?.success_rate?.toFixed(1) || "0"}%
          </div>
          <div style={{ fontSize: "0.8em", color: "#6c757d" }}>
            {aiStatus?.total_trades || 0} Total Trades
          </div>
        </div>
      </div>

      {/* Strategy Controls */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "1fr 1fr", 
        gap: 20, 
        marginBottom: 20 
      }}>
        {/* Manual Strategy Controls */}
        <div style={{ 
          padding: 20, 
          backgroundColor: "#ffffff", 
          borderRadius: 8, 
          border: "1px solid #e9ecef" 
        }}>
          <h3 style={{ margin: "0 0 16px 0" }}>📈 Manual Strategy Controls</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <button 
              onClick={startSMAStrategy}
              disabled={strategyStatus?.active}
              style={{ 
                padding: "12px 16px", 
                backgroundColor: strategyStatus?.active ? "#6c757d" : "#007bff",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: strategyStatus?.active ? "not-allowed" : "pointer"
              }}
            >
              Start SMA Strategy
            </button>
            <button 
              onClick={startEMAStrategy}
              disabled={strategyStatus?.active}
              style={{ 
                padding: "12px 16px", 
                backgroundColor: strategyStatus?.active ? "#6c757d" : "#28a745",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: strategyStatus?.active ? "not-allowed" : "pointer"
              }}
            >
              Start EMA Strategy
            </button>
            <button 
              onClick={startRSIStrategy}
              disabled={strategyStatus?.active}
              style={{ 
                padding: "12px 16px", 
                backgroundColor: strategyStatus?.active ? "#6c757d" : "#ffc107",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: strategyStatus?.active ? "not-allowed" : "pointer"
              }}
            >
              Start RSI Strategy
            </button>
            <button 
              onClick={stopStrategy}
              disabled={!strategyStatus?.active}
              style={{ 
                padding: "12px 16px", 
                backgroundColor: !strategyStatus?.active ? "#6c757d" : "#dc3545",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: !strategyStatus?.active ? "not-allowed" : "pointer"
              }}
            >
              Stop Strategy
            </button>
          </div>
          {strategyStatus && (
            <div style={{ fontSize: "0.9em", color: "#6c757d" }}>
              <div>Status: {strategyStatus.active ? "Active" : "Inactive"}</div>
              <div>Mode: {strategyStatus.live ? "Live Trading" : "Paper Trading"}</div>
              <div>Exchange: {strategyStatus.exchange}</div>
              <div>Last Signals: {strategyStatus.last_signals?.length || 0}</div>
            </div>
          )}
        </div>

        {/* AI Trading Controls */}
        <div style={{ 
          padding: 20, 
          backgroundColor: "#ffffff", 
          borderRadius: 8, 
          border: "1px solid #e9ecef" 
        }}>
          <h3 style={{ margin: "0 0 16px 0" }}>🤖 AI Trading Controls</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <button 
              onClick={startAITrading}
              disabled={aiStatus?.active}
              style={{ 
                padding: "12px 16px", 
                backgroundColor: aiStatus?.active ? "#6c757d" : "#6f42c1",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: aiStatus?.active ? "not-allowed" : "pointer"
              }}
            >
              Start AI Trading
            </button>
            <button 
              onClick={stopAITrading}
              disabled={!aiStatus?.active}
              style={{ 
                padding: "12px 16px", 
                backgroundColor: !aiStatus?.active ? "#6c757d" : "#dc3545",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: !aiStatus?.active ? "not-allowed" : "pointer"
              }}
            >
              Stop AI Trading
            </button>
          </div>
          {aiStatus && (
            <div style={{ fontSize: "0.9em", color: "#6c757d" }}>
              <div>Status: {aiStatus.active ? "Active" : "Inactive"}</div>
              <div>Capital: ₹{aiStatus.capital?.toLocaleString()}</div>
              <div>Risk: {aiStatus.risk_pct}%</div>
              <div>Active Strategies: {aiStatus.active_strategies?.length || 0}</div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ 
        padding: 20, 
        backgroundColor: "#ffffff", 
        borderRadius: 8, 
        border: "1px solid #e9ecef" 
      }}>
        <h3 style={{ margin: "0 0 16px 0" }}>📊 Recent Trading Activity</h3>
        {orders.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8f9fa" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Time</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Symbol</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Side</th>
                  <th style={{ padding: 8, textAlign: "right" }}>Quantity</th>
                  <th style={{ padding: 8, textAlign: "right" }}>Price</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, index) => (
                  <tr key={index}>
                    <td style={{ padding: 8 }}>{new Date(order.ts).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>{order.symbol}</td>
                    <td style={{ 
                      padding: 8, 
                      color: order.side === "BUY" ? "#28a745" : "#dc3545",
                      fontWeight: "bold"
                    }}>
                      {order.side}
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>{order.quantity}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>₹{order.price.toFixed(2)}</td>
                    <td style={{ padding: 8 }}>{order.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "#6c757d", padding: 20 }}>
            No recent trading activity. Start a strategy to begin trading!
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(4, 1fr)", 
        gap: 12, 
        marginTop: 20 
      }}>
        <a href="/strategy-builder" style={{ 
          padding: 16, 
          backgroundColor: "#007bff", 
          color: "white", 
          textDecoration: "none", 
          borderRadius: 8, 
          textAlign: "center",
          fontWeight: "bold"
        }}>
          📈 Strategy Builder
        </a>
        <a href="/ai-trading" style={{ 
          padding: 16, 
          backgroundColor: "#6f42c1", 
          color: "white", 
          textDecoration: "none", 
          borderRadius: 8, 
          textAlign: "center",
          fontWeight: "bold"
        }}>
          🤖 AI Trading
        </a>
        <a href="/orders" style={{ 
          padding: 16, 
          backgroundColor: "#28a745", 
          color: "white", 
          textDecoration: "none", 
          borderRadius: 8, 
          textAlign: "center",
          fontWeight: "bold"
        }}>
          📋 Orders & P&L
        </a>
        <a href="/portfolio" style={{ 
          padding: 16, 
          backgroundColor: "#ffc107", 
          color: "white", 
          textDecoration: "none", 
          borderRadius: 8, 
          textAlign: "center",
          fontWeight: "bold"
        }}>
          💼 Portfolio
        </a>
      </div>
    </main>
  );
}
