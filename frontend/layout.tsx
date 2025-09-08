export const metadata: { title: string; description: string } = {
  title: "Zerodha Auto Trader",
  description: "Live market ticks",
};

import "./styles.css";
import React from "react";
import StatusPill from "./components/StatusPill";
import ThemeControls from "./components/ThemeControls";
import DropdownCloser from "./components/DropdownCloser";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="page">
        <DropdownCloser />
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
                  <summary>Reports ▾</summary>
                  <div className="card menu menu-left">
                    <a href="/reports/portfolio">📊 Portfolio (Live) Reports</a>
                    <a href="/reports/paper-trading">📄 Paper Trading Reports</a>
                    <a href="/reports/manual-trading">🧭 Manual Trading Reports</a>
                  </div>
                </details>
              </div>
              <div className="dropdown">
                <details>
                  <summary>Trading ▾</summary>
                  <div className="card menu menu-left">
                    <a href="/paper-trading">📄 Paper Trading</a>
                    <a href="/trading-dashboard">🧭 Manual Trading</a>
                    <a href="/ai-trading">🤖 AI Trading</a>
                  </div>
                </details>
              </div>
              {/* Tools dropdown removed per user request */}
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ThemeControls />
            <StatusPill />
          </div>
        </header>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 12px 24px" }}>{children}</div>
      </body>
    </html>
  );
}
