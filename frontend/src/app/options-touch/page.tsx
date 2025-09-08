"use client";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const DEFAULT_OFFSET = Number(process.env.NEXT_PUBLIC_OPTIONS_TOUCH_DEFAULT_OFFSET || 0);
const DEFAULT_QTY = Number(process.env.NEXT_PUBLIC_OPTIONS_TOUCH_DEFAULT_QTY || 1);

import { useState } from "react";

export default function OptionsTouch() {
  const [symbols, setSymbols] = useState<string>("NIFTY BANKNIFTY");
  const [exchange, setExchange] = useState<string>("NSE");
  const [offset, setOffset] = useState<number>(DEFAULT_OFFSET);
  const [qty, setQty] = useState<number>(DEFAULT_QTY);
  const [live, setLive] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");

  const start = async () => {
    setMsg("Starting...");
    try {
      const list = symbols.split(/\s+/).filter(Boolean);
      await fetch(backendUrl + "/strategy/options_touch_sma/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: list, exchange, length: 21, offset, quantity: qty, live })
      });
      setMsg("Started.");
    } catch {
      setMsg("Failed to start");
    }
  };

  const stop = async () => {
    setMsg("Stopping...");
    try {
      await fetch(backendUrl + "/strategy/stop", { method: "POST" });
      setMsg("Stopped.");
    } catch {
      setMsg("Failed to stop");
    }
  };

  return (
    <main>
      <h2>Options Touch 21‑SMA</h2>
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 900 }}>
        <div>
          <label>Underlyings</label>
          <input value={symbols} onChange={(e)=>setSymbols(e.target.value)} placeholder="e.g. NIFTY BANKNIFTY" style={{ width: "100%", padding: 8 }} />
        </div>
        <div>
          <label>Exchange</label>
          <select value={exchange} onChange={(e)=>setExchange(e.target.value)} style={{ width: "100%", padding: 8 }}>
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={live} onChange={(e)=>setLive(e.target.checked)} /> Live
        </div>
        <div>
          <label>OTM Offset (0=ATM)</label>
          <input type="number" value={offset} onChange={(e)=>setOffset(Number(e.target.value || 0))} style={{ width: "100%", padding: 8 }} />
        </div>
        <div>
          <label>Qty per leg</label>
          <input type="number" value={qty} onChange={(e)=>setQty(Number(e.target.value || 1))} style={{ width: "100%", padding: 8 }} />
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button className="btn btn-success" onClick={start}>Start</button>
        <button className="btn btn-danger" onClick={stop}>Stop</button>
        <span>{msg}</span>
      </div>
    </main>
  );
}


