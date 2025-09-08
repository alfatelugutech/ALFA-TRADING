"use client";

import { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function ZerodhaCallback() {
  const [status, setStatus] = useState<string>("Processing...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const request_token = params.get("request_token");
    if (!request_token) {
      setStatus("Missing request_token in URL");
      return;
    }
    fetch(backendUrl + "/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_token, refresh_instruments: true }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.access_token) {
          setStatus("Login successful. You can return to the home page.");
        } else {
          setStatus("Exchange failed. Check backend logs.");
        }
      })
      .catch(() => setStatus("Network error communicating with backend"));
  }, []);

  return (
    <main style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h2>Zerodha Login</h2>
      <p>{status}</p>
      <a href="/" style={{ color: "#0969da" }}>Back to home</a>
    </main>
  );
}



