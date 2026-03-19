from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import Source, Observation

router = APIRouter()

VALID_SOURCES = {"gbif", "inat"}


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
