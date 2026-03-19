from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import Species

router = APIRouter()


def _species_to_dict(sp: Species) -> dict:
    return {
        "species_id": sp.species_id,
        "common_name": sp.common_name,
        "scientific_name": sp.scientific_name,
        "gbif_taxon_key": sp.gbif_taxon_key,
        "inat_taxon_id": sp.inat_taxon_id,
        "usda_symbol": sp.usda_symbol,
        "accepted_name_id": sp.accepted_name_id,
    }


@router.get("")
def list_species(db: Session = Depends(get_db)):
    """Return all species records."""
    rows = db.query(Species).order_by(Species.common_name).all()
    return [_species_to_dict(sp) for sp in rows]


@router.get("/{species_id}")
def get_species(species_id: str, db: Session = Depends(get_db)):
    """Return a single species by slug or numeric GBIF key (as string)."""
    sp = db.query(Species).filter(Species.species_id == species_id).first()

    # Fallback: try matching by gbif_taxon_key if species_id looks numeric
    if sp is None and species_id.isdigit():
        sp = (
            db.query(Species)
            .filter(Species.gbif_taxon_key == int(species_id))
            .first()
        )

    if sp is None:
        raise HTTPException(status_code=404, detail=f"Species '{species_id}' not found")

    return _species_to_dict(sp)
