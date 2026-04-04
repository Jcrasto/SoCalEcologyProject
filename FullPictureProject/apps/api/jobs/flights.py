"""Ingest live flight positions from OpenSky Network every 15 seconds."""

import logging
import os
from datetime import datetime, timezone

import httpx
import pandas as pd

from db import last_ingestion, write_parquet
from lib.geo import BBOX, filter_df_to_region
from ws import manager

logger = logging.getLogger(__name__)

OPENSKY_URL = "https://opensky-network.org/api/states/all"
STATE_COLS = [
    "icao24", "callsign", "origin_country", "time_position", "last_contact",
    "lon", "lat", "baro_altitude", "on_ground", "velocity", "true_track",
    "vertical_rate", "sensors", "geo_altitude", "squawk", "spi", "position_source",
]


def _df_to_features(df: pd.DataFrame) -> list:
    features = []
    for _, row in df.iterrows():
        lon = row.get("lon")
        lat = row.get("lat")
        if lon is None or lat is None:
            continue
        alt = float(row.get("altitude_m") or 0)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat, alt]},
            "properties": {
                "icao24": row.get("icao24", ""),
                "callsign": str(row.get("callsign", "")).strip(),
                "altitude_m": alt,
                "velocity_ms": float(row.get("velocity_ms") or 0),
                "heading": float(row.get("heading") or 0),
                "on_ground": bool(row.get("on_ground", False)),
                "timestamp": row.get("timestamp", ""),
            },
        })
    return features


async def ingest_flights() -> None:
    try:
        params = {
            "lamin": BBOX["lamin"], "lamax": BBOX["lamax"],
            "lomin": BBOX["lomin"], "lomax": BBOX["lomax"],
        }
        auth = None
        user = os.getenv("OPENSKY_USERNAME")
        pwd = os.getenv("OPENSKY_PASSWORD")
        if user and pwd:
            auth = (user, pwd)

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(OPENSKY_URL, params=params, auth=auth)
            resp.raise_for_status()
            data = resp.json()

        states = data.get("states") or []
        if not states:
            return

        df = pd.DataFrame(states, columns=STATE_COLS)
        df = df[["icao24", "callsign", "lon", "lat", "baro_altitude",
                  "velocity", "true_track", "on_ground"]].copy()
        df = df.rename(columns={
            "baro_altitude": "altitude_m",
            "velocity": "velocity_ms",
            "true_track": "heading",
        })
        df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
        df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
        df = df.dropna(subset=["lon", "lat"])
        df = filter_df_to_region(df)

        now = datetime.now(timezone.utc)
        df["timestamp"] = now.isoformat()
        date_str = now.strftime("%Y-%m-%d")

        write_parquet(df, "flights", date_str=date_str)
        last_ingestion["flights"] = now

        features = _df_to_features(df)
        await manager.broadcast_layer("flights", features)
        logger.debug("Flights: ingested %d aircraft", len(df))

    except Exception as exc:
        logger.error("ingest_flights error: %s", exc)
