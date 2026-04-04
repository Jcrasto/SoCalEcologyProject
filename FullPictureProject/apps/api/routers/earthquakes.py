"""Earthquake layer REST endpoint."""

import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from db import DATA_DIR, safe_read_parquet


def _f(val, default=0.0) -> float:
    try:
        v = float(val)
        return default if (math.isnan(v) or math.isinf(v)) else v
    except (TypeError, ValueError):
        return default

router = APIRouter()

_EMPTY_FC = {"type": "FeatureCollection", "features": []}


@router.get("/layers/earthquakes")
async def get_earthquakes(
    hours: int = Query(default=72, description="How many hours back to include"),
    minmag: float = Query(default=1.0, description="Minimum magnitude"),
):
    pattern = str(DATA_DIR / "earthquakes" / "*.parquet")
    df = safe_read_parquet(pattern)

    if df.empty:
        return _EMPTY_FC

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    if "event_time" in df.columns:
        df = df[df["event_time"] >= cutoff]
    if "magnitude" in df.columns:
        df = df[df["magnitude"] >= minmag]

    features = []
    for _, row in df.iterrows():
        lon = row.get("lon")
        lat = row.get("lat")
        if lon is None or lat is None:
            continue
        depth = _f(row.get("depth_km"))
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [_f(lon), _f(lat), depth * -1000],
            },
            "properties": {
                "usgs_id": str(row.get("usgs_id", "")),
                "magnitude": _f(row.get("magnitude")),
                "depth_km": depth,
                "place": str(row.get("place", "")),
                "event_time": str(row.get("event_time", "")),
            },
        })

    features.sort(key=lambda f: f["properties"]["event_time"], reverse=True)
    return {"type": "FeatureCollection", "features": features}
