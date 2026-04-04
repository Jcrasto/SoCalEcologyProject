"""Ingest fire detections from NASA FIRMS and incidents from CAL FIRE."""

import logging
import os
from datetime import datetime, timezone

import httpx
import pandas as pd

from db import last_ingestion, write_parquet
from lib.geo import BBOX, filter_df_to_region

logger = logging.getLogger(__name__)

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/json"
CALFIRE_URL = "https://www.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList?inactive=false"


async def ingest_fire_detections() -> None:
    key = os.getenv("NASA_FIRMS_KEY")
    if not key:
        logger.warning("NASA_FIRMS_KEY not set — skipping fire detection ingestion")
        return
    try:
        bbox_str = f"{BBOX['lomin']},{BBOX['lamin']},{BBOX['lomax']},{BBOX['lamax']}"
        url = f"{FIRMS_BASE}/{key}/VIIRS_SNPP_NRT/{bbox_str}/1"

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            detections = resp.json()

        if not detections:
            return

        rows = []
        for d in detections:
            lat = d.get("latitude")
            lon = d.get("longitude")
            if lat is None or lon is None:
                continue
            # Parse acq_date (YYYY-MM-DD) + acq_time (HHMM) into ISO
            try:
                acq_dt = datetime.strptime(
                    f"{d.get('acq_date', '')} {int(d.get('acq_time', 0)):04d}",
                    "%Y-%m-%d %H%M",
                ).replace(tzinfo=timezone.utc).isoformat()
            except Exception:
                acq_dt = ""
            rows.append({
                "lat": float(lat),
                "lon": float(lon),
                "brightness": float(d.get("bright_ti4") or 0),
                "frp": float(d.get("frp") or 0),
                "confidence": str(d.get("confidence", "")),
                "satellite": str(d.get("satellite", "")),
                "acq_time": acq_dt,
                "source": "nasa_firms",
            })

        if not rows:
            return

        now = datetime.now(timezone.utc)
        df = pd.DataFrame(rows)
        df = filter_df_to_region(df)
        write_parquet(df, "fires", subdir="detections", date_str=now.strftime("%Y-%m-%d"))
        last_ingestion["fire_detections"] = now
        logger.debug("Fire detections: %d hotspots", len(df))

    except Exception as exc:
        logger.error("ingest_fire_detections error: %s", exc)


async def ingest_cal_fire() -> None:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(CALFIRE_URL,
                                    headers={"User-Agent": "FullPictureProject/1.0"})
            resp.raise_for_status()
            data = resp.json()

        # CAL FIRE returns a list of incident dicts (not GeoJSON)
        rows = []
        features = data if isinstance(data, list) else data.get("features", [])
        for item in features:
            props = item.get("properties", item)  # handle both GeoJSON and plain dict
            rows.append({
                "incident_name": str(props.get("Name", props.get("incident_name", ""))),
                "acres": float(props.get("AcresBurned", props.get("acres", 0)) or 0),
                "containment_pct": float(props.get("PercentContained", props.get("containment_pct", 0)) or 0),
                "lat": float(props.get("Latitude", props.get("lat", 0)) or 0),
                "lon": float(props.get("Longitude", props.get("lon", 0)) or 0),
                "start_date": str(props.get("StartedDateOnly", props.get("start_date", ""))),
                "geom_wkt": None,
            })

        if not rows:
            return

        now = datetime.now(timezone.utc)
        df = pd.DataFrame(rows)
        df = df[df["lat"] != 0]
        write_parquet(df, "fires", subdir="perimeters", date_str=now.strftime("%Y-%m-%d"))
        last_ingestion["fire_perimeters"] = now
        logger.debug("CAL FIRE: %d active incidents", len(df))

    except Exception as exc:
        logger.error("ingest_cal_fire error: %s", exc)
