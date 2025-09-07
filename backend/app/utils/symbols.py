from __future__ import annotations

import csv
import logging
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional


logger = logging.getLogger(__name__)


@dataclass
class Instrument:
    instrument_token: int
    exchange_token: int
    tradingsymbol: str
    name: str
    last_price: float
    expiry: Optional[str]
    strike: float
    tick_size: float
    lot_size: int
    instrument_type: str
    segment: str
    exchange: str


def load_instruments(csv_path: str) -> List[Instrument]:
    instruments: List[Instrument] = []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                instruments.append(
                    Instrument(
                        instrument_token=int(row.get("instrument_token", 0)),
                        exchange_token=int(row.get("exchange_token", 0)),
                        tradingsymbol=row.get("tradingsymbol", ""),
                        name=row.get("name", ""),
                        last_price=float(row.get("last_price", 0.0) or 0.0),
                        expiry=row.get("expiry") or None,
                        strike=float(row.get("strike", 0.0) or 0.0),
                        tick_size=float(row.get("tick_size", 0.05) or 0.05),
                        lot_size=int(row.get("lot_size", 1) or 1),
                        instrument_type=row.get("instrument_type", ""),
                        segment=row.get("segment", ""),
                        exchange=row.get("exchange", ""),
                    )
                )
            except Exception:
                logger.exception("Failed to parse instrument row: %s", row)
    return instruments


def resolve_tokens_by_symbols(
    instruments: List[Instrument], symbols: Iterable[str], exchange: Optional[str] = None
) -> Dict[str, int]:
    symbol_set = {s.upper().strip() for s in symbols}
    mapping: Dict[str, int] = {}
    for inst in instruments:
        if exchange and inst.exchange.upper() != exchange.upper():
            continue
        sym = inst.tradingsymbol.upper()
        if sym in symbol_set:
            mapping[sym] = inst.instrument_token
    missing = symbol_set - set(mapping.keys())
    if missing:
        logger.warning("Symbols not found in instruments: %s", sorted(missing))
    return mapping


