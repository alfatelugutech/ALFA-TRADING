"use client";

import { useEffect, useState } from "react";
import AdvancedChart from "../components/AdvancedChart";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

interface PortfolioMetrics {
  portfolio_value: number;
  total_exposure: number;
  leverage_ratio: number;
  risk_metrics: {
    var_95: number;
    max_drawdown: number;
    sharpe_ratio: number;
    concentration_risk: number;
  };
  risk_violations: string[];
  risk_level: string;
  positions: Array<{
    symbol: string;
    quantity: number;
    avg_price: number;
    current_price: number;
    unrealized_pnl: number;
    market_value: number;
  }>;
}

interface Alert {
  id: string;
  symbol: string;
  alert_type: string;
  condition: any;
  priority: string;
  enabled: boolean;
  trigger_count: number;
  last_triggered: string | null;
}

interface BacktestResult {
  start_date: string;
  end_date: string;
  initial_capital: number;
  final_capital: number;
  total_return: number;
  annualized_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  total_trades: number;
}

export default function AdvancedFeatures() {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [portfolioData, setPortfolioData] = useState<PortfolioMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newAlert, setNewAlert] = useState({
    symbol: "",
    alert_type: "price_above",
    condition: { price: 0 },
    priority: "medium",
    enabled: true
  });

  const loadPortfolioData = async () => {
    try {
      setErrorMsg(null);
      const response = await fetch(backendUrl + "/portfolio/advanced");
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || (data && (data.error || data.status === "error"))) {
        setPortfolioData(null);
        setErrorMsg(String((data && (data.error || data.message)) || `Request failed (${response.status})`));
        return;
      }
      // basic shape check
      const valid = data && typeof data.portfolio_value === "number" && data.risk_metrics;
      if (!valid) {
        setPortfolioData(null);
        setErrorMsg("Unexpected response for /portfolio/advanced. Check backend.");
        return;
      }
      setPortfolioData(data);
    } catch (error) {
      console.error("Error loading portfolio data:", error);
      setPortfolioData(null);
      setErrorMsg("Failed to load portfolio data. Verify NEXT_PUBLIC_BACKEND_URL and CORS.");
    }
  };

  const loadAlerts = async () => {
    try {
      const response = await fetch(backendUrl + "/alerts");
      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error("Error loading alerts:", error);
    }
  };

  const createAlert = async () => {
    try {
      setLoading(true);
      const response = await fetch(backendUrl + "/alerts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAlert)
      });
      const result = await response.json();
      
      if (result.status === "success") {
        setNewAlert({ symbol: "", alert_type: "price_above", condition: { price: 0 }, priority: "medium", enabled: true });
        loadAlerts();
      }
    } catch (error) {
      console.error("Error creating alert:", error);
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    try {
      setLoading(true);
      const response = await fetch(backendUrl + "/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: "2024-01-01T00:00:00",
          end_date: "2024-12-31T23:59:59"
        })
      });
      const result = await response.json();
      
      if (result.status === "success") {
        setBacktestResult(result.result);
      }
    } catch (error) {
      console.error("Error running backtest:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolioData();
    loadAlerts();
  }, []);

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case "low": return "#4CAF50";
      case "medium": return "#FF9800";
      case "high": return "#F44336";
      case "critical": return "#9C27B0";
      default: return "#757575";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low": return "#4CAF50";
      case "medium": return "#FF9800";
      case "high": return "#F44336";
      case "critical": return "#9C27B0";
      default: return "#757575";
    }
  };

  return (
    <main style={{ maxWidth: 1200, margin: "20px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>🚀 Advanced Trading Features</h1>
      {errorMsg && (
        <div className="card" style={{ margin: "12px 0", padding: 12, border: "1px solid #eab308", background: "#fffbeb", color: "#92400e" }}>
          <strong>Note:</strong> {errorMsg}
        </div>
      )}
      
      {/* Tab Navigation */}
      <div style={{ 
        display: "flex", 
        gap: "10px", 
        marginBottom: "20px",
        borderBottom: "2px solid #e0e0e0"
      }}>
        {[
          { id: "portfolio", label: "📊 Portfolio Analytics", icon: "📊" },
          { id: "alerts", label: "🔔 Smart Alerts", icon: "🔔" },
          { id: "backtesting", label: "🧪 Backtesting", icon: "🧪" },
          { id: "charts", label: "📈 Advanced Charts", icon: "📈" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              border: "none",
              backgroundColor: activeTab === tab.id ? "#1976D2" : "#f5f5f5",
              color: activeTab === tab.id ? "white" : "#333",
              borderRadius: "5px 5px 0 0",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Portfolio Analytics Tab */}
      {activeTab === "portfolio" && (
        <div>
          <h2>📊 Advanced Portfolio Analytics</h2>
          
          {portfolioData ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              {/* Risk Metrics */}
              <div style={{ 
                padding: "20px", 
                border: "1px solid #ddd", 
                borderRadius: "8px",
                backgroundColor: "#f9f9f9"
              }}>
                <h3>Risk Metrics</h3>
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Portfolio Value:</span>
                    <strong>₹{Number(portfolioData?.portfolio_value ?? 0).toLocaleString()}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Total Exposure:</span>
                    <strong>₹{Number(portfolioData?.total_exposure ?? 0).toLocaleString()}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Leverage Ratio:</span>
                    <strong>{Number(portfolioData?.leverage_ratio ?? 0).toFixed(2)}x</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Sharpe Ratio:</span>
                    <strong>{Number(portfolioData?.risk_metrics?.sharpe_ratio ?? 0).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Max Drawdown:</span>
                    <strong>{(Number(portfolioData?.risk_metrics?.max_drawdown ?? 0) * 100).toFixed(2)}%</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>VaR (95%):</span>
                    <strong>₹{Number(portfolioData?.risk_metrics?.var_95 ?? 0).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Risk Level:</span>
                    <span style={{ 
                      color: getRiskLevelColor(portfolioData.risk_level),
                      fontWeight: "bold"
                    }}>
                      {portfolioData.risk_level.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Risk Violations */}
              <div style={{ 
                padding: "20px", 
                border: "1px solid #ddd", 
                borderRadius: "8px",
                backgroundColor: "#f9f9f9"
              }}>
                <h3>Risk Violations</h3>
                {(Array.isArray(portfolioData?.risk_violations) ? portfolioData!.risk_violations : []).length > 0 ? (
                  <ul style={{ color: "#F44336" }}>
                    {(Array.isArray(portfolioData?.risk_violations) ? portfolioData!.risk_violations : []).map((violation, index) => (
                      <li key={index}>{violation}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: "#4CAF50" }}>✅ No risk violations</p>
                )}
              </div>

              {/* Positions */}
              <div style={{ 
                gridColumn: "1 / -1",
                padding: "20px", 
                border: "1px solid #ddd", 
                borderRadius: "8px",
                backgroundColor: "#f9f9f9"
              }}>
                <h3>Current Positions</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#e0e0e0" }}>
                        <th style={{ padding: "10px", textAlign: "left" }}>Symbol</th>
                        <th style={{ padding: "10px", textAlign: "right" }}>Quantity</th>
                        <th style={{ padding: "10px", textAlign: "right" }}>Avg Price</th>
                        <th style={{ padding: "10px", textAlign: "right" }}>Current Price</th>
                        <th style={{ padding: "10px", textAlign: "right" }}>Market Value</th>
                        <th style={{ padding: "10px", textAlign: "right" }}>P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(portfolioData?.positions) ? portfolioData!.positions : []).map((position, index) => (
                        <tr key={index}>
                          <td style={{ padding: "10px" }}>{position.symbol}</td>
                          <td style={{ padding: "10px", textAlign: "right" }}>{position.quantity}</td>
                          <td style={{ padding: "10px", textAlign: "right" }}>₹{position.avg_price.toFixed(2)}</td>
                          <td style={{ padding: "10px", textAlign: "right" }}>₹{position.current_price.toFixed(2)}</td>
                          <td style={{ padding: "10px", textAlign: "right" }}>₹{position.market_value.toFixed(2)}</td>
                          <td style={{ 
                            padding: "10px", 
                            textAlign: "right",
                            color: position.unrealized_pnl >= 0 ? "#4CAF50" : "#F44336"
                          }}>
                            ₹{position.unrealized_pnl.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <p>Loading portfolio data...</p>
          )}
        </div>
      )}

      {/* Smart Alerts Tab */}
      {activeTab === "alerts" && (
        <div>
          <h2>🔔 Smart Alerts & Notifications</h2>
          
          {/* Create New Alert */}
          <div style={{ 
            padding: "20px", 
            border: "1px solid #ddd", 
            borderRadius: "8px",
            marginBottom: "20px",
            backgroundColor: "#f9f9f9"
          }}>
            <h3>Create New Alert</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", alignItems: "end" }}>
              <div>
                <label>Symbol:</label>
                <input
                  type="text"
                  value={newAlert.symbol}
                  onChange={(e) => setNewAlert({...newAlert, symbol: e.target.value})}
                  placeholder="e.g., RELIANCE"
                  style={{ width: "100%", padding: "8px", marginTop: "5px" }}
                />
              </div>
              <div>
                <label>Alert Type:</label>
                <select
                  value={newAlert.alert_type}
                  onChange={(e) => setNewAlert({...newAlert, alert_type: e.target.value})}
                  style={{ width: "100%", padding: "8px", marginTop: "5px" }}
                >
                  <option value="price_above">Price Above</option>
                  <option value="price_below">Price Below</option>
                  <option value="volume_spike">Volume Spike</option>
                  <option value="rsi_oversold">RSI Oversold</option>
                  <option value="rsi_overbought">RSI Overbought</option>
                </select>
              </div>
              <div>
                <label>Priority:</label>
                <select
                  value={newAlert.priority}
                  onChange={(e) => setNewAlert({...newAlert, priority: e.target.value})}
                  style={{ width: "100%", padding: "8px", marginTop: "5px" }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <button
                  onClick={createAlert}
                  disabled={loading || !newAlert.symbol}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#4CAF50",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  {loading ? "Creating..." : "Create Alert"}
                </button>
              </div>
            </div>
          </div>

          {/* Existing Alerts */}
          <div style={{ 
            padding: "20px", 
            border: "1px solid #ddd", 
            borderRadius: "8px",
            backgroundColor: "#f9f9f9"
          }}>
            <h3>Active Alerts</h3>
            {alerts.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#e0e0e0" }}>
                      <th style={{ padding: "10px", textAlign: "left" }}>Symbol</th>
                      <th style={{ padding: "10px", textAlign: "left" }}>Type</th>
                      <th style={{ padding: "10px", textAlign: "left" }}>Priority</th>
                      <th style={{ padding: "10px", textAlign: "center" }}>Status</th>
                      <th style={{ padding: "10px", textAlign: "right" }}>Triggers</th>
                      <th style={{ padding: "10px", textAlign: "left" }}>Last Triggered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert, index) => (
                      <tr key={index}>
                        <td style={{ padding: "10px" }}>{alert.symbol}</td>
                        <td style={{ padding: "10px" }}>{alert.alert_type.replace("_", " ")}</td>
                        <td style={{ padding: "10px" }}>
                          <span style={{ 
                            color: getPriorityColor(alert.priority),
                            fontWeight: "bold"
                          }}>
                            {alert.priority.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "10px", textAlign: "center" }}>
                          <span style={{ 
                            color: alert.enabled ? "#4CAF50" : "#F44336",
                            fontWeight: "bold"
                          }}>
                            {alert.enabled ? "✅ Active" : "❌ Disabled"}
                          </span>
                        </td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{alert.trigger_count}</td>
                        <td style={{ padding: "10px" }}>
                          {alert.last_triggered ? 
                            new Date(alert.last_triggered).toLocaleString() : 
                            "Never"
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No alerts created yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Backtesting Tab */}
      {activeTab === "backtesting" && (
        <div>
          <h2>🧪 Strategy Backtesting</h2>
          
          <div style={{ 
            padding: "20px", 
            border: "1px solid #ddd", 
            borderRadius: "8px",
            marginBottom: "20px",
            backgroundColor: "#f9f9f9"
          }}>
            <h3>Run Backtest</h3>
            <p>Test your trading strategies against historical data to validate performance.</p>
            <button
              onClick={runBacktest}
              disabled={loading}
              style={{
                padding: "10px 20px",
                backgroundColor: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? "Running Backtest..." : "Run Demo Backtest"}
            </button>
          </div>

          {backtestResult && (
            <div style={{ 
              padding: "20px", 
              border: "1px solid #ddd", 
              borderRadius: "8px",
              backgroundColor: "#f9f9f9"
            }}>
              <h3>Backtest Results</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div>
                  <h4>Performance Metrics</h4>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Initial Capital:</span>
                      <strong>₹{backtestResult.initial_capital.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Final Capital:</span>
                      <strong>₹{backtestResult.final_capital.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Total Return:</span>
                      <strong style={{ 
                        color: backtestResult.total_return >= 0 ? "#4CAF50" : "#F44336"
                      }}>
                        {(backtestResult.total_return * 100).toFixed(2)}%
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Annualized Return:</span>
                      <strong style={{ 
                        color: backtestResult.annualized_return >= 0 ? "#4CAF50" : "#F44336"
                      }}>
                        {(backtestResult.annualized_return * 100).toFixed(2)}%
                      </strong>
                    </div>
                  </div>
                </div>
                <div>
                  <h4>Risk Metrics</h4>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Sharpe Ratio:</span>
                      <strong>{backtestResult.sharpe_ratio.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Max Drawdown:</span>
                      <strong style={{ color: "#F44336" }}>
                        {(backtestResult.max_drawdown * 100).toFixed(2)}%
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Win Rate:</span>
                      <strong>{(backtestResult.win_rate * 100).toFixed(1)}%</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Total Trades:</span>
                      <strong>{backtestResult.total_trades}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Charts Tab */}
      {activeTab === "charts" && (
        <div>
          <h2>📈 Advanced Charting</h2>
          
          <div style={{ 
            padding: "20px", 
            border: "1px solid #ddd", 
            borderRadius: "8px",
            backgroundColor: "#f9f9f9"
          }}>
            <h3>Technical Analysis Chart</h3>
            <p>Advanced charting with multiple technical indicators and real-time data.</p>
            
            {/* Sample chart data - in real implementation, this would come from your data source */}
            <div style={{ 
              height: "400px", 
              border: "1px solid #ccc", 
              borderRadius: "5px",
              backgroundColor: "#1a1a1a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white"
            }}>
              <div style={{ textAlign: "center" }}>
                <h4>📊 Advanced Chart Component</h4>
                <p>This would display:</p>
                <ul style={{ textAlign: "left", margin: "20px 0" }}>
                  <li>📈 Candlestick charts with OHLC data</li>
                  <li>📊 Multiple technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands)</li>
                  <li>🔍 Zoom and pan functionality</li>
                  <li>📱 Responsive design</li>
                  <li>⚡ Real-time data updates</li>
                </ul>
                <p style={{ fontSize: "14px", opacity: 0.7 }}>
                  The AdvancedChart component is ready to use with your market data.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
