from __future__ import annotations
import os
from pathlib import Path
from typing import Optional
import duckdb
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(os.getenv("DATA_DIR", "../../data")).resolve()
PARQUET_DIR = DATA_DIR / "parquet"


def source_dir(source_id: str) -> Path:
    return PARQUET_DIR / source_id


def get_conn() -> duckdb.DuckDBPyConnection:
    return duckdb.connect(database=":memory:")


def parquet_glob(source_id: str) -> str:
    """Glob pattern to read all parquet files for a source using hive partitioning."""
    return str(source_dir(source_id) / "**" / "*.parquet")


def source_has_data(source_id: str) -> bool:
    d = source_dir(source_id)
    if not d.exists():
        return False
    return any(d.rglob("*.parquet"))


def get_source_stats(source_id: str) -> dict:
    if not source_has_data(source_id):
        return {"has_data": False, "count": 0, "start_date": None, "end_date": None}

    glob = parquet_glob(source_id)
    conn = get_conn()
    try:
        row = conn.execute(
            f"SELECT COUNT(*) AS cnt, MIN(date) AS start_date, MAX(date) AS end_date "
            f"FROM read_parquet('{glob}', hive_partitioning=true)"
        ).fetchone()
        return {
            "has_data": True,
            "count": int(row[0]),
            "start_date": row[1],
            "end_date": row[2],
        }
    except Exception:
        return {"has_data": False, "count": 0, "start_date": None, "end_date": None}
    finally:
        conn.close()


def get_preview(source_id: str, limit: int = 100) -> list[dict]:
    if not source_has_data(source_id):
        return []

    glob = parquet_glob(source_id)
    conn = get_conn()
    try:
        df = conn.execute(
            f"SELECT * FROM read_parquet('{glob}', hive_partitioning=true) "
            f"ORDER BY date DESC LIMIT {limit}"
        ).df()
        return df.to_dict(orient="records")
    except Exception:
        return []
    finally:
        conn.close()


def query_data(
    source_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    country: Optional[str] = None,
    group_by: Optional[list[str]] = None,
    limit: int = 1000,
) -> list[dict]:
    if not source_has_data(source_id):
        return []

    glob = parquet_glob(source_id)
    conn = get_conn()

    conditions = []
    if start_date:
        conditions.append(f"date >= '{start_date}'")
    if end_date:
        conditions.append(f"date <= '{end_date}'")
    if city:
        conditions.append(f"LOWER(city) = LOWER('{city}')")
    if state:
        conditions.append(f"LOWER(state) = LOWER('{state}')")
    if country:
        conditions.append(f"LOWER(country) = LOWER('{country}')")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    try:
        if group_by:
            agg_cols = ", ".join(group_by)
            sql = (
                f"SELECT {agg_cols}, COUNT(*) AS count "
                f"FROM read_parquet('{glob}', hive_partitioning=true) "
                f"{where} GROUP BY {agg_cols} ORDER BY {group_by[0]} LIMIT {limit}"
            )
        else:
            sql = (
                f"SELECT * FROM read_parquet('{glob}', hive_partitioning=true) "
                f"{where} ORDER BY date DESC LIMIT {limit}"
            )
        df = conn.execute(sql).df()
        return df.to_dict(orient="records")
    except Exception:
        return []
    finally:
        conn.close()


def build_conn_with_views(source_ids: list[str]) -> duckdb.DuckDBPyConnection:
    """Open a connection and register a view for every source that has parquet data."""
    conn = duckdb.connect(database=":memory:")
    for sid in source_ids:
        if source_has_data(sid):
            glob = parquet_glob(sid)
            conn.execute(
                f"CREATE OR REPLACE VIEW {sid} AS "
                f"SELECT * FROM read_parquet('{glob}', hive_partitioning=true)"
            )
    return conn


def execute_sql(sql: str, source_ids: list[str]) -> dict:
    """Execute arbitrary SQL with views registered for each loaded source."""
    import time
    conn = build_conn_with_views(source_ids)
    start = time.perf_counter()
    try:
        rel = conn.execute(sql)
        # Capture DuckDB column types before converting to DataFrame
        type_map = {desc[0]: str(desc[1]) for desc in (conn.description or [])}
        df = rel.df()
        elapsed = time.perf_counter() - start
        # Use pandas' own JSON serialiser to handle all numpy/date scalar types,
        # then parse back to plain Python — avoids FastAPI encoder issues entirely.
        import json
        rows = json.loads(df.to_json(orient="records", date_format="iso", default_handler=str))
        columns = [{"name": col, "type": type_map.get(col, str(df[col].dtype))} for col in df.columns]
        return {
            "ok": True,
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "elapsed_ms": round(elapsed * 1000, 1),
        }
    except Exception as e:
        elapsed = time.perf_counter() - start
        return {"ok": False, "error": str(e), "elapsed_ms": round(elapsed * 1000, 1)}
    finally:
        conn.close()


def get_schemas(source_ids: list[str]) -> list[dict]:
    """Return column names + types for every source that has data."""
    schemas = []
    for sid in source_ids:
        if not source_has_data(sid):
            continue
        conn = get_conn()
        try:
            glob = parquet_glob(sid)
            conn.execute(
                f"SELECT * FROM read_parquet('{glob}', hive_partitioning=true) LIMIT 0"
            )
            columns = [
                {"name": desc[0], "type": str(desc[1])}
                for desc in (conn.description or [])
            ]
            schemas.append({"table": sid, "columns": columns})
        except Exception:
            pass
        finally:
            conn.close()
    return schemas


def save_dataframe(df: pd.DataFrame, source_id: str, partition: str) -> int:
    """
    Save a DataFrame to partitioned parquet files.
    partition: "year_month" or "year"
    DataFrame must have a 'date' column (datetime or date).
    """
    if df.empty:
        return 0

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])

    if partition == "year_month":
        df["_year"] = df["date"].dt.year
        df["_month"] = df["date"].dt.month
        groups = df.groupby(["_year", "_month"])
        for (year, month), chunk in groups:
            out = source_dir(source_id) / f"year={year}" / f"month={month:02d}"
            out.mkdir(parents=True, exist_ok=True)
            chunk.drop(columns=["_year", "_month"]).to_parquet(
                out / "data.parquet", index=False
            )
    else:  # year
        df["_year"] = df["date"].dt.year
        groups = df.groupby("_year")
        for year, chunk in groups:
            out = source_dir(source_id) / f"year={year}"
            out.mkdir(parents=True, exist_ok=True)
            chunk.drop(columns=["_year"]).to_parquet(out / "data.parquet", index=False)

    return len(df)
