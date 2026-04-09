from __future__ import annotations
import os
from abc import ABC, abstractmethod
from datetime import date
from typing import Optional
import pandas as pd

from db import save_dataframe


class BaseJob(ABC):
    source_id: str
    name: str
    description: str
    category: str
    partition: str = "year_month"  # "year_month" | "year"
    requires_key: bool = False
    key_env_var: Optional[str] = None

    def key_configured(self) -> bool:
        if not self.requires_key or not self.key_env_var:
            return True
        return bool(os.getenv(self.key_env_var))

    def get_key(self) -> Optional[str]:
        if self.key_env_var:
            return os.getenv(self.key_env_var)
        return None

    @abstractmethod
    async def fetch(self, start_date: date, end_date: date) -> pd.DataFrame:
        """Fetch data and return as DataFrame with at least a 'date' column."""
        ...

    async def run(self, start_date: date, end_date: date) -> dict:
        df = await self.fetch(start_date, end_date)
        rows = save_dataframe(df, self.source_id, self.partition)
        return {"source_id": self.source_id, "rows_saved": rows}

    def to_info(self) -> dict:
        return {
            "id": self.source_id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "partition": self.partition,
            "requires_key": self.requires_key,
            "key_env_var": self.key_env_var,
            "key_configured": self.key_configured(),
        }
