"""EIA Natural Gas Prices — requires EIA_API_KEY."""
from __future__ import annotations
from datetime import date
import httpx
import pandas as pd

from jobs.base import BaseJob


class NaturalGasJob(BaseJob):
    source_id = "natural_gas"
    name = "Natural Gas Prices (EIA)"
    description = "Monthly residential & commercial natural gas prices by state. Source: EIA Open Data."
    category = "Energy Prices"
    partition = "year"
    requires_key = True
    key_env_var = "EIA_API_KEY"

    async def fetch(self, start_date: date, end_date: date) -> pd.DataFrame:
        key = self.get_key()
        start = start_date.strftime("%Y-%m")
        end = end_date.strftime("%Y-%m")

        params = {
            "api_key": key,
            "frequency": "monthly",
            "data[0]": "val",
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
                "https://api.eia.gov/v2/natural-gas/pri/sum/data", params=params
            )
            resp.raise_for_status()
            data = resp.json()
            for row in data.get("response", {}).get("data", []):
                records.append({
                    "date": row.get("period") + "-01",
                    "state": row.get("duoarea"),
                    "country": "US",
                    "city": None,
                    "process": row.get("process-name"),
                    "price_per_mcf": row.get("val"),
                })

        return pd.DataFrame(records) if records else pd.DataFrame()
