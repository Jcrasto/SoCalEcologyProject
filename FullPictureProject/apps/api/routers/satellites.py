"""Satellite positions layer REST endpoint."""

import time
from datetime import datetime, timezone

from fastapi import APIRouter, Query

from db import DATA_DIR, safe_read_parquet
from lib.geo import in_region
from lib.sgp4_util import compute_positions

router = APIRouter()

_EMPTY_FC = {"type": "FeatureCollection", "features": []}


@router.get("/layers/satellites")
async def get_satellites(
    ts: int = Query(default=None, description="Unix timestamp for position computation"),
):
    if ts is None:
        ts = int(time.time())

    pattern = str(DATA_DIR / "satellites" / "tle" / "*.parquet")
    df = safe_read_parquet(pattern)

    if df.empty:
        return _EMPTY_FC

    target_time = datetime.fromtimestamp(ts, tz=timezone.utc)
    features = []

    for _, row in df.iterrows():
        line1 = str(row.get("tle_line1", ""))
        line2 = str(row.get("tle_line2", ""))
        if not line1 or not line2:
            continue

        positions = compute_positions(line1, line2, [target_time])
        if not positions:
            continue

        pos = positions[0]
        lat = pos["lat"]
        lon = pos["lon"]
        alt_km = pos["altitude_km"]

        # Only include LEO/MEO satellites overhead the region
        if alt_km > 2000:
            continue
        if not in_region(lat, lon):
            continue

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat, alt_km * 1000],
            },
            "properties": {
                "norad_id": int(row.get("norad_id") or 0),
                "name": str(row.get("name", "")),
                "object_type": str(row.get("object_type", "")),
                "altitude_km": round(alt_km, 1),
                "velocity_kms": round(pos["velocity_kms"], 3),
            },
        })

    return {"type": "FeatureCollection", "features": features}
