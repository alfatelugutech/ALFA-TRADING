"use client";

import { useEffect, useState } from "react";

type AIStrategy = {
  name: string;
  description: string;
  risk_level: "low" | "medium" | "high";
  expected_return: number;
  max_drawdown: number;
  confidence: number;
};

type AIRecommendation = {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  target_price?: number;
  stop_loss?: number;
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function AITradingPage() {
  const [aiActive, setAiActive] = useState<boolean>(false);
  const [aiCapital, setAiCapital] = useState<number>(100000);
  const [aiRisk, setAiRisk] = useState<number>(2);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("sma");
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [aiPerformance, setAiPerformance] = useState<any>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: "info" | "success" | "error" }[]>([]);

  const strategies: AIStrategy[] = [
    {
      name: "SMA Crossover",
      description: "Simple Moving Average crossover strategy with AI-optimized parameters",
      risk_level: "medium",
      expected_return: 12.5,
      max_drawdown: 8.2,
      confidence: 0.78
    },
    {
      name: "EMA Momentum",
      description: "Exponential Moving Average momentum strategy with dynamic risk management",
      risk_level: "high",
      expected_return: 18.3,
      max_drawdown: 12.1,
      confidence: 0.82
    },
    {
      name: "RSI Mean Reversion",
      description: "RSI-based mean reversion strategy with AI market regime detection",
      risk_level: "low",
      expected_return: 8.7,
      max_drawdown: 5.4,
      confidence: 0.71
    },
    {
      name: "Bollinger Bands",
      description: "Bollinger Bands strategy with AI volatility prediction",
      risk_level: "medium",
      expected_return: 14.2,
      max_drawdown: 9.8,
      confidence: 0.75
    },
    {
      name: "Multi-Factor AI",
      description: "Advanced multi-factor model combining technical, fundamental, and sentiment analysis",
      risk_level: "high",
      expected_return: 22.1,
      max_drawdown: 15.3,
      confidence: 0.85
    }
  ];

  const pushToast = (text: string, kind: "info" | "success" | "error" = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  const loadAIStatus = async () => {
    try {
      const data = await (await fetch(backendUrl + "/status/all")).json();
      if (data?.ai) {
        setAiActive(!!data.ai.active);
        setAiCapital(Number(data.ai.trade_capital || 100000));
        setAiRisk(Number((data.ai.risk_pct || 0.02) * 100));
      }
    } catch (error) {
      pushToast("Failed to load AI status", "error");
    }
  };

  const loadRecommendations = async () => {
    try {
      const data = await (await fetch(backendUrl + "/ai/recommendations")).json();
      setRecommendations(data.recommendations || []);
    } catch (error) {
      pushToast("Failed to load AI recommendations", "error");
    }
  };

  const loadPerformance = async () => {
    try {
      const data = await (await fetch(backendUrl + "/ai/performance")).json();
      setAIPerformance(data);
    } catch (error) {
      pushToast("Failed to load AI performance", "error");
    }
  };

  useEffect(() => {
    loadAIStatus();
    loadRecommendations();
    loadPerformance();
  }, []);

  const saveAIConfig = async () => {
    try {
      await fetch(backendUrl + "/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: aiActive,
          trade_capital: aiCapital,
          risk_pct: aiRisk / 100
        })
      });
      pushToast("AI configuration saved", "success");
    } catch (error) {
      pushToast("Failed to save AI configuration", "error");
    }
  };

  const startAI = async () => {
    try {
      await saveAIConfig();
      await fetch(backendUrl + "/ai/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: selectedStrategy })
      });
      setAiActive(true);
      pushToast("AI trading started", "success");
    } catch (error) {
      pushToast("Failed to start AI trading", "error");
    }
  };

  const stopAI = async () => {
    try {
      await fetch(backendUrl + "/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false })
      });
      await fetch(backendUrl + "/strategy/stop", { method: "POST" });
      setAiActive(false);
      pushToast("AI trading stopped", "success");
    } catch (error) {
      pushToast("Failed to stop AI trading", "error");
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low": return "#28a745";
      case "medium": return "#ffc107";
      case "high": return "#dc3545";
      default: return "#6c757d";
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "BUY": return "#28a745";
      case "SELL": return "#dc3545";
      case "HOLD": return "#6c757d";
      default: return "#6c757d";
    }
  };

  return (
    <div style={{ 
      display: "grid", 
      gridTemplateColumns: "1fr 1fr", 
      gap: "20px", 
      padding: "20px",
      minHeight: "100vh",
      backgroundColor: "#f8f9fa"
    }}>
      {/* AI Configuration Panel */}
      <div style={{ 
        backgroundColor: "white", 
        padding: "20px", 
        borderRadius: "8px", 
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <h2 style={{ margin: "0 0 20px 0", fontSize: "24px", fontWeight: "bold" }}>🤖 AI Trading Configuration</h2>
        
        {/* AI Status */}
        <div style={{ 
          padding: "16px", 
          backgroundColor: aiActive ? "#d4edda" : "#f8d7da", 
          borderRadius: "8px", 
          marginBottom: "20px",
          border: `1px solid ${aiActive ? "#c3e6cb" : "#f5c6cb"}`
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: "0 0 4px 0", color: aiActive ? "#155724" : "#721c24" }}>
                AI Trading: {aiActive ? "🟢 ACTIVE" : "🔴 INACTIVE"}
              </h3>
              <p style={{ margin: 0, fontSize: "14px", color: aiActive ? "#155724" : "#721c24" }}>
                {aiActive ? "AI is actively managing your portfolio" : "AI trading is currently disabled"}
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={startAI}
                disabled={aiActive}
                style={{
                  padding: "8px 16px",
                  backgroundColor: aiActive ? "#6c757d" : "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: aiActive ? "not-allowed" : "pointer",
                  fontSize: "14px"
                }}
              >
                Start AI
              </button>
              <button
                onClick={stopAI}
                disabled={!aiActive}
                style={{
                  padding: "8px 16px",
                  backgroundColor: !aiActive ? "#6c757d" : "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: !aiActive ? "not-allowed" : "pointer",
                  fontSize: "14px"
                }}
              >
                Stop AI
              </button>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
              Trading Capital (₹)
            </label>
            <input
              type="number"
              value={aiCapital}
              onChange={(e) => setAiCapital(Number(e.target.value))}
              style={{ 
                width: "100%", 
                padding: "8px", 
                border: "1px solid #ddd", 
                borderRadius: "4px",
                fontSize: "14px"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
              Risk Per Trade (%)
            </label>
            <input
              type="number"
              value={aiRisk}
              onChange={(e) => setAiRisk(Number(e.target.value))}
              min="0.1"
              max="10"
              step="0.1"
              style={{ 
                width: "100%", 
                padding: "8px", 
                border: "1px solid #ddd", 
                borderRadius: "4px",
                fontSize: "14px"
              }}
            />
            <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
              Risk per trade: ₹{(aiCapital * aiRisk / 100).toLocaleString()}
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
              AI Strategy
            </label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              style={{ 
                width: "100%", 
                padding: "8px", 
                border: "1px solid #ddd", 
                borderRadius: "4px",
                fontSize: "14px"
              }}
            >
              {strategies.map(strategy => (
                <option key={strategy.name.toLowerCase().replace(/\s+/g, '_')} value={strategy.name.toLowerCase().replace(/\s+/g, '_')}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={saveAIConfig}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "bold"
            }}
          >
            Save Configuration
          </button>
        </div>
      </div>

      {/* AI Strategies & Recommendations */}
      <div style={{ 
        backgroundColor: "white", 
        padding: "20px", 
        borderRadius: "8px", 
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <h2 style={{ margin: "0 0 20px 0", fontSize: "24px", fontWeight: "bold" }}>📊 AI Strategies</h2>
        
        {/* Strategy Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
          {strategies.map(strategy => (
            <div
              key={strategy.name}
              style={{
                padding: "16px",
                border: selectedStrategy === strategy.name.toLowerCase().replace(/\s+/g, '_') ? "2px solid #007bff" : "1px solid #ddd",
                borderRadius: "8px",
                cursor: "pointer",
                backgroundColor: selectedStrategy === strategy.name.toLowerCase().replace(/\s+/g, '_') ? "#f8f9ff" : "#f8f9fa"
              }}
              onClick={() => setSelectedStrategy(strategy.name.toLowerCase().replace(/\s+/g, '_'))}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>{strategy.name}</h4>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  backgroundColor: getRiskColor(strategy.risk_level),
                  color: "white"
                }}>
                  {strategy.risk_level.toUpperCase()}
                </span>
              </div>
              <p style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#666" }}>{strategy.description}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", fontSize: "12px" }}>
                <div>
                  <span style={{ color: "#666" }}>Expected Return:</span>
                  <div style={{ fontWeight: "bold", color: "#28a745" }}>{strategy.expected_return}%</div>
                </div>
                <div>
                  <span style={{ color: "#666" }}>Max Drawdown:</span>
                  <div style={{ fontWeight: "bold", color: "#dc3545" }}>{strategy.max_drawdown}%</div>
                </div>
                <div>
                  <span style={{ color: "#666" }}>Confidence:</span>
                  <div style={{ fontWeight: "bold", color: "#007bff" }}>{(strategy.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* AI Recommendations */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3>AI Recommendations</h3>
            <button
              onClick={loadRecommendations}
              style={{
                padding: "6px 12px",
                backgroundColor: "#007bff",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              Refresh
            </button>
          </div>
          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            {recommendations.length > 0 ? (
              recommendations.map((rec, index) => (
                <div key={index} style={{
                  padding: "12px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  backgroundColor: "#f8f9fa"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontWeight: "bold", fontSize: "16px" }}>{rec.symbol}</span>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      backgroundColor: getActionColor(rec.action),
                      color: "white"
                    }}>
                      {rec.action}
                    </span>
                  </div>
                  <p style={{ margin: "0 0 8px 0", fontSize: "14px" }}>{rec.reasoning}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#666" }}>
                    <span>Confidence: {(rec.confidence * 100).toFixed(0)}%</span>
                    {rec.target_price && <span>Target: ₹{rec.target_price.toFixed(2)}</span>}
                    {rec.stop_loss && <span>Stop Loss: ₹{rec.stop_loss.toFixed(2)}</span>}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                No AI recommendations available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Performance (Full Width) */}
      {aiPerformance && (
        <div style={{ 
          gridColumn: "1 / -1",
          backgroundColor: "white", 
          padding: "20px", 
          borderRadius: "8px", 
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h3>AI Performance Metrics</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            <div style={{ textAlign: "center", padding: "16px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#28a745" }}>
                {aiPerformance.total_return || 0}%
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>Total Return</div>
            </div>
            <div style={{ textAlign: "center", padding: "16px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#007bff" }}>
                {aiPerformance.sharpe_ratio || 0}
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>Sharpe Ratio</div>
            </div>
            <div style={{ textAlign: "center", padding: "16px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#dc3545" }}>
                {aiPerformance.max_drawdown || 0}%
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>Max Drawdown</div>
            </div>
            <div style={{ textAlign: "center", padding: "16px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ffc107" }}>
                {aiPerformance.win_rate || 0}%
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>Win Rate</div>
            </div>
          </div>
        </div>
      )}

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