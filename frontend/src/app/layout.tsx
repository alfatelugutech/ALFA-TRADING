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
            <a href="/options-builder" style={{ color: "var(--fg)", textDecoration: "none" }}>Options Builder</a>
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
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 12px 24px" }}>{children}</div>
      </body>
    </html>
  );
}
