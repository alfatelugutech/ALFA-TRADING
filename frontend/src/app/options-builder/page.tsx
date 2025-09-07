"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";

type Leg = {
  underlying: string;
  expiry: string; // YYYY-MM-DD or 'next'
  method: "ATM_OFFSET" | "SYMBOL";
  type: "CE" | "PE"; // for ATM_OFFSET
  side: "BUY" | "SELL";
  qty: number;
  offset: number; // 0=ATM
  symbol: string; // for SYMBOL or resolved
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function OptionsBuilder() {
  const [legs, setLegs] = useState<Leg[]>([
    { underlying: "NIFTY", expiry: "next", method: "ATM_OFFSET", type: "CE", side: "BUY", qty: 1, offset: 0, symbol: "" },
    { underlying: "NIFTY", expiry: "next", method: "ATM_OFFSET", type: "PE", side: "BUY", qty: 1, offset: 0, symbol: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const setLeg = (i: number, patch: Partial<Leg>) => {
    setLegs((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const addLeg = () => setLegs((arr) => [...arr, { underlying: "NIFTY", expiry: "next", method: "ATM_OFFSET", type: "CE", side: "BUY", qty: 1, offset: 0, symbol: "" }]);
  const removeLeg = (i: number) => setLegs((arr) => arr.filter((_, idx) => idx !== i));

  const resolveSymbols = async () => {
    const out: Leg[] = [];
    for (const l of legs) {
      if (l.method === "SYMBOL") {
        out.push(l);
        continue;
      }
      // Resolve from chain
      const url = new URL(backendUrl + "/options/chain");
      url.searchParams.set("underlying", l.underlying);
      url.searchParams.set("expiry", l.expiry || "next");
      url.searchParams.set("count", String(50));
      const data = await (await fetch(url.toString())).json();
      const strikes: number[] = data?.strikes || [];
      const arr = (l.type === "CE" ? data?.ce : data?.pe) || [];
      if (!strikes.length || !arr.length) {
        out.push(l);
        continue;
      }
      const mid = strikes[Math.floor(strikes.length / 2)];
      const sorted = [...arr].sort((a: any, b: any) => Math.abs(Number(a.strike) - mid) - Math.abs(Number(b.strike) - mid));
      const idx = Math.min(sorted.length - 1, Math.max(0, Number(l.offset || 0)));
      const pick = sorted[idx];
      out.push({ ...l, symbol: pick?.tradingsymbol || l.symbol });
    }
    setLegs(out);
  };

  const execute = async () => {
    setBusy(true);
    setMsg("Executing...");
    try {
      await resolveSymbols();
      for (const l of legs) {
        const sym = l.symbol?.trim();
        if (!sym) continue;
        await fetch(backendUrl + "/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: sym, exchange: "NFO", side: l.side, quantity: l.qty }),
        });
      }
      setMsg("Orders sent (paper/live depending on mode)");
    } catch (e) {
      console.error(e);
      setMsg("Error placing orders");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 1000, margin: "20px auto", fontFamily: "system-ui, sans-serif" }}>
      <h2>Options Strategy Builder</h2>
      <p>Build multi‑leg NFO strategies (paper/live depends on current mode). Use ATM offset or direct symbol. Expiry can be YYYY‑MM‑DD or "next".</p>
      <table className="table">
        <thead>
          <tr>
            <th>Underlying</th>
            <th>Expiry</th>
            <th>Method</th>
            <th>Type</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Offset</th>
            <th>Symbol</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => (
            <tr key={i}>
              <td>
                <select value={l.underlying} onChange={(e) => setLeg(i, { underlying: e.target.value })}>
                  <option value="NIFTY">NIFTY</option>
                  <option value="BANKNIFTY">BANKNIFTY</option>
                  <option value="SENSEX">SENSEX</option>
                  <option value="FINNIFTY">FINNIFTY</option>
                </select>
              </td>
              <td>
                <input value={l.expiry} onChange={(e) => setLeg(i, { expiry: e.target.value })} placeholder="YYYY-MM-DD or next" />
              </td>
              <td>
                <select value={l.method} onChange={(e) => setLeg(i, { method: e.target.value as any })}>
                  <option value="ATM_OFFSET">ATM_OFFSET</option>
                  <option value="SYMBOL">SYMBOL</option>
                </select>
              </td>
              <td>
                <select value={l.type} onChange={(e) => setLeg(i, { type: e.target.value as any })} disabled={l.method === "SYMBOL"}>
                  <option value="CE">CE</option>
                  <option value="PE">PE</option>
                </select>
              </td>
              <td>
                <select value={l.side} onChange={(e) => setLeg(i, { side: e.target.value as any })}>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </td>
              <td>
                <input type="number" value={l.qty} onChange={(e) => setLeg(i, { qty: Number(e.target.value || 1) })} style={{ width: 80 }} />
              </td>
              <td>
                <input type="number" value={l.offset} onChange={(e) => setLeg(i, { offset: Number(e.target.value || 0) })} style={{ width: 80 }} disabled={l.method === "SYMBOL"} />
              </td>
              <td>
                <input value={l.symbol} onChange={(e) => setLeg(i, { symbol: e.target.value })} placeholder="Direct tradingsymbol" disabled={l.method !== "SYMBOL"} />
              </td>
              <td>
                <button className="btn" onClick={() => removeLeg(i)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn" onClick={addLeg}>Add Leg</button>
        <button className="btn" onClick={resolveSymbols}>Preview/Resolve</button>
        <button className="btn btn-primary" onClick={execute} disabled={busy}>{busy ? "Placing..." : "Execute"}</button>
        <span>{msg}</span>
      </div>
    </main>
  );
}


