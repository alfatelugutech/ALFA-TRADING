from __future__ import annotations

import collections
from typing import Deque, Dict, Iterable, List

from .base import BaseStrategy, Signal


class RsiStrategy(BaseStrategy):
    """
    RSI-based strategy for both equity and options trading
    Buy when RSI < 30 (oversold), Sell when RSI > 70 (overbought)
    """
    
    def __init__(self, symbols: Iterable[str], period: int = 14, 
                 oversold: float = 30.0, overbought: float = 70.0,
                 quantity: int = 1) -> None:
        super().__init__(symbols)
        self.period = period
        self.oversold = oversold
        self.overbought = overbought
        self.quantity = quantity
        self.price_history: Dict[str, Deque[float]] = {
            s: collections.deque(maxlen=period + 1) for s in self.symbols
        }
        self.last_rsi: Dict[str, float] = {s: 50.0 for s in self.symbols}
        self.last_signal_side: Dict[str, str] = {s: "" for s in self.symbols}
        
    def _calculate_rsi(self, prices: Deque[float]) -> float:
        """Calculate RSI using Wilder's smoothing method"""
        if len(prices) < self.period + 1:
            return 50.0  # Neutral RSI
        
        price_list = list(prices)
        gains = []
        losses = []
        
        for i in range(1, len(price_list)):
            change = price_list[i] - price_list[i-1]
            if change > 0:
                gains.append(change)
                losses.append(0)
            else:
                gains.append(0)
                losses.append(abs(change))
        
        if len(gains) < self.period:
            return 50.0
        
        # Calculate initial averages
        avg_gain = sum(gains[:self.period]) / self.period
        avg_loss = sum(losses[:self.period]) / self.period
        
        # Apply Wilder's smoothing for remaining periods
        for i in range(self.period, len(gains)):
            avg_gain = (avg_gain * (self.period - 1) + gains[i]) / self.period
            avg_loss = (avg_loss * (self.period - 1) + losses[i]) / self.period
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    def on_ticks(self, ticks: List[dict]) -> List[Signal]:
        signals: List[Signal] = []
        
        for tick in ticks:
            symbol = tick.get("_symbol", "")
            price = tick.get("last_price") or tick.get("last_traded_price") or tick.get("ltp")
            
            if not symbol or price is None:
                continue
                
            price = float(price)
            
            if symbol not in self.price_history:
                continue
                
            # Update price history
            self.price_history[symbol].append(price)
            
            # Calculate RSI
            rsi = self._calculate_rsi(self.price_history[symbol])
            self.last_rsi[symbol] = rsi
            
            # Generate signals based on RSI levels
            if rsi < self.oversold and self.last_signal_side[symbol] != "BUY":
                signals.append(Signal(symbol=symbol, side="BUY", quantity=self.quantity))
                self.last_signal_side[symbol] = "BUY"
            elif rsi > self.overbought and self.last_signal_side[symbol] != "SELL":
                signals.append(Signal(symbol=symbol, side="SELL", quantity=self.quantity))
                self.last_signal_side[symbol] = "SELL"
            elif self.oversold < rsi < self.overbought:
                # Reset signal when RSI returns to neutral zone
                self.last_signal_side[symbol] = ""
        
        return signals
