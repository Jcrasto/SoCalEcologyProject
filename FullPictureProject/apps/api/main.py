"""Full Picture API — FastAPI entry point."""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import db
from ws import manager
from routers import flights, earthquakes, vessels, weather, fires, tides, satellites, traffic, prices
from jobs.flights import ingest_flights
from jobs.earthquakes import ingest_earthquakes
from jobs.vessels import ingest_vessels
from jobs.weather import ingest_weather_alerts, ingest_weather_obs
from jobs.fires import ingest_fire_detections, ingest_cal_fire
from jobs.tides import ingest_tides
from jobs.satellites import ingest_satellites
from jobs.traffic import ingest_traffic
from jobs.prices import ingest_prices

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise DuckDB connection
    db.get_con()

    # ── Schedule all ingestion jobs ───────────────────────────────────────────
    scheduler.add_job(ingest_flights,         "interval", seconds=15,      id="flights")
    scheduler.add_job(ingest_earthquakes,     "interval", minutes=5,       id="earthquakes")
    scheduler.add_job(ingest_weather_alerts,  "interval", minutes=5,       id="weather_alerts")
    scheduler.add_job(ingest_fire_detections, "interval", minutes=15,      id="fire_detections")
    scheduler.add_job(ingest_tides,           "interval", minutes=6,       id="tides")
    scheduler.add_job(ingest_weather_obs,     "interval", hours=1,         id="weather_obs")
    scheduler.add_job(ingest_cal_fire,        "interval", hours=1,         id="cal_fire")
    scheduler.add_job(ingest_traffic,         "interval", minutes=5,       id="traffic")
    scheduler.add_job(ingest_satellites,      "interval", hours=6,         id="satellites")
    scheduler.add_job(ingest_vessels,         "interval", hours=24,        id="vessels")
    scheduler.add_job(ingest_prices,          "interval", hours=24,        id="prices")

    scheduler.start()
    logger.info("APScheduler started with %d jobs", len(scheduler.get_jobs()))

    # ── Run high-priority jobs immediately at startup ─────────────────────────
    logger.info("Running initial ingestion jobs...")
    for fn in [ingest_flights, ingest_earthquakes, ingest_weather_alerts,
               ingest_fire_detections, ingest_tides]:
        try:
            await fn()
        except Exception as exc:
            logger.warning("Startup job %s failed: %s", fn.__name__, exc)

    # Run slower jobs in background (don't block startup)
    for fn in [ingest_vessels, ingest_satellites, ingest_prices]:
        scheduler.add_job(fn, "date", id=f"{fn.__name__}_startup")

    yield

    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")


app = FastAPI(
    title="Full Picture API",
    description="Southern California geospatial monitoring platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = "/api/v1"
app.include_router(flights.router,    prefix=PREFIX)
app.include_router(earthquakes.router, prefix=PREFIX)
app.include_router(vessels.router,    prefix=PREFIX)
app.include_router(weather.router,    prefix=PREFIX)
app.include_router(fires.router,      prefix=PREFIX)
app.include_router(tides.router,      prefix=PREFIX)
app.include_router(satellites.router, prefix=PREFIX)
app.include_router(traffic.router,    prefix=PREFIX)
app.include_router(prices.router,     prefix=PREFIX)


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "subscribe":
                layers = data.get("layers", [])
                await manager.subscribe(websocket, layers)
                logger.debug("Client subscribed to: %s", layers)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/v1/health")
async def health():
    return {
        "status": "ok",
        "last_ingestion": {
            k: v.isoformat() for k, v in db.last_ingestion.items()
        },
    }
