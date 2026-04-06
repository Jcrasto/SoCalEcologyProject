"""Prices layer REST endpoint."""

from fastapi import APIRouter, Query, HTTPException

from db import DATA_DIR, safe_read_parquet

router = APIRouter()


@router.get("/layers/prices")
async def get_prices(
    series_id: str = Query(..., description="Price series ID (e.g. EMM_EPMRU_PTE_SCA_DPG)"),
):
    # Get series metadata
    series_pattern = str(DATA_DIR / "prices" / "series" / "*.parquet")
    series_df = safe_read_parquet(series_pattern)

    series_name = None
    unit = None
    if not series_df.empty and "series_id" in series_df.columns:
        match = series_df[series_df["series_id"] == series_id]
        if not match.empty:
            series_name = str(match.iloc[0].get("series_name", ""))
            unit = str(match.iloc[0].get("unit", ""))

    # Get observations
    obs_pattern = str(DATA_DIR / "prices" / "observations" / "*.parquet")
    obs_df = safe_read_parquet(obs_pattern)

    observations = []
    if not obs_df.empty and "series_id" in obs_df.columns:
        filtered = obs_df[obs_df["series_id"] == series_id].copy()
        if "period_date" in filtered.columns:
            filtered = filtered.sort_values("period_date")
        for _, row in filtered.iterrows():
            val = row.get("value")
            try:
                val = float(val)
            except (TypeError, ValueError):
                val = None
            observations.append({
                "date": str(row.get("period_date", "")),
                "value": val,
            })

    return {
        "series_id": series_id,
        "series_name": series_name,
        "unit": unit,
        "observations": observations,
    }
