export const metadata: { title: string; description: string } = {
  title: "Zerodha Auto Trader",
  description: "Live market ticks",
};

import "./styles.css";
import React from "react";
import StatusPill from "./components/StatusPill";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="page">
        <header className="card" style={{ maxWidth: 1000, margin: "12px auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Zerodha Auto Trader</div>
          <StatusPill />
          <nav style={{ display: "flex", gap: 12 }}>
            <a href="/" style={{ color: "var(--fg)", textDecoration: "none" }}>Dashboard</a>
            <div style={{ position: "relative" }}>
              <details>
                <summary style={{ cursor: "pointer" }}>Trading</summary>
                <div className="card" style={{ position: "absolute", right: 0, zIndex: 10 }}>
                  <div><a href="/orders" style={{ color: "var(--fg)", textDecoration: "none" }}>Orders</a></div>
                </div>
              </details>
            </div>
          </nav>
        </header>
        <div className="shell">
          <aside className="sidebar">
            <a className="navlink" href="/">Dashboard</a>
            <a className="navlink" href="/strategy-builder">Strategy Builder</a>
            <a className="navlink" href="/backtesting">Backtesting</a>
            <a className="navlink" href="/live-trading">Live Trading</a>
            <a className="navlink" href="/portfolio">Portfolio</a>
            <a className="navlink" href="/risk">Risk Management</a>
            <a className="navlink" href="/market-data">Market Data</a>
            <a className="navlink" href="/research">Research Lab</a>
            <a className="navlink" href="/optimization">Optimization</a>
            <a className="navlink" href="/alerts">Alerts & Signals</a>
            <a className="navlink" href="/analytics">Analytics</a>
            <a className="navlink" href="/paper-trading">Paper Trading</a>
            <a className="navlink" href="/options-trading">Options Trading</a>
            <a className="navlink" href="/trade-reports">Trade Reports</a>
            <a className="navlink" href="/settings">Settings</a>
          </aside>
          <section className="content">{children}</section>
        </div>
      </body>
    </html>
  );
}

function StatusPill() {
  const [data, setData] = React.useState<any>(null);
  React.useEffect(() => {
    const load = async () => {
      try {
        const d = await (await fetch((process.env.NEXT_PUBLIC_BACKEND_URL || "") + "/status/all")).json();
        setData(d);
      } catch {}
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);
  const color = data?.auth ? (data?.dry_run ? "#ca8a04" : "#22c55e") : "#ef4444";
  const text = data?.auth ? (data?.dry_run ? "AUTH • PAPER" : "AUTH • LIVE") : "NO AUTH";
  const orders = data?.orders ?? 0;
  const subs = data?.subscriptions ?? 0;
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  return (
    <div style={{ position: "relative" }}>
      <details>
        <summary style={{ listStyle: "none", display: "inline-block" }}>
          <span style={{ background: color, color: "#fff", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
            {text} · O:{orders} · S:{subs}
          </span>
        </summary>
        <div className="card" style={{ position: "absolute", right: 0, marginTop: 8, zIndex: 20, minWidth: 260 }}>
          <div style={{ marginBottom: 6 }}>Auth: {String(!!data?.auth)} · Mode: {data?.dry_run ? "PAPER" : "LIVE"}</div>
          <div style={{ marginBottom: 6 }}>Orders: {orders} · Subscriptions: {subs}</div>
          <div style={{ marginBottom: 6 }}>Strategy: {data?.strategy?.active ? "ON" : "OFF"} {data?.strategy?.live ? "(LIVE)" : ""}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn" href="/orders">Orders</a>
            <a className="btn" href="/portfolio">Portfolio</a>
            <a className="btn" href="/market-data">Market Data</a>
            <a className="btn" href={backend + "/health"} target="_blank" rel="noreferrer">Health</a>
            <a className="btn" href={backend + "/auth/profile"} target="_blank" rel="noreferrer">Profile</a>
          </div>
        </div>
      </details>
    </div>
  );
}

