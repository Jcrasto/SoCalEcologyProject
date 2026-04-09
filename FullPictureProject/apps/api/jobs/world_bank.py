"""World Bank Open Data — no API key required."""
from __future__ import annotations
from datetime import date
import httpx
import pandas as pd

from jobs.base import BaseJob

# Indicators to fetch
INDICATORS = {
    "NY.GDP.PCAP.CD": "GDP per capita (USD)",
    "FP.CPI.TOTL.ZG": "Inflation (CPI %)",
    "SL.UEM.TOTL.ZS": "Unemployment rate (%)",
    "EP.PMP.SGAS.CD": "Gasoline pump price (USD/liter)",
    "EG.USE.PCAP.KG.OE": "Energy use per capita (kg oil equiv)",
}


class WorldBankJob(BaseJob):
    source_id = "world_bank"
    name = "World Bank Indicators"
    description = "Annual country-level indicators: GDP per capita, inflation, unemployment, gasoline prices. Source: World Bank."
    category = "Economics"
    partition = "year"
    requires_key = False

    async def fetch(self, start_date: date, end_date: date) -> pd.DataFrame:
        start_year = start_date.year
        end_year = end_date.year
        records = []

        async with httpx.AsyncClient(timeout=60) as client:
            for indicator_id, indicator_name in INDICATORS.items():
                page = 1
                while True:
                    params = {
                        "format": "json",
                        "per_page": 1000,
                        "page": page,
                        "mrv": end_year - start_year + 1,
                        "date": f"{start_year}:{end_year}",
                    }
                    url = f"https://api.worldbank.org/v2/country/all/indicator/{indicator_id}"
                    try:
                        resp = await client.get(url, params=params)
                        resp.raise_for_status()
                        result = resp.json()
                        if len(result) < 2 or not result[1]:
                            break
                        meta = result[0]
                        data = result[1]
                        for item in data:
                            if item.get("value") is None:
                                continue
                            records.append({
                                "date": f"{item.get('date')}-01-01",
                                "country": item.get("country", {}).get("value"),
                                "country_code": item.get("countryiso3code"),
                                "state": None,
                                "city": None,
                                "indicator_id": indicator_id,
                                "indicator_name": indicator_name,
                                "value": item.get("value"),
                            })
                        if page >= meta.get("pages", 1):
                            break
                        page += 1
                    except Exception:
                        break

        return pd.DataFrame(records) if records else pd.DataFrame()
