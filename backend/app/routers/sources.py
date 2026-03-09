"""Sources router — CRUD for data sources.

Provides:
  GET  /sources          — list all sources for the user
  POST /sources          — create a source (idempotent per source_type)
  PATCH /sources/{id}/synced — update last_synced_at timestamp
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import DataSource
from app.schemas.sources import SourceCreate, SourceResponse

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceResponse])
def list_sources(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all data sources for the authenticated user.
    Not paginated — users will have a small number of sources.
    """
    sources = (
        db.query(DataSource)
        .filter(DataSource.user_id == user_id)
        .order_by(DataSource.created_at.desc())
        .all()
    )
    return sources


@router.post("", response_model=SourceResponse, status_code=201)
def create_source(
    body: SourceCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Create a data source. Idempotent — if a source with the same
    source_type already exists for this user, return it (200) instead
    of creating a duplicate.
    """
    existing = (
        db.query(DataSource)
        .filter(
            DataSource.user_id == user_id,
            DataSource.source_type == body.source_type,
        )
        .first()
    )
    if existing:
        # Return existing source — mobile client caches the ID
        return existing

    source = DataSource(
        user_id=user_id,
        source_type=body.source_type,
        config=body.config,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.patch("/{source_id}/synced", response_model=SourceResponse)
def mark_synced(
    source_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Update a source's last_synced_at timestamp to now.
    Called by the mobile app after a successful HealthKit sync.
    """
    source = (
        db.query(DataSource)
        .filter(
            DataSource.id == source_id,
            DataSource.user_id == user_id,
        )
        .first()
    )
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data source not found",
        )

    source.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(source)
    return source
