"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function Risk() {
  const [sl, setSl] = useState<number>(2);
  const [tp, setTp] = useState<number>(0);
  const [auto, setAuto] = useState<boolean>(false);
  const [trail, setTrail] = useState<number>(0);
  const [activationPts, setActivationPts] = useState<number>(10);
  const [trailAfterAct, setTrailAfterAct] = useState<number>(1);
  const [exit3Candles, setExit3Candles] = useState<boolean>(true);
  const [msg, setMsg] = useState<string>("");

  const load = async () => {
    try {
      const data = await (await fetch(backendUrl + "/risk")).json();
      setSl(Number((data.sl_pct || 0.02) * 100));
      setTp(Number((data.tp_pct || 0) * 100));
      setAuto(!!data.auto_close);
      setTrail(Number((data.trailing_stop_pct || 0) * 100));
      if (typeof data.activation_points === "number") setActivationPts(Number(data.activation_points || 10));
      if (typeof data.points_after_activation === "number") setTrailAfterAct(Number(data.points_after_activation || 1));
      if (typeof data.exit_three_candles === "boolean") setExit3Candles(!!data.exit_three_candles);
    } catch {}
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setMsg("Saving...");
    await fetch(backendUrl + "/risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sl_pct: sl / 100, tp_pct: tp / 100, auto_close: auto, trailing_stop_pct: trail / 100, activation_points: activationPts, points_after_activation: trailAfterAct, exit_three_candles: exit3Candles }),
    });
    setMsg("Saved.");
  };

  return (
    <main>
      <h2>Risk Management</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 700 }}>
        <div>
          <label>Stop-Loss %</label>
          <input type="number" value={sl} onChange={(e) => setSl(Number(e.target.value || 0))} style={{ width: "100%", padding: 8 }} />
        </div>
        <div>
          <label>Take-Profit %</label>
          <input type="number" value={tp} onChange={(e) => setTp(Number(e.target.value || 0))} style={{ width: "100%", padding: 8 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto Close
        </div>
        <div>
          <label>Trailing Stop %</label>
          <input type="number" value={trail} onChange={(e) => setTrail(Number(e.target.value || 0))} style={{ width: "100%", padding: 8 }} />
        </div>
        <div>
          <label>Activation Points (start trailing)</label>
          <input type="number" value={activationPts} onChange={(e) => setActivationPts(Number(e.target.value || 0))} style={{ width: "100%", padding: 8 }} />
        </div>
        <div>
          <label>Trailing Points After Activation</label>
          <input type="number" value={trailAfterAct} onChange={(e) => setTrailAfterAct(Number(e.target.value || 0))} style={{ width: "100%", padding: 8 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={exit3Candles} onChange={(e) => setExit3Candles(e.target.checked)} /> Exit on 3 adverse candles
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={save} style={{ padding: "8px 12px" }}>Save</button>
        <span style={{ marginLeft: 12 }}>{msg}</span>
      </div>
    </main>
  );
}


