"use client";

import { useEffect, useState } from "react";

type ChainRec = { tradingsymbol: string; strike: number; instrument_token: number; type: string };
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function OptionsTrading() {
  const [under, setUnder] = useState<string>("NIFTY");
  const [expiries, setExpiries] = useState<string[]>([]);
  const [exp, setExp] = useState<string>("");
  const [count, setCount] = useState<number>(10);
  const [ce, setCe] = useState<ChainRec[]>([]);
  const [pe, setPe] = useState<ChainRec[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<number>(1);
  const [offset, setOffset] = useState<number>(0);

  const loadExpiries = async () => {
    const data = await (await fetch(`${backendUrl}/options/expiries?underlying=${under}`)).json();
    setExpiries(data || []);
    if (data?.length && !exp) setExp(data[0]);
  };

  const loadChain = async () => {
    if (!exp) { await loadExpiries(); return; }
    const data = await (await fetch(`${backendUrl}/options/chain?underlying=${under}&expiry=${exp}&count=${count}`)).json();
    setCe(data?.ce || []);
    setPe(data?.pe || []);
  };

  useEffect(() => { loadExpiries(); }, [under]);

  const toggle = (sym: string) => {
    const s = new Set(selected);
    if (s.has(sym)) s.delete(sym); else s.add(sym);
    setSelected(s);
  };

  const addToWatchlist = async () => {
    const list = Array.from(selected);
    if (!list.length) return;
    await fetch(backendUrl + "/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: list, exchange: "NFO", mode: "ltp" }) });
  };

  const placeOrders = async (side: "BUY" | "SELL") => {
    const list = Array.from(selected);
    for (const sym of list) {
      await fetch(backendUrl + "/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, exchange: "NFO", side, quantity: qty }) });
    }
  };

  return (
    <main>
      <h2>Options Trading</h2>
      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <select value={under} onChange={(e) => setUnder(e.target.value)}>
          <option value="NIFTY">NIFTY</option>
          <option value="BANKNIFTY">BANKNIFTY</option>
          <option value="SENSEX">SENSEX</option>
          <option value="FINNIFTY">FINNIFTY</option>
        </select>
        <select value={exp} onChange={(e) => setExp(e.target.value)}>
          <option value="">Select expiry</option>
          {expiries.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <input type="number" value={count} onChange={(e) => setCount(Number(e.target.value || 10))} style={{ width: 100, padding: 6 }} />
        <button className="btn btn-primary" onClick={loadChain}>Load</button>
        <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value || 1))} style={{ width: 100, padding: 6 }} />
        <button className="btn btn-success" onClick={() => placeOrders("BUY")}>BUY</button>
        <button className="btn btn-danger" onClick={() => placeOrders("SELL")}>SELL</button>
        <button className="btn" onClick={addToWatchlist}>Subscribe</button>
        <input type="number" value={offset} onChange={(e)=>setOffset(Number(e.target.value || 0))} style={{ width: 100, padding: 6 }} />
        <button className="btn" onClick={async ()=>{
          const body = { underlying: under, expiry: exp || "next", side: "BUY", quantity: qty, offset };
          await fetch((process.env.NEXT_PUBLIC_BACKEND_URL || "") + "/options/atm_trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          alert("ATM BUY placed (paper/live based on mode)");
        }}>ATM BUY</button>
        <button className="btn" onClick={async ()=>{
          const body = { underlying: under, expiry: exp || "next", side: "SELL", quantity: qty, offset };
          await fetch((process.env.NEXT_PUBLIC_BACKEND_URL || "") + "/options/atm_trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          alert("ATM SELL placed (paper/live based on mode)");
        }}>ATM SELL</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="card">
          <h4>Calls (CE)</h4>
          <table className="table">
            <thead>
              <tr>
                <th style={{ textAlign: "right" }}>Strike</th>
                <th>Symbol</th>
                <th style={{ textAlign: "center" }}>Select</th>
              </tr>
            </thead>
            <tbody>
              {(ce || []).map((r) => (
                <tr key={r.tradingsymbol}>
                  <td style={{ textAlign: "right" }}>{Number(r.strike).toFixed(2)}</td>
                  <td>{r.tradingsymbol}</td>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={selected.has(r.tradingsymbol)} onChange={() => toggle(r.tradingsymbol)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h4>Puts (PE)</h4>
          <table className="table">
            <thead>
              <tr>
                <th style={{ textAlign: "right" }}>Strike</th>
                <th>Symbol</th>
                <th style={{ textAlign: "center" }}>Select</th>
              </tr>
            </thead>
            <tbody>
              {(pe || []).map((r) => (
                <tr key={r.tradingsymbol}>
                  <td style={{ textAlign: "right" }}>{Number(r.strike).toFixed(2)}</td>
                  <td>{r.tradingsymbol}</td>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" checked={selected.has(r.tradingsymbol)} onChange={() => toggle(r.tradingsymbol)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}


