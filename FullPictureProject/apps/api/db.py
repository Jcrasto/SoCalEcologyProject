"""Database utilities: DuckDB singleton, Parquet read/write helpers."""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import duckdb
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

logger = logging.getLogger(__name__)

# ─── Data directory ───────────────────────────────────────────────────────────
# Resolves to FullPictureProject/data/ regardless of cwd
DATA_DIR: Path = Path(__file__).resolve().parent.parent.parent / "data"

# ─── Ingestion timestamps ─────────────────────────────────────────────────────
last_ingestion: dict[str, datetime] = {}

# ─── DuckDB singleton ─────────────────────────────────────────────────────────
_connection: Optional[duckdb.DuckDBPyConnection] = None


def get_con() -> duckdb.DuckDBPyConnection:
    """Return a module-level singleton DuckDB connection with required extensions."""
    global _connection
    if _connection is None:
        _connection = duckdb.connect(database=":memory:", read_only=False)
        try:
            _connection.execute("INSTALL spatial; LOAD spatial;")
        except Exception as exc:
            logger.warning("Could not load DuckDB spatial extension: %s", exc)
        try:
            _connection.execute("INSTALL json; LOAD json;")
        except Exception as exc:
            logger.warning("Could not load DuckDB json extension: %s", exc)
    return _connection


def parquet_path(
    layer: str,
    date_str: Optional[str] = None,
    subdir: Optional[str] = None,
) -> Path:
    """
    Return the Parquet file path for a layer, creating parent directories.

    Layout examples
    ---------------
    layer="flights", date_str="2025-01-15"
        → data/flights/date=2025-01-15/data.parquet

    layer="fires", subdir="detections", date_str="2025-01-15"
        → data/fires/detections/date=2025-01-15/data.parquet

    layer="satellites", subdir="tle"
        → data/satellites/tle/data.parquet
    """
    base = DATA_DIR / layer
    if subdir:
        base = base / subdir
    if date_str:
        base = base / f"date={date_str}"
    base.mkdir(parents=True, exist_ok=True)
    return base / "data.parquet"


def write_parquet(
    df: pd.DataFrame,
    layer: str,
    date_str: Optional[str] = None,
    subdir: Optional[str] = None,
) -> None:
    """Write a DataFrame to the partitioned Parquet store."""
    if df.empty:
        logger.debug("write_parquet: empty DataFrame for layer=%s, skipping", layer)
        return
    path = parquet_path(layer, date_str=date_str, subdir=subdir)
    table = pa.Table.from_pandas(df, preserve_index=False)
    pq.write_table(table, str(path), compression="snappy")
    logger.debug("Wrote %d rows to %s", len(df), path)


def safe_read_parquet(glob_pattern: str) -> pd.DataFrame:
    """Read Parquet files matching a glob pattern; returns empty DataFrame if none exist."""
    import glob as _glob
    files = _glob.glob(glob_pattern)
    if not files:
        return pd.DataFrame()
    return query(f"SELECT * FROM read_parquet('{glob_pattern}')")


def query(sql: str, params=None) -> pd.DataFrame:
    """Execute a SQL statement against the DuckDB singleton and return a DataFrame."""
    con = get_con()
    try:
        if params:
            result = con.execute(sql, params)
        else:
            result = con.execute(sql)
        return result.df()
    except Exception as exc:
        logger.error("DuckDB query error: %s\nSQL: %s", exc, sql)
        return pd.DataFrame()
