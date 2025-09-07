from __future__ import annotations

import json
import logging
from typing import Callable, Dict, Iterable, List, Optional

from kiteconnect import KiteTicker


logger = logging.getLogger(__name__)


class MarketTicker:
    def __init__(
        self,
        api_key: str,
        access_token: str,
        on_tick: Callable[[List[dict]], None],
        on_connect: Optional[Callable[[], None]] = None,
        on_close: Optional[Callable[[], None]] = None,
        mode_full: bool = False,
    ) -> None:
        self.api_key = api_key
        self.access_token = access_token
        self.on_tick = on_tick
        self.on_connect = on_connect
        self.on_close = on_close
        self.mode_full = mode_full
        self._ticker: Optional[KiteTicker] = None
        self._subscribed: List[int] = []

    def start(self, tokens: Iterable[int]) -> None:
        ticker = KiteTicker(self.api_key, self.access_token)
        self._ticker = ticker

        def _on_ticks(ws, ticks):
            try:
                self.on_tick(ticks)
            except Exception:
                logger.exception("on_tick handler error")

        def _on_connect(ws, response):
            try:
                token_list = list(tokens)
                self._subscribed = token_list
                ws.subscribe(token_list)
                if self.mode_full:
                    ws.set_mode(ws.MODE_FULL, token_list)
                else:
                    ws.set_mode(ws.MODE_LTP, token_list)
                if self.on_connect:
                    self.on_connect()
            except Exception:
                logger.exception("on_connect handler error")

        def _on_close(ws, code, reason):
            logger.info("Ticker closed: %s %s", code, reason)
            try:
                if self.on_close:
                    self.on_close()
            except Exception:
                logger.exception("on_close handler error")

        ticker.on_ticks = _on_ticks
        ticker.on_connect = _on_connect
        ticker.on_close = _on_close

        logger.info("Starting ticker... tokens=%s mode=%s", len(list(tokens)), "FULL" if self.mode_full else "LTP")
        ticker.connect(threaded=True, disable_ssl_verification=False)

    def stop(self) -> None:
        if self._ticker:
            try:
                self._ticker.close()
            except Exception:
                logger.exception("Error closing ticker")

    def subscribe(self, tokens: Iterable[int]) -> None:
        if not self._ticker:
            raise RuntimeError("Ticker not started")
        token_list = list(tokens)
        if not token_list:
            return
        self._subscribed = list(set(self._subscribed + token_list))
        self._ticker.subscribe(token_list)
        if self.mode_full:
            self._ticker.set_mode(self._ticker.MODE_FULL, token_list)
        else:
            self._ticker.set_mode(self._ticker.MODE_LTP, token_list)

    def unsubscribe(self, tokens: Iterable[int]) -> None:
        if not self._ticker:
            raise RuntimeError("Ticker not started")
        token_list = list(tokens)
        if not token_list:
            return
        self._subscribed = [t for t in self._subscribed if t not in token_list]
        self._ticker.unsubscribe(token_list)


