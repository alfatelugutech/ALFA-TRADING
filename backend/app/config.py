from dataclasses import dataclass
from typing import Optional
import os
from dotenv import load_dotenv


@dataclass
class Config:
    zerodha_api_key: str
    zerodha_api_secret: str
    zerodha_user_id: str
    zerodha_totp_secret: Optional[str]
    access_token: Optional[str]
    instruments_csv_path: str
    log_level: str
    dry_run: bool
    env: str


_cached_config: Optional[Config] = None


def get_config() -> Config:
    global _cached_config
    if _cached_config is not None:
        return _cached_config

    # Load environment variables from .env if present
    load_dotenv(override=False)

    zerodha_api_key = os.getenv("ZERODHA_API_KEY", "").strip()
    zerodha_api_secret = os.getenv("ZERODHA_API_SECRET", "").strip()
    zerodha_user_id = os.getenv("ZERODHA_USER_ID", "").strip()
    zerodha_totp_secret = os.getenv("ZERODHA_TOTP_SECRET")
    access_token = os.getenv("ACCESS_TOKEN")
    instruments_csv_path = os.getenv("INSTRUMENTS_CSV_PATH", "data/instruments.csv").strip()
    log_level = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    dry_run = os.getenv("DRY_RUN", "true").lower() in {"1", "true", "yes", "y"}
    env = os.getenv("ENV", "dev").strip()

    if not zerodha_api_key or not zerodha_api_secret or not zerodha_user_id:
        raise RuntimeError(
            "ZERODHA_API_KEY, ZERODHA_API_SECRET, and ZERODHA_USER_ID must be set in .env"
        )

    _cached_config = Config(
        zerodha_api_key=zerodha_api_key,
        zerodha_api_secret=zerodha_api_secret,
        zerodha_user_id=zerodha_user_id,
        zerodha_totp_secret=zerodha_totp_secret,
        access_token=access_token,
        instruments_csv_path=instruments_csv_path,
        log_level=log_level,
        dry_run=dry_run,
        env=env,
    )
    return _cached_config

