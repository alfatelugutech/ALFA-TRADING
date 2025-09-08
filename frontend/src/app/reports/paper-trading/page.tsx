"use client";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function PaperTradingReports() {
  return (
    <main>
      <h2>Paper Trading Reports</h2>
      <div className="card" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <a className="btn" href={`${backendUrl || ''}/reports/paper/csv`} target="_blank">Download CSV</a>
        <a className="btn" href={`${backendUrl || ''}/reports/paper/pdf`} target="_blank">Download PDF</a>
      </div>
      <p>Reports for simulated paper trading sessions.</p>
    </main>
  );
}


