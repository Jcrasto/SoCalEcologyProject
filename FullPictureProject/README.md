# FullPicture

A multi-source data platform for exploring economic, environmental, and weather data. Data is fetched from public APIs, stored locally as partitioned Parquet files, and queryable via a DuckDB-backed FastAPI backend with a React frontend.

---

## Table of Contents

- [Architecture](#architecture)
- [Running the Application](#running-the-application)
- [API Keys](#api-keys)
- [Data Sources](#data-sources)
- [Adding a New Data Source](#adding-a-new-data-source)
- [Refreshing Data via Script](#refreshing-data-via-script)
- [SQL Reference](#sql-reference)

---

## Architecture

```
FullPictureProject/
├── apps/
│   ├── api/                    # FastAPI backend
│   │   ├── main.py             # App entry point, router registration
│   │   ├── db.py               # DuckDB queries, Parquet read/write utilities
│   │   ├── models.py           # Pydantic request/response models
│   │   ├── jobs/               # Data fetcher jobs (one file per source)
│   │   │   ├── base.py         # BaseJob abstract class
│   │   │   ├── __init__.py     # Source registry (REGISTRY dict)
│   │   │   ├── weather.py
│   │   │   ├── electricity.py
│   │   │   └── ...
│   │   └── routers/            # API route handlers
│   │       ├── sources.py      # /sources — list, stats, preview, refresh
│   │       ├── data.py         # /data — filtered queries
│   │       └── query.py        # /query, /schema — SQL editor endpoints
│   └── web/                    # React frontend
│       └── src/
│           ├── App.tsx         # Layout, tab bar
│           ├── components/
│           │   ├── SourceList/ # Sidebar: data source list with live stats
│           │   ├── DataPreview/# Sortable preview table
│           │   ├── RefreshPanel/ # Date range picker + refresh trigger
│           │   ├── SqlEditor/  # SQL editor + schema browser
│           │   └── Globe/      # Cesium globe (lazy-loaded)
│           ├── stores/         # Zustand global state
│           ├── config/api.ts   # API endpoint constants
│           └── types/          # TypeScript interfaces
├── data/
│   └── parquet/                # Local Parquet storage (git-ignored)
│       ├── weather/
│       │   └── year=2024/
│       │       └── month=01/
│       │           └── data.parquet
│       ├── unemployment/
│       │   └── year=2024/
│       │       └── data.parquet
│       └── ...
├── scripts/
│   └── refresh_data.py         # CLI for triggering refreshes
└── dev.sh                      # Starts both API and web dev servers
```

### How data flows

1. **Refresh triggered** — user clicks Refresh in the UI (or runs `scripts/refresh_data.py`), which calls `POST /sources/{id}/refresh` with a date range.
2. **Job runs** — the matching `BaseJob` subclass fetches data from the upstream API and returns a pandas DataFrame.
3. **Saved as Parquet** — `db.save_dataframe()` partitions the DataFrame by year (or year/month for daily sources) and writes Parquet files under `data/parquet/{source_id}/`.
4. **Queried via DuckDB** — all reads go through DuckDB's `read_parquet(..., hive_partitioning=true)`, which pushes down date/location filters directly to the file system.
5. **SQL editor** — `POST /query` creates a DuckDB view per loaded source and executes arbitrary SQL against them.

### Parquet partitioning strategy

| Granularity | Partition scheme | Sources |
|---|---|---|
| Daily | `year={Y}/month={MM}/data.parquet` | weather, air_quality |
| Weekly / Monthly | `year={Y}/data.parquet` | electricity, natural_gas, gasoline, unemployment, interest_rates, market_indexes, world_bank |

Finer partitioning (year + month) is used when a source produces many rows per year to keep individual file sizes manageable.

### Tech stack

| Layer | Technology |
|---|---|
| Backend framework | FastAPI (Python 3.11+) |
| Query engine | DuckDB (in-process, no server) |
| Storage | Apache Parquet (hive-partitioned) |
| HTTP client | httpx (async) |
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| State management | Zustand |
| Data fetching | TanStack Query |
| Table rendering | TanStack Table |
| Globe | CesiumJS + resium (lazy-loaded) |
| Package management | uv (Python), npm (Node) |

---

## Running the Application

### Prerequisites

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) (`pip install uv` or `brew install uv`)
- Node.js 18+

### First run

```bash
# 1. Clone / enter the project
cd FullPictureProject

# 2. Copy and fill in API keys
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your keys (see API Keys section below)

# 3. Start everything
./dev.sh
```

`dev.sh` will:
- Create a Python venv at `apps/api/.venv` if it doesn't exist
- Install Python dependencies
- Install npm packages if `node_modules` is missing
- Start the API on **http://localhost:8000**
- Start the web dev server on **http://localhost:5173**

### Starting services individually

```bash
# API only
cd apps/api
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Web only
cd apps/web
npm run dev
```

### API docs (Swagger UI)

```
http://localhost:8000/docs
```

---

## API Keys

Copy `apps/api/.env.example` to `apps/api/.env` and fill in the keys you need.

| Variable | Source | Sign up |
|---|---|---|
| `FRED_API_KEY` | FRED (interest rates, market indexes) | https://fred.stlouisfed.org/docs/api/api_key.html |
| `EIA_API_KEY` | EIA (electricity, natural gas, gasoline) | https://www.eia.gov/opendata/ |
| `BLS_API_KEY` | BLS (unemployment) | https://www.bls.gov/developers/ |
| `EPA_API_KEY` | EPA AirNow (air quality) | https://docs.airnowapi.org/ |

Sources that need **no API key**: `weather` (Open-Meteo) and `world_bank` (World Bank Open Data).

The UI shows a warning icon next to any source whose key is missing, and the Refresh button is disabled for those sources.

---

## Data Sources

| ID | Name | Category | Key required | Geo level | Granularity |
|---|---|---|---|---|---|
| `weather` | Open-Meteo | Weather | No | City | Daily |
| `air_quality` | EPA AirNow | Environment | Yes (`EPA_API_KEY`) | City | Daily |
| `electricity` | EIA Retail Electricity | Energy Prices | Yes (`EIA_API_KEY`) | State | Monthly |
| `natural_gas` | EIA Natural Gas | Energy Prices | Yes (`EIA_API_KEY`) | State | Monthly |
| `gasoline` | EIA Gasoline Prices | Energy Prices | Yes (`EIA_API_KEY`) | Metro region | Weekly |
| `unemployment` | BLS LAUS | Labor | Yes (`BLS_API_KEY`) | State | Monthly |
| `interest_rates` | FRED | Finance | Yes (`FRED_API_KEY`) | National | Daily |
| `market_indexes` | FRED | Finance | Yes (`FRED_API_KEY`) | National | Daily |
| `world_bank` | World Bank | Economics | No | Country | Annual |

---

## Adding a New Data Source

Adding a source requires changes in two places: a new job file and one line in the registry. The frontend picks it up automatically.

### Step 1 — Create the job file

Create `apps/api/jobs/my_source.py`:

```python
from __future__ import annotations
from datetime import date
import httpx
import pandas as pd
from jobs.base import BaseJob


class MySourceJob(BaseJob):
    source_id = "my_source"          # used as the table name in SQL and the parquet folder name
    name = "My Source (Provider)"   # display name in the UI
    description = "One-line description of what this data is."
    category = "My Category"        # groups sources in the sidebar
    partition = "year"               # "year" for monthly/annual data, "year_month" for daily data
    requires_key = True              # set False if no API key needed
    key_env_var = "MY_SOURCE_API_KEY"  # env var name; omit or set None if requires_key = False

    async def fetch(self, start_date: date, end_date: date) -> pd.DataFrame:
        key = self.get_key()
        records = []

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                "https://api.example.com/data",
                params={"start": str(start_date), "end": str(end_date), "api_key": key},
            )
            resp.raise_for_status()
            for row in resp.json().get("data", []):
                records.append({
                    "date": row["period"],      # required — used for partitioning and stats
                    "city": row.get("city"),    # optional location fields
                    "state": row.get("state"),
                    "country": row.get("country"),
                    "lat": row.get("lat"),      # optional — used by the globe
                    "lon": row.get("lon"),
                    "value": row["value"],      # source-specific columns
                })

        return pd.DataFrame(records) if records else pd.DataFrame()
```

**Rules for the returned DataFrame:**
- Must have a `date` column (string `"YYYY-MM-DD"` or datetime). This is required for partitioning and the stats endpoints.
- Include `city`, `state`, `country` where applicable — leave as `None` for levels that don't apply.
- Include `lat`/`lon` if you want data points to appear on the globe.
- All other columns are arbitrary and will be reflected automatically in the schema browser and SQL editor.

### Step 2 — Register the job

Open `apps/api/jobs/__init__.py` and add two lines:

```python
from jobs.my_source import MySourceJob   # add this import

REGISTRY: dict = {
    job.source_id: job
    for job in [
        WeatherJob(),
        # ... existing jobs ...
        MySourceJob(),                   # add this entry
    ]
}
```

That's it. The source will now appear in:
- The **Explorer** sidebar (with live stats once data is loaded)
- The **SQL editor** schema panel (once data is loaded)
- `GET /sources` API response
- `scripts/refresh_data.py --list`

### Step 3 — Add your API key (if needed)

Add the key to `apps/api/.env`:

```
MY_SOURCE_API_KEY=your_key_here
```

And document it in `apps/api/.env.example`:

```
MY_SOURCE_API_KEY=your_my_source_api_key_here
```

### Choosing partition granularity

| Your data | Set `partition =` |
|---|---|
| Daily or more frequent | `"year_month"` |
| Weekly, monthly, or annual | `"year"` |

Use `"year_month"` when you expect tens of thousands of rows per year (e.g. daily data across many cities). Use `"year"` otherwise to keep the file count low.

---

## Refreshing Data via Script

Use `scripts/refresh_data.py` to trigger refreshes from the command line without opening the UI. The API must be running.

```bash
# List all sources and their key status
python scripts/refresh_data.py --list

# Refresh a single source
python scripts/refresh_data.py --source weather --start 2024-01-01 --end 2024-12-31

# Refresh all sources for a date range
python scripts/refresh_data.py --all --start 2023-01-01 --end 2024-12-31

# Target a non-default API URL
python scripts/refresh_data.py --source weather --start 2024-01-01 --end 2024-12-31 --base-url http://myserver:8000
```

Refreshes run as background tasks on the API — the script returns immediately after queuing. Re-running the same date range overwrites the existing Parquet files for those partitions.

---

## SQL Reference

The SQL editor uses **DuckDB SQL**, which is Postgres-compatible with extensions. Each loaded source is available as a view using its `source_id` as the table name.

### Useful queries

```sql
-- Preview any source
SELECT * FROM weather LIMIT 20

-- Filter by location
SELECT * FROM unemployment WHERE state = 'CA' ORDER BY date DESC LIMIT 20

-- Aggregate by state
SELECT state, AVG(unemployment_rate) AS avg_rate
FROM unemployment
GROUP BY state ORDER BY avg_rate DESC

-- Join two sources on date
SELECT w.date, w.city, w.temperature_2m_max, a.aqi
FROM weather w
JOIN air_quality a ON w.date = a.date AND w.city = a.city
ORDER BY w.date DESC LIMIT 20

-- Compare interest rates over time
SELECT date, series_name, rate_pct
FROM interest_rates
WHERE series_id IN ('FEDFUNDS', 'DGS10', 'MORTGAGE30US')
ORDER BY date DESC LIMIT 60

-- World Bank: latest GDP per capita by country
SELECT country, MAX(date) AS latest_year, AVG(value) AS avg_gdp
FROM world_bank
WHERE indicator_id = 'NY.GDP.PCAP.CD'
GROUP BY country ORDER BY avg_gdp DESC LIMIT 30
```

### DuckDB-specific syntax

```sql
-- Exclude columns
SELECT * EXCLUDE (city, state) FROM weather LIMIT 10

-- Cast
SELECT value::DOUBLE, date::DATE FROM world_bank LIMIT 5

-- Date truncation
SELECT DATE_TRUNC('month', date) AS month, AVG(temperature_2m_max) AS avg_max
FROM weather GROUP BY 1 ORDER BY 1

-- Regex column selection
SELECT COLUMNS('price.*') FROM gasoline LIMIT 5
```

Full DuckDB SQL reference: https://duckdb.org/docs/sql/introduction
