from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from kiteconnect import KiteConnect


logger = logging.getLogger(__name__)


class ZerodhaClient:
    def __init__(
        self,
        api_key: str,
        api_secret: str,
        access_token: Optional[str] = None,
    ) -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self._kite = KiteConnect(api_key=api_key)
        if access_token:
            self._kite.set_access_token(access_token)

    @property
    def kite(self) -> KiteConnect:
        return self._kite

    # Authentication helpers
    def generate_session(self, request_token: str) -> Dict[str, Any]:
        session = self._kite.generate_session(request_token, api_secret=self.api_secret)
        self._kite.set_access_token(session["access_token"])
        return session

    # Orders
    def place_market_order(
        self,
        tradingsymbol: str,
        exchange: str,
        quantity: int,
        transaction_type: str,
        product: str = "MIS",
        variety: str = "regular",
    ) -> Dict[str, Any]:
        logger.info(
            "Placing market order: %s %s %s qty=%s", transaction_type, exchange, tradingsymbol, quantity
        )
        order_id = self._kite.place_order(
            variety=variety,
            exchange=exchange,
            tradingsymbol=tradingsymbol,
            transaction_type=transaction_type,
            quantity=quantity,
            order_type=self._kite.ORDER_TYPE_MARKET,
            product=product,
        )
        return {"order_id": order_id}

    def get_ltp(self, instruments: Dict[str, str]) -> Dict[str, Any]:
        try:
            return self._kite.ltp(instruments)
        except Exception:
            # fallback to quote if ltp missing for some derivatives
            try:
                keys = list(instruments.keys())
                data = self._kite.quote(keys)
                # normalize to ltp-like shape
                out: Dict[str, Any] = {}
                for k, v in (data or {}).items():
                    last = v.get("last_price") or v.get("last_traded_price") or 0
                    out[k] = {"last_price": last}
                return out
            except Exception:
                return {}

    def instruments(self, exchange: Optional[str] = None):
        return self._kite.instruments(exchange)


