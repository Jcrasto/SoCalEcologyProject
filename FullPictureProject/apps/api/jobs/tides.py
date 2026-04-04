"""Ingest tide observations from NOAA Tides & Currents every 6 minutes."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import pandas as pd

from db import last_ingestion, write_parquet

logger = logging.getLogger(__name__)

NOAA_TIDES_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"

STATIONS = {
    "9410230": "La Jolla",
    "9410660": "Los Angeles",
    "9411340": "Santa Barbara",
    "9410840": "Santa Monica",
}


async def ingest_tides() -> None:
    try:
        now = datetime.now(timezone.utc)
        begin_date = (now - timedelta(days=1)).strftime("%Y%m%d")
        end_date = (now + timedelta(days=1)).strftime("%Y%m%d")
        date_str = now.strftime("%Y-%m-%d")

        async with httpx.AsyncClient(timeout=30) as client:
            for station_id, station_name in STATIONS.items():
                rows = []

                # Fetch observed water levels
                obs_params = {
                    "product": "water_level",
                    "application": "fullpicture",
                    "begin_date": begin_date,
                    "end_date": end_date,
                    "station": station_id,
                    "datum": "MLLW",
                    "time_zone": "gmt",
                    "units": "metric",
                    "format": "json",
                }
                try:
                    obs_resp = await client.get(NOAA_TIDES_URL, params=obs_params)
                    obs_data = obs_resp.json().get("data", [])
                    for item in obs_data:
                        rows.append({
                            "station_id": station_id,
                            "station_name": station_name,
                            "timestamp": item.get("t", ""),
                            "water_level_m": _parse_float(item.get("v")),
                            "prediction_m": None,
                            "type": "observed",
                        })
                except Exception as exc:
                    logger.warning("Tide obs fetch error for %s: %s", station_id, exc)

                # Fetch predictions
                pred_params = {**obs_params, "product": "predictions"}
                try:
                    pred_resp = await client.get(NOAA_TIDES_URL, params=pred_params)
                    pred_data = pred_resp.json().get("predictions", [])
                    for item in pred_data:
                        rows.append({
                            "station_id": station_id,
                            "station_name": station_name,
                            "timestamp": item.get("t", ""),
                            "water_level_m": None,
                            "prediction_m": _parse_float(item.get("v")),
                            "type": "prediction",
                        })
                except Exception as exc:
                    logger.warning("Tide pred fetch error for %s: %s", station_id, exc)

                if rows:
                    df = pd.DataFrame(rows)
                    write_parquet(
                        df, "tides",
                        subdir=f"station={station_id}",
                        date_str=date_str,
                    )

        last_ingestion["tides"] = now
        logger.debug("Tides: updated %d stations", len(STATIONS))

    except Exception as exc:
        logger.error("ingest_tides error: %s", exc)


def _parse_float(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
