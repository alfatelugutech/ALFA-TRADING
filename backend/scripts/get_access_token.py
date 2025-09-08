from __future__ import annotations

import os
import sys
import webbrowser
from pathlib import Path

from kiteconnect import KiteConnect
from dotenv import dotenv_values, set_key


def main() -> int:
    # Load .env
    env_path = Path(".env")
    if not env_path.exists():
        print(".env not found. Create it from backend/.env.example and fill credentials.")
        return 1

    env = dotenv_values(dotenv_path=str(env_path))
    api_key = env.get("ZERODHA_API_KEY", "").strip()
    api_secret = env.get("ZERODHA_API_SECRET", "").strip()
    if not api_key or not api_secret:
        print("ZERODHA_API_KEY and ZERODHA_API_SECRET are required in .env")
        return 1

    kite = KiteConnect(api_key=api_key)
    login_url = kite.login_url()
    print("Open this URL, login, and copy the request_token from the redirect:")
    print(login_url)
    try:
        webbrowser.open(login_url)
    except Exception:
        pass

    request_token = input("Paste request_token here: ").strip()
    if not request_token:
        print("request_token is required")
        return 1

    data = kite.generate_session(request_token, api_secret=api_secret)
    access_token = data["access_token"]
    # Store back into .env
    set_key(str(env_path), "ACCESS_TOKEN", access_token)
    print("ACCESS_TOKEN updated in .env")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())



