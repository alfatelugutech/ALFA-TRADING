"use client";

import React, { useEffect, useState } from "react";

export default function ThemeControls() {
  const [light, setLight] = useState<boolean>(false);
  const [compact, setCompact] = useState<boolean>(false);

  useEffect(() => {
    try {
      const l = localStorage.getItem("theme_light");
      const c = localStorage.getItem("theme_compact");
      if (l === "1") setLight(true);
      if (c === "1") setCompact(true);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("theme_light", light ? "1" : "0"); } catch {}
    const html = document.documentElement;
    if (light) html.classList.add("light"); else html.classList.remove("light");
  }, [light]);

  useEffect(() => {
    try { localStorage.setItem("theme_compact", compact ? "1" : "0"); } catch {}
    const body = document.body;
    if (compact) body.classList.add("compact"); else body.classList.remove("compact");
  }, [compact]);

  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={light} onChange={(e)=>setLight(e.target.checked)} /> Light
      </label>
      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={compact} onChange={(e)=>setCompact(e.target.checked)} /> Compact
      </label>
    </div>
  );
}


