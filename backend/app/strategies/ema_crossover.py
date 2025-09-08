from __future__ import annotations

import collections
from typing import Deque, Dict, Iterable, List

from .base import BaseStrategy, Signal


def _ema(prev: float, price: float, period: int) -> float:
    if period <= 1:
        return price
    k = 2.0 / (period + 1.0)
    return (price - prev) * k + prev


class EmaCrossoverStrategy(BaseStrategy):
    def __init__(self, symbols: Iterable[str], short_window: int = 12, long_window: int = 26) -> None:
        super().__init__(symbols)
        self.short_window = short_window
        self.long_window = long_window
        self.ema_s: Dict[str, float] = {s: 0.0 for s in self.symbols}
        self.ema_l: Dict[str, float] = {s: 0.0 for s in self.symbols}
        self.seeded: Dict[str, bool] = {s: False for s in self.symbols}
        self.last_signal_side: Dict[str, str] = {s: "" for s in self.symbols}

    def on_ticks(self, ticks: List[dict]) -> List[Signal]:
        signals: List[Signal] = []
        for t in ticks:
            symbol = t.get("_symbol")
            price = t.get("last_price") or t.get("last_traded_price") or t.get("ltp")
            if not symbol or price is None:
                continue
            price = float(price)
            if not self.seeded[symbol]:
                self.ema_s[symbol] = price
                self.ema_l[symbol] = price
                self.seeded[symbol] = True
                continue
            self.ema_s[symbol] = _ema(self.ema_s[symbol], price, self.short_window)
            self.ema_l[symbol] = _ema(self.ema_l[symbol], price, self.long_window)
            side = "BUY" if self.ema_s[symbol] > self.ema_l[symbol] else "SELL"
            if side != self.last_signal_side[symbol]:
                signals.append(Signal(symbol=symbol, side=side, quantity=1))
                self.last_signal_side[symbol] = side
        return signals




