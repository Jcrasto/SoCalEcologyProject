"""Tides layer REST endpoint."""

from typing import Optional
from fastapi import APIRouter, Query

from db import DATA_DIR, safe_read_parquet

router = APIRouter()

STATION_COORDS = {
    "9410230": {"name": "La Jolla", "lat": 32.867, "lon": -117.257},
    "9410660": {"name": "Los Angeles", "lat": 33.720, "lon": -118.272},
    "9411340": {"name": "Santa Barbara", "lat": 34.408, "lon": -119.686},
    "9410840": {"name": "Santa Monica", "lat": 34.008, "lon": -118.499},
}


@router.get("/layers/tides")
async def get_tides(
    station_id: str = Query(default=None, description="Station ID; omit for all"),
):
    stations_to_fetch = (
        [station_id] if station_id and station_id in STATION_COORDS
        else list(STATION_COORDS.keys())
    )

    result = []
    for sid in stations_to_fetch:
        meta = STATION_COORDS[sid]
        pattern = str(DATA_DIR / "tides" / f"station={sid}" / "date=*" / "*.parquet")
        df = safe_read_parquet(pattern)

        observations = []
        if not df.empty:
            # Merge observed and predicted into combined rows by timestamp
            obs_df = df[df.get("type", pd.Series(dtype=str)) == "observed"] if "type" in df.columns else df
            pred_df = df[df["type"] == "prediction"] if "type" in df.columns else None

            # Build a timestamp-keyed dict
            merged: dict = {}
            for _, row in df.iterrows():
                ts = str(row.get("timestamp", ""))
                if ts not in merged:
                    merged[ts] = {"timestamp": ts, "water_level_m": None, "prediction_m": None}
                row_type = str(row.get("type", ""))
                if row_type == "prediction":
                    merged[ts]["prediction_m"] = _safe_float(row.get("prediction_m"))
                else:
                    merged[ts]["water_level_m"] = _safe_float(row.get("water_level_m"))

            observations = sorted(merged.values(), key=lambda x: x["timestamp"])

        result.append({
            "station_id": sid,
            "station_name": meta["name"],
            "lat": meta["lat"],
            "lon": meta["lon"],
            "observations": observations,
        })

    return result


def _safe_float(value) -> Optional[float]:
    try:
        import math
        v = float(value)
        return None if math.isnan(v) or math.isinf(v) else v
    except (TypeError, ValueError):
        return None


# Needed for the type annotation in the function body above
import pandas as pd  # noqa: E402
