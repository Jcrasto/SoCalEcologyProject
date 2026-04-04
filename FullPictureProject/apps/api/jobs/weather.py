"""Ingest NOAA NWS weather alerts and observations."""

import logging
from datetime import datetime, timezone

import httpx
import pandas as pd

from db import last_ingestion, write_parquet

logger = logging.getLogger(__name__)

NWS_HEADERS = {"User-Agent": "FullPictureProject/1.0 (contact@example.com)"}
SOCAL_BBOX = (-120.5, 31.0, -115.0, 36.0)


async def ingest_weather_alerts() -> None:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                "https://api.weather.gov/alerts/active?area=CA",
                headers=NWS_HEADERS,
            )
            resp.raise_for_status()
            fc = resp.json()

        rows = []
        for feat in fc.get("features", []):
            props = feat.get("properties", {})
            geom = feat.get("geometry")
            rows.append({
                "alert_id": props.get("id", ""),
                "event": props.get("event", ""),
                "severity": props.get("severity", ""),
                "headline": props.get("headline", ""),
                "description": str(props.get("description", ""))[:500],
                "expires": str(props.get("expires", "")),
                "geometry_json": str(geom) if geom else None,
            })

        if not rows:
            return

        now = datetime.now(timezone.utc)
        df = pd.DataFrame(rows)
        write_parquet(df, "weather", subdir="alerts", date_str=now.strftime("%Y-%m-%d"))
        last_ingestion["weather_alerts"] = now
        logger.debug("Weather alerts: %d active for CA", len(df))

    except Exception as exc:
        logger.error("ingest_weather_alerts error: %s", exc)


# Sample grid points covering SoCal bbox
_GRID_POINTS = [
    (32.7, -117.2),  # San Diego
    (33.5, -118.2),  # Los Angeles
    (34.0, -118.5),  # Santa Monica
    (34.4, -119.7),  # Santa Barbara
    (33.8, -117.9),  # Orange County
    (33.9, -116.5),  # Palm Springs
]


async def ingest_weather_obs() -> None:
    try:
        rows = []
        async with httpx.AsyncClient(timeout=30) as client:
            for lat, lon in _GRID_POINTS:
                try:
                    pt_resp = await client.get(
                        f"https://api.weather.gov/points/{lat},{lon}",
                        headers=NWS_HEADERS,
                    )
                    if pt_resp.status_code != 200:
                        continue
                    pt_data = pt_resp.json()
                    hourly_url = (
                        pt_data.get("properties", {})
                        .get("forecastHourly")
                    )
                    if not hourly_url:
                        continue

                    fc_resp = await client.get(hourly_url, headers=NWS_HEADERS)
                    if fc_resp.status_code != 200:
                        continue
                    fc_data = fc_resp.json()
                    periods = fc_data.get("properties", {}).get("periods", [])
                    if not periods:
                        continue

                    p = periods[0]
                    rows.append({
                        "lat": lat,
                        "lon": lon,
                        "temperature_f": p.get("temperature"),
                        "wind_speed": p.get("windSpeed", ""),
                        "wind_direction": p.get("windDirection", ""),
                        "short_forecast": p.get("shortForecast", ""),
                        "start_time": p.get("startTime", ""),
                    })
                except Exception:
                    continue

        if not rows:
            return

        now = datetime.now(timezone.utc)
        df = pd.DataFrame(rows)
        write_parquet(df, "weather", subdir="observations", date_str=now.strftime("%Y-%m-%d"))
        last_ingestion["weather_obs"] = now
        logger.debug("Weather obs: %d grid points", len(df))

    except Exception as exc:
        logger.error("ingest_weather_obs error: %s", exc)
