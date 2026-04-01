"""AI provider factory.

Returns the correct ``HealthAIService`` implementation based on the
``AI_PROVIDER`` environment variable (read via ``core/config.py``).

Usage::

    from app.services.ai.factory import get_ai_service

    ai = get_ai_service()           # singleton per provider
    result = await ai.generate_debrief(summary)

Adding a new provider:
  1. Create ``services/ai/<provider>_service.py`` implementing ``HealthAIService``
  2. Register it in ``_REGISTRY`` below
  3. Set ``AI_PROVIDER=<key>`` in ``.env``
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import get_settings
from app.services.ai.base import HealthAIService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider registry — maps AI_PROVIDER env values to lazy import paths.
# Using strings avoids importing heavy SDKs until actually needed.
# ---------------------------------------------------------------------------

_REGISTRY: dict[str, str] = {
    "vertexai": "app.services.ai.gemini_service.GeminiHealthAIService",
    "local": "app.services.ai.local_service.LocalHealthAIService",
}


def _looks_unconfigured(value: str) -> bool:
    normalized = value.strip().lower()
    if not normalized:
        return True
    return any(
        marker in normalized
        for marker in ("placeholder", "your-", "path/to", "change-me")
    )


def _provider_is_configured(provider: str) -> bool:
    settings = get_settings()

    if provider == "vertexai":
        return not (
            _looks_unconfigured(settings.GCP_PROJECT_ID)
            or _looks_unconfigured(settings.GOOGLE_APPLICATION_CREDENTIALS)
        )

    return True


def _import_class(dotted_path: str) -> type[HealthAIService]:
    """Dynamically import a class from a dotted module path."""
    module_path, class_name = dotted_path.rsplit(".", 1)
    import importlib

    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)

    if not (isinstance(cls, type) and issubclass(cls, HealthAIService)):
        raise TypeError(
            f"{dotted_path} is not a HealthAIService subclass"
        )
    return cls


@lru_cache(maxsize=1)
def get_ai_service() -> HealthAIService:
    """Return a singleton ``HealthAIService`` for the configured provider.

    The instance is cached so repeated calls return the same object
    (preserving any internal state like lazy-initialised SDK clients).

    Raises:
        ValueError: If ``AI_PROVIDER`` is not found in the registry.
    """
    settings = get_settings()
    provider = settings.AI_PROVIDER.lower()

    dotted_path = _REGISTRY.get(provider)
    if dotted_path is None:
        logger.warning(
            "Unknown AI provider '%s' configured; falling back to local mode",
            provider,
        )
        provider = "local"
        dotted_path = _REGISTRY[provider]

    if not _provider_is_configured(provider):
        logger.warning(
            "AI provider '%s' is not configured; falling back to local mode",
            provider,
        )
        provider = "local"
        dotted_path = _REGISTRY[provider]

    cls = _import_class(dotted_path)
    instance = cls()

    logger.info("AI provider initialised: %s (%s)", provider, dotted_path)
    return instance
