"""Baselines router — GET /baselines and POST /baselines/recalculate."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import UserBaseline
from app.schemas.baselines import BaselineResponse
from app.services.baseline_service import calculate_baselines

router = APIRouter(prefix="/baselines", tags=["baselines"])


@router.get("", response_model=list[BaselineResponse])
def list_baselines(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return current baselines for all metric types the user has."""
    baselines = (
        db.query(UserBaseline)
        .filter(UserBaseline.user_id == user_id)
        .order_by(UserBaseline.metric_type)
        .all()
    )
    return baselines


@router.post("/recalculate", response_model=list[BaselineResponse])
def recalculate_user_baselines(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Recalculate rolling baselines from the user's current metrics."""
    return calculate_baselines(db, user_id)
