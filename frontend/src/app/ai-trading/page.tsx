"use client";

import { useEffect, useState } from "react";

type AIRecommendation = {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
};

const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== "undefined" ? window.location.origin : "")) as string;

export default function AITradingPage() {
  const [aiActive, setAiActive] = useState<boolean>(false);
  const [aiCapital, setAiCapital] = useState<number>(100000);
  const [aiRisk, setAiRisk] = useState<number>(2);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: "info" | "success" | "error" }[]>([]);

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
    } catch {}
  };

  const loadRecommendations = async () => {
    try {
      const data = await (await fetch(backendUrl + "/ai/recommendations")).json();
      setRecommendations(data.recommendations || []);
    } catch {}
  };

  useEffect(() => {
    loadAIStatus();
    loadRecommendations();
  }, []);

  const saveAIConfig = async () => {
    try {
      await fetch(backendUrl + "/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: aiActive, trade_capital: aiCapital, risk_pct: aiRisk / 100 })
      });
      pushToast("AI configuration saved", "success");
    } catch {
      pushToast("Failed to save AI configuration", "error");
    }
  };

  const startAI = async () => {
    try {
      await saveAIConfig();
      await fetch(backendUrl + "/ai/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: "sma" }) });
      setAiActive(true);
      pushToast("AI trading started", "success");
    } catch {
      pushToast("Failed to start AI trading", "error");
    }
  };

  const stopAI = async () => {
    try {
      await fetch(backendUrl + "/ai/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) });
      await fetch(backendUrl + "/strategy/stop", { method: "POST" });
      setAiActive(false);
      pushToast("AI trading stopped", "success");
    } catch {
      pushToast("Failed to stop AI trading", "error");
    }
  };

  return (
    <main>
      <h2>AI Trading</h2>
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={aiActive} onChange={(e)=>setAiActive(e.target.checked)} /> Active
        </label>
        <input type="number" value={aiCapital} onChange={(e)=>setAiCapital(Number(e.target.value || 0))} placeholder="Trading capital (₹)" />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="number" value={aiRisk} onChange={(e)=>setAiRisk(Number(e.target.value || 0))} placeholder="Risk %" /> % per trade
        </div>
        <div style={{ gridColumn: "1 / span 2", display: "flex", gap: 8 }}>
          <button className="btn" onClick={saveAIConfig}>Save Config</button>
          <button className="btn btn-success" onClick={startAI}>Start AI</button>
          <button className="btn btn-danger" onClick={stopAI}>Stop AI</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>AI Recommendations</h3>
        {recommendations.length ? (
          <ul>
            {recommendations.map((r, i) => (
              <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: 6, borderBottom: "1px solid #eee" }}>
                <span>{r.symbol}</span>
                <span style={{ fontWeight: 600 }}>{r.action}</span>
                <span style={{ color: "#666" }}>{Math.round((r.confidence || 0) * 100)}%</span>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ color: "#666" }}>No recommendations</div>
        )}
      </div>

      <div style={{ position: "fixed", top: 16, right: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t)=> (
          <div key={t.id} style={{ background: t.kind === "error" ? "#fee2e2" : t.kind === "success" ? "#dcfce7" : "#e5e7eb", color: "#111", padding: "8px 12px", borderRadius: 8, boxShadow: "0 2px 6px rgba(0,0,0,0.15)", minWidth: 220 }}>
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}


