export const metadata: { title: string; description: string } = {
  title: "Zerodha Auto Trader",
  description: "Live market ticks",
};

import "./styles.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="page">
        <header className="card" style={{ maxWidth: 1000, margin: "12px auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Zerodha Auto Trader</div>
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
            <a className="navlink" href="/broker-integration">Broker Integration</a>
            <a className="navlink" href="/settings">Settings</a>
          </aside>
          <section className="content">{children}</section>
        </div>
      </body>
    </html>
  );
}

