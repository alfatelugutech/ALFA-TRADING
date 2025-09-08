from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional


@dataclass
class Signal:
    symbol: str
    side: str  # BUY or SELL
    quantity: int


class BaseStrategy:
    def __init__(self, symbols: Iterable[str]) -> None:
        self.symbols = [s.upper() for s in symbols]

    def on_ticks(self, ticks: List[dict]) -> List[Signal]:
        raise NotImplementedError



