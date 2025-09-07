from __future__ import annotations

import csv
from pathlib import Path

from dotenv import dotenv_values
from kiteconnect import KiteConnect


def main() -> int:
    env = dotenv_values(".env")
    api_key = env.get("ZERODHA_API_KEY", "").strip()
    access_token = env.get("ACCESS_TOKEN", "").strip()
    out_path = Path(env.get("INSTRUMENTS_CSV_PATH", "data/instruments.csv"))
    if not api_key or not access_token:
        print("Set ZERODHA_API_KEY and ACCESS_TOKEN in .env first.")
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)

    kite = KiteConnect(api_key=api_key)
    kite.set_access_token(access_token)
    data = kite.instruments()
    if not data:
        print("No instruments returned; check token.")
        return 2

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    print(f"Wrote {len(data)} instruments to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


