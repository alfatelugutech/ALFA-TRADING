from __future__ import annotations

import asyncio
import csv
import logging
import time
from datetime import datetime, time as dtime, timezone
from zoneinfo import ZoneInfo
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
from app.strategies.ema_crossover import EmaCrossoverStrategy
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

# Order log (paper + live)
order_log: List[dict] = []

# Risk management
risk_sl_pct: float = 0.02  # 2% stop-loss
risk_tp_pct: float = 0.0   # optional take-profit
risk_auto_close: bool = False

# Paper trading account (virtual money)
paper_start_cash = float(os.getenv("PAPER_STARTING_CASH", "1000000") or 1000000)
paper_account: Dict[str, float] = {"starting_cash": paper_start_cash, "cash": paper_start_cash}
paper_risk_per_trade_pct: float = float(os.getenv("PAPER_RISK_PER_TRADE_PCT", "0.01") or 0.01)

# AI trading config
ai_active: bool = False
ai_trade_capital: float = float(os.getenv("AI_TRADE_CAPITAL", "10000") or 10000)
ai_risk_pct: float = float(os.getenv("AI_RISK_PCT", "0.01") or 0.01)

# Auto-schedule
schedule_cfg: Dict[str, object] = {
    "enabled": False,
    "strategy": "sma",  # sma|ema
    "symbols": [],
    "exchange": "NSE",
    "short": 20,
    "long": 50,
    "live": False,
    "start": "09:15",
    "stop": "15:25",
    "square_off_eod": True,
}
_schedule_state: Dict[str, object] = {"started_on": "", "stopped_on": ""}


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
                    qty_calc = s.quantity
                    if ai_active:
                        price = _get_ltp_for_symbol(strategy_exchange, s.symbol)
                        if price > 0:
                            qty_calc = max(1, int(ai_trade_capital / price))
                    logger.info("[DRY] Strategy signal %s %s qty=%s", s.side, s.symbol, qty_calc)
                    _record_order(s.symbol, strategy_exchange, s.side, qty_calc, _get_ltp_for_symbol(strategy_exchange, s.symbol), True, source="strategy")
                    continue
                txn_type = broker.kite.TRANSACTION_TYPE_BUY if s.side == "BUY" else broker.kite.TRANSACTION_TYPE_SELL
                try:
                    qty_live = s.quantity
                    if ai_active:
                        price = _get_ltp_for_symbol(strategy_exchange, s.symbol)
                        if price > 0:
                            qty_live = max(1, int(ai_trade_capital / price))
                    broker.place_market_order(
                        tradingsymbol=s.symbol,
                        exchange=strategy_exchange,
                        quantity=qty_live,
                        transaction_type=txn_type,
                    )
                    _record_order(s.symbol, strategy_exchange, s.side, qty_live, _get_ltp_for_symbol(strategy_exchange, s.symbol), False, source="strategy")
                except Exception:
                    logger.exception("Order placement failed for %s", s.symbol)
        except Exception:
            logger.exception("Strategy on_ticks failed")
    # Auto close based on risk settings
    if risk_auto_close:
        try:
            holdings = _get_holdings()
            for sym, h in holdings.items():
                qty = h.get("quantity", 0)
                avg = h.get("avg_price", 0.0)
                if qty <= 0 or avg <= 0:
                    continue
                ltp = _get_ltp_for_symbol(strategy_exchange, sym)
                if risk_sl_pct > 0 and ltp <= avg * (1.0 - risk_sl_pct):
                    _square_off(sym, qty, reason="SL")
                elif risk_tp_pct > 0 and ltp >= avg * (1.0 + risk_tp_pct):
                    _square_off(sym, qty, reason="TP")
        except Exception:
            logger.exception("Auto close evaluation failed")


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
        _record_order(req.symbol, req.exchange, side, req.quantity, _get_ltp_for_symbol(req.exchange, req.symbol), True, source="manual")
        return {"dry_run": True, "status": "ok"}
    resp = broker.place_market_order(
        tradingsymbol=req.symbol,
        exchange=req.exchange,
        quantity=req.quantity,
        transaction_type=txn_type,
    )
    _record_order(req.symbol, req.exchange, side, req.quantity, _get_ltp_for_symbol(req.exchange, req.symbol), False, source="manual")
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


def _get_ltp_for_symbol(exchange: str, symbol: str) -> float:
    try:
        data = broker.get_ltp({f"{exchange}:{symbol}": symbol})
        rec = data.get(f"{exchange}:{symbol}") or {}
        return float(rec.get("last_price", 0) or 0)
    except Exception:
        return 0.0


def _record_order(symbol: str, exchange: str, side: str, quantity: int, price: float, dry_run: bool, source: str = "manual") -> None:
    order_log.append({
        "ts": int(time.time() * 1000),
        "symbol": symbol,
        "exchange": exchange,
        "side": side,
        "quantity": quantity,
        "price": price,
        "dry_run": dry_run,
        "source": source,
    })
    # Adjust virtual cash for paper trades
    try:
        if dry_run:
            cost = float(price) * int(quantity)
            if side == "BUY":
                paper_account["cash"] = float(paper_account.get("cash", 0.0)) - cost
            elif side == "SELL":
                paper_account["cash"] = float(paper_account.get("cash", 0.0)) + cost
    except Exception:
        logger.exception("paper cash adjust failed")


def _get_holdings() -> Dict[str, dict]:
    # Build simple holdings from order_log (BUY positive, SELL negative)
    holdings: Dict[str, dict] = {}
    for o in order_log:
        qty = o["quantity"] if o["side"] == "BUY" else -o["quantity"]
        s = holdings.setdefault(o["symbol"], {"quantity": 0, "avg_price": 0.0})
        new_qty = s["quantity"] + qty
        if new_qty > 0 and qty > 0:
            # weighted average on buys
            s["avg_price"] = (s["avg_price"] * s["quantity"] + o["price"] * qty) / max(new_qty, 1)
        s["quantity"] = new_qty
        if s["quantity"] <= 0:
            s["avg_price"] = 0.0
    return holdings


def _get_holdings_paper_only() -> Dict[str, dict]:
    holdings: Dict[str, dict] = {}
    for o in order_log:
        if not o.get("dry_run"):
            continue
        qty = o["quantity"] if o["side"] == "BUY" else -o["quantity"]
        s = holdings.setdefault(o["symbol"], {"quantity": 0, "avg_price": 0.0})
        new_qty = s["quantity"] + qty
        if new_qty > 0 and qty > 0:
            s["avg_price"] = (s["avg_price"] * s["quantity"] + o["price"] * qty) / max(new_qty, 1)
        s["quantity"] = new_qty
        if s["quantity"] <= 0:
            s["avg_price"] = 0.0
    return holdings


def _paper_equity_and_unrealized() -> Dict[str, float]:
    eq = 0.0
    unreal = 0.0
    holds = _get_holdings_paper_only()
    for sym, h in holds.items():
        qty = int(h.get("quantity", 0))
        if qty <= 0:
            continue
        avg = float(h.get("avg_price", 0.0))
        ltp = _get_ltp_for_symbol(strategy_exchange, sym)
        eq += ltp * qty
        unreal += (ltp - avg) * qty
    return {"equity": round(eq, 2), "unrealized": round(unreal, 2)}


def _square_off(symbol: str, quantity: int, reason: str = "") -> None:
    if quantity <= 0:
        return
    side = "SELL"
    if cfg.dry_run:
        _record_order(symbol, strategy_exchange, side, quantity, _get_ltp_for_symbol(strategy_exchange, symbol), True, source=f"auto-{reason}")
        logger.info("[AUTO-%s][DRY] Square-off %s qty=%s", reason, symbol, quantity)
        return
    txn_type = broker.kite.TRANSACTION_TYPE_SELL
    try:
        broker.place_market_order(tradingsymbol=symbol, exchange=strategy_exchange, quantity=quantity, transaction_type=txn_type)
        _record_order(symbol, strategy_exchange, side, quantity, _get_ltp_for_symbol(strategy_exchange, symbol), False, source=f"auto-{reason}")
        logger.info("[AUTO-%s] Square-off %s qty=%s", reason, symbol, quantity)
    except Exception:
        logger.exception("Square-off failed for %s", symbol)


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


class EmaStartRequest(BaseModel):
    symbols: List[str]
    exchange: str = "NSE"
    short: int = 12
    long: int = 26
    live: bool = False


@app.post("/strategy/ema/start")
def strategy_ema_start(req: EmaStartRequest):
    global strategy, strategy_active, strategy_live, strategy_exchange, symbol_to_token, token_to_symbol
    try:
        broker.kite.profile()
    except Exception:
        return {"error": "NOT_AUTHENTICATED"}
    mapping = resolve_tokens_by_symbols(instruments, req.symbols, exchange=req.exchange)
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": req.symbols}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ensure_ticker(mode_full=False)
    ticker.subscribe(mapping.values())
    strategy = EmaCrossoverStrategy(symbols=list(mapping.keys()), short_window=req.short, long_window=req.long)
    strategy_active = True
    strategy_live = bool(req.live)
    strategy_exchange = req.exchange
    return {"status": "started", "type": "ema", "symbols": list(mapping.keys()), "live": strategy_live}


@app.get("/orders")
def orders():
    return order_log[-200:]


@app.get("/pnl")
def pnl():
    # Simple realized PnL by pairing BUY then SELL per symbol FIFO
    realized = 0.0
    holdings: Dict[str, List[dict]] = {}
    for o in order_log:
        if o["side"] == "BUY":
            holdings.setdefault(o["symbol"], []).append(o)
        elif o["side"] == "SELL":
            qty = o["quantity"]
            while qty > 0 and holdings.get(o["symbol"]):
                buy = holdings[o["symbol"]][0]
                take = min(qty, buy["quantity"])
                realized += (o["price"] - buy["price"]) * take
                buy["quantity"] -= take
                qty -= take
                if buy["quantity"] <= 0:
                    holdings[o["symbol"]].pop(0)
            # If no buys to match, ignore (shorting not handled here)
    # Unrealized PnL using current LTP for remaining buys
    unrealized = 0.0
    for sym, buys in holdings.items():
        if not buys:
            continue
        ltp = _get_ltp_for_symbol(strategy_exchange, sym)
        for b in buys:
            unrealized += (ltp - b["price"]) * b["quantity"]
    return {"realized": round(realized, 2), "unrealized": round(unrealized, 2)}


class RiskConfig(BaseModel):
    sl_pct: float = 0.02
    tp_pct: float = 0.0
    auto_close: bool = False


@app.get("/risk")
def get_risk():
    return {"sl_pct": risk_sl_pct, "tp_pct": risk_tp_pct, "auto_close": risk_auto_close}


@app.post("/risk")
def set_risk(cfg_req: RiskConfig):
    global risk_sl_pct, risk_tp_pct, risk_auto_close
    risk_sl_pct = float(cfg_req.sl_pct)
    risk_tp_pct = float(cfg_req.tp_pct)
    risk_auto_close = bool(cfg_req.auto_close)
    logger.info("Risk updated sl=%.4f tp=%.4f auto=%s", risk_sl_pct, risk_tp_pct, risk_auto_close)
    return get_risk()


def _parse_hhmm(value: str) -> dtime:
    try:
        hh, mm = value.split(":")
        return dtime(hour=int(hh), minute=int(mm))
    except Exception:
        return dtime(hour=9, minute=15)


async def _scheduler_loop():
    tz = ZoneInfo("Asia/Kolkata")
    while True:
        try:
            if schedule_cfg.get("enabled"):
                now = datetime.now(tz)
                today_key = now.strftime("%Y-%m-%d")
                start_t = _parse_hhmm(str(schedule_cfg.get("start", "09:15")))
                stop_t = _parse_hhmm(str(schedule_cfg.get("stop", "15:25")))

                # START
                if _schedule_state.get("started_on") != today_key and now.time() >= start_t:
                    sym = [str(s).upper() for s in (schedule_cfg.get("symbols") or [])]
                    if sym:
                        if schedule_cfg.get("strategy") == "ema":
                            strategy_ema_start(EmaStartRequest(
                                symbols=sym,
                                exchange=str(schedule_cfg.get("exchange", "NSE")),
                                short=int(schedule_cfg.get("short", 12)),
                                long=int(schedule_cfg.get("long", 26)),
                                live=bool(schedule_cfg.get("live", False)),
                            ))
                        else:
                            strategy_sma_start(SmaStartRequest(
                                symbols=sym,
                                exchange=str(schedule_cfg.get("exchange", "NSE")),
                                short=int(schedule_cfg.get("short", 20)),
                                long=int(schedule_cfg.get("long", 50)),
                                live=bool(schedule_cfg.get("live", False)),
                            ))
                        _schedule_state["started_on"] = today_key
                        logger.info("Auto-started strategy via schedule")

                # STOP
                if _schedule_state.get("stopped_on") != today_key and now.time() >= stop_t:
                    strategy_stop()
                    if bool(schedule_cfg.get("square_off_eod", True)):
                        # square-off remaining holdings
                        holds = _get_holdings()
                        for sym, h in holds.items():
                            qty = int(h.get("quantity", 0))
                            if qty > 0:
                                _square_off(sym, qty, reason="EOD")
                    _schedule_state["stopped_on"] = today_key
                    logger.info("Auto-stopped strategy via schedule")
        except Exception:
            logger.exception("Scheduler loop error")
        await asyncio.sleep(30)


@app.on_event("startup")
async def _startup():
    asyncio.create_task(_scheduler_loop())


class ScheduleBody(BaseModel):
    enabled: bool
    strategy: str
    symbols: List[str]
    exchange: str = "NSE"
    short: int = 20
    long: int = 50
    live: bool = False
    start: str = "09:15"
    stop: str = "15:25"
    square_off_eod: bool = True


@app.get("/schedule")
def get_schedule():
    return {"config": schedule_cfg, "state": _schedule_state, "paper": {"starting_cash": paper_account.get("starting_cash", 0.0), "cash": paper_account.get("cash", 0.0)}}


@app.post("/schedule")
def set_schedule(body: ScheduleBody):
    schedule_cfg.update({
        "enabled": bool(body.enabled),
        "strategy": body.strategy,
        "symbols": [s.upper() for s in body.symbols],
        "exchange": body.exchange,
        "short": int(body.short),
        "long": int(body.long),
        "live": bool(body.live),
        "start": body.start,
        "stop": body.stop,
        "square_off_eod": bool(body.square_off_eod),
    })
    logger.info("Schedule updated: %s", schedule_cfg)
    return get_schedule()


@app.get("/positions")
def positions():
    holds = _get_holdings()
    out = []
    for sym, h in holds.items():
        qty = int(h.get("quantity", 0))
        if qty <= 0:
            continue
        avg = float(h.get("avg_price", 0.0))
        ltp = _get_ltp_for_symbol(strategy_exchange, sym)
        pnl_u = (ltp - avg) * qty
        out.append({"symbol": sym, "quantity": qty, "avg_price": round(avg, 2), "ltp": round(ltp, 2), "unrealized": round(pnl_u, 2)})
    # include paper account summary row (as meta)
    paper = _paper_equity_and_unrealized()
    meta = {"paper_cash": round(float(paper_account.get("cash", 0.0)), 2), "paper_equity": paper.get("equity", 0.0), "paper_unrealized": paper.get("unrealized", 0.0)}
    return {"positions": out, "paper": meta}


_expiries_cache: Dict[str, dict] = {}


@app.get("/options/expiries")
def options_expiries(underlying: str):
    try:
        global instruments
        u = (underlying or "").upper()
        now_ms = int(time.time() * 1000)
        cached = _expiries_cache.get(u)
        if cached and now_ms - int(cached.get("ts", 0)) < 60 * 60 * 1000:
            return cached.get("data", [])
        exps = sorted({i.expiry for i in instruments if i.exchange in {"NFO", "BFO"} and (i.name or "").upper() == u and i.instrument_type in {"CE", "PE"} and i.expiry})
        # If empty, try refreshing instruments from broker
        if not exps:
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
                    exps = sorted({i.expiry for i in instruments if i.exchange in {"NFO", "BFO"} and (i.name or "").upper() == u and i.instrument_type in {"CE", "PE"} and i.expiry})
            except Exception:
                logger.exception("refresh instruments for expiries failed")
        data = [e for e in exps if e]
        _expiries_cache[u] = {"ts": now_ms, "data": data}
        return data
    except Exception:
        logger.exception("expiries error")
        return []


@app.get("/options/chain")
def options_chain(underlying: str, expiry: str, count: int = 10, around: float | None = None):
    try:
        global instruments
        u = (underlying or "").upper()
        exp_param = (expiry or "").strip()
        items_all = [i for i in instruments if i.exchange in {"NFO", "BFO"} and (i.name or "").upper() == u and i.instrument_type in {"CE", "PE"}]
        # support alias 'next' to choose nearest upcoming expiry
        if exp_param.lower() == "next" or exp_param == "":
            try:
                from datetime import date
                today = date.today().isoformat()
                exps = sorted({i.expiry for i in items_all if i.expiry})
                exp_choice = None
                for e in exps:
                    if e >= today:
                        exp_choice = e
                        break
                exp_param = exp_choice or (exps[0] if exps else "")
            except Exception:
                pass
        items = [i for i in items_all if (i.expiry or "") == exp_param]
        if not items:
            # attempt refresh
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
                    items_all = [i for i in instruments if i.exchange in {"NFO", "BFO"} and (i.name or "").upper() == u and i.instrument_type in {"CE", "PE"}]
                    items = [i for i in items_all if (i.expiry or "") == exp_param]
            except Exception:
                logger.exception("refresh instruments for chain failed")
            if not items:
                return {"ce": [], "pe": [], "strikes": []}
        strikes = sorted(sorted({float(i.strike) for i in items if i.strike}))
        if not strikes:
            return {"ce": [], "pe": [], "strikes": []}
        center = around if around and around > 0 else strikes[len(strikes)//2]
        # take nearest 'count' strikes around center
        strikes_sorted = sorted(strikes, key=lambda s: abs(s - center))[:max(1, count)]
        selected = [s for s in sorted(strikes_sorted)]
        def pack(kind):
            arr = []
            for i in items:
                if i.instrument_type != kind:
                    continue
                if float(i.strike) in selected:
                    arr.append({
                        "tradingsymbol": i.tradingsymbol,
                        "strike": float(i.strike),
                        "instrument_token": i.instrument_token,
                        "type": kind,
                    })
            return sorted(arr, key=lambda x: x["strike"])[:count]
        return {"ce": pack("CE"), "pe": pack("PE"), "strikes": selected}
    except Exception:
        logger.exception("options chain error")
        return {"ce": [], "pe": [], "strikes": []}


@app.get("/status/all")
def status_all():
    try:
        prof = broker.kite.profile()
        auth = True
    except Exception:
        auth = False
    paper = _paper_equity_and_unrealized()
    return {
        "health": "ok",
        "auth": auth,
        "dry_run": cfg.dry_run,
        "orders": len(order_log),
        "subscriptions": len(symbol_to_token),
        "paper": {
            "cash": round(float(paper_account.get("cash", 0.0)), 2),
            "equity": paper.get("equity", 0.0),
            "unrealized": paper.get("unrealized", 0.0),
            "starting_cash": round(float(paper_account.get("starting_cash", 0.0)), 2),
            "risk_per_trade_pct": paper_risk_per_trade_pct,
        },
        "strategy": {
            "active": strategy_active,
            "live": strategy_live,
            "exchange": strategy_exchange,
        },
        "ai": {
            "active": ai_active,
            "trade_capital": ai_trade_capital,
            "risk_pct": ai_risk_pct,
        },
        "schedule": {"config": schedule_cfg, "state": _schedule_state},
    }


class DryRunRequest(BaseModel):
    value: bool


@app.post("/config/dry_run")
def set_dry_run(req: DryRunRequest):
    cfg.dry_run = bool(req.value)
    logger.info("DRY_RUN set to %s", cfg.dry_run)
    return {"dry_run": cfg.dry_run}


class PaperResetBody(BaseModel):
    cash: Optional[float] = None
    clear_orders: Optional[bool] = True


@app.post("/paper/reset")
def paper_reset(body: PaperResetBody):
    global paper_account, order_log
    try:
        new_cash = float(body.cash) if body.cash is not None else float(paper_account.get("starting_cash", 0.0))
    except Exception:
        new_cash = float(paper_account.get("starting_cash", 0.0))
    paper_account["starting_cash"] = new_cash
    paper_account["cash"] = new_cash
    if bool(body.clear_orders):
        order_log = [o for o in order_log if not o.get("dry_run")]
    logger.info("Paper account reset: cash=%.2f clear=%s", new_cash, bool(body.clear_orders))
    return {"cash": round(new_cash, 2), "cleared": bool(body.clear_orders)}


class AiConfigBody(BaseModel):
    active: bool
    trade_capital: float
    risk_pct: float


@app.post("/ai/config")
def ai_config(body: AiConfigBody):
    global ai_active, ai_trade_capital, ai_risk_pct
    ai_active = bool(body.active)
    ai_trade_capital = float(body.trade_capital)
    ai_risk_pct = float(body.risk_pct)
    logger.info("AI config updated: active=%s cap=%.2f risk=%.4f", ai_active, ai_trade_capital, ai_risk_pct)
    return {"active": ai_active, "trade_capital": ai_trade_capital, "risk_pct": ai_risk_pct}


@app.get("/broker/orders")
def broker_orders():
    try:
        data = broker.kite.orders()
        return data or []
    except Exception as e:
        logger.exception("broker orders failed")
        return {"error": str(e)}


