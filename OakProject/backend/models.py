from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    Date,
    DateTime,
    UniqueConstraint,
    Index,
    ForeignKey,
    func,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Species(Base):
    __tablename__ = "species"

    species_id = Column(String, primary_key=True)          # slug, e.g. "quercus-agrifolia"
    scientific_name = Column(String, nullable=False)
    common_name = Column(String, nullable=False)
    gbif_taxon_key = Column(Integer, nullable=True)
    inat_taxon_id = Column(Integer, nullable=True)
    usda_symbol = Column(String, nullable=True)
    accepted_name_id = Column(String, ForeignKey("species.species_id"), nullable=True)

    observations = relationship("Observation", back_populates="species")
    images = relationship("Image", back_populates="species")


class Observation(Base):
    __tablename__ = "observations"

    obs_id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String, nullable=False)                # e.g. "gbif" | "inat"
    source_record_id = Column(String, nullable=False)      # original ID from the source
    species_id = Column(String, ForeignKey("species.species_id"), nullable=False)
    obs_date = Column(Date, nullable=True)
    observer = Column(String, nullable=True)
    basis_of_record = Column(String, nullable=True)
    coordinate_uncertainty_m = Column(Float, nullable=True)
    license = Column(String, nullable=True)
    attribution = Column(String, nullable=True)
    import_date = Column(DateTime, server_default=func.now())
    curated = Column(Boolean, default=False, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("source", "source_record_id", name="uq_source_record"),
        Index("ix_obs_species_id", "species_id"),
        Index("ix_obs_latlon", "latitude", "longitude"),
    )

    species = relationship("Species", back_populates="observations")
    images = relationship("Image", back_populates="observation")


class Image(Base):
    __tablename__ = "images"

    img_id = Column(Integer, primary_key=True, autoincrement=True)
    obs_id = Column(Integer, ForeignKey("observations.obs_id"), nullable=True)
    species_id = Column(String, ForeignKey("species.species_id"), nullable=False)
    url = Column(String, nullable=False)
    license = Column(String, nullable=True)
    photographer = Column(String, nullable=True)
    source = Column(String, nullable=True)              # e.g. "inat"

    observation = relationship("Observation", back_populates="images")
    species = relationship("Species", back_populates="images")


class Source(Base):
    __tablename__ = "sources"

    source_code = Column(String, primary_key=True)     # e.g. "gbif"
    name = Column(String, nullable=False)
    url = Column(String, nullable=True)
    license = Column(String, nullable=True)
