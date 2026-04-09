from __future__ import annotations
from pydantic import BaseModel
from fastapi import APIRouter

from jobs import REGISTRY
from db import execute_sql, get_schemas

router = APIRouter(tags=["sql"])

SOURCE_IDS = list(REGISTRY.keys())


class QueryRequest(BaseModel):
    sql: str


@router.post("/query")
def run_query(req: QueryRequest):
    return execute_sql(req.sql, SOURCE_IDS)


@router.get("/schema")
def schema():
    return get_schemas(SOURCE_IDS)
