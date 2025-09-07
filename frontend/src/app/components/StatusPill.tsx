"use client";

import React from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function StatusPill() {
  const [data, setData] = React.useState<any>(null);
  const load = async () => {
    try {
      const d = await (await fetch(backendUrl + "/status/all")).json();
      setData(d);
    } catch {}
  };
  React.useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const color = data?.auth ? (data?.dry_run ? "#ca8a04" : "#22c55e") : "#ef4444";
  const text = data?.auth ? (data?.dry_run ? "AUTH • PAPER" : "AUTH • LIVE") : "NO AUTH";
  const orders = data?.orders ?? 0;
  const subs = data?.subscriptions ?? 0;

  const toggleMode = async () => {
    try {
      await fetch(backendUrl + "/config/dry_run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: !data?.dry_run }) });
      load();
    } catch {}
  };

  const startStrategy = async () => {
    try {
      const s = await (await fetch(backendUrl + "/schedule")).json();
      const c = s?.config || {};
      const symbols = (c.symbols || []).map((x: any) => String(x));
      if (!symbols.length) return;
      const body = {
        symbols,
        exchange: c.exchange || "NSE",
        short: Number(c.short || 20),
        long: Number(c.long || 50),
        live: !!c.live,
      };
      const url = (c.strategy || "sma") === "ema" ? "/strategy/ema/start" : "/strategy/sma/start";
      await fetch(backendUrl + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      load();
    } catch {}
  };

  const stopStrategy = async () => {
    try {
      await fetch(backendUrl + "/strategy/stop", { method: "POST" });
      load();
    } catch {}
  };

  const startAITrading = async () => {
    try {
      const capStr = prompt("AI trade capital", String((data?.ai?.trade_capital ?? 10000)));
      const riskStr = prompt("Risk % per trade", String(((data?.ai?.risk_pct ?? 0.01) * 100)));
      const cap = Number(capStr || 10000);
      const riskPct = Number(riskStr || 1) / 100;
      await fetch(backendUrl + "/ai/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true, trade_capital: cap, risk_pct: riskPct }) });
      await startStrategy();
      load();
    } catch {}
  };

  const stopAITrading = async () => {
    try {
      await fetch(backendUrl + "/ai/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false, trade_capital: data?.ai?.trade_capital ?? 10000, risk_pct: data?.ai?.risk_pct ?? 0.01 }) });
      await stopStrategy();
      load();
    } catch {}
  };

  return (
    <div style={{ position: "relative" }}>
      <details>
        <summary style={{ listStyle: "none", display: "inline-block" }}>
          <span style={{ background: color, color: "#fff", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
            {text} · O:{orders} · S:{subs}
          </span>
        </summary>
        <div className="card" style={{ position: "absolute", right: 0, marginTop: 8, zIndex: 20, minWidth: 300 }}>
          <div style={{ marginBottom: 6 }}>Auth: {String(!!data?.auth)} · Mode: {data?.dry_run ? "PAPER" : "LIVE"}</div>
          <div style={{ marginBottom: 6 }}>Orders: {orders} · Subscriptions: {subs}</div>
          <div style={{ marginBottom: 6 }}>Strategy: {data?.strategy?.active ? "ON" : "OFF"} {data?.strategy?.live ? "(LIVE)" : ""}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn" href="/orders">Orders</a>
            <a className="btn" href="/portfolio">Portfolio</a>
            <a className="btn" href="/market-data">Market Data</a>
            <a className="btn" href={backendUrl + "/health"} target="_blank" rel="noreferrer">Health</a>
            <a className="btn" href={backendUrl + "/auth/profile"} target="_blank" rel="noreferrer">Profile</a>
            <button className="btn btn-success" onClick={startStrategy}>Start</button>
            <button className="btn btn-danger" onClick={stopStrategy}>Stop</button>
            <button className="btn" onClick={toggleMode}>{data?.dry_run ? "Switch to LIVE" : "Switch to PAPER"}</button>
            <button className="btn btn-success" onClick={startAITrading}>Start AI</button>
            <button className="btn" onClick={stopAITrading}>Stop AI</button>
          </div>
        </div>
      </details>
    </div>
  );
}


