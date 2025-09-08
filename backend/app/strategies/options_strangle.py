from __future__ import annotations

import math
from typing import Dict, Iterable, List, Optional

from .base import BaseStrategy, Signal


class OptionsStrangleStrategy(BaseStrategy):
    """
    Options Strangle Strategy - Buy CE and PE at different strikes (OTM)
    Lower cost than straddle, profits from high volatility
    """
    
    def __init__(self, symbols: Iterable[str], underlying: str = "NIFTY", 
                 expiry: str = "next", quantity: int = 1, 
                 volatility_threshold: float = 0.02,
                 otm_offset: int = 2) -> None:
        super().__init__(symbols)
        self.underlying = underlying.upper()
        self.expiry = expiry
        self.quantity = quantity
        self.volatility_threshold = volatility_threshold
        self.otm_offset = otm_offset  # How many strikes OTM
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
    
    def _get_strike_increment(self) -> float:
        """Get strike increment based on underlying"""
        if self.underlying in ["NIFTY", "FINNIFTY"]:
            return 50.0
        elif self.underlying == "BANKNIFTY":
            return 100.0
        else:
            return 50.0
    
    def _get_otm_strikes(self, underlying_price: float) -> tuple[float, float]:
        """Get OTM CE and PE strikes"""
        increment = self._get_strike_increment()
        atm_strike = round(underlying_price / increment) * increment
        
        # CE strike (above ATM)
        ce_strike = atm_strike + (self.otm_offset * increment)
        # PE strike (below ATM)
        pe_strike = atm_strike - (self.otm_offset * increment)
        
        return ce_strike, pe_strike
    
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
        
        # Generate strangle signals based on underlying volatility
        if self.last_underlying_price and self.underlying in self.price_history:
            underlying_vol = self._calculate_volatility(self.price_history[self.underlying])
            
            if underlying_vol > self.volatility_threshold:
                ce_strike, pe_strike = self._get_otm_strikes(self.last_underlying_price)
                
                # Check if we already have a strangle position
                strangle_key = f"{self.underlying}_{self.expiry}_{ce_strike}_{pe_strike}"
                if strangle_key not in self.positions:
                    # Generate CE and PE symbols
                    ce_symbol = f"{self.underlying}{self.expiry}{ce_strike}CE"
                    pe_symbol = f"{self.underlying}{self.expiry}{pe_strike}PE"
                    
                    # Buy both CE and PE
                    signals.append(Signal(symbol=ce_symbol, side="BUY", quantity=self.quantity))
                    signals.append(Signal(symbol=pe_symbol, side="BUY", quantity=self.quantity))
                    
                    # Mark position as opened
                    self.positions[strangle_key] = {
                        "ce_symbol": ce_symbol,
                        "pe_symbol": pe_symbol,
                        "ce_strike": ce_strike,
                        "pe_strike": pe_strike,
                        "entry_price": self.last_underlying_price,
                        "volatility": underlying_vol
                    }
        
        return signals
