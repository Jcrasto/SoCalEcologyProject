"""Traffic layer REST endpoint."""

import glob as _glob
import math
from fastapi import APIRouter


def _f(val, default=0.0) -> float:
    try:
        v = float(val)
        return default if (math.isnan(v) or math.isinf(v)) else v
    except (TypeError, ValueError):
        return default

from db import DATA_DIR, safe_read_parquet

router = APIRouter()

_EMPTY_FC = {"type": "FeatureCollection", "features": []}


def _wkt_to_coordinates(wkt: str) -> list:
    """Parse a WKT LINESTRING into a list of [lon, lat] pairs."""
    try:
        inner = wkt.replace("LINESTRING(", "").replace(")", "")
        pairs = [p.strip().split() for p in inner.split(",")]
        return [[float(p[0]), float(p[1])] for p in pairs if len(p) >= 2]
    except Exception:
        return []


@router.get("/layers/traffic")
async def get_traffic():
    pattern = str(DATA_DIR / "traffic" / "date=*" / "*.parquet")
    files = sorted(_glob.glob(pattern))
    if not files:
        return _EMPTY_FC

    df = safe_read_parquet(files[-1])
    if df.empty:
        return _EMPTY_FC

    features = []
    for _, row in df.iterrows():
        wkt = str(row.get("geom_wkt", ""))
        coords = _wkt_to_coordinates(wkt)
        if len(coords) < 2:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "segment_id": str(row.get("segment_id", "")),
                "speed_kmh": _f(row.get("speed_kmh")),
                "free_flow_speed_kmh": _f(row.get("free_flow_speed_kmh")),
                "congestion_level": str(row.get("congestion_level", "unknown")),
            },
        })

    return {"type": "FeatureCollection", "features": features}
