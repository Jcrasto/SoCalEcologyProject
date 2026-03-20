import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import func, Integer
from sqlalchemy.orm import Session
from backend.db import get_db, engine
from backend.models import Source, Observation, Image, Species

router = APIRouter()

VALID_SOURCES = {"gbif", "inat"}

BASE_DIR = Path(__file__).parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = BASE_DIR / "oaks.db"


@router.get("/sources")
def list_sources(db: Session = Depends(get_db)):
    """
    List all data sources with the count of observations imported from each.
    """
    sources = db.query(Source).all()

    # Build a count map from observations table
    counts_q = (
        db.query(Observation.source, func.count(Observation.obs_id))
        .group_by(Observation.source)
        .all()
    )
    counts = {row[0]: row[1] for row in counts_q}

    return [
        {
            "source_code": s.source_code,
            "name": s.name,
            "url": s.url,
            "license": s.license,
            "observation_count": counts.get(s.source_code, 0),
        }
        for s in sources
    ]


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """
    Return a comprehensive snapshot of the database:
    total observations, images, curated count, DB file size,
    and per-species breakdowns.

    Uses bulk GROUP BY queries instead of per-species loops to avoid N+1.
    """
    # DB file size
    db_size_bytes = DB_PATH.stat().st_size if DB_PATH.exists() else 0

    # --- Bulk aggregate queries (one pass each, not one per species) ----------

    # Obs count, curated count, and import date range — all in one query
    totals = db.query(
        func.count(Observation.obs_id),
        func.sum(func.cast(Observation.curated, Integer)),
        func.min(Observation.import_date),
        func.max(Observation.import_date),
    ).first()
    total_obs, total_curated, first_import, last_import = totals
    total_curated = total_curated or 0

    # Total images
    total_images = db.query(func.count(Image.img_id)).scalar()

    # Obs counts by source (global)
    obs_by_source = {
        row[0]: row[1]
        for row in db.query(Observation.source, func.count(Observation.obs_id))
        .group_by(Observation.source)
        .all()
    }

    # Per-species obs counts broken down by source — one query for all species
    source_counts_all = db.query(
        Observation.species_id,
        Observation.source,
        func.count(Observation.obs_id),
    ).group_by(Observation.species_id, Observation.source).all()

    # Per-species curated counts — one query
    curated_by_species = {
        row[0]: row[1]
        for row in db.query(Observation.species_id, func.count(Observation.obs_id))
        .filter(Observation.curated == True)
        .group_by(Observation.species_id)
        .all()
    }

    # Per-species date ranges — one query
    date_ranges = {
        row[0]: (row[1], row[2])
        for row in db.query(
            Observation.species_id,
            func.min(Observation.obs_date),
            func.max(Observation.obs_date),
        ).group_by(Observation.species_id).all()
    }

    # Per-species image counts — one query
    image_counts = {
        row[0]: row[1]
        for row in db.query(Image.species_id, func.count(Image.img_id))
        .group_by(Image.species_id)
        .all()
    }

    # Restructure source counts into {species_id: {source: count}}
    sc: dict = {}
    for species_id, source, count in source_counts_all:
        sc.setdefault(species_id, {})[source] = count

    # Assemble per-species rows from the pre-fetched bulk data
    all_species = db.query(Species).all()
    species_stats = []
    for sp in all_species:
        sid = sp.species_id
        dr = date_ranges.get(sid, (None, None))
        species_stats.append({
            "species_id": sid,
            "common_name": sp.common_name,
            "scientific_name": sp.scientific_name,
            "gbif_count": sc.get(sid, {}).get("gbif", 0),
            "inat_count": sc.get(sid, {}).get("inat", 0),
            "image_count": image_counts.get(sid, 0),
            "curated_count": curated_by_species.get(sid, 0),
            "earliest_obs": str(dr[0]) if dr[0] else None,
            "latest_obs": str(dr[1]) if dr[1] else None,
        })

    return {
        "db_path": str(DB_PATH),
        "db_size_bytes": db_size_bytes,
        "total_observations": total_obs,
        "total_images": total_images,
        "total_curated": total_curated,
        "obs_by_source": obs_by_source,
        "first_import": str(first_import) if first_import else None,
        "last_import": str(last_import) if last_import else None,
        "species": species_stats,
    }


@router.get("/files")
def list_data_files():
    """
    List all static export files in /data/occurrences/ and /data/photos/,
    including file size and record count.
    """
    result = {"occurrences": [], "photos": []}

    for category in ("occurrences", "photos"):
        folder = DATA_DIR / category
        if not folder.exists():
            continue
        for fpath in sorted(folder.iterdir()):
            if not fpath.is_file():
                continue
            size = fpath.stat().st_size
            record_count = None
            try:
                with open(fpath, encoding="utf-8") as fh:
                    data = json.load(fh)
                if category == "occurrences":
                    # GeoJSON FeatureCollection
                    record_count = len(data.get("features", []))
                else:
                    # JSON array of photos
                    record_count = len(data) if isinstance(data, list) else None
            except Exception:
                pass
            result[category].append({
                "filename": fpath.name,
                "path": str(fpath.relative_to(BASE_DIR)),
                "size_bytes": size,
                "record_count": record_count,
            })

    return result


@router.get("/tables")
def list_tables(preview: int = 20):
    """
    Return schema info + a data preview for every table in the database.
    """
    from sqlalchemy import inspect as sa_inspect, text

    inspector = sa_inspect(engine)
    table_names = inspector.get_table_names()

    result = []
    with engine.connect() as conn:
        for table in table_names:
            # Column metadata
            pk_cols = set(inspector.get_pk_constraint(table).get("constrained_columns", []))
            columns = [
                {
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "primary_key": col["name"] in pk_cols,
                }
                for col in inspector.get_columns(table)
            ]

            # Row count
            count_row = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar()

            # Preview rows — coerce all values to JSON-safe types
            rows_raw = conn.execute(text(f'SELECT * FROM "{table}" LIMIT {preview}')).mappings().all()
            rows = []
            for row in rows_raw:
                safe = {}
                for k, v in row.items():
                    if hasattr(v, "isoformat"):
                        safe[k] = v.isoformat()
                    elif v is None or isinstance(v, (str, int, float, bool)):
                        safe[k] = v
                    else:
                        safe[k] = str(v)
                rows.append(safe)

            result.append({
                "table": table,
                "row_count": count_row,
                "columns": columns,
                "preview": rows,
            })

    return result


@router.post("/fetch/{source}", status_code=202)
def trigger_fetch(source: str):
    """
    Stub endpoint to trigger a data fetch for a given source.
    In production this would enqueue a background task.
    """
    if source not in VALID_SOURCES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown source '{source}'. Valid sources: {sorted(VALID_SOURCES)}",
        )

    return JSONResponse(
        status_code=202,
        content={
            "message": f"Fetch queued for source '{source}'. "
                       f"Run `python scripts/fetch-data.py` to execute manually.",
            "source": source,
        },
    )
