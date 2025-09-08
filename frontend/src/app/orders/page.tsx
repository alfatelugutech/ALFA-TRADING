"use client";

import { useEffect, useState } from "react";
import OrderManager from "../components/OrderManager";

type OrderRec = {
  ts: number;
  symbol: string;
  exchange: string;
  side: string;
  quantity: number;
  price: number;
  dry_run: boolean;
  source: string;
  status?: string;
  order_id?: string;
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRec[]>([]);
  const [activeTab, setActiveTab] = useState<"place" | "history" | "pending">("place");
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: "info" | "success" | "error" }[]>([]);

  const pushToast = (text: string, kind: "info" | "success" | "error" = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  const loadOrders = async () => {
    try {
      const data = await (await fetch(backendUrl + "/orders")).json();
      setOrders(data || []);
    } catch (error) {
      pushToast("Failed to load orders", "error");
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatNumber = (value: number, decimals: number = 2): string => {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  };

  const cancelOrder = async (orderId: string) => {
    try {
      await fetch(`${backendUrl}/orders/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId })
      });
      pushToast(`Order ${orderId} cancelled`, "success");
      loadOrders();
    } catch (error) {
      pushToast("Failed to cancel order", "error");
    }
  };

  const modifyOrder = async (orderId: string, newPrice: number, newQuantity: number) => {
    try {
      await fetch(`${backendUrl}/orders/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          order_id: orderId, 
          price: newPrice, 
          quantity: newQuantity 
        })
      });
      pushToast(`Order ${orderId} modified`, "success");
      loadOrders();
    } catch (error) {
      pushToast("Failed to modify order", "error");
    }
  };

  return (
    <div style={{ 
      display: "grid", 
      gridTemplateColumns: "400px 1fr", 
      gap: "20px", 
      padding: "20px",
      minHeight: "100vh",
      backgroundColor: "#f8f9fa"
    }}>
      {/* Order Placement Panel */}
      <div>
        <OrderManager />
      </div>

      {/* Orders Management Panel */}
      <div style={{ 
        backgroundColor: "white", 
        borderRadius: "8px", 
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        overflow: "hidden"
      }}>
        {/* Tab Navigation */}
        <div style={{ 
          display: "flex", 
          borderBottom: "1px solid #eee"
        }}>
          {[
            { key: "place", label: "Place Order" },
            { key: "pending", label: "Pending Orders" },
            { key: "history", label: "Order History" }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                flex: 1,
                padding: "12px 16px",
                backgroundColor: activeTab === tab.key ? "#007bff" : "transparent",
                color: activeTab === tab.key ? "white" : "#333",
                border: "none",
                cursor: "pointer",
                fontWeight: activeTab === tab.key ? "bold" : "normal",
                fontSize: "14px"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ padding: "20px" }}>
          {activeTab === "place" && (
            <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
              <h3>Place Orders</h3>
              <p>Use the order form on the left to place new orders.</p>
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(3, 1fr)", 
                gap: "16px", 
                marginTop: "20px" 
              }}>
                <div style={{ padding: "16px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
                  <h4 style={{ margin: "0 0 8px 0", color: "#007bff" }}>Market Orders</h4>
                  <p style={{ margin: 0, fontSize: "14px" }}>Execute immediately at current market price</p>
                </div>
                <div style={{ padding: "16px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
                  <h4 style={{ margin: "0 0 8px 0", color: "#28a745" }}>Limit Orders</h4>
                  <p style={{ margin: 0, fontSize: "14px" }}>Set your desired price for execution</p>
                </div>
                <div style={{ padding: "16px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
                  <h4 style={{ margin: "0 0 8px 0", color: "#dc3545" }}>Stop Loss</h4>
                  <p style={{ margin: 0, fontSize: "14px" }}>Protect your positions with stop loss orders</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "pending" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3>Pending Orders</h3>
                <button 
                  onClick={loadOrders}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  Refresh
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f8f9fa" }}>
                      <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Time</th>
                      <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Symbol</th>
                      <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Side</th>
                      <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Qty</th>
                      <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Price</th>
                      <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Status</th>
                      <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.filter(order => order.status === "PENDING" || !order.status).map(order => (
                      <tr key={`${order.ts}-${order.symbol}-${order.side}`}>
                        <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                          {new Date(order.ts).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{order.symbol}</td>
                        <td style={{ 
                          padding: "8px", 
                          borderBottom: "1px solid #eee",
                          color: order.side === "BUY" ? "#28a745" : "#dc3545",
                          fontWeight: "bold"
                        }}>
                          {order.side}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                          {order.quantity}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                          {formatCurrency(order.price)}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                          <span style={{ 
                            padding: "2px 8px", 
                            borderRadius: "12px", 
                            fontSize: "12px",
                            backgroundColor: "#fff3cd",
                            color: "#856404"
                          }}>
                            {order.status || "PENDING"}
                          </span>
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                          <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                            <button
                              onClick={() => {
                                const newPrice = prompt("New price:", order.price.toString());
                                const newQty = prompt("New quantity:", order.quantity.toString());
                                if (newPrice && newQty) {
                                  modifyOrder(order.order_id || "", parseFloat(newPrice), parseInt(newQty));
                                }
                              }}
                              style={{
                                padding: "2px 6px",
                                backgroundColor: "#ffc107",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "12px"
                              }}
                            >
                              Modify
                            </button>
                            <button
                              onClick={() => cancelOrder(order.order_id || "")}
                              style={{
                                padding: "2px 6px",
                                backgroundColor: "#dc3545",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "12px"
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.filter(order => order.status === "PENDING" || !order.status).length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                    No pending orders
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3>Order History</h3>
                <button 
                  onClick={loadOrders}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  Refresh
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f8f9fa" }}>
                      <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Time</th>
                      <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Symbol</th>
                      <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Side</th>
                      <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Qty</th>
                      <th style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #ddd" }}>Price</th>
                      <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #ddd" }}>Mode</th>
                      <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #ddd" }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(-100).reverse().map(order => (
                      <tr key={`${order.ts}-${order.symbol}-${order.side}`}>
                        <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                          {new Date(order.ts).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{order.symbol}</td>
                        <td style={{ 
                          padding: "8px", 
                          borderBottom: "1px solid #eee",
                          color: order.side === "BUY" ? "#28a745" : "#dc3545",
                          fontWeight: "bold"
                        }}>
                          {order.side}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                          {order.quantity}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", borderBottom: "1px solid #eee" }}>
                          {formatCurrency(order.price)}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                          {order.dry_run ? "PAPER" : "LIVE"}
                        </td>
                        <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{order.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                    No order history found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notifications */}
      <div style={{ 
        position: "fixed", 
        top: "16px", 
        right: "16px", 
        display: "flex", 
        flexDirection: "column", 
        gap: "8px",
        zIndex: 1000
      }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: t.kind === "error" ? "#fee2e2" : t.kind === "success" ? "#dcfce7" : "#e5e7eb",
              color: "#111",
              padding: "12px 16px",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              minWidth: "300px",
              border: `1px solid ${t.kind === "error" ? "#fecaca" : t.kind === "success" ? "#bbf7d0" : "#d1d5db"}`
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}