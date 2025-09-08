from __future__ import annotations

import collections
from typing import Deque, Dict, Iterable, List

from .base import BaseStrategy, Signal


class SmaCrossoverStrategy(BaseStrategy):
    def __init__(self, symbols: Iterable[str], short_window: int = 20, long_window: int = 50, entry_on_touch: bool = False) -> None:
        super().__init__(symbols)
        self.short_window = short_window
        self.long_window = long_window
        self.entry_on_touch = entry_on_touch
        self.price_history: Dict[str, Deque[float]] = {
            s: collections.deque(maxlen=max(long_window, short_window)) for s in self.symbols
        }
        self.last_signal_side: Dict[str, str] = {s: "" for s in self.symbols}
        # Track last candle color and last SMA touch to implement touch rules
        self.prev_close: Dict[str, float] = {s: 0.0 for s in self.symbols}

    def _sma(self, values: Deque[float], length: int) -> float:
        if len(values) < length:
            return float("nan")
        slice_vals = list(values)[-length:]
        return sum(slice_vals) / float(length)

    def on_ticks(self, ticks: List[dict]) -> List[Signal]:
        signals: List[Signal] = []
        for t in ticks:
            token = t.get("instrument_token") or t.get("instrument_token".upper())
            last_price = t.get("last_price") or t.get("last_traded_price") or t.get("ltp")
            if token is None or last_price is None:
                continue
            # Zerodha ticks don't include symbol; the runner should resolve token->symbol mapping.
            symbol = t.get("_symbol")
            if not symbol:
                continue
            dq = self.price_history[symbol]
            dq.append(float(last_price))
            sma_s = self._sma(dq, self.short_window)
            sma_l = self._sma(dq, self.long_window)
            if not (sma_s == sma_s and sma_l == sma_l):
                continue
            side = None
            # Entry/exit based on SMA touch with 21-length if requested
            if self.entry_on_touch and self.short_window == 21 and self.long_window == 21:
                # Define candle color by last traded price vs previous close snapshot
                last_close = float(last_price)
                prev_c = self.prev_close.get(symbol, last_close)
                candle_green = last_close >= prev_c
                # Touch detected if price crosses from below to above SMA, or above to below
                if candle_green and prev_c <= sma_s <= last_close:
                    side = "BUY"
                elif (not candle_green) and prev_c >= sma_s >= last_close:
                    side = "SELL"
                # Update prev close snapshot
                self.prev_close[symbol] = last_close
            if side is None:
                side = "BUY" if sma_s > sma_l else "SELL"
            if side != self.last_signal_side[symbol]:
                signals.append(Signal(symbol=symbol, side=side, quantity=1))
                self.last_signal_side[symbol] = side
        return signals




