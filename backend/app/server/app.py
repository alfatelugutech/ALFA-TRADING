from __future__ import annotations

import asyncio
import csv
import logging
from pathlib import Path
from typing import Dict, List, Optional

import orjson
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.config import get_config
from app.logging_setup import setup_logging
from app.broker.zerodha_client import ZerodhaClient
from app.market.ticker import MarketTicker
from app.utils.symbols import load_instruments, resolve_tokens_by_symbols


logger = logging.getLogger(__name__)

app = FastAPI(title="Zerodha Auto Trader API")


class SubscribeRequest(BaseModel):
    symbols: List[str]
    exchange: Optional[str] = "NSE"
    mode: Optional[str] = "ltp"  # ltp|full


class OrderRequest(BaseModel):
    symbol: str
    exchange: str = "NSE"
    side: str  # BUY|SELL
    quantity: int = 1


# App state
cfg = get_config()
setup_logging(cfg.log_level)

broker = ZerodhaClient(api_key=cfg.zerodha_api_key, api_secret=cfg.zerodha_api_secret, access_token=cfg.access_token)


def _load_or_download_instruments() -> list:
    csv_path = Path(cfg.instruments_csv_path)
    try:
        return load_instruments(str(csv_path))
    except FileNotFoundError:
        logger.warning("Instruments CSV missing at %s. Attempting to download...", csv_path)
        try:
            data = broker.instruments()
            if not data:
                logger.error("Broker returned no instruments. Skipping write.")
                return []
            csv_path.parent.mkdir(parents=True, exist_ok=True)
            with csv_path.open("w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=data[0].keys())
                writer.writeheader()
                writer.writerows(data)
            logger.info("Instruments downloaded: %s entries", len(data))
            return load_instruments(str(csv_path))
        except Exception:
            logger.exception("Failed to download instruments. Continuing with empty list.")
            return []


instruments = _load_or_download_instruments()

latest_ticks: Dict[int, dict] = {}
symbol_to_token: Dict[str, int] = {}
token_to_symbol: Dict[int, str] = {}

ticker: Optional[MarketTicker] = None


def ensure_ticker(mode_full: bool) -> MarketTicker:
    global ticker
    if ticker is None:
        ticker = MarketTicker(
            api_key=cfg.zerodha_api_key,
            access_token=cfg.access_token or "",
            on_tick=_on_ticks,
            on_connect=lambda: logger.info("WS connected"),
            on_close=lambda: logger.info("WS closed"),
            mode_full=mode_full,
        )
        # Start with no tokens; will subscribe dynamically
        ticker.start(tokens=[])
    return ticker


def _on_ticks(ticks: List[dict]) -> None:
    for t in ticks:
        tok = t.get("instrument_token")
        if tok:
            latest_ticks[tok] = t
            if tok in token_to_symbol:
                t["symbol"] = token_to_symbol[tok]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/subscribe")
def subscribe(req: SubscribeRequest):
    global symbol_to_token, token_to_symbol
    mode_full = (req.mode or "ltp").lower() == "full"
    ensure_ticker(mode_full=mode_full)
    mapping = resolve_tokens_by_symbols(instruments, req.symbols, exchange=req.exchange)
    if not mapping:
        return {"subscribed": [], "missing": req.symbols}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ticker.subscribe(mapping.values())
    return {"subscribed": list(mapping.keys())}


@app.post("/unsubscribe")
def unsubscribe(req: SubscribeRequest):
    mapping = {s: symbol_to_token.get(s.upper()) for s in req.symbols}
    tokens = [t for t in mapping.values() if t]
    if not tokens:
        return {"unsubscribed": []}
    ensure_ticker(mode_full=(req.mode or "ltp").lower() == "full")
    ticker.unsubscribe(tokens)
    return {"unsubscribed": req.symbols}


@app.post("/order")
def order(req: OrderRequest):
    side = req.side.upper()
    txn_type = broker.kite.TRANSACTION_TYPE_BUY if side == "BUY" else broker.kite.TRANSACTION_TYPE_SELL
    resp = broker.place_market_order(
        tradingsymbol=req.symbol,
        exchange=req.exchange,
        quantity=req.quantity,
        transaction_type=txn_type,
    )
    return resp


@app.websocket("/ws/ticks")
async def ws_ticks(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            await asyncio.sleep(0.5)
            # Send latest snapshot of all subscribed tokens
            payload = []
            for tok, t in list(latest_ticks.items())[:2000]:
                s = token_to_symbol.get(tok)
                if s:
                    t = dict(t)
                    t["symbol"] = s
                    payload.append(t)
            await ws.send_bytes(orjson.dumps({"ticks": payload}))
    except WebSocketDisconnect:
        return


