"use client";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function PortfolioReports() {
  return (
    <main>
      <h2>Portfolio (Live) Reports</h2>
      <div className="card" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <a className="btn" href={`${backendUrl || ''}/reports/portfolio/csv`} target="_blank">Download CSV</a>
        <a className="btn" href={`${backendUrl || ''}/reports/portfolio/pdf`} target="_blank">Download PDF</a>
      </div>
      <p>Summary and downloads for live portfolio performance.</p>
    </main>
  );
}



