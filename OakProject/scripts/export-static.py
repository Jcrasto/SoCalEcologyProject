#!/usr/bin/env python3
"""
export-static.py — Export occurrence and photo data from oaks.db to static files.

Outputs:
  data/occurrences/{species-id}.geojson  — GeoJSON FeatureCollection per species
  data/photos/{species-id}.json          — array of photo objects per species

Usage (run from OakProject/ root):
    python scripts/export-static.py [--curated-only]
"""

import argparse
import json
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.db import init_db, SessionLocal  # noqa: E402
from backend.models import Species, Observation, Image  # noqa: E402

OCCURRENCES_DIR = BASE_DIR / "data" / "occurrences"
PHOTOS_DIR = BASE_DIR / "data" / "photos"


def export_species(db, curated_only: bool) -> None:
    species_list = db.query(Species).all()
    print(f"Exporting {len(species_list)} species …\n")

    for sp in species_list:
        obs_query = db.query(Observation).filter(
            Observation.species_id == sp.species_id,
            Observation.latitude.isnot(None),
            Observation.longitude.isnot(None),
        )
        if curated_only:
            obs_query = obs_query.filter(Observation.curated == True)  # noqa: E712

        observations = obs_query.all()

        # --- GeoJSON ---
        features = []
        for obs in observations:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [obs.longitude, obs.latitude],
                    },
                    "properties": {
                        "obs_id": obs.obs_id,
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
            )

        geojson = {
            "type": "FeatureCollection",
            "name": sp.common_name,
            "species_id": sp.species_id,
            "features": features,
        }

        geojson_path = OCCURRENCES_DIR / f"{sp.species_id}.geojson"
        geojson_path.write_text(json.dumps(geojson, indent=2), encoding="utf-8")
        print(f"  [{sp.species_id}] {len(features)} observations → {geojson_path.name}")

        # --- Photos ---
        images = db.query(Image).filter(Image.species_id == sp.species_id).all()
        photos_data = [
            {
                "img_id": img.img_id,
                "obs_id": img.obs_id,
                "url": img.url,
                "license": img.license,
                "photographer": img.photographer,
                "source": img.source,
            }
            for img in images
        ]

        photos_path = PHOTOS_DIR / f"{sp.species_id}.json"
        photos_path.write_text(json.dumps(photos_data, indent=2), encoding="utf-8")
        print(f"  [{sp.species_id}] {len(photos_data)} photos → {photos_path.name}")

    print(f"\nDone. Files written to:")
    print(f"  {OCCURRENCES_DIR}")
    print(f"  {PHOTOS_DIR}")


def main():
    parser = argparse.ArgumentParser(
        description="Export oaks.db data to static GeoJSON/JSON files."
    )
    parser.add_argument(
        "--curated-only",
        action="store_true",
        help="Export only observations marked as curated=True",
    )
    args = parser.parse_args()

    print("=== SoCal Oak Explorer — Static Export ===")
    print(f"Database: {BASE_DIR / 'oaks.db'}")
    print(f"Curated only: {args.curated_only}\n")

    # Ensure output directories exist
    OCCURRENCES_DIR.mkdir(parents=True, exist_ok=True)
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

    init_db()

    db = SessionLocal()
    try:
        export_species(db, curated_only=args.curated_only)
    finally:
        db.close()


if __name__ == "__main__":
    main()
