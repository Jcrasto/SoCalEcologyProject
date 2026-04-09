"""FRED Market Index Series — requires FRED_API_KEY."""
from __future__ import annotations
from datetime import date
import httpx
import pandas as pd

from jobs.base import BaseJob

SERIES = {
    "NASDAQCOM": "NASDAQ Composite",
    "RU2000PR": "Russell 2000",
    "VIXCLS": "CBOE VIX",
    "WILL5000PR": "Wilshire 5000",
}


class MarketIndexesJob(BaseJob):
    source_id = "market_indexes"
    name = "Market Indexes (FRED)"
    description = "Daily market indexes: NASDAQ, Russell 2000, VIX, Wilshire 5000. Source: FRED (freely licensed)."
    category = "Finance"
    partition = "year"
    requires_key = True
    key_env_var = "FRED_API_KEY"

    async def fetch(self, start_date: date, end_date: date) -> pd.DataFrame:
        key = self.get_key()
        records = []

        async with httpx.AsyncClient(timeout=30) as client:
            for series_id, series_name in SERIES.items():
                params = {
                    "series_id": series_id,
                    "api_key": key,
                    "file_type": "json",
                    "observation_start": str(start_date),
                    "observation_end": str(end_date),
                }
                try:
                    resp = await client.get(
                        "https://api.stlouisfed.org/fred/series/observations",
                        params=params,
                    )
                    resp.raise_for_status()
                    for obs in resp.json().get("observations", []):
                        val = obs.get("value")
                        if val == ".":
                            continue
                        records.append({
                            "date": obs.get("date"),
                            "series_id": series_id,
                            "series_name": series_name,
                            "value": float(val),
                            "country": "US",
                            "state": None,
                            "city": None,
                        })
                except Exception:
                    pass

        return pd.DataFrame(records) if records else pd.DataFrame()
