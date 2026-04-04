"""Pydantic response models for the Full Picture API."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


# ─── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    last_ingestion: Dict[str, str] = Field(default_factory=dict)


# ─── GeoJSON geometry types ───────────────────────────────────────────────────

class GeoJSONPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: List[float]  # [lon, lat] or [lon, lat, alt]


class GeoJSONLineString(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: List[List[float]]  # [[lon, lat], ...]


class GeoJSONPolygon(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[List[float]]]  # [[[lon, lat], ...], ...]


class GeoJSONMultiPolygon(BaseModel):
    type: Literal["MultiPolygon"] = "MultiPolygon"
    coordinates: List[List[List[List[float]]]]


# ─── GeoJSON Feature / FeatureCollection ──────────────────────────────────────

class GeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: Optional[Union[GeoJSONPoint, GeoJSONLineString, GeoJSONPolygon, GeoJSONMultiPolygon, Dict[str, Any]]]
    properties: Dict[str, Any] = Field(default_factory=dict)
    id: Optional[Union[str, int]] = None


class GeoJSONFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[GeoJSONFeature] = Field(default_factory=list)


# ─── Tides ────────────────────────────────────────────────────────────────────

class TideObservation(BaseModel):
    timestamp: str          # ISO-8601
    water_level_m: Optional[float] = None
    prediction_m: Optional[float] = None
    quality: Optional[str] = None


class TideStation(BaseModel):
    station_id: str
    station_name: str
    lat: float
    lon: float
    observations: List[TideObservation] = Field(default_factory=list)


class TideResponse(BaseModel):
    stations: List[TideStation]


# ─── Prices ───────────────────────────────────────────────────────────────────

class PriceObservation(BaseModel):
    date: str
    value: Optional[float] = None


class PriceSeriesResponse(BaseModel):
    series_id: str
    series_name: Optional[str] = None
    unit: Optional[str] = None
    observations: List[PriceObservation] = Field(default_factory=list)
