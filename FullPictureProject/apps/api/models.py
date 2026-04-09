from __future__ import annotations
from typing import Optional
from datetime import date
from pydantic import BaseModel


class SourceInfo(BaseModel):
    id: str
    name: str
    description: str
    category: str
    partition: str  # "year_month" | "year"
    requires_key: bool
    key_env_var: Optional[str] = None
    key_configured: bool = False


class SourceStats(BaseModel):
    source_id: str
    has_data: bool
    count: int = 0
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class RefreshRequest(BaseModel):
    start_date: date
    end_date: date


class DataQuery(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    group_by: Optional[list[str]] = None  # ["city", "state", "country", "year", "month"]
    limit: int = 1000
