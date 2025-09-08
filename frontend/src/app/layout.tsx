export const metadata: { title: string; description: string } = {
  title: "Zerodha Auto Trader",
  description: "Live market ticks",
};

import "./styles.css";
import React from "react";
import StatusPill from "./components/StatusPill";
import ThemeControls from "./components/ThemeControls";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="page">
        <header className="card sticky-top" style={{ maxWidth: 1100, margin: "12px auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 800, letterSpacing: .4, background: "linear-gradient(90deg, #60a5fa, #a78bfa)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Zerodha Auto Trader</div>
            <nav className="topnav" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <a href="/">Dashboard</a>
              <div className="dropdown">
                <details>
                  <summary>Market ▾</summary>
                  <div className="card menu menu-left">
                    <a href="/market-data">Live Market Data</a>
                    <a href="/analytics">Analytics</a>
                    <a href="/trade-reports">Reports</a>
                  </div>
                </details>
              </div>
              <div className="dropdown">
                <details>
                  <summary>Options ▾</summary>
                  <div className="card menu menu-left">
                    <a href="/options-trading">Options Trading</a>
                    <a href="/options-strategies">Options Strategies</a>
                    <a href="/options-builder">Strategy Builder</a>
                  </div>
                </details>
              </div>
              <div className="dropdown">
                <details>
                  <summary>Trading ▾</summary>
                  <div className="card menu menu-left">
                    <a href="/ai-trading">🤖 AI Trading</a>
                    <a href="/strategy-builder">Strategies</a>
                    <a href="/risk">Risk Management</a>
                    <a href="/orders">Orders</a>
                    <a href="/portfolio">Portfolio</a>
                  </div>
                </details>
              </div>
              <div className="dropdown">
                <details>
                  <summary>Tools ▾</summary>
                  <div className="card menu menu-left">
                    <a href="/backtesting">Backtesting</a>
                    <a href="/settings">Settings</a>
                  </div>
                </details>
              </div>
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ThemeControls />
            <div className="dropdown">
              <details>
                <summary>More ▾</summary>
                <div className="card menu">
                  <a href="/strategy-builder">Strategy Builder</a>
                  <a href="/backtesting">Backtesting</a>
                  <a href="/risk">Risk</a>
                  <a href="/trade-reports">Reports</a>
                  <a href="/settings">Settings</a>
                </div>
              </details>
            </div>
            <StatusPill />
          </div>
        </header>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 12px 24px" }}>{children}</div>
      </body>
    </html>
  );
}
