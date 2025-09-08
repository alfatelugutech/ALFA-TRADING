"use client";

import { useState, useEffect } from "react";

type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
type ProductType = "MIS" | "CNC" | "NRML";
type ValidityType = "DAY" | "IOC";

interface OrderFormData {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderType: OrderType;
  price?: number;
  triggerPrice?: number;
  product: ProductType;
  validity: ValidityType;
  disclosedQuantity?: number;
}

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:10000";

export default function OrderManager() {
  const [formData, setFormData] = useState<OrderFormData>({
    symbol: "",
    side: "BUY",
    quantity: 1,
    orderType: "MARKET",
    product: "MIS",
    validity: "DAY"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: "info" | "success" | "error" }[]>([]);
  const [ltp, setLtp] = useState<number>(0);
  const [exchange, setExchange] = useState<string>("NSE");

  const pushToast = (text: string, kind: "info" | "success" | "error" = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };

  const fetchLTP = async (symbol: string) => {
    if (!symbol) return;
    try {
      const response = await fetch(`${backendUrl}/ltp?symbols=${symbol}&exchange=${exchange}`);
      const data = await response.json();
      const price = data[symbol] || 0;
      setLtp(price);
      if (formData.orderType === "MARKET" || formData.orderType === "SL-M") {
        setFormData(prev => ({ ...prev, price: price }));
      }
    } catch (error) {
      pushToast("Failed to fetch LTP", "error");
    }
  };

  useEffect(() => {
    if (formData.symbol) {
      fetchLTP(formData.symbol);
    }
  }, [formData.symbol, exchange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const orderPayload = {
        symbol: formData.symbol,
        exchange: exchange,
        side: formData.side,
        quantity: formData.quantity,
        order_type: formData.orderType,
        product: formData.product,
        validity: formData.validity,
        ...(formData.price && { price: formData.price }),
        ...(formData.triggerPrice && { trigger_price: formData.triggerPrice }),
        ...(formData.disclosedQuantity && { disclosed_quantity: formData.disclosedQuantity })
      };

      const response = await fetch(`${backendUrl}/orders/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload)
      });

      const result = await response.json();
      
      if (response.ok) {
        pushToast(`Order placed successfully: ${result.order_id || "N/A"}`, "success");
        // Reset form
        setFormData({
          symbol: "",
          side: "BUY",
          quantity: 1,
          orderType: "MARKET",
          product: "MIS",
          validity: "DAY"
        });
        setLtp(0);
      } else {
        pushToast(`Order failed: ${result.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      pushToast("Failed to place order", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateMargin = () => {
    if (!ltp || !formData.quantity) return 0;
    const notional = ltp * formData.quantity;
    // Rough margin calculation (varies by broker and product)
    const marginRate = formData.product === "MIS" ? 0.2 : 1.0; // 20% for MIS, 100% for CNC/NRML
    return notional * marginRate;
  };

  return (
    <div style={{ 
      backgroundColor: "white", 
      padding: "20px", 
      borderRadius: "8px", 
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      maxWidth: "500px"
    }}>
      <h3 style={{ margin: "0 0 20px 0", fontSize: "18px", fontWeight: "bold" }}>Place Order</h3>
      
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Exchange Selection */}
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            Exchange
          </label>
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            style={{ 
              width: "100%", 
              padding: "8px", 
              border: "1px solid #ddd", 
              borderRadius: "4px",
              fontSize: "14px"
            }}
          >
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
            <option value="NFO">NFO</option>
            <option value="MCX">MCX</option>
          </select>
        </div>

        {/* Symbol */}
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            Symbol *
          </label>
          <input
            type="text"
            value={formData.symbol}
            onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
            placeholder="e.g., RELIANCE, NIFTY"
            required
            style={{ 
              width: "100%", 
              padding: "8px", 
              border: "1px solid #ddd", 
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
          {ltp > 0 && (
            <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
              LTP: ₹{ltp.toFixed(2)}
            </div>
          )}
        </div>

        {/* Side */}
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            Side *
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, side: "BUY" }))}
              style={{
                flex: 1,
                padding: "8px",
                backgroundColor: formData.side === "BUY" ? "#28a745" : "#f8f9fa",
                color: formData.side === "BUY" ? "white" : "#333",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "bold"
              }}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, side: "SELL" }))}
              style={{
                flex: 1,
                padding: "8px",
                backgroundColor: formData.side === "SELL" ? "#dc3545" : "#f8f9fa",
                color: formData.side === "SELL" ? "white" : "#333",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "bold"
              }}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            Quantity *
          </label>
          <input
            type="number"
            value={formData.quantity}
            onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
            min="1"
            required
            style={{ 
              width: "100%", 
              padding: "8px", 
              border: "1px solid #ddd", 
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>

        {/* Order Type */}
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            Order Type *
          </label>
          <select
            value={formData.orderType}
            onChange={(e) => setFormData(prev => ({ ...prev, orderType: e.target.value as OrderType }))}
            style={{ 
              width: "100%", 
              padding: "8px", 
              border: "1px solid #ddd", 
              borderRadius: "4px",
              fontSize: "14px"
            }}
          >
            <option value="MARKET">Market</option>
            <option value="LIMIT">Limit</option>
            <option value="SL">Stop Loss</option>
            <option value="SL-M">Stop Loss Market</option>
          </select>
        </div>

        {/* Price (for Limit and SL orders) */}
        {(formData.orderType === "LIMIT" || formData.orderType === "SL") && (
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
              Price *
            </label>
            <input
              type="number"
              value={formData.price || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || undefined }))}
              step="0.05"
              min="0"
              required
              style={{ 
                width: "100%", 
                padding: "8px", 
                border: "1px solid #ddd", 
                borderRadius: "4px",
                fontSize: "14px"
              }}
            />
          </div>
        )}

        {/* Trigger Price (for SL orders) */}
        {formData.orderType === "SL" && (
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
              Trigger Price *
            </label>
            <input
              type="number"
              value={formData.triggerPrice || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, triggerPrice: parseFloat(e.target.value) || undefined }))}
              step="0.05"
              min="0"
              required
              style={{ 
                width: "100%", 
                padding: "8px", 
                border: "1px solid #ddd", 
                borderRadius: "4px",
                fontSize: "14px"
              }}
            />
          </div>
        )}

        {/* Product */}
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            Product *
          </label>
          <select
            value={formData.product}
            onChange={(e) => setFormData(prev => ({ ...prev, product: e.target.value as ProductType }))}
            style={{ 
              width: "100%", 
              padding: "8px", 
              border: "1px solid #ddd", 
              borderRadius: "4px",
              fontSize: "14px"
            }}
          >
            <option value="MIS">MIS (Intraday)</option>
            <option value="CNC">CNC (Delivery)</option>
            <option value="NRML">NRML (Futures)</option>
          </select>
        </div>

        {/* Validity */}
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            Validity *
          </label>
          <select
            value={formData.validity}
            onChange={(e) => setFormData(prev => ({ ...prev, validity: e.target.value as ValidityType }))}
            style={{ 
              width: "100%", 
              padding: "8px", 
              border: "1px solid #ddd", 
              borderRadius: "4px",
              fontSize: "14px"
            }}
          >
            <option value="DAY">Day</option>
            <option value="IOC">IOC (Immediate or Cancel)</option>
          </select>
        </div>

        {/* Margin Calculation */}
        {ltp > 0 && formData.quantity > 0 && (
          <div style={{ 
            padding: "12px", 
            backgroundColor: "#f8f9fa", 
            borderRadius: "4px",
            fontSize: "14px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span>Notional Value:</span>
              <span>₹{(ltp * formData.quantity).toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              <span>Margin Required:</span>
              <span>₹{calculateMargin().toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor: isSubmitting ? "#6c757d" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            fontSize: "16px",
            fontWeight: "bold"
          }}
        >
          {isSubmitting ? "Placing Order..." : `Place ${formData.side} Order`}
        </button>
      </form>

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
