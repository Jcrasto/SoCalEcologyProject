# Full Picture — Southern California Geospatial Monitor

A real-time geospatial monitoring platform that aggregates flights, earthquakes, vessels, fires, weather alerts, tides, satellites, traffic, and commodity prices into a single 3D globe view.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Running the App](#running-the-app)
- [Data Sources Reference](#data-sources-reference)
- [Adding a New Data Source](#adding-a-new-data-source)
  - [Step 1 — Write the ingestion job](#step-1--write-the-ingestion-job)
  - [Step 2 — Write the API router](#step-2--write-the-api-router)
  - [Step 3 — Register the router and scheduler job](#step-3--register-the-router-and-scheduler-job)
  - [Step 4 — Add the TypeScript type](#step-4--add-the-typescript-type)
  - [Step 5 — Add state to the Zustand store](#step-5--add-state-to-the-zustand-store)
  - [Step 6 — Add polling in useLayerData](#step-6--add-polling-in-uselayerdata)
  - [Step 7 — Subscribe via WebSocket](#step-7--subscribe-via-websocket)
  - [Step 8 — Render on the globe](#step-8--render-on-the-globe)
  - [Step 9 — Add to the Layer Panel](#step-9--add-to-the-layer-panel)
  - [Step 10 — Add to the Data Explorer](#step-10--add-to-the-data-explorer)
  - [Checklist](#checklist)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│                                                              │
│  App.tsx ──► CesiumGlobe.tsx   (3D rendering)               │
│          ├─► LayerPanel.tsx    (toggles + live counts)       │
│          ├─► TideChart.tsx     (recharts tide overlay)       │
│          └─► DataExplorer.tsx  (table preview page)          │
│                                                              │
│  State:  layerStore.ts  (Zustand)                           │
│  Fetch:  useLayerData.ts  (HTTP polling per layer)          │
│  Push:   useWebSocket.ts  (WS real-time updates & alerts)   │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP + WebSocket
┌────────────────────▼────────────────────────────────────────┐
│                    FastAPI  (port 8009)                      │
│                                                              │
│  GET /api/v1/layers/<name>   ←── routers/<name>.py          │
│  GET /api/v1/admin/tables    ←── routers/explorer.py        │
│  WS  /ws                     ←── ws.py                      │
│                                                              │
│  APScheduler  ──► jobs/<name>.py  (fetch → Parquet → WS)    │
└────────────────────┬────────────────────────────────────────┘
                     │ DuckDB reads Parquet files
┌────────────────────▼────────────────────────────────────────┐
│                 data/<layer>/date=YYYY-MM-DD/                │
│                         data.parquet                        │
└─────────────────────────────────────────────────────────────┘
```

**Key technology choices:**

| Concern | Choice |
|---|---|
| 3D visualization | Cesium.js (`PointPrimitiveCollection`, `PolylineCollection`, GeoJSON) |
| State management | Zustand (`layerStore.ts`) |
| Data transport | HTTP polling (per-layer intervals) + WebSocket push |
| Storage | Apache Parquet via PyArrow; queried in-process by DuckDB |
| Task scheduling | APScheduler (AsyncIOScheduler) inside FastAPI lifespan |

---

## Running the App

```bash
# From the project root
./dev.sh
```

Backend starts on `http://localhost:8009`, frontend on `http://localhost:5174`.

Environment variables are loaded from `apps/api/.env`:

```
OPENSKY_USERNAME=          # optional — improves flight rate limits
OPENSKY_PASSWORD=
AISHUB_USERNAME=           # required for vessels
NASA_FIRMS_KEY=            # required for fire detections
HERE_API_KEY=              # required for traffic
EIA_API_KEY=               # required for energy prices
FRED_API_KEY=              # required for commodity prices
PORT=8009
LOG_LEVEL=info
```

---

## Data Sources Reference

| Layer | Parquet path | API endpoint | Update interval |
|---|---|---|---|
| flights | `data/flights/date=*/data.parquet` | `GET /api/v1/layers/flights` | 15 s |
| earthquakes | `data/earthquakes/data.parquet` | `GET /api/v1/layers/earthquakes` | 5 min |
| vessels | `data/vessels/date=*/data.parquet` | `GET /api/v1/layers/vessels` | 24 h |
| fires (detections) | `data/fires/detections/date=*/data.parquet` | `GET /api/v1/layers/fires` | 15 min |
| fires (perimeters) | `data/fires/perimeters/date=*/data.parquet` | `GET /api/v1/layers/fires` | 1 h |
| weather alerts | `data/weather/alerts/date=*/data.parquet` | `GET /api/v1/layers/weather/alerts` | 5 min |
| tides | `data/tides/station=*/date=*/data.parquet` | `GET /api/v1/layers/tides` | 6 min |
| satellites | `data/satellites/tle/data.parquet` | `GET /api/v1/layers/satellites` | 6 h |
| traffic | `data/traffic/date=*/data.parquet` | `GET /api/v1/layers/traffic` | 5 min |
| prices | `data/prices/series/*.parquet` | `GET /api/v1/layers/prices` | 24 h |

---

## Adding a New Data Source

This walkthrough adds a hypothetical **Air Quality** layer (`air_quality`) that fetches PM2.5 readings and renders them as colored points on the globe. Substitute your own layer name, fields, and rendering logic throughout.

The changes touch **10 files** across the backend and frontend. Each step below shows exactly what to add and where.

---

### Step 1 — Write the ingestion job

**File: `apps/api/jobs/air_quality.py`** *(create new)*

The job is an `async` function that:
1. Fetches data from an external API
2. Normalises it into a flat Pandas DataFrame
3. Writes (or upserts) to a Parquet file via `write_parquet()`
4. Optionally broadcasts real-time alerts via the WebSocket manager

```python
"""Air quality ingestion job — fetches PM2.5 readings."""

import logging
from datetime import datetime, timezone

import httpx
import pandas as pd

from db import DATA_DIR, safe_read_parquet, write_parquet
from ws import manager                # WebSocket broadcast manager

logger = logging.getLogger(__name__)

# Geographic bounds (match apps/api/lib/geo.py)
BBOX = {"lat_min": 31.0, "lat_max": 36.0, "lon_min": -120.5, "lon_max": -115.0}


async def ingest_air_quality() -> None:
    url = "https://api.example.com/air_quality"
    params = {**BBOX, "parameter": "pm25"}

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            raw = resp.json()
    except Exception as exc:
        logger.warning("air_quality fetch failed: %s", exc)
        return

    rows = []
    for item in raw.get("results", []):
        rows.append({
            "station_id":  item["locationId"],
            "station_name": item.get("location", ""),
            "lat":          item["coordinates"]["latitude"],
            "lon":          item["coordinates"]["longitude"],
            "pm25":         item.get("value"),
            "aqi":          item.get("aqi"),
            "recorded_at":  item.get("date", {}).get("utc", ""),
        })

    if not rows:
        logger.info("air_quality: no rows returned")
        return

    new_df = pd.DataFrame(rows)

    # --- Upsert: merge with any existing records, deduplicate ---
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pattern = str(DATA_DIR / "air_quality" / "*.parquet")
    existing = safe_read_parquet(pattern)

    if not existing.empty:
        combined = pd.concat([existing, new_df], ignore_index=True)
        combined = combined.drop_duplicates(subset=["station_id"], keep="last")
    else:
        combined = new_df

    write_parquet(combined, "air_quality", date_str=today)
    logger.info("air_quality: stored %d stations", len(combined))

    # --- Broadcast a WebSocket update so connected clients refresh ---
    await manager.broadcast(
        layer="air_quality",
        features=[_row_to_feature(row) for _, row in combined.iterrows()],
    )


def _row_to_feature(row: pd.Series) -> dict:
    """Convert a DataFrame row to a GeoJSON Feature dict."""
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [float(row["lon"]), float(row["lat"])],
        },
        "properties": {
            "station_id":   str(row.get("station_id", "")),
            "station_name": str(row.get("station_name", "")),
            "pm25":         float(row["pm25"]) if row.get("pm25") is not None else None,
            "aqi":          int(row["aqi"])    if row.get("aqi")  is not None else None,
            "recorded_at":  str(row.get("recorded_at", "")),
        },
    }
```

**Storage layout produced:**

```
data/air_quality/date=2025-01-15/data.parquet
```

**Broadcast options:**

| Method | When to use |
|---|---|
| `manager.broadcast(layer, features)` | Full-refresh update — replaces all client state for this layer |
| `manager.broadcast_alert(layer, feature)` | Single-record alert — prepended to client state (used by earthquakes) |

---

### Step 2 — Write the API router

**File: `apps/api/routers/air_quality.py`** *(create new)*

The router reads from Parquet and returns a GeoJSON `FeatureCollection`. Keep filtering logic here rather than in the job.

```python
"""Air quality REST endpoint."""

from fastapi import APIRouter

from db import DATA_DIR, safe_read_parquet

router = APIRouter()

_EMPTY_FC = {"type": "FeatureCollection", "features": []}


@router.get("/layers/air_quality")
async def get_air_quality():
    pattern = str(DATA_DIR / "air_quality" / "**" / "*.parquet")
    df = safe_read_parquet(pattern)

    if df.empty:
        return _EMPTY_FC

    features = []
    for _, row in df.iterrows():
        lon, lat = row.get("lon"), row.get("lat")
        if lon is None or lat is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [float(lon), float(lat)],
            },
            "properties": {
                "station_id":   str(row.get("station_id", "")),
                "station_name": str(row.get("station_name", "")),
                "pm25":         float(row["pm25"]) if row.get("pm25") is not None else None,
                "aqi":          int(row["aqi"])    if row.get("aqi")  is not None else None,
                "recorded_at":  str(row.get("recorded_at", "")),
            },
        })

    return {"type": "FeatureCollection", "features": features}
```

The endpoint will be available at `GET /api/v1/layers/air_quality`.

**Response shape reference for all existing layer types:**

| Layer type | Geometry | Key properties |
|---|---|---|
| Point layer (flights, earthquakes, vessels, satellites, air quality) | `Point` with `[lon, lat]` or `[lon, lat, altitude_m]` | Flat property dict |
| Line layer (traffic) | `LineString` | `segment_id`, `speed_kmh`, `congestion_level` |
| Polygon layer (weather, fire perimeters) | `Polygon` / `MultiPolygon` | Incident-specific fields |
| Non-GeoJSON (tides, prices) | — | Custom array/object response — use `setLayer()` on the frontend |

---

### Step 3 — Register the router and scheduler job

**File: `apps/api/main.py`**

Two additions: import the router and job, then wire them up.

```python
# --- Imports (top of file) ---
from routers import (
    flights, earthquakes, vessels, weather, fires,
    tides, satellites, traffic, prices, explorer,
    air_quality,                        # ← add this
)
from jobs.air_quality import ingest_air_quality  # ← add this

# --- Inside the lifespan() context manager, with the other scheduler.add_job calls ---
scheduler.add_job(ingest_air_quality, "interval", minutes=30, id="air_quality")

# --- Optionally run once at startup alongside the other high-priority jobs ---
for fn in [ingest_flights, ingest_earthquakes, ingest_weather_alerts,
           ingest_fire_detections, ingest_tides,
           ingest_air_quality]:          # ← add here if fast enough to run at startup
    ...

# --- Router registration (with the other app.include_router calls) ---
app.include_router(air_quality.router, prefix=PREFIX)
```

---

### Step 4 — Add the TypeScript type

**File: `apps/web/src/types/layers.ts`**

Two changes: add `'air_quality'` to the `LayerName` union, and define a properties interface.

```typescript
// 1. Extend LayerName union (line 1–10)
export type LayerName =
  | 'flights'
  | 'earthquakes'
  | 'vessels'
  | 'fires'
  | 'weather'
  | 'tides'
  | 'satellites'
  | 'traffic'
  | 'prices'
  | 'air_quality'   // ← add this

// 2. Add a properties interface (after the existing interfaces)
export interface AirQualityProperties {
  station_id: string
  station_name: string
  pm25: number | null
  aqi: number | null
  recorded_at: string
}
```

`LayerName` is used as the discriminant throughout the store, hooks, and WebSocket logic — adding it here makes TypeScript enforce consistency everywhere.

---

### Step 5 — Add state to the Zustand store

**File: `apps/web/src/stores/layerStore.ts`**

The store holds a slice of state for every layer. For a standard GeoJSON layer, add:

1. A field on `LayerStore` (typically `GeoJSONFeatureCollection | null`)
2. An initial value (typically `null`)
3. A default enabled state
4. A `setLayer` branch if the layer needs special handling (most layers don't)

```typescript
// 1. Add to LayerStore interface
interface LayerStore {
  // ... existing fields ...
  air_quality: GeoJSONFeatureCollection | null
}

// 2. Add initial value inside create()
air_quality: null,

// 3. Add a default enabled state
enabled: {
  // ... existing layers ...
  air_quality: true,   // or false to start toggled off
},

// 4. setLayer() already handles GeoJSONFeatureCollection via the else branch:
//    set({ [name]: data })
//    No additional branch needed for a standard GeoJSON layer.
```

If your layer returns something other than a `GeoJSONFeatureCollection` (like tides returns `TideStation[]`, or prices returns `PriceSeries`), add an explicit branch inside `setLayer`:

```typescript
} else if (name === 'air_quality') {
  set({ air_quality: data as GeoJSONFeatureCollection })
}
```

---

### Step 6 — Add polling in useLayerData

**File: `apps/web/src/hooks/useLayerData.ts`**

Add one entry to the `fetchers` array. Pick an `intervalMs` that matches how often your backend job runs.

```typescript
const fetchers: Array<{ fn: () => Promise<void>; intervalMs: number }> = [
  // ... existing entries ...
  {
    fn: async () => setLayer('air_quality', await fetchJSON(`${API}/layers/air_quality`)),
    intervalMs: 30 * 60_000,   // 30 minutes — matches the scheduler interval
  },
]
```

The `fetchJSON` helper throws on non-2xx responses; errors are silently caught by the `.catch(() => {})` wrapper in the loop, so failed fetches simply leave the previous data in place.

---

### Step 7 — Subscribe via WebSocket

**File: `apps/web/src/hooks/useWebSocket.ts`**

Two changes: add the layer name to the subscription list, and handle alert messages if your layer broadcasts them.

```typescript
// 1. Add to subscription list (line 5)
const ALL_LAYERS = [
  'flights', 'earthquakes', 'vessels', 'fires',
  'weather', 'tides', 'satellites', 'traffic',
  'air_quality',   // ← add this
]

// 2. Handle alert messages (inside the ws.onmessage handler, in the alert branch)
} else if (msg.type === 'alert') {
  if (msg.layer === 'earthquakes') {
    store.addEarthquake(msg.data as GeoJSONFeature)
  }
  // If your layer uses broadcast_alert() instead of broadcast(), add a case here:
  // if (msg.layer === 'air_quality') {
  //   store.setLayer('air_quality', ...)
  // }
}
```

If your job calls `manager.broadcast()` (full update), the existing `msg.type === 'update'` branch already routes to `store.setLayer(msg.layer, ...)` for all layers — no extra code needed.

---

### Step 8 — Render on the globe

**File: `apps/web/src/components/Globe/CesiumGlobe.tsx`**

This is the largest change. The pattern used by all existing point layers:

1. Create a `useRef` for the Cesium primitive collection
2. Initialise it inside the `useEffect` that sets up the Cesium viewer
3. Read the layer data and enabled state from the Zustand store
4. Add a `useEffect` that clears and re-populates the collection whenever the data changes

```typescript
// 1. Import the new type
import type { AirQualityProperties } from '../../types/layers'

// 2. Declare a ref alongside the other primitive collection refs
const airQualityPoints = useRef<Cesium.PointPrimitiveCollection | null>(null)

// 3. Read state from the store (alongside the other layer selectors)
const airQuality = useLayerStore((s) => s.air_quality)

// 4. Initialise inside the viewer setup useEffect (alongside other collections)
airQualityPoints.current = viewer.scene.primitives.add(
  new Cesium.PointPrimitiveCollection()
)

// 5. Add a render effect
useEffect(() => {
  const col = airQualityPoints.current
  if (!col) return
  col.removeAll()
  col.show = enabled.air_quality
  if (!enabled.air_quality || !airQuality) return

  for (const feat of airQuality.features) {
    if (!feat.geometry || feat.geometry.type !== 'Point') continue
    const [lon, lat] = feat.geometry.coordinates
    const props = feat.properties as AirQualityProperties

    col.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      pixelSize: 10,
      color: _aqiColor(props.aqi),
      outlineColor: Cesium.Color.WHITE.withAlpha(0.6),
      outlineWidth: 1,
      id: feat,   // makes the feature available in click/hover handlers
    })
  }
}, [airQuality, enabled.air_quality])

// 6. Helper color function
function _aqiColor(aqi: number | null): Cesium.Color {
  if (aqi === null)    return Cesium.Color.GRAY.withAlpha(0.6)
  if (aqi > 150)       return Cesium.Color.fromCssColorString('#dc2626')  // red — unhealthy
  if (aqi > 100)       return Cesium.Color.fromCssColorString('#f97316')  // orange — sensitive
  if (aqi > 50)        return Cesium.Color.fromCssColorString('#facc15')  // yellow — moderate
  return Cesium.Color.fromCssColorString('#22c55e')                        // green — good
}
```

**Other Cesium primitives used by existing layers for reference:**

| Primitive | Used by | When to use |
|---|---|---|
| `PointPrimitiveCollection` | flights, earthquakes, vessels, satellites, air_quality | Discrete point locations |
| `PolylineCollection` | traffic | Road segments, paths |
| `GeoJsonDataSource` | weather (polygons), fire perimeters | Complex polygons / GeoJSON from the API |
| `BillboardCollection` | flights, vessels (icons) | Icon sprites instead of colored dots |

---

### Step 9 — Add to the Layer Panel

**File: `apps/web/src/components/Controls/LayerPanel.tsx`**

Two changes: add an entry to `LAYERS`, and add a `countFor` case.

```typescript
// 1. Add to LAYERS array
const LAYERS: LayerConfig[] = [
  // ... existing entries ...
  { name: 'air_quality', label: 'Air Quality', icon: '💨', color: '#22c55e' },
]

// 2. Add to countFor() switch
function countFor(name: LayerName): number | null {
  switch (name) {
    case 'flights':     return flights.length
    case 'earthquakes': return earthquakes.length
    // ... existing cases ...
    case 'air_quality': return airQuality?.features.length ?? null
    default:            return null
  }
}
```

Also destructure `air_quality` from the store at the top of the component, alongside the other layers:

```typescript
const { enabled, toggleLayer, flights, earthquakes, ..., air_quality: airQuality } = useLayerStore()
```

---

### Step 10 — Add to the Data Explorer

**File: `apps/api/routers/explorer.py`**

Add one entry to the `TABLES` list. The tuple is `(id, label, icon, glob_pattern_relative_to_DATA_DIR)`.

```python
TABLES = [
    ("flights",             "Flights",              "✈",  "flights/**/*.parquet"),
    # ... existing entries ...
    ("air_quality",         "Air Quality",          "💨", "air_quality/**/*.parquet"),
]
```

The Data Explorer endpoint (`GET /api/v1/admin/tables`) uses DuckDB to count rows and pull a 10-row preview automatically — no other changes required.

---

### Checklist

Use this as a final review before testing:

**Backend**
- [ ] `apps/api/jobs/air_quality.py` — ingestion job exists, writes Parquet, broadcasts via `manager`
- [ ] `apps/api/routers/air_quality.py` — router returns valid GeoJSON (or custom response)
- [ ] `apps/api/main.py` — router imported and registered with `app.include_router(..., prefix=PREFIX)`
- [ ] `apps/api/main.py` — job imported and scheduled with `scheduler.add_job(...)`
- [ ] `apps/api/routers/explorer.py` — entry added to `TABLES` list

**Frontend**
- [ ] `apps/web/src/types/layers.ts` — `'air_quality'` added to `LayerName` union
- [ ] `apps/web/src/types/layers.ts` — `AirQualityProperties` interface defined
- [ ] `apps/web/src/stores/layerStore.ts` — `air_quality` field, initial value, and enabled default added
- [ ] `apps/web/src/hooks/useLayerData.ts` — polling entry added to `fetchers` array
- [ ] `apps/web/src/hooks/useWebSocket.ts` — `'air_quality'` added to `ALL_LAYERS`
- [ ] `apps/web/src/components/Globe/CesiumGlobe.tsx` — primitive collection created, render effect added
- [ ] `apps/web/src/components/Controls/LayerPanel.tsx` — entry in `LAYERS`, case in `countFor()`

**Verification**
- [ ] Backend starts without errors: `uvicorn main:app --port 8009`
- [ ] `GET /api/v1/layers/air_quality` returns `{"type":"FeatureCollection","features":[...]}`
- [ ] `GET /api/v1/admin/tables` shows `air_quality` with a record count
- [ ] Layer toggle in the panel shows/hides points on the globe
- [ ] Live count in the panel updates after each poll interval
