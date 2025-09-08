from __future__ import annotations

import collections
import math
from typing import Deque, Dict, Iterable, List

from .base import BaseStrategy, Signal


class BollingerBandsStrategy(BaseStrategy):
    """
    Bollinger Bands strategy for both equity and options trading
    Buy when price touches lower band, Sell when price touches upper band
    """
    
    def __init__(self, symbols: Iterable[str], period: int = 20, 
                 std_dev: float = 2.0, quantity: int = 1) -> None:
        super().__init__(symbols)
        self.period = period
        self.std_dev = std_dev
        self.quantity = quantity
        self.price_history: Dict[str, Deque[float]] = {
            s: collections.deque(maxlen=period) for s in self.symbols
        }
        self.last_signal_side: Dict[str, str] = {s: "" for s in self.symbols}
        
    def _calculate_bollinger_bands(self, prices: Deque[float]) -> tuple[float, float, float]:
        """Calculate Bollinger Bands (upper, middle, lower)"""
        if len(prices) < self.period:
            return 0.0, 0.0, 0.0
        
        price_list = list(prices)
        
        # Calculate SMA (middle band)
        sma = sum(price_list) / len(price_list)
        
        # Calculate standard deviation
        variance = sum((price - sma) ** 2 for price in price_list) / len(price_list)
        std = math.sqrt(variance)
        
        # Calculate upper and lower bands
        upper_band = sma + (self.std_dev * std)
        lower_band = sma - (self.std_dev * std)
        
        return upper_band, sma, lower_band
    
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
            
            # Calculate Bollinger Bands
            upper_band, middle_band, lower_band = self._calculate_bollinger_bands(self.price_history[symbol])
            
            if upper_band == 0.0:  # Not enough data
                continue
            
            # Generate signals based on Bollinger Bands
            if price <= lower_band and self.last_signal_side[symbol] != "BUY":
                signals.append(Signal(symbol=symbol, side="BUY", quantity=self.quantity))
                self.last_signal_side[symbol] = "BUY"
            elif price >= upper_band and self.last_signal_side[symbol] != "SELL":
                signals.append(Signal(symbol=symbol, side="SELL", quantity=self.quantity))
                self.last_signal_side[symbol] = "SELL"
            elif lower_band < price < upper_band:
                # Reset signal when price returns to middle range
                self.last_signal_side[symbol] = ""
        
        return signals
