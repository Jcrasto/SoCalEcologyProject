from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from jobs import REGISTRY
from db import query_data

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/{source_id}")
def get_data(
    source_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    group_by: Optional[str] = Query(None, description="Comma-separated: city,state,country,year,month"),
    limit: int = Query(1000, le=10000),
):
    if source_id not in REGISTRY:
        raise HTTPException(404, f"Source '{source_id}' not found")

    group_by_list = [g.strip() for g in group_by.split(",")] if group_by else None

    rows = query_data(
        source_id=source_id,
        start_date=start_date,
        end_date=end_date,
        city=city,
        state=state,
        country=country,
        group_by=group_by_list,
        limit=limit,
    )
    return {"source_id": source_id, "rows": rows, "count": len(rows)}
