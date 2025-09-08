from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
import time
from typing import Dict, List

from app.config import get_config
from app.logging_setup import setup_logging
from app.broker.zerodha_client import ZerodhaClient
from app.market.ticker import MarketTicker
from app.utils.symbols import load_instruments, resolve_tokens_by_symbols
from app.strategies.sma_crossover import SmaCrossoverStrategy


logger = logging.getLogger(__name__)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Zerodha Auto Trader")
    p.add_argument("--symbols", nargs="+", required=True, help="Symbols e.g. TCS INFY RELIANCE")
    p.add_argument("--exchange", default="NSE", help="Exchange e.g. NSE NFO BSE")
    p.add_argument("--short", type=int, default=20, help="Short SMA window")
    p.add_argument("--long", type=int, default=50, help="Long SMA window")
    p.add_argument("--full", action="store_true", help="Use full tick data")
    p.add_argument("--ltp", action="store_true", help="Use LTP mode (default)")
    p.add_argument("--live", action="store_true", help="Place live orders (disable dry-run)")
    return p


def main() -> int:
    cfg = get_config()
    setup_logging(cfg.log_level)

    args = build_arg_parser().parse_args()
    if args.live:
        cfg.dry_run = False

    if not cfg.access_token:
        logger.error("ACCESS_TOKEN missing. Run scripts/get_access_token.py first.")
        return 1

    instruments = load_instruments(cfg.instruments_csv_path)
    symbol_to_token = resolve_tokens_by_symbols(instruments, args.symbols, exchange=args.exchange)
    if not symbol_to_token:
        logger.error("No tokens resolved for symbols: %s", args.symbols)
        return 2

    token_to_symbol = {v: k for k, v in symbol_to_token.items()}

    broker = ZerodhaClient(
        api_key=cfg.zerodha_api_key, api_secret=cfg.zerodha_api_secret, access_token=cfg.access_token
    )

    strategy = SmaCrossoverStrategy(symbols=list(symbol_to_token.keys()), short_window=args.short, long_window=args.long)

    shutdown = threading.Event()

    def on_tick(ticks: List[dict]) -> None:
        for t in ticks:
            tok = t.get("instrument_token")
            if tok in token_to_symbol:
                t["_symbol"] = token_to_symbol[tok]
        signals = strategy.on_ticks(ticks)
        for sig in signals:
            side = sig.side
            if cfg.dry_run:
                logger.info("[DRY] %s %s qty=%s", side, sig.symbol, sig.quantity)
                continue
            try:
                txn_type = broker.kite.TRANSACTION_TYPE_BUY if side == "BUY" else broker.kite.TRANSACTION_TYPE_SELL
                broker.place_market_order(
                    tradingsymbol=sig.symbol,
                    exchange=args.exchange,
                    quantity=sig.quantity,
                    transaction_type=txn_type,
                )
            except Exception:
                logger.exception("Order placement failed for %s", sig.symbol)

    def on_connect():
        logger.info("Ticker connected")

    def on_close():
        logger.info("Ticker closed")
        shutdown.set()

    ticker = MarketTicker(
        api_key=cfg.zerodha_api_key,
        access_token=cfg.access_token,
        on_tick=on_tick,
        on_connect=on_connect,
        on_close=on_close,
        mode_full=bool(args.full and not args.ltp),
    )

    tokens = list(symbol_to_token.values())
    ticker.start(tokens)

    def handle_sigint(signum, frame):
        logger.info("Signal received. Shutting down...")
        shutdown.set()

    signal.signal(signal.SIGINT, handle_sigint)
    signal.signal(signal.SIGTERM, handle_sigint)

    while not shutdown.is_set():
        time.sleep(1.0)
    ticker.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())



