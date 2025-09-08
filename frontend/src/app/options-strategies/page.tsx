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

export default function OptionsStrategies() {
  const [strategyType, setStrategyType] = useState<"options_straddle" | "options_strangle">("options_straddle");
  const [underlying, setUnderlying] = useState<string>("NIFTY");
  const [expiry, setExpiry] = useState<string>("next");
  const [quantity, setQuantity] = useState<number>(1);
  const [volatilityThreshold, setVolatilityThreshold] = useState<number>(0.02);
  const [otmOffset, setOtmOffset] = useState<number>(2);
  const [live, setLive] = useState<boolean>(false);
  const [status, setStatus] = useState<StrategyStatus | null>(null);
  const [expiries, setExpiries] = useState<string[]>([]);

  const loadExpiries = async () => {
    try {
      const data = await (await fetch(`${backendUrl}/options/expiries?underlying=${underlying}`)).json();
      setExpiries(data || []);
      if (data?.length && !expiry) setExpiry(data[0]);
    } catch (error) {
      console.error("Failed to load expiries:", error);
    }
  };

  useEffect(() => {
    loadExpiries();
  }, [underlying]);

  const startStrategy = async () => {
    try {
      const url = strategyType === "options_straddle" 
        ? "/strategy/options_straddle/start" 
        : "/strategy/options_strangle/start";
      
      const body: any = {
        symbols: [underlying],
        underlying,
        expiry,
        quantity,
        volatility_threshold: volatilityThreshold,
        live
      };

      if (strategyType === "options_strangle") {
        body.otm_offset = otmOffset;
      }

      await fetch(backendUrl + url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      await getStatus();
      alert(`${strategyType.replace('_', ' ').toUpperCase()} strategy started!`);
    } catch (error) {
      console.error("Failed to start strategy:", error);
      alert("Failed to start strategy");
    }
  };

  const stopStrategy = async () => {
    try {
      await fetch(backendUrl + "/strategy/stop", { method: "POST" });
      await getStatus();
      alert("Strategy stopped!");
    } catch (error) {
      console.error("Failed to stop strategy:", error);
      alert("Failed to stop strategy");
    }
  };

  const getStatus = async () => {
    try {
      const s = await (await fetch(backendUrl + "/strategy/status")).json();
      setStatus(s);
    } catch (error) {
      console.error("Failed to get status:", error);
    }
  };

  useEffect(() => {
    getStatus();
    const interval = setInterval(getStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main>
      <h2>Options Trading Strategies</h2>
      
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Strategy Configuration</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
          <div>
            <label>Strategy Type</label>
            <select value={strategyType} onChange={(e) => setStrategyType(e.target.value as any)}>
              <option value="options_straddle">Options Straddle</option>
              <option value="options_strangle">Options Strangle</option>
            </select>
          </div>
          
          <div>
            <label>Underlying</label>
            <select value={underlying} onChange={(e) => setUnderlying(e.target.value)}>
              <option value="NIFTY">NIFTY</option>
              <option value="BANKNIFTY">BANKNIFTY</option>
              <option value="SENSEX">SENSEX</option>
              <option value="FINNIFTY">FINNIFTY</option>
            </select>
          </div>
          
          <div>
            <label>Expiry</label>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              <option value="next">Next Expiry</option>
              {expiries.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label>Quantity</label>
            <input 
              type="number" 
              value={quantity} 
              onChange={(e) => setQuantity(Number(e.target.value || 1))} 
              min="1"
            />
          </div>
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
          <div>
            <label>Volatility Threshold</label>
            <input 
              type="number" 
              step="0.01"
              value={volatilityThreshold} 
              onChange={(e) => setVolatilityThreshold(Number(e.target.value || 0.02))} 
              min="0"
              max="1"
            />
          </div>
          
          {strategyType === "options_strangle" && (
            <div>
              <label>OTM Offset (Strikes)</label>
              <input 
                type="number" 
                value={otmOffset} 
                onChange={(e) => setOtmOffset(Number(e.target.value || 2))} 
                min="1"
                max="10"
              />
            </div>
          )}
          
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input 
                type="checkbox" 
                checked={live} 
                onChange={(e) => setLive(e.target.checked)} 
              /> 
              Live Trading
            </label>
          </div>
          
          <div />
        </div>
        
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={startStrategy}>
            Start Strategy
          </button>
          <button className="btn btn-danger" onClick={stopStrategy}>
            Stop Strategy
          </button>
          <button className="btn" onClick={getStatus}>
            Refresh Status
          </button>
        </div>
      </div>

      {status && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Strategy Status</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div>
              <strong>Active:</strong> {status.active ? "Yes" : "No"}
            </div>
            <div>
              <strong>Live Trading:</strong> {status.live ? "Yes" : "No"}
            </div>
            <div>
              <strong>Exchange:</strong> {status.exchange}
            </div>
            <div>
              <strong>Last Signals:</strong> {status.last_signals?.length || 0}
            </div>
          </div>
          
          {status.last_signals && status.last_signals.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Recent Signals</h4>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {status.last_signals.slice(-5).map((signal, index) => (
                  <div key={index} style={{ 
                    padding: 8, 
                    margin: 4, 
                    backgroundColor: signal.side === "BUY" ? "#d4edda" : "#f8d7da",
                    borderRadius: 4,
                    fontSize: "0.9em"
                  }}>
                    <strong>{signal.side}</strong> {signal.symbol} (Qty: {signal.quantity})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Strategy Information</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <h4>Options Straddle</h4>
            <p>
              <strong>Strategy:</strong> Buy both CE and PE at ATM strike<br/>
              <strong>Profit:</strong> High volatility regardless of direction<br/>
              <strong>Risk:</strong> Time decay and low volatility<br/>
              <strong>Best for:</strong> High volatility expectations
            </p>
          </div>
          
          <div>
            <h4>Options Strangle</h4>
            <p>
              <strong>Strategy:</strong> Buy CE and PE at different OTM strikes<br/>
              <strong>Profit:</strong> High volatility with lower cost than straddle<br/>
              <strong>Risk:</strong> Time decay and low volatility<br/>
              <strong>Best for:</strong> High volatility with cost optimization
            </p>
          </div>
        </div>
        
        <div style={{ marginTop: 16, padding: 12, backgroundColor: "#fff3cd", borderRadius: 4 }}>
          <strong>⚠️ Risk Warning:</strong> Options trading involves significant risk. 
          These strategies are for educational purposes. Always understand the risks 
          and consider paper trading first.
        </div>
      </div>
    </main>
  );
}
