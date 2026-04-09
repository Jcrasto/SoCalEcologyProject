"""Open-Meteo Historical Weather — no API key required."""
from __future__ import annotations
from datetime import date
import httpx
import pandas as pd

from jobs.base import BaseJob

# Default locations: major US metros + SoCal cities
DEFAULT_LOCATIONS = [
    {"city": "Los Angeles", "state": "CA", "country": "US", "lat": 34.05, "lon": -118.24},
    {"city": "San Diego", "state": "CA", "country": "US", "lat": 32.72, "lon": -117.16},
    {"city": "San Francisco", "state": "CA", "country": "US", "lat": 37.77, "lon": -122.42},
    {"city": "New York", "state": "NY", "country": "US", "lat": 40.71, "lon": -74.01},
    {"city": "Chicago", "state": "IL", "country": "US", "lat": 41.85, "lon": -87.65},
    {"city": "Houston", "state": "TX", "country": "US", "lat": 29.76, "lon": -95.37},
    {"city": "Phoenix", "state": "AZ", "country": "US", "lat": 33.45, "lon": -112.07},
    {"city": "Seattle", "state": "WA", "country": "US", "lat": 47.61, "lon": -122.33},
    {"city": "Denver", "state": "CO", "country": "US", "lat": 39.74, "lon": -104.98},
    {"city": "Miami", "state": "FL", "country": "US", "lat": 25.77, "lon": -80.20},
]

DAILY_VARS = [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "wind_speed_10m_max",
    "shortwave_radiation_sum",
]


class WeatherJob(BaseJob):
    source_id = "weather"
    name = "Weather (Open-Meteo)"
    description = "Daily weather: temp max/min, precipitation, wind speed. Source: Open-Meteo ERA5 reanalysis."
    category = "Weather"
    partition = "year_month"
    requires_key = False

    async def fetch(self, start_date: date, end_date: date) -> pd.DataFrame:
        records = []
        async with httpx.AsyncClient(timeout=30) as client:
            for loc in DEFAULT_LOCATIONS:
                params = {
                    "latitude": loc["lat"],
                    "longitude": loc["lon"],
                    "start_date": str(start_date),
                    "end_date": str(end_date),
                    "daily": ",".join(DAILY_VARS),
                    "timezone": "America/New_York",
                }
                resp = await client.get(
                    "https://archive-api.open-meteo.com/v1/archive", params=params
                )
                resp.raise_for_status()
                data = resp.json()
                daily = data.get("daily", {})
                dates = daily.get("time", [])
                for i, d in enumerate(dates):
                    rec = {
                        "date": d,
                        "city": loc["city"],
                        "state": loc["state"],
                        "country": loc["country"],
                        "lat": loc["lat"],
                        "lon": loc["lon"],
                    }
                    for var in DAILY_VARS:
                        vals = daily.get(var, [])
                        rec[var] = vals[i] if i < len(vals) else None
                    records.append(rec)

        return pd.DataFrame(records) if records else pd.DataFrame()
