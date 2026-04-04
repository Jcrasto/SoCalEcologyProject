"""Ingest vessel AIS positions from AISHub (free tier, requires registration).

Get a free API key at https://www.aishub.net/api
Set AISHUB_USERNAME in apps/api/.env

Marine Cadastre's AISDataDynamic MapServer was decommissioned — it no longer
provides real-time vessel positions. AISHub aggregates 1000+ AIS receivers
and provides a free JSON feed covering SoCal coastal waters.
"""

import logging
import os
from datetime import datetime, timezone

import httpx
import pandas as pd

from db import last_ingestion, write_parquet
from lib.geo import BBOX, filter_df_to_region

logger = logging.getLogger(__name__)

AISHUB_USERNAME = os.getenv("AISHUB_USERNAME", "")

# Bounding box as AISHub expects: latmin,lonmin,latmax,lonmax
AISHUB_URL = "https://data.aishub.net/ws.php"


async def ingest_vessels() -> None:
    if not AISHUB_USERNAME:
        logger.warning("AISHUB_USERNAME not set — skipping vessel ingestion. "
                       "Register free at https://www.aishub.net/api")
        return

    try:
        params = {
            "username": AISHUB_USERNAME,
            "format": "1",          # JSON
            "output": "json",
            "compress": "0",
            "latmin": BBOX["lamin"],
            "latmax": BBOX["lamax"],
            "lonmin": BBOX["lomin"],
            "lonmax": BBOX["lomax"],
        }

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(AISHUB_URL, params=params)
            resp.raise_for_status()
            payload = resp.json()

        # AISHub returns [metadata_dict, [vessel_list]]
        vessels_raw = payload[1] if isinstance(payload, list) and len(payload) > 1 else []
        if not isinstance(vessels_raw, list):
            logger.warning("Vessels: unexpected AISHub response shape")
            return

        rows = []
        for v in vessels_raw:
            lat = v.get("LATITUDE")
            lon = v.get("LONGITUDE")
            if lat is None or lon is None:
                continue
            try:
                lat, lon = float(lat), float(lon)
            except (TypeError, ValueError):
                continue
            rows.append({
                "mmsi": str(v.get("MMSI", "")),
                "vessel_name": str(v.get("NAME", "")),
                "vessel_type": str(v.get("TYPE", "")),
                "lat": lat,
                "lon": lon,
                "speed_kts": float(v.get("SPEED") or 0) / 10.0,  # AISHub gives 1/10 knots
                "course_deg": float(v.get("COG") or 0) / 10.0,
                "nav_status": str(v.get("NAVSTAT", "")),
                "timestamp": str(v.get("TIME", "")),
            })

        if not rows:
            logger.info("Vessels: no vessels in region from AISHub")
            return

        df = pd.DataFrame(rows)
        df = filter_df_to_region(df)

        now = datetime.now(timezone.utc)
        write_parquet(df, "vessels", date_str=now.strftime("%Y-%m-%d"))
        last_ingestion["vessels"] = now
        logger.info("Vessels: ingested %d vessel positions", len(df))

    except Exception as exc:
        logger.error("ingest_vessels error: %s", exc)
