"""Flight layer REST endpoint."""

import math
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Query

from db import DATA_DIR, safe_read_parquet


def _f(val, default=0.0) -> float:
    """Convert to float, returning default for None/NaN/inf."""
    try:
        v = float(val)
        return default if (math.isnan(v) or math.isinf(v)) else v
    except (TypeError, ValueError):
        return default

router = APIRouter()

_EMPTY_FC = {"type": "FeatureCollection", "features": []}


@router.get("/layers/flights")
async def get_flights(
    ts: int = Query(default=None, description="Unix timestamp (default: now)"),
    window_seconds: int = Query(default=90, description="Seconds back from ts to include"),
):
    if ts is None:
        ts = int(time.time())

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pattern = str(DATA_DIR / "flights" / f"date={today}" / "*.parquet")
    df = safe_read_parquet(pattern)

    if df.empty:
        return _EMPTY_FC

    cutoff = datetime.fromtimestamp(ts - window_seconds, tz=timezone.utc).isoformat()
    if "timestamp" in df.columns:
        df = df[df["timestamp"] >= cutoff]

    features = []
    for _, row in df.iterrows():
        lon = row.get("lon")
        lat = row.get("lat")
        if lon is None or lat is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [_f(lon), _f(lat), _f(row.get("altitude_m"))],
            },
            "properties": {
                "icao24": str(row.get("icao24", "")),
                "callsign": str(row.get("callsign", "")).strip(),
                "altitude_m": _f(row.get("altitude_m")),
                "velocity_ms": _f(row.get("velocity_ms")),
                "heading": _f(row.get("heading")),
                "on_ground": bool(row.get("on_ground") or False),
                "timestamp": str(row.get("timestamp", "")),
            },
        })

    return {"type": "FeatureCollection", "features": features}
