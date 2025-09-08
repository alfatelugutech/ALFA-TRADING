from __future__ import annotations

import math
from typing import Dict, Iterable, List, Optional

from .base import BaseStrategy, Signal


class OptionsStraddleStrategy(BaseStrategy):
    """
    Options Straddle Strategy - Buy both CE and PE at ATM strike
    Profits from high volatility regardless of direction
    """
    
    def __init__(self, symbols: Iterable[str], underlying: str = "NIFTY", 
                 expiry: str = "next", quantity: int = 1, 
                 volatility_threshold: float = 0.02) -> None:
        super().__init__(symbols)
        self.underlying = underlying.upper()
        self.expiry = expiry
        self.quantity = quantity
        self.volatility_threshold = volatility_threshold
        self.positions: Dict[str, Dict] = {}
        self.price_history: Dict[str, List[float]] = {s: [] for s in self.symbols}
        self.last_underlying_price: Optional[float] = None
        
    def _calculate_volatility(self, prices: List[float], period: int = 20) -> float:
        """Calculate historical volatility"""
        if len(prices) < period:
            return 0.0
        
        recent_prices = prices[-period:]
        returns = []
        for i in range(1, len(recent_prices)):
            if recent_prices[i-1] > 0:
                returns.append(math.log(recent_prices[i] / recent_prices[i-1]))
        
        if len(returns) < 2:
            return 0.0
            
        mean_return = sum(returns) / len(returns)
        variance = sum((r - mean_return) ** 2 for r in returns) / (len(returns) - 1)
        return math.sqrt(variance * 252)  # Annualized volatility
    
    def _get_atm_strike(self, underlying_price: float) -> float:
        """Get ATM strike price (rounded to nearest 50 for NIFTY, 100 for BANKNIFTY)"""
        if self.underlying in ["NIFTY", "FINNIFTY"]:
            return round(underlying_price / 50) * 50
        elif self.underlying == "BANKNIFTY":
            return round(underlying_price / 100) * 100
        else:
            return round(underlying_price)
    
    def on_ticks(self, ticks: List[dict]) -> List[Signal]:
        signals: List[Signal] = []
        
        for tick in ticks:
            symbol = tick.get("_symbol", "")
            price = tick.get("last_price") or tick.get("last_traded_price") or tick.get("ltp")
            
            if not symbol or price is None:
                continue
                
            price = float(price)
            
            # Track underlying price
            if symbol == self.underlying:
                self.last_underlying_price = price
                self.price_history[symbol].append(price)
                # Keep only last 50 prices for volatility calculation
                if len(self.price_history[symbol]) > 50:
                    self.price_history[symbol] = self.price_history[symbol][-50:]
            
            # Check if this is an options symbol we're tracking
            if symbol not in self.symbols:
                continue
                
            # Update price history for options
            self.price_history[symbol].append(price)
            if len(self.price_history[symbol]) > 20:
                self.price_history[symbol] = self.price_history[symbol][-20:]
        
        # Generate straddle signals based on underlying volatility
        if self.last_underlying_price and self.underlying in self.price_history:
            underlying_vol = self._calculate_volatility(self.price_history[self.underlying])
            
            if underlying_vol > self.volatility_threshold:
                atm_strike = self._get_atm_strike(self.last_underlying_price)
                
                # Check if we already have a straddle position
                straddle_key = f"{self.underlying}_{self.expiry}_{atm_strike}"
                if straddle_key not in self.positions:
                    # Generate CE and PE symbols (this would need to be resolved from instruments)
                    ce_symbol = f"{self.underlying}{self.expiry}{atm_strike}CE"
                    pe_symbol = f"{self.underlying}{self.expiry}{atm_strike}PE"
                    
                    # Buy both CE and PE
                    signals.append(Signal(symbol=ce_symbol, side="BUY", quantity=self.quantity))
                    signals.append(Signal(symbol=pe_symbol, side="BUY", quantity=self.quantity))
                    
                    # Mark position as opened
                    self.positions[straddle_key] = {
                        "ce_symbol": ce_symbol,
                        "pe_symbol": pe_symbol,
                        "strike": atm_strike,
                        "entry_price": self.last_underlying_price,
                        "volatility": underlying_vol
                    }
        
        return signals
