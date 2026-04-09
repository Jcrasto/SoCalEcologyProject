"""EPA AirNow Daily AQI — requires EPA_API_KEY."""
from __future__ import annotations
from datetime import date, timedelta
import httpx
import pandas as pd

from jobs.base import BaseJob

# Major US metro zip codes to sample air quality
SAMPLE_ZIPS = [
    ("90001", "Los Angeles", "CA", "US"),
    ("92101", "San Diego", "CA", "US"),
    ("94102", "San Francisco", "CA", "US"),
    ("10001", "New York", "NY", "US"),
    ("60601", "Chicago", "IL", "US"),
    ("77001", "Houston", "TX", "US"),
    ("85001", "Phoenix", "AZ", "US"),
    ("98101", "Seattle", "WA", "US"),
    ("80202", "Denver", "CO", "US"),
    ("33101", "Miami", "FL", "US"),
]


class AirQualityJob(BaseJob):
    source_id = "air_quality"
    name = "Air Quality / AQI (EPA AirNow)"
    description = "Daily AQI and pollutant levels (PM2.5, PM10, O3, CO, NO2, SO2) by city. Source: EPA AirNow API."
    category = "Environment"
    partition = "year_month"
    requires_key = True
    key_env_var = "EPA_API_KEY"

    async def fetch(self, start_date: date, end_date: date) -> pd.DataFrame:
        key = self.get_key()
        records = []

        async with httpx.AsyncClient(timeout=30) as client:
            current = start_date
            while current <= end_date:
                date_str = current.strftime("%Y-%m-%dT00-0000")
                for zip_code, city, state, country in SAMPLE_ZIPS:
                    params = {
                        "format": "application/json",
                        "zipCode": zip_code,
                        "date": date_str,
                        "distance": 25,
                        "API_KEY": key,
                    }
                    try:
                        resp = await client.get(
                            "https://www.airnowapi.org/aq/observation/zipCode/historical/",
                            params=params,
                        )
                        resp.raise_for_status()
                        for obs in resp.json():
                            records.append({
                                "date": str(current),
                                "city": city,
                                "state": state,
                                "country": country,
                                "parameter": obs.get("ParameterName"),
                                "aqi": obs.get("AQI"),
                                "category": obs.get("Category", {}).get("Name"),
                            })
                    except Exception:
                        pass
                current += timedelta(days=1)

        return pd.DataFrame(records) if records else pd.DataFrame()
