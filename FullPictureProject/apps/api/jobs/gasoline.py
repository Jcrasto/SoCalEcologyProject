"""EIA Retail Gasoline Prices — requires EIA_API_KEY."""
from __future__ import annotations
from datetime import date
import httpx
import pandas as pd

from jobs.base import BaseJob


class GasolineJob(BaseJob):
    source_id = "gasoline"
    name = "Gasoline Prices (EIA)"
    description = "Weekly retail gasoline prices ($/gallon) by US metro region. Source: EIA Open Data."
    category = "Energy Prices"
    partition = "year"
    requires_key = True
    key_env_var = "EIA_API_KEY"

    async def fetch(self, start_date: date, end_date: date) -> pd.DataFrame:
        key = self.get_key()
        start = str(start_date)
        end = str(end_date)

        params = {
            "api_key": key,
            "frequency": "weekly",
            "data[0]": "value",
            "start": start,
            "end": end,
            "sort[0][column]": "period",
            "sort[0][direction]": "asc",
            "offset": 0,
            "length": 5000,
        }

        records = []
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                "https://api.eia.gov/v2/petroleum/pri/gnd/data", params=params
            )
            resp.raise_for_status()
            data = resp.json()
            for row in data.get("response", {}).get("data", []):
                records.append({
                    "date": row.get("period"),
                    "region": row.get("duoarea"),
                    "country": "US",
                    "state": None,
                    "city": None,
                    "grade": row.get("product-name"),
                    "price_per_gallon": row.get("value"),
                })

        return pd.DataFrame(records) if records else pd.DataFrame()
