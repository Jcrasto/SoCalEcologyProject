"""Data Explorer endpoint — returns record counts, previews, and on-demand refresh."""

import glob as _glob
import logging
import math
import time
from typing import Any

from fastapi import APIRouter, HTTPException

from db import DATA_DIR, query
from jobs.flights import ingest_flights
from jobs.earthquakes import ingest_earthquakes
from jobs.vessels import ingest_vessels
from jobs.weather import ingest_weather_alerts, ingest_weather_obs
from jobs.fires import ingest_fire_detections, ingest_cal_fire
from jobs.tides import ingest_tides
from jobs.satellites import ingest_satellites
from jobs.traffic import ingest_traffic
from jobs.prices import ingest_prices

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Table definitions ────────────────────────────────────────────────────────
# Each entry: (id, label, icon, glob_pattern_relative_to_DATA_DIR)
TABLES = [
    ("flights",             "Flights",              "✈",  "flights/**/*.parquet"),
    ("earthquakes",         "Earthquakes",          "⚡", "earthquakes/*.parquet"),
    ("vessels",             "Vessels",              "⛵", "vessels/**/*.parquet"),
    ("fires_detections",    "Fire Detections",      "🔥", "fires/detections/**/*.parquet"),
    ("fires_perimeters",    "Fire Perimeters",      "🌋", "fires/perimeters/**/*.parquet"),
    ("weather_alerts",      "Weather Alerts",       "🌩", "weather/alerts/**/*.parquet"),
    ("tides",               "Tides",                "🌊", "tides/**/*.parquet"),
    ("satellites_tle",      "Satellites (TLE)",     "🛰", "satellites/tle/*.parquet"),
    ("traffic",             "Traffic",              "🚗", "traffic/**/*.parquet"),
    ("prices_series",       "Price Series",         "📈", "prices/series/*.parquet"),
    ("prices_observations", "Price Observations",   "💰", "prices/observations/*.parquet"),
]


# Maps table id → ingest functions to call on refresh.
# prices_series and prices_observations share the same job — deduplicated at call time.
SOURCE_JOBS: dict[str, list] = {
    "flights":              [ingest_flights],
    "earthquakes":          [ingest_earthquakes],
    "vessels":              [ingest_vessels],
    "fires_detections":     [ingest_fire_detections],
    "fires_perimeters":     [ingest_cal_fire],
    "weather_alerts":       [ingest_weather_alerts, ingest_weather_obs],
    "tides":                [ingest_tides],
    "satellites_tle":       [ingest_satellites],
    "traffic":              [ingest_traffic],
    "prices_series":        [ingest_prices],
    "prices_observations":  [ingest_prices],
}

# All unique jobs for "refresh all"
_ALL_JOBS = list({id(fn): fn for jobs in SOURCE_JOBS.values() for fn in jobs}.values())


def _sanitize(val: Any) -> Any:
    """Convert non-JSON-serialisable values to safe Python primitives."""
    if val is None:
        return None
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    # pandas Timestamp, numpy types, etc.
    try:
        import numpy as np  # type: ignore
        if isinstance(val, (np.integer,)):
            return int(val)
        if isinstance(val, (np.floating,)):
            v = float(val)
            return None if (math.isnan(v) or math.isinf(v)) else v
        if isinstance(val, np.bool_):
            return bool(val)
    except ImportError:
        pass
    try:
        import pandas as pd  # type: ignore
        if isinstance(val, pd.Timestamp):
            return val.isoformat()
    except ImportError:
        pass
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return val


def _table_stats(glob_pattern: str):
    """Return (total_count, columns, preview_rows) for a Parquet glob pattern."""
    files = _glob.glob(glob_pattern)
    if not files:
        return 0, [], []

    pattern_escaped = glob_pattern.replace("'", "''")

    # total count
    count_df = query(f"SELECT COUNT(*) AS n FROM read_parquet('{pattern_escaped}')")
    total = int(count_df["n"].iloc[0]) if not count_df.empty else 0

    # preview (10 rows)
    preview_df = query(f"SELECT * FROM read_parquet('{pattern_escaped}') LIMIT 10")
    columns = list(preview_df.columns)
    preview_rows = [
        {col: _sanitize(row[col]) for col in columns}
        for _, row in preview_df.iterrows()
    ]

    return total, columns, preview_rows


@router.get("/admin/tables")
async def get_table_stats():
    """Return record counts and 10-row previews for every data table."""
    results = []
    for table_id, label, icon, rel_pattern in TABLES:
        abs_pattern = str(DATA_DIR / rel_pattern)
        try:
            total, columns, preview = _table_stats(abs_pattern)
        except Exception as exc:
            logger.warning("explorer: error reading %s: %s", table_id, exc)
            total, columns, preview = 0, [], []

        results.append({
            "id": table_id,
            "label": label,
            "icon": icon,
            "total_records": total,
            "columns": columns,
            "preview": preview,
        })

    return {"tables": results}


@router.post("/admin/refresh/{source_id}")
async def refresh_source(source_id: str):
    """Trigger on-demand ingestion for a single data source."""
    jobs = SOURCE_JOBS.get(source_id)
    if jobs is None:
        raise HTTPException(status_code=404, detail=f"Unknown source: {source_id}")

    errors: list[str] = []
    t0 = time.monotonic()
    for fn in jobs:
        try:
            await fn()
        except Exception as exc:
            logger.error("refresh %s / %s failed: %s", source_id, fn.__name__, exc)
            errors.append(str(exc))

    elapsed = round(time.monotonic() - t0, 2)
    if errors:
        raise HTTPException(status_code=500, detail="; ".join(errors))
    return {"ok": True, "source": source_id, "elapsed_s": elapsed}


@router.post("/admin/refresh")
async def refresh_all():
    """Trigger on-demand ingestion for every data source."""
    errors: dict[str, str] = {}
    t0 = time.monotonic()
    for fn in _ALL_JOBS:
        try:
            await fn()
        except Exception as exc:
            logger.error("refresh_all / %s failed: %s", fn.__name__, exc)
            errors[fn.__name__] = str(exc)

    elapsed = round(time.monotonic() - t0, 2)
    return {"ok": not errors, "errors": errors, "elapsed_s": elapsed}
