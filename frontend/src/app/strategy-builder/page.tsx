"use client";

import { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

type Template = { name: string; type: "sma" | "ema"; symbols: string; exchange: string; short: number; long: number; live: boolean };

export default function StrategyBuilder() {
  const [type, setType] = useState<"sma" | "ema">("sma");
  const [symbols, setSymbols] = useState<string>("TCS INFY RELIANCE");
  const [exchange, setExchange] = useState<string>("NSE");
  const [shortW, setShortW] = useState<number>(20);
  const [longW, setLongW] = useState<number>(50);
  const [live, setLive] = useState<boolean>(false);
  const [status, setStatus] = useState<any>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("strategy_templates");
      if (raw) setTemplates(JSON.parse(raw));
    } catch {}
  }, []);

  const saveTemplates = (t: Template[]) => {
    setTemplates(t);
    try { localStorage.setItem("strategy_templates", JSON.stringify(t)); } catch {}
  };

  const start = async () => {
    const url = type === "ema" ? "/strategy/ema/start" : "/strategy/sma/start";
    await fetch(backendUrl + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: symbols.split(/\s+/).filter(Boolean), exchange, short: shortW, long: longW, live }),
    });
    await getStatus();
  };

  const stop = async () => {
    await fetch(backendUrl + "/strategy/stop", { method: "POST" });
    await getStatus();
  };

  const getStatus = async () => {
    const s = await (await fetch(backendUrl + "/strategy/status")).json();
    setStatus(s);
  };

  const saveTemplate = () => {
    const name = prompt("Template name?") || "My Strategy";
    const t: Template = { name, type, symbols, exchange, short: shortW, long: longW, live };
    const next = [...templates.filter((x) => x.name !== name), t];
    saveTemplates(next);
  };

  const loadTemplate = (t: Template) => {
    setType(t.type);
    setSymbols(t.symbols);
    setExchange(t.exchange);
    setShortW(t.short);
    setLongW(t.long);
    setLive(t.live);
  };

  return (
    <main>
      <h2>Strategy Builder</h2>
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
        <select value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="sma">SMA Crossover</option>
          <option value="ema">EMA Crossover</option>
        </select>
        <select value={exchange} onChange={(e) => setExchange(e.target.value)}>
          <option value="NSE">NSE</option>
          <option value="BSE">BSE</option>
          <option value="NFO">NFO</option>
        </select>
        <input value={shortW} onChange={(e) => setShortW(Number(e.target.value || 20))} placeholder="Short" />
        <input value={longW} onChange={(e) => setLongW(Number(e.target.value || 50))} placeholder="Long" />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live
        </label>
        <div />
        <input value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="Symbols (space separated)" style={{ gridColumn: "1 / span 6" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={start}>Start</button>
        <button className="btn btn-danger" onClick={stop}>Stop</button>
        <button className="btn" onClick={getStatus}>Status</button>
        <button className="btn" onClick={saveTemplate}>Save Template</button>
      </div>
      {status && (
        <div className="card" style={{ marginTop: 12 }}>
          <div>Active: {String(status.active)}</div>
          <div>Live: {String(status.live)}</div>
          <div>Exchange: {status.exchange}</div>
          <div>Last Signals: {JSON.stringify(status.last_signals)}</div>
        </div>
      )}
      {templates.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4>Templates</h4>
          {templates.map((t) => (
            <div key={t.name} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <div style={{ flex: 1 }}>{t.name} · {t.type.toUpperCase()} · {t.exchange} · {t.short}/{t.long} · {t.live ? "LIVE" : "PAPER"}</div>
              <button className="btn" onClick={() => loadTemplate(t)}>Load</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}


