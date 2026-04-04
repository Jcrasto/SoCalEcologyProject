"""Ingest road traffic flow from HERE Traffic API every 5 minutes."""

import logging
import os
from datetime import datetime, timezone

import httpx
import pandas as pd

from db import last_ingestion, write_parquet
from lib.geo import CENTER_LAT, CENTER_LON, RADIUS_KM

logger = logging.getLogger(__name__)

HERE_URL = "https://data.traffic.hereapi.com/v7/flow"


def _congestion(speed: float, free_flow: float) -> str:
    if free_flow <= 0:
        return "unknown"
    ratio = speed / free_flow
    if ratio >= 0.8:
        return "free"
    if ratio >= 0.4:
        return "slow"
    return "heavy"


async def ingest_traffic() -> None:
    key = os.getenv("HERE_API_KEY")
    if not key:
        logger.warning("HERE_API_KEY not set — skipping traffic ingestion")
        return
    try:
        params = {
            "locationReferencing": "shape",
            "in": f"circle:{CENTER_LAT},{CENTER_LON};r={int(RADIUS_KM * 1000)}",
            "apiKey": key,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(HERE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        rows = []
        for result in data.get("results", []):
            loc = result.get("location", {})
            flow = result.get("currentFlow", {})
            shape = loc.get("shape", {})
            links = shape.get("links", [])

            speed = float(flow.get("speed", 0) or 0)
            free_flow = float(flow.get("freeFlow", 0) or 0)

            for i, link in enumerate(links):
                points = link.get("points", [])
                if len(points) < 2:
                    continue
                coords = [[p["lng"], p["lat"]] for p in points]
                wkt = "LINESTRING(" + ", ".join(f"{c[0]} {c[1]}" for c in coords) + ")"
                rows.append({
                    "segment_id": f"{loc.get('description', '')}_{i}",
                    "geom_wkt": wkt,
                    "speed_kmh": speed,
                    "free_flow_speed_kmh": free_flow,
                    "congestion_level": _congestion(speed, free_flow),
                })

        if not rows:
            return

        now = datetime.now(timezone.utc)
        df = pd.DataFrame(rows)
        write_parquet(df, "traffic", date_str=now.strftime("%Y-%m-%d"))
        last_ingestion["traffic"] = now
        logger.debug("Traffic: %d segments", len(df))

    except Exception as exc:
        logger.error("ingest_traffic error: %s", exc)
