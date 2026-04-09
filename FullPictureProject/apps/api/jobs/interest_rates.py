"""FRED Interest Rate Series — requires FRED_API_KEY."""
from __future__ import annotations
from datetime import date
import httpx
import pandas as pd

from jobs.base import BaseJob

SERIES = {
    "FEDFUNDS": "Federal Funds Effective Rate",
    "DGS2": "2-Year Treasury",
    "DGS10": "10-Year Treasury",
    "DGS30": "30-Year Treasury",
    "MORTGAGE30US": "30-Year Fixed Mortgage Rate",
    "PRIME": "Bank Prime Loan Rate",
}


class InterestRatesJob(BaseJob):
    source_id = "interest_rates"
    name = "Interest Rates (FRED)"
    description = "Daily/weekly US interest rates: Fed Funds, 2/10/30yr Treasury, Mortgage, Prime. Source: FRED."
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
                            "rate_pct": float(val),
                            "country": "US",
                            "state": None,
                            "city": None,
                        })
                except Exception:
                    pass

        return pd.DataFrame(records) if records else pd.DataFrame()
