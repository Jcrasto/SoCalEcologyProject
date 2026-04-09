from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers.sources import router as sources_router
from routers.data import router as data_router
from routers.query import router as query_router

app = FastAPI(
    title="FullPicture API",
    description="Multi-source economic, environmental, and weather data platform.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sources_router)
app.include_router(data_router)
app.include_router(query_router)


@app.get("/health")
def health():
    return {"status": "ok"}
