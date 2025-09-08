from __future__ import annotations

import asyncio
import csv
import logging
import time
from datetime import datetime, time as dtime, timezone, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Dict, List, Optional

import orjson
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import get_config
from app.logging_setup import setup_logging
from app.broker.zerodha_client import ZerodhaClient
from app.market.ticker import MarketTicker
from app.strategies.base import BaseStrategy
from app.strategies.sma_crossover import SmaCrossoverStrategy
from app.strategies.ema_crossover import EmaCrossoverStrategy
from app.strategies.rsi_strategy import RsiStrategy
from app.strategies.bollinger_bands import BollingerBandsStrategy
from app.strategies.macd_strategy import MacdStrategy
from app.strategies.support_resistance import SupportResistanceStrategy
from app.strategies.options_straddle import OptionsStraddleStrategy
from app.strategies.options_strangle import OptionsStrangleStrategy
from app.ai.market_analyzer import AIMarketAnalyzer
from app.ai.trading_engine import AITradingEngine
from app.risk.portfolio_manager import AdvancedPortfolioManager, RiskLevel
from app.alerts.notification_system import AdvancedAlertManager, Alert, AlertType, AlertPriority, NotificationChannel, NotificationService
from app.backtesting.engine import BacktestEngine, OrderSide, OrderType
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


class SquareOffBody(BaseModel):
    symbol: str
    quantity: int | None = None
    exchange: str | None = None


class ExchangeRequest(BaseModel):
    request_token: str
    refresh_instruments: Optional[bool] = True


# App state
cfg = get_config()
setup_logging(cfg.log_level)

broker = ZerodhaClient(api_key=cfg.zerodha_api_key, api_secret=cfg.zerodha_api_secret, access_token=cfg.access_token)

# Initialize authentication cache if we have a valid access token
def _initialize_auth_cache():
    """Initialize authentication cache on startup if access token is available"""
    if cfg.zerodha_api_key == "demo_key":
        auth_cache["is_authenticated"] = True
        auth_cache["user_id"] = "DEMO_USER"
        auth_cache["last_check"] = time.time()
        logger.info("Demo mode: Authentication cache initialized")
        return
    
    if cfg.access_token:
        try:
            broker.kite.set_access_token(cfg.access_token)
            prof = broker.kite.profile()
            user_id = prof.get("user_id")
            
            auth_cache["is_authenticated"] = True
            auth_cache["user_id"] = user_id
            auth_cache["last_check"] = time.time()
            auth_cache["access_token"] = cfg.access_token
            
            logger.info("Authentication cache initialized for user: %s (cached for 24 hours)", user_id)
        except Exception as e:
            logger.warning("Failed to initialize authentication cache: %s", str(e))
            auth_cache["is_authenticated"] = False

# Initialize cache on startup
_initialize_auth_cache()


def _load_or_download_instruments() -> list:
    csv_path = Path(cfg.instruments_csv_path)
    # In demo mode (Render/GitHub with demo_key), avoid download attempts and use in-memory demo instruments
    if cfg.zerodha_api_key == "demo_key":
        logger.info("Demo mode detected (ZERODHA_API_KEY=demo_key). Using in-memory demo instruments.")
        return _create_demo_instruments()

    try:
        return load_instruments(str(csv_path))
    except FileNotFoundError:
        logger.warning("Instruments CSV missing at %s. Attempting to download...", csv_path)
        try:
            data = broker.instruments()
            if not data:
                logger.warning("Broker returned no instruments. Falling back to demo instruments in-memory.")
                return _create_demo_instruments()
            csv_path.parent.mkdir(parents=True, exist_ok=True)
            with csv_path.open("w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=data[0].keys())
                writer.writeheader()
                writer.writerows(data)
            logger.info("Instruments downloaded: %s entries", len(data))
            return load_instruments(str(csv_path))
        except Exception as e:
            # Avoid noisy traceback in managed environments; fall back silently
            logger.warning("Instruments download failed (%s). Using in-memory demo instruments.", str(e))
            return _create_demo_instruments()


def _check_auth_or_demo():
    """Check authentication or return demo mode status with caching"""
    import time
    
    if cfg.zerodha_api_key == "demo_key":
        return True, "DEMO_USER"
    
    current_time = time.time()
    
    # Check if we have a valid cached authentication
    if (auth_cache["is_authenticated"] and 
        auth_cache["last_check"] > 0 and 
        (current_time - auth_cache["last_check"]) < auth_cache["cache_duration"]):
        logger.debug("Using cached authentication for user: %s", auth_cache["user_id"])
        return True, auth_cache["user_id"]
    
    # Cache expired or no cache, check authentication
    try:
        prof = broker.kite.profile()
        user_id = prof.get("user_id")
        
        # Update cache
        auth_cache["is_authenticated"] = True
        auth_cache["user_id"] = user_id
        auth_cache["last_check"] = current_time
        auth_cache["access_token"] = broker.kite.access_token
        
        logger.info("Authentication successful for user: %s (cached for 24 hours)", user_id)
        return True, user_id
        
    except Exception as e:
        # Clear cache on authentication failure
        auth_cache["is_authenticated"] = False
        auth_cache["user_id"] = None
        auth_cache["last_check"] = 0
        auth_cache["access_token"] = None
        
        logger.warning("Authentication failed: %s", str(e))
        return False, None


def _is_market_open(symbol_type: str = "equity") -> bool:
    """Check if market is open for trading"""
    try:
        from datetime import datetime, time
        import pytz
        
        # Get current IST time
        ist = pytz.timezone('Asia/Kolkata')
        now = datetime.now(ist)
        current_time = now.time()
        
        # Get trading hours for symbol type
        hours = TRADING_HOURS.get(symbol_type, TRADING_HOURS["equity"])
        start_time = time.fromisoformat(hours["start"])
        end_time = time.fromisoformat(hours["end"])
        
        # Check if current time is within trading hours
        is_open = start_time <= current_time <= end_time
        
        # Also check if it's a weekday (Monday=0, Sunday=6)
        is_weekday = now.weekday() < 5
        
        return is_open and is_weekday
        
    except Exception:
        # If timezone check fails, assume market is open for demo
        return True


def _create_demo_instruments() -> list:
    """Create demo instruments for GitHub/demo environment"""
    from app.utils.symbols import Instrument
    
    demo_instruments = [
        # NSE Equity
        Instrument(instrument_token=738561, exchange="NSE", tradingsymbol="RELIANCE", name="RELIANCE", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=408065, exchange="NSE", tradingsymbol="TCS", name="TCS", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=408065, exchange="NSE", tradingsymbol="INFY", name="INFY", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=341249, exchange="NSE", tradingsymbol="HDFCBANK", name="HDFCBANK", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=1270529, exchange="NSE", tradingsymbol="ICICIBANK", name="ICICIBANK", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=492033, exchange="NSE", tradingsymbol="KOTAKBANK", name="KOTAKBANK", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=356865, exchange="NSE", tradingsymbol="HINDUNILVR", name="HINDUNILVR", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=424961, exchange="NSE", tradingsymbol="ITC", name="ITC", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=2714625, exchange="NSE", tradingsymbol="BHARTIARTL", name="BHARTIARTL", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=779521, exchange="NSE", tradingsymbol="SBIN", name="SBIN", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=2939649, exchange="NSE", tradingsymbol="LT", name="LT", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=60417, exchange="NSE", tradingsymbol="ASIANPAINT", name="ASIANPAINT", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=2815745, exchange="NSE", tradingsymbol="MARUTI", name="MARUTI", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=1510401, exchange="NSE", tradingsymbol="AXISBANK", name="AXISBANK", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=4598529, exchange="NSE", tradingsymbol="NESTLEIND", name="NESTLEIND", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=2952193, exchange="NSE", tradingsymbol="ULTRACEMCO", name="ULTRACEMCO", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=857857, exchange="NSE", tradingsymbol="SUNPHARMA", name="SUNPHARMA", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=897537, exchange="NSE", tradingsymbol="TITAN", name="TITAN", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=3834113, exchange="NSE", tradingsymbol="POWERGRID", name="POWERGRID", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=2977281, exchange="NSE", tradingsymbol="NTPC", name="NTPC", instrument_type="EQ", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        
        # NSE Indices
        Instrument(instrument_token=256265, exchange="NSE", tradingsymbol="NIFTY 50", name="NIFTY 50", instrument_type="INDEX", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        Instrument(instrument_token=260105, exchange="NSE", tradingsymbol="NIFTY BANK", name="NIFTY BANK", instrument_type="INDEX", segment="NSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        
        # BSE Indices
        Instrument(instrument_token=2650241, exchange="BSE", tradingsymbol="SENSEX", name="SENSEX", instrument_type="INDEX", segment="BSE", expiry=None, strike=None, tick_size=0.05, lot_size=1, instrument_type_option=None),
        
        # NFO Options (sample)
        Instrument(instrument_token=256265, exchange="NFO", tradingsymbol="NIFTY2590925200CE", name="NIFTY2590925200CE", instrument_type="CE", segment="NFO", expiry="2025-09-25", strike=20000, tick_size=0.05, lot_size=25, instrument_type_option="CE"),
        Instrument(instrument_token=256266, exchange="NFO", tradingsymbol="NIFTY2590925200PE", name="NIFTY2590925200PE", instrument_type="PE", segment="NFO", expiry="2025-09-25", strike=20000, tick_size=0.05, lot_size=25, instrument_type_option="PE"),
    ]
    
    logger.info("Created %d demo instruments for GitHub environment", len(demo_instruments))
    return demo_instruments


instruments = _load_or_download_instruments()

latest_ticks: Dict[int, dict] = {}
symbol_to_token: Dict[str, int] = {}
token_to_symbol: Dict[int, str] = {}

ticker: Optional[MarketTicker] = None

# Strategy state
strategy_active: bool = False
strategy_live: bool = False
strategy_exchange: str = "NSE"
strategy: Optional[BaseStrategy] = None
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
ai_trade_capital: float = float(os.getenv("AI_TRADE_CAPITAL", "100000") or 100000)
ai_risk_pct: float = float(os.getenv("AI_RISK_PCT", "0.02") or 0.02)
ai_default_symbols: List[str] = [s.strip().upper() for s in (os.getenv("AI_DEFAULT_SYMBOLS", "RELIANCE TCS INFY HDFCBANK ICICIBANK KOTAKBANK HINDUNILVR ITC BHARTIARTL SBIN LT ASIANPAINT MARUTI AXISBANK NESTLEIND ULTRACEMCO SUNPHARMA TITAN POWERGRID NTPC") or "RELIANCE TCS INFY HDFCBANK ICICIBANK KOTAKBANK HINDUNILVR ITC BHARTIARTL SBIN LT ASIANPAINT MARUTI AXISBANK NESTLEIND ULTRACEMCO SUNPHARMA TITAN POWERGRID NTPC").split()]
ai_options_underlyings: List[str] = [s.strip().upper() for s in (os.getenv("AI_OPTIONS_UNDERLYINGS", "NIFTY BANKNIFTY SENSEX FINNIFTY") or "NIFTY BANKNIFTY SENSEX FINNIFTY").split()]
ai_options_qty: int = int(os.getenv("AI_OPTIONS_QTY", "1") or 1)

# AI Trading Engine
ai_engine: Optional[AITradingEngine] = None
ai_analyzer = AIMarketAnalyzer()

# Advanced Features
portfolio_manager = AdvancedPortfolioManager(initial_capital=100000)
notification_service = NotificationService({
    "email": {"enabled": False},  # Configure email settings
    "sms": {"enabled": False},    # Configure SMS settings
    "webhook": {"enabled": False} # Configure webhook settings
})
alert_manager = AdvancedAlertManager(notification_service)
backtest_engine = BacktestEngine(initial_capital=100000)

# Trailing stop
trailing_stop_pct: float = float(os.getenv("TRAILING_STOP_PCT", "0.0") or 0.0)  # 0.02 => 2%
# Absolute trailing distance in points (moves 1:1 with price once active)
trailing_stop_points: float = float(os.getenv("TRAILING_STOP_POINTS", "10") or 10.0)
trailing_state: Dict[str, Dict[str, float]] = {}
trailing_overrides_pct: Dict[str, float] = {}  # key: EXCHANGE:SYMBOL -> pct

# Authentication cache
auth_cache = {
    "is_authenticated": False,
    "user_id": None,
    "last_check": 0,
    "cache_duration": 24 * 60 * 60,  # 24 hours in seconds
    "access_token": None
}

# Trading hours (IST)
TRADING_HOURS = {
    "equity": {"start": "09:15", "end": "15:30"},
    "options": {"start": "09:15", "end": "15:30"},
    "futures": {"start": "09:15", "end": "15:30"},
    "currency": {"start": "09:00", "end": "17:00"},
    "commodity": {"start": "09:00", "end": "23:30"}
}

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
            def _strategy_name():
                try:
                    if isinstance(strategy, SmaCrossoverStrategy):
                        return "sma"
                    if isinstance(strategy, EmaCrossoverStrategy):
                        return "ema"
                    if isinstance(strategy, RsiStrategy):
                        return "rsi"
                    if isinstance(strategy, BollingerBandsStrategy):
                        return "bollinger"
                    if isinstance(strategy, MacdStrategy):
                        return "macd"
                    if isinstance(strategy, SupportResistanceStrategy):
                        return "support_resistance"
                    if isinstance(strategy, OptionsStraddleStrategy):
                        return "options_straddle"
                    if isinstance(strategy, OptionsStrangleStrategy):
                        return "options_strangle"
                except Exception:
                    pass
                return "unknown"
            name = _strategy_name()
            for s in signals:
                if cfg.dry_run or not strategy_live:
                    qty_calc = s.quantity
                    if ai_active:
                        price = _get_ltp_for_symbol(strategy_exchange, s.symbol)
                        if price > 0:
                            qty_calc = max(1, int(ai_trade_capital / price))
                    # If options symbol, convert qty_calc lots -> contracts when small integers are used
                    if ("CE" in s.symbol or "PE" in s.symbol) and qty_calc in {1, 2, 3, 4, 5, 10}:
                        lot = 75
                        if "BANKNIFTY" in s.symbol:
                            lot = 35
                        elif "SENSEX" in s.symbol:
                            lot = 20
                        elif "FINNIFTY" in s.symbol:
                            lot = 40
                        qty_calc = qty_calc * lot
                    logger.info("[DRY] Strategy signal %s %s qty=%s", s.side, s.symbol, qty_calc)
                    _record_order(s.symbol, strategy_exchange, s.side, qty_calc, _get_ltp_for_symbol(strategy_exchange, s.symbol), True, source=("ai-" + name) if ai_active else ("strategy-" + name))
                    continue
                txn_type = broker.kite.TRANSACTION_TYPE_BUY if s.side == "BUY" else broker.kite.TRANSACTION_TYPE_SELL
                try:
                    qty_live = s.quantity
                    if ai_active:
                        price = _get_ltp_for_symbol(strategy_exchange, s.symbol)
                        if price > 0:
                            qty_live = max(1, int(ai_trade_capital / price))
                    # Convert lots to contracts for options in live as well
                    if ("CE" in s.symbol or "PE" in s.symbol) and qty_live in {1, 2, 3, 4, 5, 10}:
                        lot_l = 75
                        if "BANKNIFTY" in s.symbol:
                            lot_l = 35
                        elif "SENSEX" in s.symbol:
                            lot_l = 20
                        elif "FINNIFTY" in s.symbol:
                            lot_l = 40
                        qty_live = qty_live * lot_l
                    broker.place_market_order(
                        tradingsymbol=s.symbol,
                        exchange=strategy_exchange,
                        quantity=qty_live,
                        transaction_type=txn_type,
                    )
                    _record_order(s.symbol, strategy_exchange, s.side, qty_live, _get_ltp_for_symbol(strategy_exchange, s.symbol), False, source=("ai-" + name) if ai_active else ("strategy-" + name))
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
                # Trailing stop logic
                try:
                    # choose per-symbol override if set
                    k = f"{strategy_exchange}:{sym}"
                    pct = float(trailing_overrides_pct.get(k, trailing_stop_pct))
                    st = trailing_state.setdefault(k, {"max": ltp, "min": ltp, "trail_price": 0.0})
                    # Update running extremes for both sides
                    if qty > 0:
                        # Long position: move max up and compute trailing by pct or points
                        st["max"] = max(st.get("max", ltp), ltp)
                        trail_pct = st["max"] * (1.0 - max(0.0, pct)) if pct > 0 else None
                        trail_pts = st["max"] - max(0.0, trailing_stop_points)
                        # choose the tighter stop if both configured
                        candidates = [v for v in [trail_pct, trail_pts] if v and v > 0]
                        if candidates:
                            st["trail_price"] = max(candidates)
                            if ltp <= st["trail_price"]:
                                _square_off(sym, qty, reason="TRAIL")
                    elif qty < 0:
                        # Short position: move min down and compute trailing
                        st["min"] = min(st.get("min", ltp), ltp)
                        trail_pct = st["min"] * (1.0 + max(0.0, pct)) if pct > 0 else None
                        trail_pts = st["min"] + max(0.0, trailing_stop_points)
                        candidates = [v for v in [trail_pct, trail_pts] if v and v > 0]
                        if candidates:
                            st["trail_price"] = min(candidates)
                            if ltp >= st["trail_price"]:
                                _square_off(sym, -qty, reason="TRAIL")
                except Exception:
                    pass
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
    
    # Check authentication using cached method
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
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
    # Auto-derive lot-sized quantity for options: if symbol ends with CE/PE and quantity equals 1 lot(s)
    qty = int(req.quantity)
    symu = req.symbol.upper()
    exch = req.exchange.upper()
    if ("CE" in symu or "PE" in symu):
        # If user passes small qty like 1, interpret as lots; multiply to exchange lot size if known
        # Basic defaults by underlying; can be extended per instruments
        lot = 75
        if "BANKNIFTY" in symu:
            lot = 35
        elif "SENSEX" in symu:
            lot = 20
        elif "FINNIFTY" in symu:
            lot = 40
        # Treat qty <= lot as lots when clearly not already multiples of lot
        if qty in {1, 2, 3, 4, 5, 10}:
            qty = qty * lot
    txn_type = broker.kite.TRANSACTION_TYPE_BUY if side == "BUY" else broker.kite.TRANSACTION_TYPE_SELL
    if cfg.dry_run:
        logger.info("[DRY] %s %s qty=%s", side, req.symbol, qty)
        _record_order(req.symbol, exch, side, qty, _get_ltp_for_symbol(exch, req.symbol), True, source="manual")
        return {"dry_run": True, "status": "ok"}
    resp = broker.place_market_order(
        tradingsymbol=req.symbol,
        exchange=exch,
        quantity=qty,
        transaction_type=txn_type,
    )
    _record_order(req.symbol, exch, side, qty, _get_ltp_for_symbol(exch, req.symbol), False, source="manual")
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
    global ticker, instruments, auth_cache
    import time
    
    data = broker.generate_session(req.request_token)
    access_token = data.get("access_token")
    # Set in runtime
    cfg.access_token = access_token
    broker.kite.set_access_token(access_token)
    
    # Update authentication cache
    try:
        prof = broker.kite.profile()
        user_id = prof.get("user_id")
        auth_cache["is_authenticated"] = True
        auth_cache["user_id"] = user_id
        auth_cache["last_check"] = time.time()
        auth_cache["access_token"] = access_token
        logger.info("Authentication successful for user: %s (cached for 24 hours)", user_id)
    except Exception as e:
        logger.warning("Failed to verify authentication after token exchange: %s", str(e))
    
    # Reset ticker so next subscribe uses fresh token
    ticker = None
    # Optionally refresh instruments
    refreshed = 0
    if req.refresh_instruments and cfg.zerodha_api_key != "demo_key":
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

@app.get("/auth/status")
def auth_status():
    """Get authentication status with cache info"""
    import time
    
    if cfg.zerodha_api_key == "demo_key":
        return {
            "authenticated": True,
            "user_id": "DEMO_USER",
            "demo_mode": True,
            "cache_info": None
        }
    
    current_time = time.time()
    cache_age = current_time - auth_cache["last_check"] if auth_cache["last_check"] > 0 else 0
    cache_expires_in = auth_cache["cache_duration"] - cache_age if cache_age < auth_cache["cache_duration"] else 0
    
    return {
        "authenticated": auth_cache["is_authenticated"],
        "user_id": auth_cache["user_id"],
        "demo_mode": False,
        "cache_info": {
            "cached": auth_cache["is_authenticated"] and cache_age < auth_cache["cache_duration"],
            "cache_age_hours": round(cache_age / 3600, 2),
            "expires_in_hours": round(cache_expires_in / 3600, 2) if cache_expires_in > 0 else 0,
            "last_check": auth_cache["last_check"]
        }
    }

@app.post("/auth/clear_cache")
def auth_clear_cache():
    """Clear authentication cache to force re-authentication"""
    global auth_cache
    auth_cache["is_authenticated"] = False
    auth_cache["user_id"] = None
    auth_cache["last_check"] = 0
    auth_cache["access_token"] = None
    logger.info("Authentication cache cleared")
    return {"status": "Cache cleared", "message": "Next request will require re-authentication"}


# Advanced Portfolio Management Endpoints
@app.get("/portfolio/advanced")
def get_advanced_portfolio():
    """Get advanced portfolio analysis"""
    try:
        summary = portfolio_manager.get_portfolio_summary()
        return summary
    except Exception as e:
        logger.exception("Error getting advanced portfolio: %s", e)
        return {"error": str(e)}


@app.post("/portfolio/position")
def add_portfolio_position(symbol: str, quantity: int, price: float, exchange: str = "NSE"):
    """Add a position to the portfolio"""
    try:
        success = portfolio_manager.add_position(symbol, quantity, price, exchange)
        if success:
            return {"status": "success", "message": f"Position added: {symbol}"}
        else:
            return {"status": "error", "message": "Failed to add position - risk limits exceeded"}
    except Exception as e:
        logger.exception("Error adding position: %s", e)
        return {"error": str(e)}


@app.get("/portfolio/risk")
def get_portfolio_risk():
    """Get portfolio risk metrics"""
    try:
        metrics = portfolio_manager.get_risk_metrics()
        violations = portfolio_manager.check_risk_limits()
        risk_level = portfolio_manager.get_risk_level()
        
        return {
            "risk_metrics": {
                "total_exposure": metrics.total_exposure,
                "portfolio_value": metrics.portfolio_value,
                "leverage_ratio": metrics.leverage_ratio,
                "var_95": metrics.var_95,
                "max_drawdown": metrics.max_drawdown,
                "sharpe_ratio": metrics.sharpe_ratio,
                "concentration_risk": metrics.concentration_risk
            },
            "risk_violations": violations,
            "risk_level": risk_level.value
        }
    except Exception as e:
        logger.exception("Error getting portfolio risk: %s", e)
        return {"error": str(e)}


# Advanced Alerts Endpoints
@app.post("/alerts/create")
def create_alert(alert_data: dict):
    """Create a new alert"""
    try:
        alert = Alert(
            id=alert_data.get("id", f"alert_{int(time.time())}"),
            symbol=alert_data["symbol"],
            alert_type=AlertType(alert_data["alert_type"]),
            condition=alert_data["condition"],
            priority=AlertPriority(alert_data.get("priority", "medium")),
            channels=[NotificationChannel(ch) for ch in alert_data.get("channels", ["dashboard"])],
            enabled=alert_data.get("enabled", True),
            cooldown_minutes=alert_data.get("cooldown_minutes", 15),
            user_id=alert_data.get("user_id")
        )
        
        success = alert_manager.add_alert(alert)
        if success:
            return {"status": "success", "message": f"Alert created: {alert.id}"}
        else:
            return {"status": "error", "message": "Failed to create alert"}
    except Exception as e:
        logger.exception("Error creating alert: %s", e)
        return {"error": str(e)}


@app.get("/alerts")
def get_alerts(user_id: Optional[str] = None):
    """Get all alerts"""
    try:
        alerts = alert_manager.get_alerts(user_id)
        return {"alerts": [alert.__dict__ for alert in alerts]}
    except Exception as e:
        logger.exception("Error getting alerts: %s", e)
        return {"error": str(e)}


@app.get("/alerts/history")
def get_alert_history(limit: int = 100):
    """Get alert trigger history"""
    try:
        history = alert_manager.get_trigger_history(limit)
        return {"history": [trigger.__dict__ for trigger in history]}
    except Exception as e:
        logger.exception("Error getting alert history: %s", e)
        return {"error": str(e)}


# Backtesting Endpoints
@app.post("/backtest/load-data")
def load_backtest_data(symbol: str, data: List[dict]):
    """Load historical data for backtesting"""
    try:
        import pandas as pd
        df = pd.DataFrame(data)
        success = backtest_engine.load_historical_data(symbol, df)
        if success:
            return {"status": "success", "message": f"Data loaded for {symbol}"}
        else:
            return {"status": "error", "message": "Failed to load data"}
    except Exception as e:
        logger.exception("Error loading backtest data: %s", e)
        return {"error": str(e)}


@app.post("/backtest/run")
def run_backtest(strategy_config: dict):
    """Run a backtest"""
    try:
        start_date = datetime.fromisoformat(strategy_config["start_date"])
        end_date = datetime.fromisoformat(strategy_config["end_date"])
        
        # Simple strategy function for demo
        def demo_strategy(timestamp, price_data, engine):
            # This is a placeholder - implement your strategy logic here
            pass
        
        result = backtest_engine.run_backtest(demo_strategy, start_date, end_date)
        
        return {
            "status": "success",
            "result": {
                "start_date": result.start_date.isoformat(),
                "end_date": result.end_date.isoformat(),
                "initial_capital": result.initial_capital,
                "final_capital": result.final_capital,
                "total_return": result.metrics.total_return,
                "annualized_return": result.metrics.annualized_return,
                "sharpe_ratio": result.metrics.sharpe_ratio,
                "max_drawdown": result.metrics.max_drawdown,
                "win_rate": result.metrics.win_rate,
                "total_trades": result.metrics.total_trades
            }
        }
    except Exception as e:
        logger.exception("Error running backtest: %s", e)
        return {"error": str(e)}


# WebSocket for real-time notifications
@app.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    """WebSocket endpoint for real-time notifications"""
    await websocket.accept()
    notification_service.add_websocket_client(websocket)
    
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        notification_service.remove_websocket_client(websocket)


@app.get("/status")
def status():
    try:
        prof = broker.kite.profile()
        return {"auth": True, "user_id": prof.get("user_id"), "dry_run": cfg.dry_run}
    except Exception:
        # For GitHub/demo environment, return mock auth status
        if cfg.zerodha_api_key == "demo_key":
            return {"auth": True, "user_id": "DEMO_USER", "dry_run": True, "demo_mode": True}
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
    # Require authentication
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    # Prefer latest websocket tick per symbol; fallback to broker LTP API per symbol
    out = {}
    try:
        mapping = resolve_tokens_by_symbols(instruments, sym_list, exchange=exchange)
    except Exception:
        mapping = {}
    for sym in sym_list:
        price = 0.0
        try:
            tok = mapping.get(sym)
            if tok and tok in latest_ticks:
                t = latest_ticks.get(tok) or {}
                price = float(t.get("last_price") or t.get("last_traded_price") or t.get("ltp") or 0)
        except Exception:
            pass
        if not price or price <= 0:
            try:
                data = broker.get_ltp({f"{exchange}:{sym}": sym})
                rec = data.get(f"{exchange}:{sym}") or {}
                price = float(rec.get("last_price") or rec.get("last_traded_price") or rec.get("ltp") or 0)
            except Exception:
                price = 0.0
        if price and price > 0:
            out[sym] = price
        else:
            out[sym] = 0.0
    return out


@app.get("/quote")
def quote(keys: str):
    """Generic quote endpoint that supports full keys like 'NSE:NIFTY 50'.
    Returns a simple { key: last_price } map.
    """
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    items = [k.strip() for k in (keys or "").split(",") if k.strip()]
    if not items:
        return {}
    out = {}
    # First try LTP API quickly
    try:
        ltp_map = broker.get_ltp({k: k for k in items}) or {}
        for k in items:
            v = ltp_map.get(k) or {}
            price = float(v.get("last_price") or v.get("last_traded_price") or v.get("ltp") or 0)
            if price > 0:
                out[k] = price
    except Exception:
        pass
    # Fill remaining with quote()
    try:
        missing = [k for k in items if k not in out]
        if missing:
            data = broker.kite.quote(missing)
            for k in missing:
                v = (data or {}).get(k) or {}
                price = float(v.get("last_price") or v.get("last_traded_price") or v.get("ltp") or 0)
                out[k] = price
    except Exception:
        logger.exception("quote failed")
    return out


@app.get("/history")
def history(symbol: Optional[str] = None, exchange: str = "NSE", interval: str = "minute", count: int = 180, key: Optional[str] = None):
    """Fetch recent historical candles for a symbol or full key.
    - interval: minute, 3minute, 5minute, 10minute, 15minute, 30minute, 60minute, day
    - count: number of candles to fetch (approx)
    """
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    try:
        ex = exchange
        sym = (symbol or "").upper().strip()
        if key and ":" in key:
            parts = key.split(":", 1)
            ex = parts[0].upper()
            sym = parts[1].upper()
        mapping = resolve_tokens_by_symbols(instruments, [sym], exchange=ex)
        token = mapping.get(sym)
        if not token:
            # Fallback: try quote() to get instrument_token (works for indices)
            try:
                q = broker.kite.quote([f"{ex}:{sym}"]) or {}
                token = ((q.get(f"{ex}:{sym}") or {}).get("instrument_token"))
            except Exception:
                token = None
        if not token:
            return {"candles": []}
        tz = ZoneInfo("Asia/Kolkata")
        now = datetime.now(tz)
        # Estimate period
        step_minutes_map = {
            "minute": 1,
            "1minute": 1,
            "3minute": 3,
            "5minute": 5,
            "10minute": 10,
            "15minute": 15,
            "30minute": 30,
            "60minute": 60,
            "day": 60 * 24,
        }
        step_minutes = step_minutes_map.get(interval, 1)
        delta = timedelta(minutes=max(1, step_minutes) * max(1, int(count)))
        start = now - delta
        # Zerodha expects timezone-naive UTC timestamps; we provide aware dt which SDK handles.
        data = broker.kite.historical_data(token, start, now, interval)
        candles = []
        for row in data or []:
            # row has: date, open, high, low, close, volume
            try:
                ts = row.get("date")
                tiso = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
                candles.append({
                    "time": tiso,
                    "open": float(row.get("open", 0)),
                    "high": float(row.get("high", 0)),
                    "low": float(row.get("low", 0)),
                    "close": float(row.get("close", 0)),
                    "volume": int(row.get("volume", 0)),
                })
            except Exception:
                continue
        return {"candles": candles}
    except Exception:
        logger.exception("history failed")
        return {"candles": []}
    try:
        data = broker.kite.quote(items)
        out = {}
        for k in items:
            v = data.get(k) or {}
            out[k] = float(v.get("last_price") or v.get("last_traded_price") or v.get("ltp") or 0)
        return out
    except Exception:
        logger.exception("quote failed")
        return {}


def _get_ltp_for_symbol(exchange: str, symbol: str) -> float:
    # 1) Try latest websocket tick if we have the token
    try:
        mapping = resolve_tokens_by_symbols(instruments, [symbol], exchange=exchange)
        tok = mapping.get(symbol)
        if tok and tok in latest_ticks:
            t = latest_ticks.get(tok) or {}
            price_tick = float(t.get("last_price") or t.get("last_traded_price") or t.get("ltp") or 0)
            if price_tick > 0:
                return price_tick
    except Exception:
        pass
    
    # 1b) Fallback to broker LTP API for consistent pricing (equity/options)
    try:
        # For options, try NFO exchange first
        if exchange == "NSE" and ("CE" in symbol or "PE" in symbol):
            # Try NFO exchange for options
            try:
                q = broker.kite.ltp(f"NFO:{symbol}")
                key = f"NFO:{symbol}"
                if q and key in q:
                    last = float(q[key].get("last_price") or q[key].get("last_traded_price") or 0)
                    if last > 0:
                        return last
            except Exception:
                pass
        
        # Try the original exchange
        q = broker.kite.ltp(f"{exchange}:{symbol}")
        key = f"{exchange}:{symbol}"
        if q and key in q:
            last = float(q[key].get("last_price") or q[key].get("last_traded_price") or 0)
            if last > 0:
                return last
    except Exception:
        pass
    
    # 2) Demo mode - return mock prices
    if cfg.zerodha_api_key == "demo_key":
        demo_prices = {
            "RELIANCE": 1375.0,
            "TCS": 3046.8,
            "INFY": 1445.5,
            "HDFCBANK": 1600.0,
            "ICICIBANK": 900.0,
            # Options demo prices
            "NIFTY2590924550CE": 294.15,
            "NIFTY2590924600CE": 250.0,
            "NIFTY2590924650CE": 200.0,
            "NIFTY2590924700CE": 150.0,
            "NIFTY2590924550PE": 50.0,
            "NIFTY2590924600PE": 100.0,
            "NIFTY2590924650PE": 150.0,
            "NIFTY2590924700PE": 200.0,
            "BANKNIFTY25909245000CE": 500.0,
            "BANKNIFTY25909245100CE": 400.0,
            "BANKNIFTY25909245200CE": 300.0,
            "SENSEX25909270000CE": 800.0,
            "SENSEX25909271000CE": 700.0,
            "SENSEX25909272000CE": 600.0,
            "KOTAKBANK": 1750.0,
            "HINDUNILVR": 2450.0,
            "ITC": 450.0,
            "BHARTIARTL": 1200.0,
            "SBIN": 650.0,
            "LT": 3200.0,
            "ASIANPAINT": 2800.0,
            "MARUTI": 8500.0,
            "AXISBANK": 1100.0,
            "NESTLEIND": 18000.0,
            "ULTRACEMCO": 8500.0,
            "SUNPHARMA": 1200.0,
            "TITAN": 3200.0,
            "POWERGRID": 250.0,
            "NTPC": 180.0,
            "NIFTY 50": 20000.0,
            "NIFTY BANK": 45000.0,
            "SENSEX": 75000.0,
        }
        return demo_prices.get(symbol, 100.0)
    
    # 3) Fallback to broker LTP API
    try:
        data = broker.get_ltp({f"{exchange}:{symbol}": symbol})
        rec = data.get(f"{exchange}:{symbol}") or {}
        price_api = float(rec.get("last_price") or rec.get("last_traded_price") or rec.get("ltp") or 0)
        if price_api > 0:
            return price_api
    except Exception:
        pass
    # 3) Ultimate fallback: compute mid from best bid/ask if present in quote
    try:
        q = broker.kite.quote([f"{exchange}:{symbol}"]) or {}
        rec = q.get(f"{exchange}:{symbol}") or {}
        bid = 0.0
        ask = 0.0
        try:
            bids = rec.get("depth", {}).get("buy", [])
            asks = rec.get("depth", {}).get("sell", [])
            if bids:
                bid = float((bids[0] or {}).get("price") or 0)
            if asks:
                ask = float((asks[0] or {}).get("price") or 0)
        except Exception:
            pass
        mid = 0.0
        if bid > 0 and ask > 0:
            mid = (bid + ask) / 2.0
        elif bid > 0:
            mid = bid
        elif ask > 0:
            mid = ask
        if mid > 0:
            return mid
    except Exception:
        pass
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
        # update trailing stop anchors
        k = f"{exchange}:{symbol}"
        if side == "BUY":
            # Initialize trailing with entry
            st = trailing_state.setdefault(k, {"max": float(price), "min": float(price)})
            st["max"] = max(st["max"], float(price))
        else:
            st = trailing_state.setdefault(k, {"max": float(price), "min": float(price)})
            st["min"] = min(st["min"], float(price))
    except Exception:
        logger.exception("paper cash adjust failed")


def _get_holdings() -> Dict[str, dict]:
    # Build simple holdings from order_log (BUY positive, SELL negative)
    holdings: Dict[str, dict] = {}
    for o in order_log:
        qty = o["quantity"] if o["side"] == "BUY" else -o["quantity"]
        s = holdings.setdefault(o["symbol"], {"quantity": 0, "avg_price": 0.0, "exchange": o.get("exchange", strategy_exchange)})
        s["exchange"] = o.get("exchange", s.get("exchange", strategy_exchange))
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
    # choose exchange from holding if known
    exch = strategy_exchange
    try:
        h = _get_holdings().get(symbol)
        if h and h.get("exchange"):
            exch = str(h.get("exchange"))
    except Exception:
        pass
    if cfg.dry_run:
        _record_order(symbol, exch, side, quantity, _get_ltp_for_symbol(exch, symbol), True, source=f"auto-{reason}")
        logger.info("[AUTO-%s][DRY] Square-off %s qty=%s", reason, symbol, quantity)
        return
    txn_type = broker.kite.TRANSACTION_TYPE_SELL
    try:
        broker.place_market_order(tradingsymbol=symbol, exchange=exch, quantity=quantity, transaction_type=txn_type)
        _record_order(symbol, exch, side, quantity, _get_ltp_for_symbol(exch, symbol), False, source=f"auto-{reason}")
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
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    # Resolve symbols and subscribe
    syms = req.symbols or []
    if not syms:
        syms = ai_default_symbols
    mapping = resolve_tokens_by_symbols(instruments, syms, exchange=req.exchange)
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": syms}
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
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    syms = req.symbols or []
    if not syms:
        syms = ai_default_symbols
    mapping = resolve_tokens_by_symbols(instruments, syms, exchange=req.exchange)
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": syms}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ensure_ticker(mode_full=False)
    ticker.subscribe(mapping.values())
    strategy = EmaCrossoverStrategy(symbols=list(mapping.keys()), short_window=req.short, long_window=req.long)
    strategy_active = True
    strategy_live = bool(req.live)
    strategy_exchange = req.exchange
    return {"status": "started", "type": "ema", "symbols": list(mapping.keys()), "live": strategy_live}


class RsiStartRequest(BaseModel):
    symbols: List[str]
    exchange: str = "NSE"
    period: int = 14
    oversold: float = 30.0
    overbought: float = 70.0
    live: bool = False


@app.post("/strategy/rsi/start")
def strategy_rsi_start(req: RsiStartRequest):
    global strategy, strategy_active, strategy_live, strategy_exchange, symbol_to_token, token_to_symbol
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    syms = req.symbols or []
    if not syms:
        syms = ai_default_symbols
    mapping = resolve_tokens_by_symbols(instruments, syms, exchange=req.exchange)
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": syms}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ensure_ticker(mode_full=False)
    ticker.subscribe(mapping.values())
    strategy = RsiStrategy(symbols=list(mapping.keys()), period=req.period, 
                          oversold=req.oversold, overbought=req.overbought)
    strategy_active = True
    strategy_live = bool(req.live)
    strategy_exchange = req.exchange
    return {"status": "started", "type": "rsi", "symbols": list(mapping.keys()), "live": strategy_live}


class BollingerStartRequest(BaseModel):
    symbols: List[str]
    exchange: str = "NSE"
    period: int = 20
    std_dev: float = 2.0
    live: bool = False


@app.post("/strategy/bollinger/start")
def strategy_bollinger_start(req: BollingerStartRequest):
    global strategy, strategy_active, strategy_live, strategy_exchange, symbol_to_token, token_to_symbol
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    syms = req.symbols or []
    if not syms:
        syms = ai_default_symbols
    mapping = resolve_tokens_by_symbols(instruments, syms, exchange=req.exchange)
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": syms}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ensure_ticker(mode_full=False)
    ticker.subscribe(mapping.values())
    strategy = BollingerBandsStrategy(symbols=list(mapping.keys()), period=req.period, 
                                     std_dev=req.std_dev)
    strategy_active = True
    strategy_live = bool(req.live)
    strategy_exchange = req.exchange
    return {"status": "started", "type": "bollinger", "symbols": list(mapping.keys()), "live": strategy_live}


class MacdStartRequest(BaseModel):
    symbols: List[str]
    exchange: str = "NSE"
    fast_period: int = 12
    slow_period: int = 26
    signal_period: int = 9
    live: bool = False


@app.post("/strategy/macd/start")
def strategy_macd_start(req: MacdStartRequest):
    global strategy, strategy_active, strategy_live, strategy_exchange, symbol_to_token, token_to_symbol
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    syms = req.symbols or []
    if not syms:
        syms = ai_default_symbols
    mapping = resolve_tokens_by_symbols(instruments, syms, exchange=req.exchange)
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": syms}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ensure_ticker(mode_full=False)
    ticker.subscribe(mapping.values())
    strategy = MacdStrategy(symbols=list(mapping.keys()), fast_period=req.fast_period,
                           slow_period=req.slow_period, signal_period=req.signal_period)
    strategy_active = True
    strategy_live = bool(req.live)
    strategy_exchange = req.exchange
    return {"status": "started", "type": "macd", "symbols": list(mapping.keys()), "live": strategy_live}


class SupportResistanceStartRequest(BaseModel):
    symbols: List[str]
    exchange: str = "NSE"
    lookback_period: int = 50
    breakout_threshold: float = 0.01
    live: bool = False


@app.post("/strategy/support_resistance/start")
def strategy_support_resistance_start(req: SupportResistanceStartRequest):
    global strategy, strategy_active, strategy_live, strategy_exchange, symbol_to_token, token_to_symbol
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    syms = req.symbols or []
    if not syms:
        syms = ai_default_symbols
    mapping = resolve_tokens_by_symbols(instruments, syms, exchange=req.exchange)
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": syms}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ensure_ticker(mode_full=False)
    ticker.subscribe(mapping.values())
    strategy = SupportResistanceStrategy(symbols=list(mapping.keys()), 
                                        lookback_period=req.lookback_period,
                                        breakout_threshold=req.breakout_threshold)
    strategy_active = True
    strategy_live = bool(req.live)
    strategy_exchange = req.exchange
    return {"status": "started", "type": "support_resistance", "symbols": list(mapping.keys()), "live": strategy_live}


class OptionsStraddleStartRequest(BaseModel):
    symbols: List[str]
    underlying: str = "NIFTY"
    expiry: str = "next"
    quantity: int = 1
    volatility_threshold: float = 0.02
    live: bool = False


@app.post("/strategy/options_straddle/start")
def strategy_options_straddle_start(req: OptionsStraddleStartRequest):
    global strategy, strategy_active, strategy_live, strategy_exchange, symbol_to_token, token_to_symbol
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    syms = req.symbols or []
    if not syms:
        syms = [req.underlying]  # Use underlying as default symbol
    mapping = resolve_tokens_by_symbols(instruments, syms, exchange="NSE")
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": syms}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ensure_ticker(mode_full=False)
    ticker.subscribe(mapping.values())
    strategy = OptionsStraddleStrategy(symbols=list(mapping.keys()), 
                                      underlying=req.underlying,
                                      expiry=req.expiry,
                                      quantity=req.quantity,
                                      volatility_threshold=req.volatility_threshold)
    strategy_active = True
    strategy_live = bool(req.live)
    strategy_exchange = "NFO"  # Options are traded on NFO
    return {"status": "started", "type": "options_straddle", "symbols": list(mapping.keys()), "live": strategy_live}


class OptionsStrangleStartRequest(BaseModel):
    symbols: List[str]
    underlying: str = "NIFTY"
    expiry: str = "next"
    quantity: int = 1
    volatility_threshold: float = 0.02
    otm_offset: int = 2
    live: bool = False


@app.post("/strategy/options_strangle/start")
def strategy_options_strangle_start(req: OptionsStrangleStartRequest):
    global strategy, strategy_active, strategy_live, strategy_exchange, symbol_to_token, token_to_symbol
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    syms = req.symbols or []
    if not syms:
        syms = [req.underlying]  # Use underlying as default symbol
    mapping = resolve_tokens_by_symbols(instruments, syms, exchange="NSE")
    if not mapping:
        return {"error": "SYMBOLS_NOT_FOUND", "symbols": syms}
    symbol_to_token.update(mapping)
    token_to_symbol.update({v: k for k, v in mapping.items()})
    ensure_ticker(mode_full=False)
    ticker.subscribe(mapping.values())
    strategy = OptionsStrangleStrategy(symbols=list(mapping.keys()), 
                                      underlying=req.underlying,
                                      expiry=req.expiry,
                                      quantity=req.quantity,
                                      volatility_threshold=req.volatility_threshold,
                                      otm_offset=req.otm_offset)
    strategy_active = True
    strategy_live = bool(req.live)
    strategy_exchange = "NFO"  # Options are traded on NFO
    return {"status": "started", "type": "options_strangle", "symbols": list(mapping.keys()), "live": strategy_live}


@app.get("/orders")
def orders():
    return order_log[-200:]


@app.get("/pnl")
def pnl():
    # Calculate realized and unrealized PnL
    realized = 0.0
    unrealized = 0.0
    
    # Separate paper and live trades for better tracking
    paper_realized = 0.0
    paper_unrealized = 0.0
    live_realized = 0.0
    live_unrealized = 0.0
    
    # Process orders by symbol
    symbol_orders = {}
    for o in order_log:
        symbol = o["symbol"]
        if symbol not in symbol_orders:
            symbol_orders[symbol] = []
        symbol_orders[symbol].append(o)
    
    # Calculate PnL for each symbol
    for symbol, orders in symbol_orders.items():
        # Sort orders by timestamp
        orders.sort(key=lambda x: x["ts"])
        
        # Separate buy and sell orders
        buy_orders = [o for o in orders if o["side"] == "BUY"]
        sell_orders = [o for o in orders if o["side"] == "SELL"]
        
        # Calculate realized PnL using FIFO
        remaining_buys = buy_orders.copy()
        
        for sell_order in sell_orders:
            sell_qty = sell_order["quantity"]
            sell_price = sell_order["price"]
            is_paper = sell_order.get("dry_run", True)
            
            while sell_qty > 0 and remaining_buys:
                buy_order = remaining_buys[0]
                buy_qty = buy_order["quantity"]
                buy_price = buy_order["price"]
                
                # Take the minimum of sell quantity and remaining buy quantity
                trade_qty = min(sell_qty, buy_qty)
                
                # Calculate profit/loss for this trade
                trade_pnl = (sell_price - buy_price) * trade_qty
                
                if is_paper:
                    paper_realized += trade_pnl
                else:
                    live_realized += trade_pnl
                
                realized += trade_pnl
                
                # Update quantities
                sell_qty -= trade_qty
                buy_order["quantity"] -= trade_qty
                
                # Remove buy order if fully consumed
                if buy_order["quantity"] <= 0:
                    remaining_buys.pop(0)
        
        # Calculate unrealized PnL for remaining positions
        for buy_order in remaining_buys:
            if buy_order["quantity"] > 0:
                try:
                    # Get current LTP
                    exchange = buy_order.get("exchange", strategy_exchange)
                    ltp = _get_ltp_for_symbol(exchange, symbol)
                    
                    if ltp > 0:
                        unrealized_pnl = (ltp - buy_order["price"]) * buy_order["quantity"]
                        is_paper = buy_order.get("dry_run", True)
                        
                        if is_paper:
                            paper_unrealized += unrealized_pnl
                        else:
                            live_unrealized += unrealized_pnl
                        
                        unrealized += unrealized_pnl
                except Exception:
                    # If we can't get LTP, skip this position
                    continue
    
    return {
        "realized": round(realized, 2),
        "unrealized": round(unrealized, 2),
        "total": round(realized + unrealized, 2),
        "paper": {
            "realized": round(paper_realized, 2),
            "unrealized": round(paper_unrealized, 2),
            "total": round(paper_realized + paper_unrealized, 2)
        },
        "live": {
            "realized": round(live_realized, 2),
            "unrealized": round(live_unrealized, 2),
            "total": round(live_realized + live_unrealized, 2)
        }
    }


@app.get("/reports/strategy")
def report_strategy():
    # Aggregate orders by source (strategy) and side pairs
    stats: Dict[str, Dict[str, float]] = {}
    for o in order_log:
        src = str(o.get("source", "unknown"))
        s = stats.setdefault(src, {"trades": 0, "buy": 0.0, "sell": 0.0, "profit": 0.0})
        s["trades"] += 1
        amt = float(o.get("price", 0.0)) * int(o.get("quantity", 0))
        if o.get("side") == "BUY":
            s["buy"] += amt
        else:
            s["sell"] += amt
    for k, v in stats.items():
        v["profit"] = round(v["sell"] - v["buy"], 2)
    return stats


class RiskConfig(BaseModel):
    sl_pct: float = 0.02
    tp_pct: float = 0.0
    auto_close: bool = False
    trailing_stop_pct: float = 0.0


class TrailingOverrideBody(BaseModel):
    symbol: str
    exchange: str = "NSE"
    pct: float


@app.get("/risk")
def get_risk():
    return {"sl_pct": risk_sl_pct, "tp_pct": risk_tp_pct, "auto_close": risk_auto_close, "trailing_stop_pct": trailing_stop_pct}


@app.post("/risk")
def set_risk(cfg_req: RiskConfig):
    global risk_sl_pct, risk_tp_pct, risk_auto_close
    risk_sl_pct = float(cfg_req.sl_pct)
    risk_tp_pct = float(cfg_req.tp_pct)
    risk_auto_close = bool(cfg_req.auto_close)
    global trailing_stop_pct
    trailing_stop_pct = float(cfg_req.trailing_stop_pct)
    logger.info("Risk updated sl=%.4f tp=%.4f auto=%s", risk_sl_pct, risk_tp_pct, risk_auto_close)
    return get_risk()


@app.post("/risk/trailing/override")
def set_trailing_override(body: TrailingOverrideBody):
    k = f"{body.exchange.upper()}:{body.symbol.upper()}"
    if body.pct <= 0:
        trailing_overrides_pct.pop(k, None)
    else:
        trailing_overrides_pct[k] = float(body.pct)
    return {"overrides": trailing_overrides_pct}


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
                    # Fallback to AI defaults if no symbols configured
                    if not sym:
                        sym = ai_default_symbols
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
        exch = str(h.get("exchange", strategy_exchange))
        ltp = _get_ltp_for_symbol(exch, sym)
        pnl_u = (ltp - avg) * qty
        out.append({"symbol": sym, "exchange": exch, "quantity": qty, "avg_price": round(avg, 2), "ltp": round(ltp, 2), "unrealized": round(pnl_u, 2)})
    # include paper account summary row (as meta)
    paper = _paper_equity_and_unrealized()
    meta = {"paper_cash": round(float(paper_account.get("cash", 0.0)), 2), "paper_equity": paper.get("equity", 0.0), "paper_unrealized": paper.get("unrealized", 0.0)}
    return {"positions": out, "paper": meta}


@app.post("/squareoff")
def squareoff(body: SquareOffBody):
    holds = _get_holdings()
    sym = str(body.symbol).upper()
    h = holds.get(sym)
    if not h or int(h.get("quantity", 0)) <= 0:
        return {"status": "no_position"}
    qty = int(body.quantity) if body.quantity is not None else int(h.get("quantity", 0))
    qty = max(0, min(qty, int(h.get("quantity", 0))))
    if qty <= 0:
        return {"status": "noop"}
    _square_off(sym, qty, reason="MANUAL")
    return {"status": "ok", "symbol": sym, "quantity": qty}


@app.post("/squareoff/all")
def squareoff_all():
    holds = _get_holdings()
    done = []
    for sym, h in holds.items():
        qty = int(h.get("quantity", 0))
        if qty > 0:
            _square_off(sym, qty, reason="ALL")
            done.append({"symbol": sym, "quantity": qty})
    return {"count": len(done), "closed": done}


_expiries_cache: Dict[str, dict] = {}


@app.get("/options/expiries")
def options_expiries(underlying: str):
    try:
        global instruments
        u = (underlying or "").upper()
        name_alias = {"SENSEX": "SENSEX", "BSESENSEX": "SENSEX", "NIFTY": "NIFTY", "BANKNIFTY": "NIFTY BANK", "FINNIFTY": "FINNIFTY"}
        u_name = name_alias.get(u, u)
        now_ms = int(time.time() * 1000)
        cached = _expiries_cache.get(u)
        if cached and now_ms - int(cached.get("ts", 0)) < 60 * 60 * 1000:
            return cached.get("data", [])
        exps = sorted({i.expiry for i in instruments if i.exchange in {"NFO", "BFO"} and (i.name or "").upper() == u_name and i.instrument_type in {"CE", "PE"} and i.expiry})
        # If empty, try refreshing instruments from broker
        if not exps and cfg.zerodha_api_key != "demo_key":
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
        # Map index names that differ in instruments 'name'
        name_alias = {"SENSEX": "SENSEX", "NIFTY": "NIFTY", "BANKNIFTY": "NIFTY BANK", "FINNIFTY": "FINNIFTY", "BSESENSEX": "SENSEX"}
        u_name = name_alias.get(u, u)
        exp_param = (expiry or "").strip()
        items_all = [i for i in instruments if i.exchange in {"NFO", "BFO"} and (i.name or "").upper() == u_name and i.instrument_type in {"CE", "PE"}]
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
        if not items and cfg.zerodha_api_key != "demo_key":
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
                    items_all = [i for i in instruments if i.exchange in {"NFO", "BFO"} and (i.name or "").upper() == u_name and i.instrument_type in {"CE", "PE"}]
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


@app.get("/market/status")
def market_status():
    """Get market status and trading hours"""
    try:
        from datetime import datetime
        import pytz
        
        ist = pytz.timezone('Asia/Kolkata')
        now = datetime.now(ist)
        current_time = now.strftime("%H:%M")
        current_date = now.strftime("%Y-%m-%d")
        
        # Check if market is open
        equity_open = _is_market_open("equity")
        options_open = _is_market_open("options")
        
        return {
            "current_time_ist": current_time,
            "current_date": current_date,
            "equity_market_open": equity_open,
            "options_market_open": options_open,
            "trading_hours": {
                "equity": TRADING_HOURS["equity"],
                "options": TRADING_HOURS["options"],
                "futures": TRADING_HOURS["futures"]
            },
            "next_trading_day": "Monday" if now.weekday() >= 5 else "Today"
        }
    except Exception as e:
        return {"error": str(e)}

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


# Removed duplicate AI start endpoint - using the comprehensive one below


class OptionsAtmTradeBody(BaseModel):
    underlying: str
    expiry: str = "next"  # YYYY-MM-DD or "next"
    side: str  # BUY or SELL
    quantity: int = 1
    offset: int = 0  # 0=ATM; >0 farther OTM
    count: int = 50


@app.post("/options/atm_trade")
def options_atm_trade(body: OptionsAtmTradeBody):
    """Place ATM straddle/strangle orders for options. If dry_run=True, records paper orders only."""
    try:
        chain = options_chain(body.underlying, body.expiry, count=max(20, body.count), around=None)
        strikes = chain.get("strikes", [])
        ce = chain.get("ce", [])
        pe = chain.get("pe", [])
        if not strikes or not ce or not pe:
            return {"error": "No chain data"}
        # Choose median strike as ATM approximation
        mid = strikes[len(strikes)//2]
        # Find closest CE/PE by strike
        ce_sorted = sorted(ce, key=lambda x: abs(float(x.get("strike", 0)) - mid))
        pe_sorted = sorted(pe, key=lambda x: abs(float(x.get("strike", 0)) - mid))
        ce_idx = min(len(ce_sorted)-1, max(0, body.offset))
        pe_idx = min(len(pe_sorted)-1, max(0, body.offset))
        ce_pick = ce_sorted[ce_idx]
        pe_pick = pe_sorted[pe_idx]
        side = body.side.upper()
        placed = []
        for sym in [ce_pick.get("tradingsymbol"), pe_pick.get("tradingsymbol")]:
            if not sym:
                continue
            if cfg.dry_run:
                price = _get_ltp_for_symbol("NFO", sym)
                _record_order(sym, "NFO", side, int(body.quantity), price, True, source="atm")
                placed.append({"symbol": sym, "price": price, "dry_run": True})
            else:
                txn = broker.kite.TRANSACTION_TYPE_BUY if side == "BUY" else broker.kite.TRANSACTION_TYPE_SELL
                try:
                    broker.place_market_order(tradingsymbol=sym, exchange="NFO", quantity=int(body.quantity), transaction_type=txn)
                    price = _get_ltp_for_symbol("NFO", sym)
                    _record_order(sym, "NFO", side, int(body.quantity), price, False, source="atm")
                    placed.append({"symbol": sym, "price": price, "dry_run": False})
                except Exception as e:
                    logger.exception("atm order failed for %s", sym)
        return {"placed": placed, "ce": ce_pick, "pe": pe_pick}
    except Exception as e:
        logger.exception("options_atm_trade error")
        return {"error": str(e)}


@app.get("/broker/orders")
def broker_orders():
    try:
        data = broker.kite.orders()
        return data or []
    except Exception as e:
        logger.exception("broker orders failed")
        return {"error": str(e)}


# AI Trading Endpoints
class AIStartRequest(BaseModel):
    live: bool = False
    capital: float = 100000
    max_strategies: int = 3


@app.post("/ai/start")
def ai_start_trading(req: AIStartRequest, background_tasks: BackgroundTasks):
    """Start AI-powered trading"""
    global ai_active, ai_engine, ai_trade_capital
    
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    
    if ai_active:
        return {"error": "AI_TRADING_ALREADY_ACTIVE"}
    
    try:
        ai_trade_capital = req.capital
        ai_active = True
        
        # Enable automatic risk management with trailing stops
        global risk_auto_close, trailing_stop_pct, trailing_stop_points
        risk_auto_close = True
        trailing_stop_pct = 0.02  # 2% trailing stop
        trailing_stop_points = 10  # 10 points trailing stop
        
        logger.info("AI Trading started with capital: ₹%d, risk: %.2f%%, trailing stops enabled", 
                    req.capital, req.risk_pct * 100)
        
        # Resolve and subscribe to default AI symbols so the AI gets live ticks
        try:
            syms = ai_default_symbols or [
                "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
                "KOTAKBANK", "HINDUNILVR", "ITC", "BHARTIARTL", "SBIN"
            ]
            mapping = resolve_tokens_by_symbols(instruments, syms, exchange="NSE")
            if mapping:
                symbol_to_token.update(mapping)
                token_to_symbol.update({v: k for k, v in mapping.items()})
                ensure_ticker(mode_full=False)
                if ticker:
                    try:
                        ticker.subscribe(list(mapping.values()))
                    except Exception:
                        logger.exception("Ticker subscribe failed for AI symbols")
            else:
                logger.warning("AI start: no tokens resolved for symbols %s", syms)
        except Exception:
            logger.exception("AI start: symbol resolution failed")

        # Initialize AI engine
        ai_engine = AITradingEngine(
            broker_client=broker,
            instruments=instruments,
            symbol_to_token=symbol_to_token,
            token_to_symbol=token_to_symbol,
            order_log=order_log  # Pass reference to global order log
        )
        
        # Start AI trading in background using FastAPI background tasks
        def run_ai_trading():
            import asyncio
            try:
                # Create a new event loop for this thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(ai_engine.start_ai_trading(live_mode=req.live))
            except Exception as e:
                logger.exception("Error in AI trading background task: %s", e)
                global ai_active
                ai_active = False
            finally:
                loop.close()
        
        background_tasks.add_task(run_ai_trading)
        
        logger.info("AI Trading started with capital: %s, live: %s", req.capital, req.live)
        return {"status": "started", "capital": req.capital, "live": req.live}
        
    except Exception as e:
        logger.exception("Failed to start AI trading: %s", e)
        ai_active = False
        return {"error": str(e)}


@app.post("/ai/stop")
def ai_stop_trading():
    """Stop AI-powered trading"""
    global ai_active, ai_engine
    
    try:
        if ai_engine:
            ai_engine.stop_ai_trading()
            ai_engine = None
        
        ai_active = False
        logger.info("AI Trading stopped")
        return {"status": "stopped"}
        
    except Exception as e:
        logger.exception("Failed to stop AI trading: %s", e)
        return {"error": str(e)}


@app.get("/ai/status")
def ai_status():
    """Get AI trading status"""
    try:
        # Always return a complete status object
        status_data = {
            "active": ai_active,
            "capital": ai_trade_capital,
            "risk_pct": ai_risk_pct,
            "symbols": ai_default_symbols,
            "options_underlyings": ai_options_underlyings,
            "options_qty": ai_options_qty,
            "active_strategies": [],
            "total_trades": 0,
            "successful_trades": 0,
            "total_profit": 0,
            "success_rate": 0,
            "available_capital": ai_trade_capital,
            "last_analysis": None,
            "strategy_performance": {}
        }
        
        # If AI engine is active, get additional status from it
        if ai_active and ai_engine:
            try:
                engine_status = ai_engine.get_ai_status()
                status_data.update(engine_status)
            except Exception as e:
                logger.warning("Failed to get engine status: %s", e)
        
        logger.info("AI status requested. Returning: active=%s, capital=%s", ai_active, ai_trade_capital)
        return status_data
        
    except Exception as e:
        logger.exception("Failed to get AI status: %s", e)
        return {"error": str(e)}


@app.get("/ai/analyze")
def ai_analyze_market():
    """Get AI market analysis and strategy recommendations"""
    # Check authentication or demo mode
    auth_ok, user_id = _check_auth_or_demo()
    if not auth_ok:
        return {"error": "NOT_AUTHENTICATED"}
    
    try:
        # Simulate market data (in real implementation, get from market feed)
        price_data = {}
        volume_data = {}
        
        # Get sample data for analysis
        sample_symbols = ai_default_symbols[:10] if ai_default_symbols else ["RELIANCE", "TCS", "INFY"]
        
        for symbol in sample_symbols:
            try:
                # Get current price
                ltp = _get_ltp_for_symbol("NSE", symbol)
                if ltp > 0:
                    # Simulate price history
                    price_data[symbol] = [ltp * (1 + (i - 25) * 0.001) for i in range(50)]
                    volume_data[symbol] = [1000000 + i * 1000 for i in range(50)]
            except Exception:
                continue
        
        # Analyze market
        market_condition = ai_analyzer.analyze_market_condition(price_data, volume_data)
        
        # Get recommendations
        recommendations = ai_analyzer.recommend_strategy(market_condition, ai_trade_capital)
        
        return {
            "market_condition": {
                "trend": market_condition.trend,
                "volatility": market_condition.volatility,
                "volume": market_condition.volume,
                "momentum": market_condition.momentum,
                "rsi_level": market_condition.rsi_level,
                "support_resistance": market_condition.support_resistance
            },
            "recommendations": [
                {
                    "strategy": rec.strategy_name,
                    "confidence": round(rec.confidence, 3),
                    "expected_profit": round(rec.expected_profit, 2),
                    "risk_level": rec.risk_level,
                    "symbols": rec.symbols[:5],  # Limit to top 5 symbols
                    "parameters": rec.parameters
                }
                for rec in recommendations
            ],
            "analysis_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.exception("Failed to analyze market: %s", e)
        return {"error": str(e)}


@app.get("/ai/symbols")
def ai_get_symbols():
    """Get AI trading universe"""
    return {
        "equity_universe": ai_analyzer.equity_universe,
        "options_universe": ai_analyzer.options_universe,
        "futures_universe": ai_analyzer.futures_universe,
        "total_equity_symbols": len(ai_analyzer.equity_universe),
        "total_options_symbols": len(ai_analyzer.options_universe),
        "total_futures_symbols": len(ai_analyzer.futures_universe)
    }


