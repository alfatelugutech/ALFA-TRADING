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
  // Page disabled per request; keep minimal shell to avoid route errors
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

  useEffect(() => {}, []);

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
    <main>
      <h2>AI Trading</h2>
      <p>This feature has been disabled.</p>
    </main>
  );
}