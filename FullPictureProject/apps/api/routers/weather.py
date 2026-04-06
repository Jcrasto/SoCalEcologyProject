"""Weather alerts layer REST endpoint."""

import ast
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter

from db import DATA_DIR, safe_read_parquet

router = APIRouter()

_EMPTY_FC = {"type": "FeatureCollection", "features": []}


@router.get("/layers/weather/alerts")
async def get_weather_alerts():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pattern = str(DATA_DIR / "weather" / "alerts" / f"date={today}" / "*.parquet")
    df = safe_read_parquet(pattern)

    if df.empty:
        return _EMPTY_FC

    features = []
    for _, row in df.iterrows():
        # Try to reconstruct geometry from stored JSON string
        geom = None
        geom_str = row.get("geometry_json")
        if geom_str is not None and not pd.isna(geom_str) and str(geom_str) != "None":
            try:
                geom = ast.literal_eval(geom_str)
            except Exception:
                geom = None

        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "alert_id": str(row.get("alert_id", "")),
                "event": str(row.get("event", "")),
                "severity": str(row.get("severity", "")),
                "headline": str(row.get("headline", "")),
                "description": str(row.get("description", "")),
                "expires": str(row.get("expires", "")),
            },
        })

    return {"type": "FeatureCollection", "features": features}
