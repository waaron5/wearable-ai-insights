"""Onboarding router — POST /onboarding/seed-demo and /onboarding/complete."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import DataSource, HealthMetric, User
from app.schemas.sources import SourceResponse
from app.seed import seed_demo_data_for_user

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/seed-demo", response_model=SourceResponse, status_code=201)
def seed_demo(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Generate 90 days of demo health data for the authenticated user.
    Creates a manual data source, metrics, and baselines.
    Idempotent: returns existing source if demo data was already seeded.

    The mobile app should check for HealthKit data first. If the user
    has real HealthKit data, skip this endpoint. Only call this if
    HealthKit had no data or the user denied HealthKit access.
    """
    # Check if user already has a demo data source
    existing = (
        db.query(DataSource)
        .filter(
            DataSource.user_id == user_id,
            DataSource.source_type == "manual",
        )
        .first()
    )
    if existing:
        return existing

    # Check if user already has HealthKit data — no need for demo data
    healthkit_source = (
        db.query(DataSource)
        .filter(
            DataSource.user_id == user_id,
            DataSource.source_type == "apple_healthkit",
        )
        .first()
    )
    if healthkit_source:
        # Check if there are actual metrics from HealthKit
        metric_count = (
            db.query(HealthMetric)
            .filter(
                HealthMetric.user_id == user_id,
                HealthMetric.source_id == healthkit_source.id,
            )
            .count()
        )
        if metric_count > 0:
            # User has real data — return the HealthKit source instead
            return healthkit_source

    source = seed_demo_data_for_user(db, user_id)
    return source


@router.post("/complete", status_code=200)
def complete_onboarding(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Mark the user as onboarded. Called at the end of the onboarding wizard."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if user.onboarded_at is None:
        user.onboarded_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": "ok", "onboarded_at": user.onboarded_at.isoformat()}
