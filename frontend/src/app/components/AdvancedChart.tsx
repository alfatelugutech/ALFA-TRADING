"use client";

import { useEffect, useRef, useState } from "react";

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalIndicator {
  name: string;
  data: number[];
  color: string;
  type: "line" | "histogram" | "overlay";
}

interface AdvancedChartProps {
  symbol: string;
  data: CandleData[];
  indicators?: TechnicalIndicator[];
  height?: number;
  showVolume?: boolean;
  showGrid?: boolean;
}

export default function AdvancedChart({
  symbol,
  data,
  indicators = [],
  height = 400,
  showVolume = true,
  showGrid = true
}: AdvancedChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);

  // Calculate technical indicators
  const calculateSMA = (data: number[], period: number): number[] => {
    const sma: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  };

  const calculateEMA = (data: number[], period: number): number[] => {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    if (data.length === 0) return ema;
    
    ema.push(data[0]); // First value is the same
    
    for (let i = 1; i < data.length; i++) {
      ema.push((data[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
    }
    
    return ema;
  };

  const calculateRSI = (data: number[], period: number = 14): number[] => {
    const rsi: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];
    
    // Calculate price changes
    for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    // Calculate initial averages
    if (gains.length >= period) {
      let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
      let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
      
      for (let i = period; i < gains.length; i++) {
        avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
        avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
        
        const rs = avgGain / avgLoss;
        const rsiValue = 100 - (100 / (1 + rs));
        rsi.push(rsiValue);
      }
    }
    
    return rsi;
  };

  const calculateBollingerBands = (data: number[], period: number = 20, stdDev: number = 2) => {
    const sma = calculateSMA(data, period);
    const bands = { upper: [], middle: sma, lower: [] };
    
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = sma[i - period + 1];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      
      bands.upper.push(mean + (standardDeviation * stdDev));
      bands.lower.push(mean - (standardDeviation * stdDev));
    }
    
    return bands;
  };

  const calculateMACD = (data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) => {
    const ema12 = calculateEMA(data, fastPeriod);
    const ema26 = calculateEMA(data, slowPeriod);
    
    const macdLine: number[] = [];
    const signalLine: number[] = [];
    const histogram: number[] = [];
    
    // Calculate MACD line
    for (let i = slowPeriod - 1; i < data.length; i++) {
      const macdValue = ema12[i - slowPeriod + fastPeriod] - ema26[i - slowPeriod + 1];
      macdLine.push(macdValue);
    }
    
    // Calculate signal line
    if (macdLine.length >= signalPeriod) {
      const signal = calculateEMA(macdLine, signalPeriod);
      signalLine.push(...signal);
      
      // Calculate histogram
      for (let i = 0; i < signal.length; i++) {
        histogram.push(macdLine[i + signalPeriod - 1] - signal[i]);
      }
    }
    
    return { macdLine, signalLine, histogram };
  };

  // Auto-calculate common indicators if not provided
  const autoIndicators: TechnicalIndicator[] = [];
  if (data.length > 0) {
    const closes = data.map(d => d.close);
    
    // SMA 20
    if (closes.length >= 20) {
      const sma20 = calculateSMA(closes, 20);
      autoIndicators.push({
        name: "SMA 20",
        data: sma20,
        color: "#FF6B6B",
        type: "overlay"
      });
    }
    
    // EMA 12
    if (closes.length >= 12) {
      const ema12 = calculateEMA(closes, 12);
      autoIndicators.push({
        name: "EMA 12",
        data: ema12,
        color: "#4ECDC4",
        type: "overlay"
      });
    }
    
    // RSI
    if (closes.length >= 15) {
      const rsi = calculateRSI(closes, 14);
      autoIndicators.push({
        name: "RSI",
        data: rsi,
        color: "#45B7D1",
        type: "line"
      });
    }
    
    // Bollinger Bands
    if (closes.length >= 20) {
      const bb = calculateBollingerBands(closes, 20, 2);
      autoIndicators.push({
        name: "BB Upper",
        data: bb.upper,
        color: "#96CEB4",
        type: "overlay"
      });
      autoIndicators.push({
        name: "BB Lower",
        data: bb.lower,
        color: "#96CEB4",
        type: "overlay"
      });
    }
  }

  const allIndicators = [...indicators, ...autoIndicators];

  const drawChart = () => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const chartHeight = height - (showVolume ? 80 : 0);
    const volumeHeight = showVolume ? 60 : 0;
    const padding = 40;

    // Clear canvas
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);

    // Calculate visible data range
    const visibleCount = Math.min(data.length, Math.floor(width / 8));
    const startIndex = Math.max(0, data.length - visibleCount - pan);
    const endIndex = Math.min(data.length, startIndex + visibleCount);
    const visibleData = data.slice(startIndex, endIndex);

    if (visibleData.length === 0) return;

    // Find price range
    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.1;

    // Price scale
    const priceMin = minPrice - pricePadding;
    const priceMax = maxPrice + pricePadding;

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      
      // Horizontal grid lines
      for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight - padding * 2) * (i / 5);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
      }
      
      // Vertical grid lines
      for (let i = 0; i <= 10; i++) {
        const x = padding + (width - padding * 2) * (i / 10);
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, chartHeight - padding);
        ctx.stroke();
      }
    }

    // Draw candlesticks
    const candleWidth = Math.max(2, (width - padding * 2) / visibleData.length - 2);
    
    visibleData.forEach((candle, index) => {
      const x = padding + (index * (width - padding * 2) / visibleData.length) + candleWidth / 2;
      
      // Calculate Y positions
      const highY = padding + (chartHeight - padding * 2) * (1 - (candle.high - priceMin) / (priceMax - priceMin));
      const lowY = padding + (chartHeight - padding * 2) * (1 - (candle.low - priceMin) / (priceMax - priceMin));
      const openY = padding + (chartHeight - padding * 2) * (1 - (candle.open - priceMin) / (priceMax - priceMin));
      const closeY = padding + (chartHeight - padding * 2) * (1 - (candle.close - priceMin) / (priceMax - priceMin));
      
      // Determine candle color
      const isGreen = candle.close >= candle.open;
      ctx.strokeStyle = isGreen ? "#00C851" : "#FF4444";
      ctx.fillStyle = isGreen ? "#00C851" : "#FF4444";
      
      // Draw wick
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      
      // Draw body
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY);
      
      if (bodyHeight > 0) {
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      } else {
        // Doji
        ctx.beginPath();
        ctx.moveTo(x - candleWidth / 2, openY);
        ctx.lineTo(x + candleWidth / 2, openY);
        ctx.stroke();
      }
    });

    // Draw indicators
    allIndicators.forEach(indicator => {
      if (indicator.type === "overlay" && indicator.data.length > 0) {
        ctx.strokeStyle = indicator.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        let firstPoint = true;
        indicator.data.forEach((value, index) => {
          if (index >= startIndex && index < endIndex) {
            const x = padding + ((index - startIndex) * (width - padding * 2) / visibleData.length) + candleWidth / 2;
            const y = padding + (chartHeight - padding * 2) * (1 - (value - priceMin) / (priceMax - priceMin));
            
            if (firstPoint) {
              ctx.moveTo(x, y);
              firstPoint = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        
        ctx.stroke();
      }
    });

    // Draw price labels
    ctx.fillStyle = "#fff";
    ctx.font = "12px Arial";
    ctx.textAlign = "right";
    
    for (let i = 0; i <= 5; i++) {
      const price = priceMax - (priceRange * i / 5);
      const y = padding + (chartHeight - padding * 2) * (i / 5);
      ctx.fillText(price.toFixed(2), width - padding - 5, y + 4);
    }

    // Draw volume bars if enabled
    if (showVolume && visibleData.length > 0) {
      const maxVolume = Math.max(...visibleData.map(d => d.volume));
      const volumeY = chartHeight + 10;
      
      visibleData.forEach((candle, index) => {
        const x = padding + (index * (width - padding * 2) / visibleData.length) + candleWidth / 2;
        const barHeight = (candle.volume / maxVolume) * volumeHeight;
        const isGreen = candle.close >= candle.open;
        
        ctx.fillStyle = isGreen ? "#00C851" : "#FF4444";
        ctx.fillRect(x - candleWidth / 2, volumeY + volumeHeight - barHeight, candleWidth, barHeight);
      });
    }

    // Draw hover information
    if (hoveredCandle) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(10, 10, 200, 120);
      
      ctx.fillStyle = "#fff";
      ctx.font = "14px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`Symbol: ${symbol}`, 20, 30);
      ctx.fillText(`Time: ${new Date(hoveredCandle.timestamp).toLocaleString()}`, 20, 50);
      ctx.fillText(`Open: ${hoveredCandle.open.toFixed(2)}`, 20, 70);
      ctx.fillText(`High: ${hoveredCandle.high.toFixed(2)}`, 20, 90);
      ctx.fillText(`Low: ${hoveredCandle.low.toFixed(2)}`, 20, 110);
      ctx.fillText(`Close: ${hoveredCandle.close.toFixed(2)}`, 20, 130);
    }
  };

  useEffect(() => {
    drawChart();
  }, [data, indicators, hoveredCandle, zoom, pan]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 40;
    const visibleCount = Math.min(data.length, Math.floor(rect.width / 8));
    const startIndex = Math.max(0, data.length - visibleCount - pan);
    
    const candleIndex = Math.floor((x - padding) / ((rect.width - padding * 2) / visibleCount));
    const dataIndex = startIndex + candleIndex;
    
    if (dataIndex >= 0 && dataIndex < data.length) {
      setHoveredCandle(data[dataIndex]);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: height, cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredCandle(null)}
      />
      
      {/* Indicator Legend */}
      <div style={{ 
        position: "absolute", 
        top: 10, 
        right: 10, 
        background: "rgba(0, 0, 0, 0.8)", 
        color: "white", 
        padding: "10px",
        borderRadius: "5px",
        fontSize: "12px"
      }}>
        <div style={{ marginBottom: "5px", fontWeight: "bold" }}>Indicators:</div>
        {allIndicators.map((indicator, index) => (
          <div key={index} style={{ display: "flex", alignItems: "center", marginBottom: "2px" }}>
            <div 
              style={{ 
                width: "12px", 
                height: "2px", 
                backgroundColor: indicator.color, 
                marginRight: "5px" 
              }} 
            />
            {indicator.name}
          </div>
        ))}
      </div>
      
      {/* Chart Controls */}
      <div style={{ 
        position: "absolute", 
        bottom: 10, 
        left: 10, 
        display: "flex", 
        gap: "10px" 
      }}>
        <button 
          onClick={() => setZoom(zoom * 1.2)}
          style={{ padding: "5px 10px", fontSize: "12px" }}
        >
          Zoom In
        </button>
        <button 
          onClick={() => setZoom(zoom / 1.2)}
          style={{ padding: "5px 10px", fontSize: "12px" }}
        >
          Zoom Out
        </button>
        <button 
          onClick={() => setPan(pan + 10)}
          style={{ padding: "5px 10px", fontSize: "12px" }}
        >
          ←
        </button>
        <button 
          onClick={() => setPan(pan - 10)}
          style={{ padding: "5px 10px", fontSize: "12px" }}
        >
          →
        </button>
      </div>
    </div>
  );
}
