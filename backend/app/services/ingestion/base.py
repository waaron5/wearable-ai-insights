"""Abstract base class for data source adapters.

DEPRECATED for iOS: HealthKit on the mobile client reads and normalizes data
from Apple Watch, Whoop, Oura, Garmin (via their Apple Health sync).
Individual server-side adapters per wearable are no longer needed.

The ManualAdapter is still used by the seed script for demo/test data.
This base class remains as scaffolding in case server-side ingestion
is needed in the future (e.g., for a web client or Fitbit API fallback).
"""

import uuid
from abc import ABC, abstractmethod
from datetime import date

from sqlalchemy.orm import Session

from app.models.models import HealthMetric


class DataSourceAdapter(ABC):
    """Interface that every data source adapter must implement."""

    @abstractmethod
    def sync(
        self,
        db: Session,
        user_id: uuid.UUID,
        source_id: uuid.UUID,
        start_date: date,
        end_date: date,
    ) -> list[HealthMetric]:
        """
        Fetch data from the external source and upsert normalized
        HealthMetric rows for the given date range.

        Returns the list of upserted HealthMetric rows.
        """
        ...
