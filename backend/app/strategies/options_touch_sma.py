from __future__ import annotations

import collections
from typing import Deque, Dict, Iterable, List

from .base import BaseStrategy, Signal


class OptionsTouchSmaStrategy(BaseStrategy):
    """
    Underlying 21-SMA touch strategy for options entries/exits.
    - On green candle touching/crossing up through SMA(21): emit BUY (enter ATM CE+PE)
    - On red candle touching/crossing down through SMA(21): emit SELL (exit positions)
    The execution layer (server) handles placing CE/PE based on these signals.
    """

    def __init__(self, symbols: Iterable[str], length: int = 21, offset: int = 0, quantity: int = 1) -> None:
        super().__init__(symbols)
        self.length = length
        self.offset = max(0, int(offset))
        self.quantity = max(1, int(quantity))
        self.price_history: Dict[str, Deque[float]] = {
            s: collections.deque(maxlen=length) for s in self.symbols
        }
        self.prev_close: Dict[str, float] = {s: 0.0 for s in self.symbols}
        self.last_side: Dict[str, str] = {s: "" for s in self.symbols}

    def _sma(self, values: Deque[float]) -> float:
        if len(values) < self.length:
            return float("nan")
        slice_vals = list(values)[-self.length:]
        return sum(slice_vals) / float(self.length)

    def on_ticks(self, ticks: List[dict]) -> List[Signal]:
        signals: List[Signal] = []
        for t in ticks:
            symbol = t.get("_symbol")
            last_price = t.get("last_price") or t.get("last_traded_price") or t.get("ltp")
            if not symbol or last_price is None:
                continue
            last_price = float(last_price)
            dq = self.price_history[symbol]
            dq.append(last_price)
            sma = self._sma(dq)
            if not (sma == sma):
                continue
            prev_c = self.prev_close.get(symbol, last_price)
            candle_green = last_price >= prev_c
            side: str | None = None
            # Touch logic
            if candle_green and prev_c <= sma <= last_price:
                side = "BUY"
            elif (not candle_green) and prev_c >= sma >= last_price:
                side = "SELL"
            self.prev_close[symbol] = last_price
            if side and side != self.last_side[symbol]:
                signals.append(Signal(symbol=symbol, side=side, quantity=1))
                self.last_side[symbol] = side
        return signals


