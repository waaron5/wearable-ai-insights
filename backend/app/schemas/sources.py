"""Data source schemas — GET /sources response and POST /sources body."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# Recognised source types — validated at the schema level.
ALLOWED_SOURCE_TYPES = {
    "manual",
    "apple_healthkit",
    "apple_health",  # legacy alias
    "garmin",
    "fitbit",
    "whoop",
    "oura",
}


class SourceCreate(BaseModel):
    source_type: str = Field(max_length=50)
    config: dict[str, Any] | None = None

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        if v not in ALLOWED_SOURCE_TYPES:
            raise ValueError(
                f"source_type must be one of {sorted(ALLOWED_SOURCE_TYPES)}, got '{v}'"
            )
        return v


class SourceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source_type: str
    config: dict[str, Any] | None
    last_synced_at: datetime | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
