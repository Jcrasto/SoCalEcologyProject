"""Vessel layer REST endpoint."""

import math
from fastapi import APIRouter

from db import DATA_DIR, safe_read_parquet


def _f(val, default=0.0) -> float:
    try:
        v = float(val)
        return default if (math.isnan(v) or math.isinf(v)) else v
    except (TypeError, ValueError):
        return default

router = APIRouter()

_EMPTY_FC = {"type": "FeatureCollection", "features": []}


@router.get("/layers/vessels")
async def get_vessels():
    # Read the most recent date partition
    import glob as _glob
    import os

    pattern = str(DATA_DIR / "vessels" / "date=*" / "*.parquet")
    files = sorted(_glob.glob(pattern))
    if not files:
        return _EMPTY_FC

    # Use the latest partition
    latest = files[-1]
    df = safe_read_parquet(latest)

    if df.empty:
        return _EMPTY_FC

    features = []
    for _, row in df.iterrows():
        lon = row.get("lon")
        lat = row.get("lat")
        if lon is None or lat is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [_f(lon), _f(lat), 0]},
            "properties": {
                "mmsi": str(row.get("mmsi", "")),
                "vessel_name": str(row.get("vessel_name", "")),
                "vessel_type": str(row.get("vessel_type", "")),
                "speed_kts": _f(row.get("speed_kts")),
                "course_deg": _f(row.get("course_deg")),
                "nav_status": str(row.get("nav_status", "")),
                "timestamp": str(row.get("timestamp", "")),
            },
        })

    return {"type": "FeatureCollection", "features": features}
