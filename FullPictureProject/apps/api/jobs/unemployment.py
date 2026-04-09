"""BLS Local Area Unemployment Statistics (LAUS) — BLS_API_KEY optional but recommended."""
from __future__ import annotations
from datetime import date
import httpx
import pandas as pd

from jobs.base import BaseJob

# State-level LAUS series IDs: LASST{FIPS}0000000000000003 = unemployment rate
# FIPS codes for all 50 states + DC
STATE_SERIES = {
    "AL": "LASST010000000000003",
    "AK": "LASST020000000000003",
    "AZ": "LASST040000000000003",
    "AR": "LASST050000000000003",
    "CA": "LASST060000000000003",
    "CO": "LASST080000000000003",
    "CT": "LASST090000000000003",
    "DE": "LASST100000000000003",
    "FL": "LASST120000000000003",
    "GA": "LASST130000000000003",
    "HI": "LASST150000000000003",
    "ID": "LASST160000000000003",
    "IL": "LASST170000000000003",
    "IN": "LASST180000000000003",
    "IA": "LASST190000000000003",
    "KS": "LASST200000000000003",
    "KY": "LASST210000000000003",
    "LA": "LASST220000000000003",
    "ME": "LASST230000000000003",
    "MD": "LASST240000000000003",
    "MA": "LASST250000000000003",
    "MI": "LASST260000000000003",
    "MN": "LASST270000000000003",
    "MS": "LASST280000000000003",
    "MO": "LASST290000000000003",
    "MT": "LASST300000000000003",
    "NE": "LASST310000000000003",
    "NV": "LASST320000000000003",
    "NH": "LASST330000000000003",
    "NJ": "LASST340000000000003",
    "NM": "LASST350000000000003",
    "NY": "LASST360000000000003",
    "NC": "LASST370000000000003",
    "ND": "LASST380000000000003",
    "OH": "LASST390000000000003",
    "OK": "LASST400000000000003",
    "OR": "LASST410000000000003",
    "PA": "LASST420000000000003",
    "RI": "LASST440000000000003",
    "SC": "LASST450000000000003",
    "SD": "LASST460000000000003",
    "TN": "LASST470000000000003",
    "TX": "LASST480000000000003",
    "UT": "LASST490000000000003",
    "VT": "LASST500000000000003",
    "VA": "LASST510000000000003",
    "WA": "LASST530000000000003",
    "WV": "LASST540000000000003",
    "WI": "LASST550000000000003",
    "WY": "LASST560000000000003",
    "DC": "LASST110000000000003",
}


class UnemploymentJob(BaseJob):
    source_id = "unemployment"
    name = "Unemployment Rate (BLS LAUS)"
    description = "Monthly unemployment rate (%) by state. Source: BLS Local Area Unemployment Statistics."
    category = "Labor"
    partition = "year"
    requires_key = True
    key_env_var = "BLS_API_KEY"

    async def fetch(self, start_date: date, end_date: date) -> pd.DataFrame:
        key = self.get_key()
        headers = {"Content-type": "application/json"}
        series_ids = list(STATE_SERIES.values())
        state_lookup = {v: k for k, v in STATE_SERIES.items()}

        start_year = start_date.year
        end_year = end_date.year

        records = []
        # BLS allows max 50 series per request
        async with httpx.AsyncClient(timeout=60) as client:
            for chunk_start in range(0, len(series_ids), 50):
                chunk = series_ids[chunk_start: chunk_start + 50]
                payload: dict = {
                    "seriesid": chunk,
                    "startyear": str(start_year),
                    "endyear": str(end_year),
                }
                if key:
                    payload["registrationkey"] = key

                resp = await client.post(
                    "https://api.bls.gov/publicAPI/v2/timeseries/data/",
                    json=payload,
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()

                for series in data.get("Results", {}).get("series", []):
                    sid = series["seriesID"]
                    state = state_lookup.get(sid, sid)
                    for item in series.get("data", []):
                        period = item.get("period", "")  # e.g. "M01"
                        if not period.startswith("M"):
                            continue
                        month = int(period[1:])
                        year = int(item.get("year", 0))
                        records.append({
                            "date": f"{year}-{month:02d}-01",
                            "state": state,
                            "country": "US",
                            "city": None,
                            "unemployment_rate": item.get("value"),
                        })

        return pd.DataFrame(records) if records else pd.DataFrame()
