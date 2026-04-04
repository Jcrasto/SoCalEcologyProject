"""Ingest earthquake data from USGS every 5 minutes."""

import logging
from datetime import datetime, timedelta, timezone

import httpx
import pandas as pd

from db import DATA_DIR, last_ingestion, safe_read_parquet, write_parquet
from ws import manager

logger = logging.getLogger(__name__)

USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"


def _row_to_feature(row: pd.Series) -> dict:
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [
                float(row["lon"]),
                float(row["lat"]),
                float(row.get("depth_km", 0)) * -1000,
            ],
        },
        "properties": {
            "usgs_id": row.get("usgs_id", ""),
            "magnitude": float(row.get("magnitude", 0)),
            "depth_km": float(row.get("depth_km", 0)),
            "place": str(row.get("place", "")),
            "event_time": str(row.get("event_time", "")),
        },
    }


async def ingest_earthquakes() -> None:
    try:
        params = {
            "format": "geojson",
            "minlatitude": 31.0,
            "maxlatitude": 36.0,
            "minlongitude": -120.5,
            "maxlongitude": -115.0,
            "minmagnitude": 1.0,
            "orderby": "time",
            "limit": 200,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(USGS_URL, params=params,
                                    headers={"User-Agent": "FullPictureProject/1.0"})
            resp.raise_for_status()
            fc = resp.json()

        rows = []
        now = datetime.now(timezone.utc)
        for feat in fc.get("features", []):
            props = feat.get("properties", {})
            coords = feat.get("geometry", {}).get("coordinates", [None, None, None])
            if coords[0] is None:
                continue
            event_ms = props.get("time")
            event_time = (
                datetime.fromtimestamp(event_ms / 1000, tz=timezone.utc)
                if event_ms else now
            )
            rows.append({
                "usgs_id": feat.get("id", ""),
                "magnitude": props.get("mag"),
                "depth_km": (coords[2] or 0),
                "place": props.get("place", ""),
                "lat": coords[1],
                "lon": coords[0],
                "event_time": event_time.isoformat(),
            })

        if not rows:
            return

        new_df = pd.DataFrame(rows)

        # Upsert: merge with existing, deduplicate on usgs_id
        existing_path = str(DATA_DIR / "earthquakes" / "*.parquet")
        existing = safe_read_parquet(existing_path)
        if not existing.empty and "usgs_id" in existing.columns:
            combined = pd.concat([existing, new_df], ignore_index=True)
            combined = combined.drop_duplicates(subset=["usgs_id"], keep="last")
        else:
            combined = new_df

        # Keep only last 30 days
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        if "event_time" in combined.columns:
            combined = combined[combined["event_time"] >= cutoff]

        write_parquet(combined, "earthquakes")
        last_ingestion["earthquakes"] = now

        # Alert on events from the last 10 minutes
        cutoff_alert = (now - timedelta(minutes=10)).isoformat()
        recent = new_df[new_df["event_time"] >= cutoff_alert]
        for _, row in recent.iterrows():
            await manager.broadcast_alert("earthquakes", _row_to_feature(row))

        logger.debug("Earthquakes: upserted %d total, %d recent alerts",
                     len(combined), len(recent))

    except Exception as exc:
        logger.error("ingest_earthquakes error: %s", exc)
