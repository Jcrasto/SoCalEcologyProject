"""Ingest energy and economic price data from EIA and FRED daily."""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
import pandas as pd

from db import DATA_DIR, last_ingestion, safe_read_parquet, write_parquet

logger = logging.getLogger(__name__)

EIA_SERIES = {
    "EMM_EPMRU_PTE_SCA_DPG": {
        "name": "CA Regular Gasoline ($/gal)",
        "category": "energy",
        "unit": "$/gal",
    },
    "RWTC": {
        "name": "WTI Crude Oil Spot ($/bbl)",
        "category": "energy",
        "unit": "$/bbl",
    },
}

FRED_SERIES = {
    "CUURA421SA0": {
        "name": "LA-OC CPI All Items",
        "category": "cpi",
        "unit": "index",
    },
    "CAUR": {
        "name": "CA Unemployment Rate",
        "category": "employment",
        "unit": "%",
    },
}


async def ingest_prices() -> None:
    eia_key = os.getenv("EIA_API_KEY")
    fred_key = os.getenv("FRED_API_KEY")
    now = datetime.now(timezone.utc)

    series_rows: list[dict] = []
    obs_rows: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        # ── EIA ──────────────────────────────────────────────────────────────
        if eia_key:
            for series_id, meta in EIA_SERIES.items():
                try:
                    url = f"https://api.eia.gov/v2/seriesid/{series_id}"
                    resp = await client.get(url, params={
                        "api_key": eia_key,
                        "data[0]": "value",
                        "sort[0][column]": "period",
                        "sort[0][direction]": "desc",
                        "length": "365",
                    })
                    resp.raise_for_status()
                    data = resp.json().get("response", {}).get("data", [])
                    for item in data:
                        obs_rows.append({
                            "series_id": series_id,
                            "period_date": str(item.get("period", "")),
                            "value": _parse_float(item.get("value")),
                        })
                    series_rows.append({
                        "source": "eia",
                        "series_id": series_id,
                        "series_name": meta["name"],
                        "category": meta["category"],
                        "unit": meta["unit"],
                    })
                    logger.debug("EIA %s: %d observations", series_id, len(data))
                except Exception as exc:
                    logger.warning("EIA fetch error for %s: %s", series_id, exc)
        else:
            logger.warning("EIA_API_KEY not set — skipping EIA price ingestion")

        # ── FRED ─────────────────────────────────────────────────────────────
        if fred_key:
            for series_id, meta in FRED_SERIES.items():
                try:
                    resp = await client.get(
                        "https://api.stlouisfed.org/fred/series/observations",
                        params={
                            "series_id": series_id,
                            "api_key": fred_key,
                            "file_type": "json",
                            "sort_order": "desc",
                            "limit": "365",
                        },
                    )
                    resp.raise_for_status()
                    observations = resp.json().get("observations", [])
                    for item in observations:
                        val = _parse_float(item.get("value"))
                        if val is not None:
                            obs_rows.append({
                                "series_id": series_id,
                                "period_date": str(item.get("date", "")),
                                "value": val,
                            })
                    series_rows.append({
                        "source": "fred",
                        "series_id": series_id,
                        "series_name": meta["name"],
                        "category": meta["category"],
                        "unit": meta["unit"],
                    })
                    logger.debug("FRED %s: %d observations", series_id, len(observations))
                except Exception as exc:
                    logger.warning("FRED fetch error for %s: %s", series_id, exc)
        else:
            logger.warning("FRED_API_KEY not set — skipping FRED price ingestion")

    if series_rows:
        write_parquet(pd.DataFrame(series_rows), "prices", subdir="series")

    if obs_rows:
        # Merge with existing observations, deduplicate
        existing = safe_read_parquet(str(DATA_DIR / "prices" / "observations" / "*.parquet"))
        new_df = pd.DataFrame(obs_rows)
        if not existing.empty:
            combined = pd.concat([existing, new_df], ignore_index=True)
            combined = combined.drop_duplicates(subset=["series_id", "period_date"], keep="last")
        else:
            combined = new_df
        write_parquet(combined, "prices", subdir="observations")

    last_ingestion["prices"] = now


def _parse_float(value) -> Optional[float]:
    try:
        f = float(value)
        return None if f == -999 else f  # FRED uses -999 for missing
    except (TypeError, ValueError):
        return None
