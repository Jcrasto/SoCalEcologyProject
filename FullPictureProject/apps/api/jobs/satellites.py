"""Ingest satellite TLE data from Celestrak every 6 hours."""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
import pandas as pd

from db import last_ingestion, write_parquet

logger = logging.getLogger(__name__)

TLE_URLS = {
    "active": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=TLE",
    "visual": "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=TLE",
    "starlink": "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=TLE",
}


def _parse_tle_text(text: str) -> list[dict]:
    """Parse TLE text into a list of dicts with name, line1, line2, norad_id."""
    rows = []
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]
    i = 0
    while i + 2 < len(lines):
        name = lines[i].strip()
        line1 = lines[i + 1].strip()
        line2 = lines[i + 2].strip()
        if line1.startswith("1 ") and line2.startswith("2 "):
            try:
                norad_id = int(line1[2:7])
                # Epoch from TLE line1: columns 19-32
                epoch_str = line1[18:32].strip()
                epoch = _parse_tle_epoch(epoch_str)
            except Exception:
                norad_id = 0
                epoch = None
            rows.append({
                "name": name,
                "tle_line1": line1,
                "tle_line2": line2,
                "norad_id": norad_id,
                "epoch": epoch.isoformat() if epoch else "",
            })
            i += 3
        else:
            i += 1
    return rows


def _parse_tle_epoch(epoch_str: str) -> Optional[datetime]:
    """Convert TLE epoch (YYDDD.DDDDDDDD) to a UTC datetime."""
    try:
        year_2 = int(epoch_str[:2])
        year = 2000 + year_2 if year_2 < 57 else 1900 + year_2
        day_of_year = float(epoch_str[2:])
        base = datetime(year, 1, 1, tzinfo=timezone.utc)
        from datetime import timedelta
        dt = base + timedelta(days=day_of_year - 1)
        return dt
    except Exception:
        return None


async def ingest_satellites() -> None:
    try:
        all_rows: list[dict] = []
        async with httpx.AsyncClient(timeout=60) as client:
            for name, url in TLE_URLS.items():
                try:
                    resp = await client.get(url)
                    resp.raise_for_status()
                    rows = _parse_tle_text(resp.text)
                    all_rows.extend(rows)
                    logger.debug("Satellites: fetched %d TLEs from %s", len(rows), name)
                except Exception as exc:
                    logger.warning("TLE fetch error for %s: %s", name, exc)

        if not all_rows:
            return

        now = datetime.now(timezone.utc)
        df = pd.DataFrame(all_rows)
        df["fetched_at"] = now.isoformat()
        # Deduplicate on norad_id, keep last
        df = df.drop_duplicates(subset=["norad_id"], keep="last")

        write_parquet(df, "satellites", subdir="tle")
        last_ingestion["satellites"] = now
        logger.info("Satellites: stored %d TLE records", len(df))

    except Exception as exc:
        logger.error("ingest_satellites error: %s", exc)
