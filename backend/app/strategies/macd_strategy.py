from __future__ import annotations

import collections
from typing import Deque, Dict, Iterable, List

from .base import BaseStrategy, Signal


class MacdStrategy(BaseStrategy):
    """
    MACD strategy for both equity and options trading
    Buy when MACD line crosses above signal line, Sell when it crosses below
    """
    
    def __init__(self, symbols: Iterable[str], fast_period: int = 12, 
                 slow_period: int = 26, signal_period: int = 9,
                 quantity: int = 1) -> None:
        super().__init__(symbols)
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.signal_period = signal_period
        self.quantity = quantity
        self.price_history: Dict[str, Deque[float]] = {
            s: collections.deque(maxlen=slow_period + signal_period) for s in self.symbols
        }
        self.ema_fast: Dict[str, float] = {s: 0.0 for s in self.symbols}
        self.ema_slow: Dict[str, float] = {s: 0.0 for s in self.symbols}
        self.ema_signal: Dict[str, float] = {s: 0.0 for s in self.symbols}
        self.macd_history: Dict[str, Deque[float]] = {
            s: collections.deque(maxlen=signal_period) for s in self.symbols
        }
        self.last_macd: Dict[str, float] = {s: 0.0 for s in self.symbols}
        self.last_signal: Dict[str, float] = {s: 0.0 for s in self.symbols}
        self.last_signal_side: Dict[str, str] = {s: "" for s in self.symbols}
        self.initialized: Dict[str, bool] = {s: False for s in self.symbols}
        
    def _calculate_ema(self, prev_ema: float, price: float, period: int) -> float:
        """Calculate Exponential Moving Average"""
        if period <= 1:
            return price
        k = 2.0 / (period + 1.0)
        return (price - prev_ema) * k + prev_ema
    
    def _calculate_macd(self, symbol: str, price: float) -> tuple[float, float, float]:
        """Calculate MACD (macd_line, signal_line, histogram)"""
        # Initialize EMAs with first price
        if not self.initialized[symbol]:
            self.ema_fast[symbol] = price
            self.ema_slow[symbol] = price
            self.initialized[symbol] = True
            return 0.0, 0.0, 0.0
        
        # Update EMAs
        self.ema_fast[symbol] = self._calculate_ema(self.ema_fast[symbol], price, self.fast_period)
        self.ema_slow[symbol] = self._calculate_ema(self.ema_slow[symbol], price, self.slow_period)
        
        # Calculate MACD line
        macd_line = self.ema_fast[symbol] - self.ema_slow[symbol]
        
        # Update MACD history for signal line calculation
        self.macd_history[symbol].append(macd_line)
        
        # Calculate signal line (EMA of MACD line)
        if len(self.macd_history[symbol]) == 1:
            self.ema_signal[symbol] = macd_line
        else:
            self.ema_signal[symbol] = self._calculate_ema(self.ema_signal[symbol], macd_line, self.signal_period)
        
        # Calculate histogram
        histogram = macd_line - self.ema_signal[symbol]
        
        return macd_line, self.ema_signal[symbol], histogram
    
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
            
            # Calculate MACD
            macd_line, signal_line, histogram = self._calculate_macd(symbol, price)
            
            # Generate signals based on MACD crossover
            if self.last_macd[symbol] != 0.0 and self.last_signal[symbol] != 0.0:
                # Bullish crossover: MACD crosses above signal line
                if (self.last_macd[symbol] <= self.last_signal[symbol] and 
                    macd_line > signal_line and 
                    self.last_signal_side[symbol] != "BUY"):
                    signals.append(Signal(symbol=symbol, side="BUY", quantity=self.quantity))
                    self.last_signal_side[symbol] = "BUY"
                
                # Bearish crossover: MACD crosses below signal line
                elif (self.last_macd[symbol] >= self.last_signal[symbol] and 
                      macd_line < signal_line and 
                      self.last_signal_side[symbol] != "SELL"):
                    signals.append(Signal(symbol=symbol, side="SELL", quantity=self.quantity))
                    self.last_signal_side[symbol] = "SELL"
            
            # Update last values
            self.last_macd[symbol] = macd_line
            self.last_signal[symbol] = signal_line
        
        return signals
