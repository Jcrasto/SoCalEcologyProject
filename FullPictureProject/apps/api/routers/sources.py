from __future__ import annotations
from fastapi import APIRouter, HTTPException, BackgroundTasks

from jobs import REGISTRY
from db import get_source_stats, get_preview
from models import SourceInfo, SourceStats, RefreshRequest

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceInfo])
def list_sources():
    return [job.to_info() for job in REGISTRY.values()]


@router.get("/{source_id}/stats", response_model=SourceStats)
def source_stats(source_id: str):
    if source_id not in REGISTRY:
        raise HTTPException(404, f"Source '{source_id}' not found")
    stats = get_source_stats(source_id)
    return SourceStats(source_id=source_id, **stats)


@router.get("/{source_id}/preview")
def source_preview(source_id: str, limit: int = 100):
    if source_id not in REGISTRY:
        raise HTTPException(404, f"Source '{source_id}' not found")
    rows = get_preview(source_id, limit=limit)
    return {"source_id": source_id, "rows": rows, "count": len(rows)}


async def _run_refresh(source_id: str, req: RefreshRequest):
    job = REGISTRY[source_id]
    return await job.run(req.start_date, req.end_date)


@router.post("/{source_id}/refresh")
async def refresh_source(
    source_id: str,
    req: RefreshRequest,
    background_tasks: BackgroundTasks,
):
    if source_id not in REGISTRY:
        raise HTTPException(404, f"Source '{source_id}' not found")
    job = REGISTRY[source_id]
    if job.requires_key and not job.key_configured():
        raise HTTPException(
            400,
            f"API key not configured. Set {job.key_env_var} in your .env file.",
        )
    background_tasks.add_task(_run_refresh, source_id, req)
    return {
        "status": "queued",
        "source_id": source_id,
        "start_date": str(req.start_date),
        "end_date": str(req.end_date),
    }
