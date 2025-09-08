from __future__ import annotations

import collections
from typing import Deque, Dict, Iterable, List, Tuple

from .base import BaseStrategy, Signal


class SupportResistanceStrategy(BaseStrategy):
    """
    Support and Resistance breakout strategy
    Buy when price breaks above resistance, Sell when price breaks below support
    """
    
    def __init__(self, symbols: Iterable[str], lookback_period: int = 50, 
                 breakout_threshold: float = 0.01, quantity: int = 1) -> None:
        super().__init__(symbols)
        self.lookback_period = lookback_period
        self.breakout_threshold = breakout_threshold  # 1% breakout threshold
        self.quantity = quantity
        self.price_history: Dict[str, Deque[float]] = {
            s: collections.deque(maxlen=lookback_period) for s in self.symbols
        }
        self.high_history: Dict[str, Deque[float]] = {
            s: collections.deque(maxlen=lookback_period) for s in self.symbols
        }
        self.low_history: Dict[str, Deque[float]] = {
            s: collections.deque(maxlen=lookback_period) for s in self.symbols
        }
        self.last_signal_side: Dict[str, str] = {s: "" for s in self.symbols}
        self.support_levels: Dict[str, List[float]] = {s: [] for s in self.symbols}
        self.resistance_levels: Dict[str, List[float]] = {s: [] for s in self.symbols}
        
    def _find_support_resistance(self, symbol: str) -> Tuple[List[float], List[float]]:
        """Find support and resistance levels using pivot points"""
        if len(self.high_history[symbol]) < 10 or len(self.low_history[symbol]) < 10:
            return [], []
        
        highs = list(self.high_history[symbol])
        lows = list(self.low_history[symbol])
        
        support_levels = []
        resistance_levels = []
        
        # Find local minima (support) and maxima (resistance)
        for i in range(2, len(highs) - 2):
            # Check for resistance (local maximum)
            if (highs[i] > highs[i-1] and highs[i] > highs[i-2] and 
                highs[i] > highs[i+1] and highs[i] > highs[i+2]):
                resistance_levels.append(highs[i])
            
            # Check for support (local minimum)
            if (lows[i] < lows[i-1] and lows[i] < lows[i-2] and 
                lows[i] < lows[i+1] and lows[i] < lows[i+2]):
                support_levels.append(lows[i])
        
        # Remove duplicates and sort
        support_levels = sorted(list(set(support_levels)))
        resistance_levels = sorted(list(set(resistance_levels)))
        
        return support_levels, resistance_levels
    
    def _get_nearest_levels(self, price: float, support_levels: List[float], 
                          resistance_levels: List[float]) -> Tuple[float, float]:
        """Get nearest support and resistance levels to current price"""
        nearest_support = 0.0
        nearest_resistance = float('inf')
        
        # Find nearest support below current price
        for level in support_levels:
            if level < price and level > nearest_support:
                nearest_support = level
        
        # Find nearest resistance above current price
        for level in resistance_levels:
            if level > price and level < nearest_resistance:
                nearest_resistance = level
        
        return nearest_support, nearest_resistance
    
    def on_ticks(self, ticks: List[dict]) -> List[Signal]:
        signals: List[Signal] = []
        
        for tick in ticks:
            symbol = tick.get("_symbol", "")
            price = tick.get("last_price") or tick.get("last_traded_price") or tick.get("ltp")
            high = tick.get("high") or price
            low = tick.get("low") or price
            
            if not symbol or price is None:
                continue
                
            price = float(price)
            high = float(high)
            low = float(low)
            
            if symbol not in self.price_history:
                continue
                
            # Update price history
            self.price_history[symbol].append(price)
            self.high_history[symbol].append(high)
            self.low_history[symbol].append(low)
            
            # Find support and resistance levels
            support_levels, resistance_levels = self._find_support_resistance(symbol)
            
            if not support_levels or not resistance_levels:
                continue
            
            # Get nearest levels
            nearest_support, nearest_resistance = self._get_nearest_levels(
                price, support_levels, resistance_levels
            )
            
            # Check for breakouts
            # Resistance breakout (bullish)
            if (nearest_resistance != float('inf') and 
                price > nearest_resistance * (1 + self.breakout_threshold) and
                self.last_signal_side[symbol] != "BUY"):
                signals.append(Signal(symbol=symbol, side="BUY", quantity=self.quantity))
                self.last_signal_side[symbol] = "BUY"
            
            # Support breakdown (bearish)
            elif (nearest_support > 0 and 
                  price < nearest_support * (1 - self.breakout_threshold) and
                  self.last_signal_side[symbol] != "SELL"):
                signals.append(Signal(symbol=symbol, side="SELL", quantity=self.quantity))
                self.last_signal_side[symbol] = "SELL"
            
            # Reset signal if price returns to range
            elif (nearest_support > 0 and nearest_resistance != float('inf') and
                  nearest_support * (1 + self.breakout_threshold) < price < 
                  nearest_resistance * (1 - self.breakout_threshold)):
                self.last_signal_side[symbol] = ""
        
        return signals
