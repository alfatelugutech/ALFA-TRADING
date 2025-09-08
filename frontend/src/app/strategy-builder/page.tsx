"use client";

import { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

type Template = { 
  name: string; 
  type: "sma" | "ema" | "rsi" | "bollinger" | "macd" | "support_resistance" | "options_straddle" | "options_strangle"; 
  symbols: string; 
  exchange: string; 
  short: number; 
  long: number; 
  live: boolean;
  // Additional parameters for different strategies
  period?: number;
  oversold?: number;
  overbought?: number;
  std_dev?: number;
  fast_period?: number;
  slow_period?: number;
  signal_period?: number;
  lookback_period?: number;
  breakout_threshold?: number;
  underlying?: string;
  expiry?: string;
  quantity?: number;
  volatility_threshold?: number;
  otm_offset?: number;
};

export default function StrategyBuilder() {
  const [type, setType] = useState<"sma" | "ema" | "rsi" | "bollinger" | "macd" | "support_resistance" | "options_straddle" | "options_strangle">("sma");
  const [symbols, setSymbols] = useState<string>("TCS INFY RELIANCE");
  const [exchange, setExchange] = useState<string>("NSE");
  const [shortW, setShortW] = useState<number>(20);
  const [longW, setLongW] = useState<number>(50);
  const [live, setLive] = useState<boolean>(false);
  const [status, setStatus] = useState<any>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  
  // Additional strategy parameters
  const [period, setPeriod] = useState<number>(14);
  const [oversold, setOversold] = useState<number>(30);
  const [overbought, setOverbought] = useState<number>(70);
  const [stdDev, setStdDev] = useState<number>(2.0);
  const [fastPeriod, setFastPeriod] = useState<number>(12);
  const [slowPeriod, setSlowPeriod] = useState<number>(26);
  const [signalPeriod, setSignalPeriod] = useState<number>(9);
  const [lookbackPeriod, setLookbackPeriod] = useState<number>(50);
  const [breakoutThreshold, setBreakoutThreshold] = useState<number>(0.01);
  const [underlying, setUnderlying] = useState<string>("NIFTY");
  const [expiry, setExpiry] = useState<string>("next");
  const [quantity, setQuantity] = useState<number>(1);
  const [volatilityThreshold, setVolatilityThreshold] = useState<number>(0.02);
  const [otmOffset, setOtmOffset] = useState<number>(2);

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
    let url = "";
    let body: any = { symbols: symbols.split(/\s+/).filter(Boolean), exchange, live };
    
    switch (type) {
      case "sma":
        url = "/strategy/sma/start";
        body = { ...body, short: shortW, long: longW };
        break;
      case "ema":
        url = "/strategy/ema/start";
        body = { ...body, short: shortW, long: longW };
        break;
      case "rsi":
        url = "/strategy/rsi/start";
        body = { ...body, period, oversold, overbought };
        break;
      case "bollinger":
        url = "/strategy/bollinger/start";
        body = { ...body, period, std_dev: stdDev };
        break;
      case "macd":
        url = "/strategy/macd/start";
        body = { ...body, fast_period: fastPeriod, slow_period: slowPeriod, signal_period: signalPeriod };
        break;
      case "support_resistance":
        url = "/strategy/support_resistance/start";
        body = { ...body, lookback_period: lookbackPeriod, breakout_threshold: breakoutThreshold };
        break;
      case "options_straddle":
        url = "/strategy/options_straddle/start";
        body = { ...body, underlying, expiry, quantity, volatility_threshold: volatilityThreshold };
        break;
      case "options_strangle":
        url = "/strategy/options_strangle/start";
        body = { ...body, underlying, expiry, quantity, volatility_threshold: volatilityThreshold, otm_offset: otmOffset };
        break;
      default:
        alert("Unknown strategy type");
        return;
    }
    
    await fetch(backendUrl + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    const t: Template = { 
      name, type, symbols, exchange, short: shortW, long: longW, live,
      period, oversold, overbought, std_dev: stdDev,
      fast_period: fastPeriod, slow_period: slowPeriod, signal_period: signalPeriod,
      lookback_period: lookbackPeriod, breakout_threshold: breakoutThreshold,
      underlying, expiry, quantity, volatility_threshold: volatilityThreshold, otm_offset: otmOffset
    };
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
    setPeriod(t.period || 14);
    setOversold(t.oversold || 30);
    setOverbought(t.overbought || 70);
    setStdDev(t.std_dev || 2.0);
    setFastPeriod(t.fast_period || 12);
    setSlowPeriod(t.slow_period || 26);
    setSignalPeriod(t.signal_period || 9);
    setLookbackPeriod(t.lookback_period || 50);
    setBreakoutThreshold(t.breakout_threshold || 0.01);
    setUnderlying(t.underlying || "NIFTY");
    setExpiry(t.expiry || "next");
    setQuantity(t.quantity || 1);
    setVolatilityThreshold(t.volatility_threshold || 0.02);
    setOtmOffset(t.otm_offset || 2);
  };

  return (
    <main>
      <h2>Strategy Builder</h2>
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
        <select value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="sma">SMA Crossover</option>
          <option value="ema">EMA Crossover</option>
          <option value="rsi">RSI Strategy</option>
          <option value="bollinger">Bollinger Bands</option>
          <option value="macd">MACD Strategy</option>
          <option value="support_resistance">Support/Resistance</option>
          <option value="options_straddle">Options Straddle</option>
          <option value="options_strangle">Options Strangle</option>
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
      
      {/* Strategy-specific parameters */}
      {(type === "rsi") && (
        <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
          <input value={period} onChange={(e) => setPeriod(Number(e.target.value || 14))} placeholder="Period" />
          <input value={oversold} onChange={(e) => setOversold(Number(e.target.value || 30))} placeholder="Oversold" />
          <input value={overbought} onChange={(e) => setOverbought(Number(e.target.value || 70))} placeholder="Overbought" />
          <div />
        </div>
      )}
      
      {(type === "bollinger") && (
        <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
          <input value={period} onChange={(e) => setPeriod(Number(e.target.value || 20))} placeholder="Period" />
          <input value={stdDev} onChange={(e) => setStdDev(Number(e.target.value || 2.0))} placeholder="Std Dev" />
          <div />
          <div />
        </div>
      )}
      
      {(type === "macd") && (
        <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
          <input value={fastPeriod} onChange={(e) => setFastPeriod(Number(e.target.value || 12))} placeholder="Fast Period" />
          <input value={slowPeriod} onChange={(e) => setSlowPeriod(Number(e.target.value || 26))} placeholder="Slow Period" />
          <input value={signalPeriod} onChange={(e) => setSignalPeriod(Number(e.target.value || 9))} placeholder="Signal Period" />
          <div />
        </div>
      )}
      
      {(type === "support_resistance") && (
        <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
          <input value={lookbackPeriod} onChange={(e) => setLookbackPeriod(Number(e.target.value || 50))} placeholder="Lookback Period" />
          <input value={breakoutThreshold} onChange={(e) => setBreakoutThreshold(Number(e.target.value || 0.01))} placeholder="Breakout Threshold" />
          <div />
          <div />
        </div>
      )}
      
      {(type === "options_straddle" || type === "options_strangle") && (
        <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
          <select value={underlying} onChange={(e) => setUnderlying(e.target.value)}>
            <option value="NIFTY">NIFTY</option>
            <option value="BANKNIFTY">BANKNIFTY</option>
            <option value="SENSEX">SENSEX</option>
            <option value="FINNIFTY">FINNIFTY</option>
          </select>
          <input value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="Expiry (next)" />
          <input value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 1))} placeholder="Quantity" />
          <input value={volatilityThreshold} onChange={(e) => setVolatilityThreshold(Number(e.target.value || 0.02))} placeholder="Vol Threshold" />
        </div>
      )}
      
      {(type === "options_strangle") && (
        <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
          <input value={otmOffset} onChange={(e) => setOtmOffset(Number(e.target.value || 2))} placeholder="OTM Offset" />
          <div />
          <div />
          <div />
        </div>
      )}
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


