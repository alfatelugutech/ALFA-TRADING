"use client";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function ManualTradingReports() {
  return (
    <main>
      <h2>Manual Trading Reports</h2>
      <div className="card" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <a className="btn" href={`${backendUrl || ''}/reports/manual/csv`} target="_blank">Download CSV</a>
        <a className="btn" href={`${backendUrl || ''}/reports/manual/pdf`} target="_blank">Download PDF</a>
      </div>
      <p>Reports for discretionary/manual trading activity.</p>
    </main>
  );
}



