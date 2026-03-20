#!/usr/bin/env python3
"""
fetch-data.py — ETL script for the SoCal Oak Explorer.

Reads src/data/species.json, initialises the SQLite database, then fetches
occurrence records from GBIF and iNaturalist for each species with a known
taxon identifier.  Photos from iNaturalist are also stored.

Usage (run from OakProject/ root):
    python scripts/fetch-data.py
"""

import json
import sys
import time
from datetime import date, datetime
from pathlib import Path

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Path setup — allow imports from OakProject root
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.db import init_db, SessionLocal  # noqa: E402 (after sys.path tweak)
from backend.models import Species, Observation, Image, Source  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SOCAL_BBOX = {
    "minLon": -120.5,
    "maxLon": -114.0,
    "minLat": 32.5,
    "maxLat": 35.8,
}

GBIF_API = "https://api.gbif.org/v1"
INAT_API = "https://api.inaturalist.org/v1"

SPECIES_JSON = BASE_DIR / "src" / "data" / "species.json"

SOURCES = [
    {
        "source_code": "gbif",
        "name": "Global Biodiversity Information Facility",
        "url": "https://www.gbif.org",
        "license": "CC-BY 4.0",
    },
    {
        "source_code": "inat",
        "name": "iNaturalist",
        "url": "https://www.inaturalist.org",
        "license": "CC-BY / CC-BY-NC (per observation)",
    },
]

# Polite delay between API requests (seconds)
REQUEST_DELAY = 0.5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _upsert_sources(db: Session) -> None:
    for src in SOURCES:
        existing = db.get(Source, src["source_code"])
        if existing is None:
            db.add(Source(**src))
    db.commit()
    print("[sources] Source records inserted/verified.")


def _upsert_species(db: Session, species_list: list) -> None:
    for sp in species_list:
        existing = db.get(Species, sp["id"])
        if existing is None:
            db.add(
                Species(
                    species_id=sp["id"],
                    scientific_name=sp["scientificName"],
                    common_name=sp["commonName"],
                    gbif_taxon_key=sp.get("gbifTaxonKey"),
                    inat_taxon_id=sp.get("iNaturalistTaxonId"),
                    usda_symbol=sp.get("usdaSymbol"),
                )
            )
        else:
            existing.scientific_name = sp["scientificName"]
            existing.common_name = sp["commonName"]
            existing.gbif_taxon_key = sp.get("gbifTaxonKey")
            existing.inat_taxon_id = sp.get("iNaturalistTaxonId")
            existing.usda_symbol = sp.get("usdaSymbol")
    db.commit()
    print(f"[species] Upserted {len(species_list)} species records.")


def _parse_date(date_str: str | None) -> date | None:
    if not date_str:
        return None
    for fmt, length in (("%Y-%m-%d", 10), ("%Y-%m", 7), ("%Y", 4)):
        try:
            return datetime.strptime(date_str[:length], fmt).date()
        except ValueError:
            continue
    return None


def _insert_observation(db: Session, source: str, record_id: str, **kwargs) -> bool:
    """
    Insert an observation row, skipping duplicates (source, source_record_id).
    Returns True if inserted, False if skipped.
    """
    obs = Observation(source=source, source_record_id=record_id, **kwargs)
    db.add(obs)
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


# ---------------------------------------------------------------------------
# GBIF fetch
# ---------------------------------------------------------------------------

GBIF_PAGE_SIZE = 300   # GBIF's maximum per-page limit
GBIF_MAX_OFFSET = 100_000  # GBIF hard cap on offset


def fetch_gbif(db: Session, species_list: list) -> None:
    client = httpx.Client(timeout=30)
    bbox = SOCAL_BBOX

    for sp in species_list:
        taxon_key = sp.get("gbifTaxonKey")
        if not taxon_key:
            print(f"[gbif] Skipping {sp['commonName']} — no gbifTaxonKey")
            continue

        print(f"[gbif] Fetching {sp['commonName']} (taxonKey={taxon_key}) …")
        inserted = 0
        skipped = 0
        offset = 0
        total = None

        # Build the base URL manually so bbox range params are not URL-encoded
        # by httpx — GBIF's parser requires literal commas in the lat/lon ranges.
        base_url = (
            f"{GBIF_API}/occurrence/search"
            f"?taxonKey={taxon_key}"
            f"&decimalLatitude={bbox['minLat']},{bbox['maxLat']}"
            f"&decimalLongitude={bbox['minLon']},{bbox['maxLon']}"
            f"&hasCoordinate=true"
            f"&hasGeospatialIssue=false"
            f"&limit={GBIF_PAGE_SIZE}"
        )

        while True:
            url = f"{base_url}&offset={offset}"
            try:
                resp = client.get(url)
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPError as exc:
                print(f"  [gbif] HTTP error at offset {offset}: {exc}")
                break

            if total is None:
                total = data.get("count", "?")
                print(f"  [gbif] {total} total records in bbox — paginating …")

            results = data.get("results", [])
            page_num = offset // GBIF_PAGE_SIZE + 1
            print(f"  [gbif] Page {page_num}: {len(results)} records (offset={offset})")

            for rec in results:
                lat = rec.get("decimalLatitude")
                lon = rec.get("decimalLongitude")
                if lat is None or lon is None:
                    continue

                ok = _insert_observation(
                    db,
                    source="gbif",
                    record_id=str(rec.get("key", "")),
                    species_id=sp["id"],
                    obs_date=_parse_date(rec.get("eventDate")),
                    observer=rec.get("recordedBy"),
                    basis_of_record=rec.get("basisOfRecord"),
                    coordinate_uncertainty_m=rec.get("coordinateUncertaintyInMeters"),
                    license=rec.get("license"),
                    attribution=rec.get("rightsHolder") or rec.get("institutionCode"),
                    latitude=lat,
                    longitude=lon,
                )
                if ok:
                    inserted += 1
                else:
                    skipped += 1

            if data.get("endOfRecords", True) or not results:
                break

            offset += GBIF_PAGE_SIZE
            if offset >= GBIF_MAX_OFFSET:
                print(f"  [gbif] Reached GBIF offset cap ({GBIF_MAX_OFFSET}), stopping.")
                break

            time.sleep(REQUEST_DELAY)

        print(f"  [gbif] Done — Inserted={inserted}, Skipped(dup)={skipped}, Total fetched={inserted + skipped}")

    client.close()


# ---------------------------------------------------------------------------
# iNaturalist fetch
# ---------------------------------------------------------------------------

def fetch_inat(db: Session, species_list: list) -> None:
    client = httpx.Client(timeout=30)

    for sp in species_list:
        taxon_id = sp.get("iNaturalistTaxonId")
        if not taxon_id:
            print(f"[inat] Skipping {sp['commonName']} — no iNaturalistTaxonId")
            continue

        print(f"[inat] Fetching {sp['commonName']} (taxon_id={taxon_id}) …")
        inserted_obs = 0
        inserted_img = 0
        skipped = 0

        params = {
            "taxon_id": taxon_id,
            "quality_grade": "research",
            "place_id": 14,        # California
            "per_page": 200,
            "page": 1,
            "photos": "true",
            "geo": "true",
        }

        try:
            resp = client.get(f"{INAT_API}/observations", params=params)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            print(f"  [inat] HTTP error: {exc}")
            continue

        results = data.get("results", [])
        print(f"  [inat] Got {len(results)} records (of {data.get('total_results', '?')} total)")

        for rec in results:
            location = rec.get("location")  # "lat,lon" string or None
            lat, lon = None, None
            if location:
                try:
                    lat, lon = [float(v) for v in location.split(",")]
                except ValueError:
                    pass

            if lat is None or lon is None:
                continue

            # Filter to SoCal bbox
            bbox = SOCAL_BBOX
            if not (
                bbox["minLon"] <= lon <= bbox["maxLon"]
                and bbox["minLat"] <= lat <= bbox["maxLat"]
            ):
                continue

            record_id = str(rec.get("id", ""))
            ok = _insert_observation(
                db,
                source="inat",
                record_id=record_id,
                species_id=sp["id"],
                obs_date=_parse_date(rec.get("observed_on")),
                observer=rec.get("user", {}).get("login"),
                basis_of_record="HUMAN_OBSERVATION",
                license=rec.get("license_code"),
                attribution=rec.get("attribution"),
                latitude=lat,
                longitude=lon,
            )
            if ok:
                inserted_obs += 1
                # Retrieve the obs_id we just inserted
                obs_row = (
                    db.query(Observation)
                    .filter(
                        Observation.source == "inat",
                        Observation.source_record_id == record_id,
                    )
                    .first()
                )

                # Insert photos for this observation
                for photo in rec.get("photos", []):
                    url = photo.get("url", "").replace("square", "medium")
                    if not url:
                        continue
                    img = Image(
                        obs_id=obs_row.obs_id if obs_row else None,
                        species_id=sp["id"],
                        url=url,
                        license=photo.get("license_code"),
                        photographer=photo.get("attribution", "").strip("(C) ").split(",")[0],
                        source="inat",
                    )
                    db.add(img)
                    inserted_img += 1

                try:
                    db.commit()
                except Exception:
                    db.rollback()

            else:
                skipped += 1

        print(
            f"  [inat] Observations inserted={inserted_obs}, "
            f"images inserted={inserted_img}, skipped(dup)={skipped}"
        )
        time.sleep(REQUEST_DELAY)

    client.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=== SoCal Oak Explorer — Data Fetch ===")
    print(f"Database: {BASE_DIR / 'oaks.db'}")
    print(f"Species file: {SPECIES_JSON}\n")

    # Load species seed data
    with open(SPECIES_JSON, encoding="utf-8") as fh:
        species_list = json.load(fh)
    print(f"Loaded {len(species_list)} species from species.json\n")

    # Initialise DB schema
    init_db()

    db: Session = SessionLocal()
    try:
        _upsert_sources(db)
        _upsert_species(db, species_list)

        print("\n--- GBIF ---")
        fetch_gbif(db, species_list)

        print("\n--- iNaturalist ---")
        fetch_inat(db, species_list)

    finally:
        db.close()

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
