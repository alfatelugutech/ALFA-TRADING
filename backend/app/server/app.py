from __future__ import annotations

import asyncio
import csv
import logging
from pathlib import Path
from typing import Dict, List, Optional

import orjson
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_config
from app.logging_setup import setup_logging
from app.broker.zerodha_client import ZerodhaClient
from app.market.ticker import MarketTicker
from app.strategies.sma_crossover import SmaCrossoverStrategy
from app.utils.symbols import load_instruments, resolve_tokens_by_symbols, search_symbols


logger = logging.getLogger(__name__)

app = FastAPI(title="Zerodha Auto Trader API")

# CORS for frontend (Vercel)
import os
_allowed = os.getenv("ALLOWED_ORIGINS", "*")
if _allowed.strip() == "*":
    _origins = ["*"]
else:
    _origins = [o.strip() for o in _allowed.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SubscribeRequest(BaseModel):
    symbols: List[str]
    exchange: Optional[str] = "NSE"
    mode: Optional[str] = "ltp"  # ltp|full


class OrderRequest(BaseModel):
    symbol: str
    exchange: str = "NSE"
    side: str  # BUY|SELL
    quantity: int = 1


class ExchangeRequest(BaseModel):
    request_token: str
    refresh_instruments: Optional[bool] = True


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

# Strategy state
strategy_active: bool = False
strategy_live: bool = False
strategy_exchange: str = "NSE"
strategy: Optional[SmaCrossoverStrategy] = None
last_strategy_signals: List[dict] = []


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
    # Strategy processing
    global strategy_active, strategy, last_strategy_signals
    if strategy_active and strategy is not None:
        # Attach _symbol for strategy compatibility
        enriched: List[dict] = []
        for t in ticks:
            tok = t.get("instrument_token")
            sym = token_to_symbol.get(tok)
            if not sym:
                continue
            tt = dict(t)
            tt["_symbol"] = sym
            enriched.append(tt)
        if not enriched:
            return
        try:
            signals = strategy.on_ticks(enriched)
            last_strategy_signals = [s.__dict__ for s in signals]
            for s in signals:
                if cfg.dry_run or not strategy_live:
                    logger.info("[DRY] Strategy signal %s %s qty=%s", s.side, s.symbol, s.quantity)
                    continue
                txn_type = broker.kite.TRANSACTION_TYPE_BUY if s.side == "BUY" else broker.kite.TRANSACTION_TYPE_SELL
                try:
                    broker.place_market_order(
                        tradingsymbol=s.symbol,
                        exchange=strategy_exchange,
                        quantity=s.quantity,
                        transaction_type=txn_type,
                    )
                except Exception:
                    logger.exception("Order placement failed for %s", s.symbol)
        except Exception:
            logger.exception("Strategy on_ticks failed")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {
        "name": "Zerodha Auto Trader API",
        "endpoints": [
            "/health",
            "/symbols/search?q=RELIANCE&exchange=NSE&limit=10",
            "/auth/login_url",
            "/auth/exchange",
            "/auth/profile",
            "/subscribe",
            "/unsubscribe",
            "/order",
            "/ws/ticks",
        ],
    }


@app.post("/subscribe")
def subscribe(req: SubscribeRequest):
    global symbol_to_token, token_to_symbol
    mode_full = (req.mode or "ltp").lower() == "full"
    # Validate token by fetching profile; if invalid, ask client to login
    try:
        broker.kite.profile()
    except Exception:
        return {"error": "NOT_AUTHENTICATED", "message": "Login required. Use /auth/login_url then /auth/exchange."}
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
    if cfg.dry_run:
        logger.info("[DRY] %s %s qty=%s", side, req.symbol, req.quantity)
        return {"dry_run": True, "status": "ok"}
    resp = broker.place_market_order(
        tradingsymbol=req.symbol,
        exchange=req.exchange,
        quantity=req.quantity,
        transaction_type=txn_type,
    )
    return resp


@app.get("/auth/login_url")
def auth_login_url():
    try:
        url = broker.kite.login_url()
        return {"url": url}
    except Exception:
        logger.exception("Failed to get login_url")
        return {"url": None}


@app.post("/auth/exchange")
def auth_exchange(req: ExchangeRequest):
    global ticker, instruments
    data = broker.generate_session(req.request_token)
    access_token = data.get("access_token")
    # Set in runtime
    cfg.access_token = access_token
    broker.kite.set_access_token(access_token)
    # Reset ticker so next subscribe uses fresh token
    ticker = None
    # Optionally refresh instruments
    refreshed = 0
    if req.refresh_instruments:
        try:
            data_ins = broker.instruments()
            if data_ins:
                csv_path = Path(cfg.instruments_csv_path)
                csv_path.parent.mkdir(parents=True, exist_ok=True)
                with csv_path.open("w", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=data_ins[0].keys())
                    writer.writeheader()
                    writer.writerows(data_ins)
                instruments = load_instruments(str(csv_path))
                refreshed = len(instruments)
        except Exception:
            logger.exception("Failed to refresh instruments after exchange")
    return {"access_token": access_token, "instruments": refreshed}


@app.get("/auth/profile")
def auth_profile():
    try:
        prof = broker.kite.profile()
        return {"user_id": prof.get("user_id"), "user_name": prof.get("user_name")}
    except Exception as e:
        logger.exception("Profile fetch failed")
        return {"error": str(e)}


@app.get("/status")
def status():
    try:
        prof = broker.kite.profile()
        return {"auth": True, "user_id": prof.get("user_id"), "dry_run": cfg.dry_run}
    except Exception:
        return {"auth": False, "dry_run": cfg.dry_run}


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


@app.get("/symbols/search")
def symbols_search(q: str, exchange: Optional[str] = None, limit: int = 20):
    items = search_symbols(instruments, q, exchange=exchange, limit=limit)
    return [
        {
            "instrument_token": i.instrument_token,
            "tradingsymbol": i.tradingsymbol,
            "name": i.name,
            "exchange": i.exchange,
            "segment": i.segment,
        }
        for i in items
    ]


@app.get("/ltp")
def ltp(symbols: str, exchange: str = "NSE"):
    sym_list = [s.strip().upper() for s in (symbols or "").split(",") if s.strip()]
    if not sym_list:
        return {}
    mapping = resolve_tokens_by_symbols(instruments, sym_list, exchange=exchange)
    if not mapping:
        return {}
    # Build Zerodha LTP instrument map: "EXCHANGE:TRADINGSYMBOL":
    inst_map = {f"{exchange}:{sym}": sym for sym in mapping.keys()}
    data = broker.get_ltp(inst_map)
    # Convert back to simple { symbol: price }
    out = {}
    for key, val in (data or {}).items():
        sym = inst_map.get(key)
        if not sym:
            continue
        out[sym] = val.get("last_price")
    return out


class SmaStartRequest(BaseModel):
    symbols: List[str]
    exchange: str = "NSE"
    short: int = 20
    long: int = 50
    live: bool = False


@app.post("/strategy/sma/start")
def strategy_sma_start(req: SmaStartRequest):
    global strategy, strategy_active, strategy_live, strategy_exchange, symbol_to_token, token_to_symbol
    # Validate auth
    try:
        broker.kite.profile()
    except Exception:
        return {"error": "NOT_AUTHENTICATED"}
    # Resolve symbols and subscribe
    mapping = resolve_tokens_by_symbols(instruments, req.symbols, exchange=req.exchange)
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": req.symbols}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ensure_ticker(mode_full=False)
    ticker.subscribe(mapping.values())
    # Init strategy
    strategy = SmaCrossoverStrategy(symbols=list(mapping.keys()), short_window=req.short, long_window=req.long)
    strategy_active = True
    strategy_live = bool(req.live)
    strategy_exchange = req.exchange
    return {"status": "started", "symbols": list(mapping.keys()), "live": strategy_live}


@app.post("/strategy/stop")
def strategy_stop():
    global strategy_active, strategy
    strategy_active = False
    strategy = None
    return {"status": "stopped"}


@app.get("/strategy/status")
def strategy_status():
    return {
        "active": strategy_active,
        "live": strategy_live,
        "exchange": strategy_exchange,
        "last_signals": last_strategy_signals[-10:],
    }


class DryRunRequest(BaseModel):
    value: bool


@app.post("/config/dry_run")
def set_dry_run(req: DryRunRequest):
    cfg.dry_run = bool(req.value)
    logger.info("DRY_RUN set to %s", cfg.dry_run)
    return {"dry_run": cfg.dry_run}


