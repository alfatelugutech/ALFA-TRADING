"use client";

import { useEffect, useState } from "react";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

interface AuthStatusData {
  authenticated: boolean;
  user_id: string;
  demo_mode: boolean;
  cache_info?: {
    cached: boolean;
    cache_age_hours: number;
    expires_in_hours: number;
    last_check: number;
  };
}

export default function AuthStatus() {
  const [authStatus, setAuthStatus] = useState<AuthStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAuthStatus = async () => {
    try {
      const response = await fetch(backendUrl + "/auth/status");
      const data = await response.json();
      setAuthStatus(data);
    } catch (error) {
      console.error("Failed to load auth status:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearCache = async () => {
    try {
      await fetch(backendUrl + "/auth/clear_cache", { method: "POST" });
      await loadAuthStatus(); // Reload status
    } catch (error) {
      console.error("Failed to clear cache:", error);
    }
  };

  useEffect(() => {
    loadAuthStatus();
  }, []);

  if (loading) {
    return <div>Loading auth status...</div>;
  }

  if (!authStatus) {
    return <div>Failed to load auth status</div>;
  }

  return (
    <div style={{ 
      padding: "10px", 
      border: "1px solid #ddd", 
      borderRadius: "5px", 
      margin: "10px 0",
      backgroundColor: authStatus.authenticated ? "#e8f5e8" : "#ffe8e8"
    }}>
      <h4>Authentication Status</h4>
      <div>
        <strong>Status:</strong> {authStatus.authenticated ? "✅ Authenticated" : "❌ Not Authenticated"}
      </div>
      <div>
        <strong>User:</strong> {authStatus.user_id || "Unknown"}
      </div>
      {authStatus.demo_mode && (
        <div>
          <strong>Mode:</strong> 🎮 Demo Mode
        </div>
      )}
      {authStatus.cache_info && (
        <div>
          <strong>Cache:</strong> {authStatus.cache_info.cached ? "✅ Cached" : "❌ Not Cached"}
          {authStatus.cache_info.cached && (
            <span> (Expires in {authStatus.cache_info.expires_in_hours.toFixed(1)} hours)</span>
          )}
        </div>
      )}
      {authStatus.authenticated && authStatus.cache_info && (
        <button 
          onClick={clearCache}
          style={{
            marginTop: "10px",
            padding: "5px 10px",
            backgroundColor: "#ff6b6b",
            color: "white",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer"
          }}
        >
          Clear Cache (Force Re-login)
        </button>
      )}
    </div>
  );
}
