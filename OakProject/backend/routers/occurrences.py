from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import Observation, Image

router = APIRouter()


def _obs_to_feature(obs: Observation) -> dict:
    """Convert an Observation ORM row to a GeoJSON Feature dict."""
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [obs.longitude, obs.latitude],
        },
        "properties": {
            "obs_id": obs.obs_id,
            "species_id": obs.species_id,
            "source": obs.source,
            "source_record_id": obs.source_record_id,
            "obs_date": obs.obs_date.isoformat() if obs.obs_date else None,
            "observer": obs.observer,
            "basis_of_record": obs.basis_of_record,
            "coordinate_uncertainty_m": obs.coordinate_uncertainty_m,
            "license": obs.license,
            "curated": obs.curated,
        },
    }


@router.get("/occurrences")
def list_occurrences(
    bbox: Optional[str] = None,
    species: Optional[str] = None,
    limit: int = 500,
    db: Session = Depends(get_db),
):
    """
    Return a GeoJSON FeatureCollection of observations.

    Query params:
      bbox    — comma-separated minlon,minlat,maxlon,maxlat
      species — species slug to filter by
      limit   — max records to return (default 500)
    """
    q = db.query(Observation).filter(
        Observation.latitude.isnot(None),
        Observation.longitude.isnot(None),
    )

    if species:
        q = q.filter(Observation.species_id == species)

    if bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = [float(v) for v in bbox.split(",")]
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail="bbox must be four comma-separated floats: minlon,minlat,maxlon,maxlat",
            )
        q = q.filter(
            Observation.longitude >= min_lon,
            Observation.longitude <= max_lon,
            Observation.latitude >= min_lat,
            Observation.latitude <= max_lat,
        )

    rows = q.limit(limit).all()

    return {
        "type": "FeatureCollection",
        "features": [_obs_to_feature(o) for o in rows],
    }


@router.get("/distribution/{species_id}")
def species_distribution(species_id: str, db: Session = Depends(get_db)):
    """
    Return a GeoJSON FeatureCollection of all observations for a single species.
    """
    rows = (
        db.query(Observation)
        .filter(
            Observation.species_id == species_id,
            Observation.latitude.isnot(None),
            Observation.longitude.isnot(None),
        )
        .all()
    )

    return {
        "type": "FeatureCollection",
        "features": [_obs_to_feature(o) for o in rows],
    }


@router.get("/photos/{species_id}")
def species_photos(species_id: str, db: Session = Depends(get_db)):
    """Return all images associated with a species."""
    rows = db.query(Image).filter(Image.species_id == species_id).all()
    return [
        {
            "img_id": img.img_id,
            "obs_id": img.obs_id,
            "species_id": img.species_id,
            "url": img.url,
            "license": img.license,
            "photographer": img.photographer,
            "source": img.source,
        }
        for img in rows
    ]


@router.post("/occurrences/{obs_id}/curate")
def toggle_curated(obs_id: int, db: Session = Depends(get_db)):
    """Toggle the curated flag on an observation."""
    obs = db.query(Observation).filter(Observation.obs_id == obs_id).first()
    if obs is None:
        raise HTTPException(status_code=404, detail=f"Observation {obs_id} not found")
    obs.curated = not obs.curated
    db.commit()
    db.refresh(obs)
    return {"obs_id": obs.obs_id, "curated": obs.curated}
