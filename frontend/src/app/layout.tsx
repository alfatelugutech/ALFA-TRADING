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
        <header className="card sticky-top" style={{ maxWidth: 1100, margin: "12px auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Zerodha Auto Trader</div>
            <nav className="topnav" style={{ display: "flex", gap: 8 }}>
              <a href="/">Dashboard</a>
              <a href="/market-data">Market Data</a>
              <a href="/options-builder">Options Builder</a>
              <a href="/options-trading">Options</a>
              <a href="/portfolio">Portfolio</a>
              <a href="/orders">Orders</a>
              <a href="/analytics">Analytics</a>
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
