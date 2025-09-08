"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

type MarketCondition = {
  trend: string;
  volatility: string;
  volume: string;
  momentum: string;
  rsi_level: string;
  support_resistance: string;
};

type StrategyRecommendation = {
  strategy: string;
  confidence: number;
  expected_profit: number;
  risk_level: string;
  symbols: string[];
  parameters: any;
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

type TradingUniverse = {
  equity_universe: string[];
  options_universe: string[];
  futures_universe: string[];
  total_equity_symbols: number;
  total_options_symbols: number;
  total_futures_symbols: number;
};

export default function AITrading() {
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [marketCondition, setMarketCondition] = useState<MarketCondition | null>(null);
  const [recommendations, setRecommendations] = useState<StrategyRecommendation[]>([]);
  const [tradingUniverse, setTradingUniverse] = useState<TradingUniverse | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [capital, setCapital] = useState(100000);
  const [liveMode, setLiveMode] = useState(false);

  const loadAIStatus = async () => {
    try {
      const response = await fetch(`${backendUrl}/ai/status`);
      const data = await response.json();
      setAiStatus(data);
    } catch (error) {
      console.error("Failed to load AI status:", error);
    }
  };

  const loadMarketAnalysis = async () => {
    try {
      const response = await fetch(`${backendUrl}/ai/analyze`);
      const data = await response.json();
      if (data.market_condition) {
        setMarketCondition(data.market_condition);
        setRecommendations(data.recommendations || []);
      }
    } catch (error) {
      console.error("Failed to load market analysis:", error);
    }
  };

  const loadTradingUniverse = async () => {
    try {
      const response = await fetch(`${backendUrl}/ai/symbols`);
      const data = await response.json();
      setTradingUniverse(data);
    } catch (error) {
      console.error("Failed to load trading universe:", error);
    }
  };

  const startAITrading = async () => {
    setIsStarting(true);
    try {
      const response = await fetch(`${backendUrl}/ai/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          live: liveMode,
          capital: capital,
          max_strategies: 3
        })
      });
      const data = await response.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
      } else {
        alert("AI Trading started successfully!");
        await loadAIStatus();
      }
    } catch (error) {
      console.error("Failed to start AI trading:", error);
      alert("Failed to start AI trading");
    } finally {
      setIsStarting(false);
    }
  };

  const stopAITrading = async () => {
    setIsStopping(true);
    try {
      const response = await fetch(`${backendUrl}/ai/stop`, {
        method: "POST"
      });
      const data = await response.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
      } else {
        alert("AI Trading stopped successfully!");
        await loadAIStatus();
      }
    } catch (error) {
      console.error("Failed to stop AI trading:", error);
      alert("Failed to stop AI trading");
    } finally {
      setIsStopping(false);
    }
  };

  useEffect(() => {
    loadAIStatus();
    loadMarketAnalysis();
    loadTradingUniverse();
    
    const interval = setInterval(() => {
      loadAIStatus();
      loadMarketAnalysis();
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case "bullish": return "#10b981";
      case "bearish": return "#ef4444";
      case "high": return "#f59e0b";
      case "low": return "#6b7280";
      case "strong": return "#10b981";
      case "weak": return "#ef4444";
      case "oversold": return "#3b82f6";
      case "overbought": return "#f59e0b";
      default: return "#6b7280";
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low": return "#10b981";
      case "medium": return "#f59e0b";
      case "high": return "#ef4444";
      default: return "#6b7280";
    }
  };

  return (
    <main>
      <h2>🤖 AI Trading Engine</h2>
      
      {/* AI Trading Control */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>AI Trading Control</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div>
            <label>Trading Capital (₹)</label>
            <input 
              type="number" 
              value={capital} 
              onChange={(e) => setCapital(Number(e.target.value))}
              disabled={aiStatus?.active}
            />
          </div>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input 
                type="checkbox" 
                checked={liveMode} 
                onChange={(e) => setLiveMode(e.target.checked)}
                disabled={aiStatus?.active}
              /> 
              Live Trading Mode
            </label>
          </div>
          <div>
            <label>Status</label>
            <div style={{ 
              padding: 8, 
              borderRadius: 4, 
              backgroundColor: aiStatus?.active ? "#10b981" : "#6b7280",
              color: "white",
              textAlign: "center"
            }}>
              {aiStatus?.active ? "🟢 ACTIVE" : "🔴 INACTIVE"}
            </div>
          </div>
          <div>
            <label>Actions</label>
            <div style={{ display: "flex", gap: 8 }}>
              {!aiStatus?.active ? (
                <button 
                  className="btn btn-primary" 
                  onClick={startAITrading}
                  disabled={isStarting}
                >
                  {isStarting ? "Starting..." : "Start AI Trading"}
                </button>
              ) : (
                <button 
                  className="btn btn-danger" 
                  onClick={stopAITrading}
                  disabled={isStopping}
                >
                  {isStopping ? "Stopping..." : "Stop AI Trading"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Performance */}
      {aiStatus?.active && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>AI Performance</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            <div>
              <strong>Total Trades</strong>
              <div style={{ fontSize: "1.5em", color: "#3b82f6" }}>
                {aiStatus.total_trades || 0}
              </div>
            </div>
            <div>
              <strong>Success Rate</strong>
              <div style={{ fontSize: "1.5em", color: "#10b981" }}>
                {aiStatus.success_rate?.toFixed(1) || 0}%
              </div>
            </div>
            <div>
              <strong>Total Profit</strong>
              <div style={{ 
                fontSize: "1.5em", 
                color: (aiStatus.total_profit || 0) >= 0 ? "#10b981" : "#ef4444" 
              }}>
                ₹{(aiStatus.total_profit || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <strong>Active Strategies</strong>
              <div style={{ fontSize: "1.5em", color: "#f59e0b" }}>
                {aiStatus.active_strategies?.length || 0}
              </div>
            </div>
            <div>
              <strong>Available Capital</strong>
              <div style={{ fontSize: "1.5em", color: "#6b7280" }}>
                ₹{(aiStatus.available_capital || 0).toLocaleString()}
              </div>
            </div>
          </div>
          
          {aiStatus.active_strategies && aiStatus.active_strategies.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4>Active Strategies</h4>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {aiStatus.active_strategies.map((strategy, index) => (
                  <span 
                    key={index}
                    style={{ 
                      padding: "4px 8px", 
                      backgroundColor: "#3b82f6", 
                      color: "white", 
                      borderRadius: 4,
                      fontSize: "0.9em"
                    }}
                  >
                    {strategy.replace('_', ' ').toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Market Analysis */}
      {marketCondition && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>📊 Market Analysis</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            <div>
              <strong>Trend</strong>
              <div style={{ 
                padding: 8, 
                borderRadius: 4, 
                backgroundColor: getConditionColor(marketCondition.trend),
                color: "white",
                textAlign: "center"
              }}>
                {marketCondition.trend.toUpperCase()}
              </div>
            </div>
            <div>
              <strong>Volatility</strong>
              <div style={{ 
                padding: 8, 
                borderRadius: 4, 
                backgroundColor: getConditionColor(marketCondition.volatility),
                color: "white",
                textAlign: "center"
              }}>
                {marketCondition.volatility.toUpperCase()}
              </div>
            </div>
            <div>
              <strong>Momentum</strong>
              <div style={{ 
                padding: 8, 
                borderRadius: 4, 
                backgroundColor: getConditionColor(marketCondition.momentum),
                color: "white",
                textAlign: "center"
              }}>
                {marketCondition.momentum.toUpperCase()}
              </div>
            </div>
            <div>
              <strong>Volume</strong>
              <div style={{ 
                padding: 8, 
                borderRadius: 4, 
                backgroundColor: getConditionColor(marketCondition.volume),
                color: "white",
                textAlign: "center"
              }}>
                {marketCondition.volume.toUpperCase()}
              </div>
            </div>
            <div>
              <strong>RSI Level</strong>
              <div style={{ 
                padding: 8, 
                borderRadius: 4, 
                backgroundColor: getConditionColor(marketCondition.rsi_level),
                color: "white",
                textAlign: "center"
              }}>
                {marketCondition.rsi_level.toUpperCase()}
              </div>
            </div>
            <div>
              <strong>Support/Resistance</strong>
              <div style={{ 
                padding: 8, 
                borderRadius: 4, 
                backgroundColor: getConditionColor(marketCondition.support_resistance),
                color: "white",
                textAlign: "center"
              }}>
                {marketCondition.support_resistance.replace('_', ' ').toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Recommendations */}
      {recommendations.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>🎯 AI Strategy Recommendations</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {recommendations.slice(0, 5).map((rec, index) => (
              <div 
                key={index}
                style={{ 
                  padding: 16, 
                  border: "1px solid #e5e7eb", 
                  borderRadius: 8,
                  backgroundColor: index === 0 ? "#f0f9ff" : "white"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: index === 0 ? "#1e40af" : "inherit" }}>
                    {index === 0 ? "🥇 " : index === 1 ? "🥈 " : index === 2 ? "🥉 " : ""}
                    {rec.strategy.replace('_', ' ').toUpperCase()}
                  </h4>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ 
                      padding: "4px 8px", 
                      backgroundColor: getRiskColor(rec.risk_level),
                      color: "white",
                      borderRadius: 4,
                      fontSize: "0.8em"
                    }}>
                      {rec.risk_level.toUpperCase()} RISK
                    </span>
                    <span style={{ 
                      padding: "4px 8px", 
                      backgroundColor: "#3b82f6",
                      color: "white",
                      borderRadius: 4,
                      fontSize: "0.8em"
                    }}>
                      {(rec.confidence * 100).toFixed(1)}% CONFIDENCE
                    </span>
                  </div>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 8 }}>
                  <div>
                    <strong>Expected Profit</strong>
                    <div style={{ color: "#10b981", fontSize: "1.2em" }}>
                      ₹{rec.expected_profit.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <strong>Symbols</strong>
                    <div style={{ fontSize: "0.9em" }}>
                      {rec.symbols.slice(0, 3).join(", ")}
                      {rec.symbols.length > 3 && ` +${rec.symbols.length - 3} more`}
                    </div>
                  </div>
                  <div>
                    <strong>Parameters</strong>
                    <div style={{ fontSize: "0.8em", color: "#6b7280" }}>
                      {Object.entries(rec.parameters).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(", ")}
                    </div>
                  </div>
                  <div>
                    <strong>Market Fit</strong>
                    <div style={{ 
                      fontSize: "0.9em",
                      color: rec.confidence > 0.8 ? "#10b981" : rec.confidence > 0.6 ? "#f59e0b" : "#6b7280"
                    }}>
                      {rec.confidence > 0.8 ? "Excellent" : rec.confidence > 0.6 ? "Good" : "Fair"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trading Universe */}
      {tradingUniverse && (
        <div className="card">
          <h3>🌍 Trading Universe</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <div>
              <h4>Equity Markets</h4>
              <div style={{ fontSize: "2em", color: "#3b82f6", marginBottom: 8 }}>
                {tradingUniverse.total_equity_symbols}
              </div>
              <div style={{ fontSize: "0.9em", color: "#6b7280" }}>
                Large, Mid & Small Cap stocks
              </div>
              <div style={{ marginTop: 8, maxHeight: 150, overflowY: "auto" }}>
                {tradingUniverse.equity_universe.slice(0, 20).map((symbol, index) => (
                  <span 
                    key={index}
                    style={{ 
                      display: "inline-block",
                      padding: "2px 6px", 
                      margin: "1px",
                      backgroundColor: "#f3f4f6", 
                      borderRadius: 3,
                      fontSize: "0.8em"
                    }}
                  >
                    {symbol}
                  </span>
                ))}
                {tradingUniverse.equity_universe.length > 20 && (
                  <div style={{ fontSize: "0.8em", color: "#6b7280", marginTop: 4 }}>
                    +{tradingUniverse.equity_universe.length - 20} more...
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <h4>Options Markets</h4>
              <div style={{ fontSize: "2em", color: "#f59e0b", marginBottom: 8 }}>
                {tradingUniverse.total_options_symbols}
              </div>
              <div style={{ fontSize: "0.9em", color: "#6b7280" }}>
                Index & Stock options
              </div>
              <div style={{ marginTop: 8 }}>
                {tradingUniverse.options_universe.map((symbol, index) => (
                  <div 
                    key={index}
                    style={{ 
                      padding: "4px 8px", 
                      margin: "2px 0",
                      backgroundColor: "#fef3c7", 
                      borderRadius: 4,
                      fontSize: "0.9em"
                    }}
                  >
                    {symbol}
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h4>Futures Markets</h4>
              <div style={{ fontSize: "2em", color: "#10b981", marginBottom: 8 }}>
                {tradingUniverse.total_futures_symbols}
              </div>
              <div style={{ fontSize: "0.9em", color: "#6b7280" }}>
                Index & Stock futures
              </div>
              <div style={{ marginTop: 8 }}>
                {tradingUniverse.futures_universe.map((symbol, index) => (
                  <div 
                    key={index}
                    style={{ 
                      padding: "4px 8px", 
                      margin: "2px 0",
                      backgroundColor: "#d1fae5", 
                      borderRadius: 4,
                      fontSize: "0.9em"
                    }}
                  >
                    {symbol}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
