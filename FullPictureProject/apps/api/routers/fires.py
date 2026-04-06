"""Fire detections and perimeters layer REST endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter

from db import DATA_DIR, safe_read_parquet

router = APIRouter()

_EMPTY_FC = {"type": "FeatureCollection", "features": []}


@router.get("/layers/fires")
async def get_fires():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    features = []

    # Detection points
    det_pattern = str(DATA_DIR / "fires" / "detections" / f"date={today}" / "*.parquet")
    det_df = safe_read_parquet(det_pattern)
    for _, row in det_df.iterrows():
        lon = row.get("lon")
        lat = row.get("lat")
        if lon is None or lat is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
            "properties": {
                "layer_type": "detection",
                "brightness": float(row.get("brightness") or 0),
                "frp": float(row.get("frp") or 0),
                "confidence": str(row.get("confidence", "")),
                "satellite": str(row.get("satellite", "")),
                "acq_time": str(row.get("acq_time", "")),
                "source": str(row.get("source", "nasa_firms")),
            },
        })

    # Incident perimeters (point-based from CAL FIRE)
    per_pattern = str(DATA_DIR / "fires" / "perimeters" / f"date={today}" / "*.parquet")
    per_df = safe_read_parquet(per_pattern)
    for _, row in per_df.iterrows():
        lon = row.get("lon")
        lat = row.get("lat")
        if lon is None or lat is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
            "properties": {
                "layer_type": "incident",
                "incident_name": str(row.get("incident_name", "")),
                "acres": float(row.get("acres") or 0),
                "containment_pct": float(row.get("containment_pct") or 0),
                "start_date": str(row.get("start_date", "")),
            },
        })

    return {"type": "FeatureCollection", "features": features}
