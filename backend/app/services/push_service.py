"""Push notification service — APNs HTTP/2 delivery.

Uses ``httpx`` to send push notifications to Apple Push Notification service
via the token-based (JWT) authentication method with a ``.p8`` auth key.

Required config (set via environment / .env):
  - ``APNS_KEY_ID``     – 10-character Key ID from Apple Developer portal
  - ``APNS_TEAM_ID``    – 10-character Team ID
  - ``APNS_AUTH_KEY_PATH`` – path to the ``.p8`` file
  - ``APPLE_BUNDLE_ID`` – already in config ("com.vitalview.app")

The service is a no-op when any of the above credentials are missing,
which allows local development without APNs setup.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

import httpx
from jose import jwt as jose_jwt

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# APNs endpoints
# ---------------------------------------------------------------------------

_APNS_PROD = "https://api.push.apple.com"
_APNS_SANDBOX = "https://api.sandbox.push.apple.com"

# Cache the JWT for ~50 minutes (Apple tokens expire after 60 min)
_cached_token: str | None = None
_cached_token_time: float = 0
_TOKEN_TTL = 50 * 60  # 50 minutes in seconds


# ---------------------------------------------------------------------------
# JWT generation for APNs token-based auth
# ---------------------------------------------------------------------------

def _load_auth_key(path: str) -> str:
    """Read the .p8 private key file and return its contents."""
    return Path(path).read_text().strip()


def _get_apns_jwt() -> str | None:
    """Return a cached or freshly-minted APNs JWT (ES256 signed).

    Returns ``None`` if credentials are not configured.
    """
    global _cached_token, _cached_token_time

    settings = get_settings()
    key_id = settings.APNS_KEY_ID
    team_id = settings.APNS_TEAM_ID
    key_path = settings.APNS_AUTH_KEY_PATH

    if not key_id or not team_id or not key_path:
        return None

    now = time.time()
    if _cached_token and (now - _cached_token_time) < _TOKEN_TTL:
        return _cached_token

    try:
        private_key = _load_auth_key(key_path)
        payload = {
            "iss": team_id,
            "iat": int(now),
        }
        token = jose_jwt.encode(
            payload,
            private_key,
            algorithm="ES256",
            headers={"kid": key_id},
        )
        _cached_token = token
        _cached_token_time = now
        return token
    except Exception:
        logger.exception("Failed to generate APNs JWT")
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def send_push_notification(
    device_token: str,
    title: str,
    body: str,
    *,
    badge: int | None = 1,
    sound: str = "default",
    data: dict | None = None,
    use_sandbox: bool = False,
) -> bool:
    """Send a single push notification via APNs HTTP/2.

    Args:
        device_token: The APNs device token (hex string).
        title: Alert title.
        body: Alert body text.
        badge: App icon badge count (None to leave unchanged).
        sound: Sound name ("default" for system sound).
        data: Custom payload data (merged into the push payload).
        use_sandbox: Use the sandbox APNs endpoint (for dev builds).

    Returns:
        ``True`` if the push was accepted, ``False`` otherwise.
    """
    settings = get_settings()
    token = _get_apns_jwt()

    if token is None:
        logger.info(
            "APNs credentials not configured — skipping push notification"
        )
        return False

    base_url = _APNS_SANDBOX if use_sandbox else _APNS_PROD
    url = f"{base_url}/3/device/{device_token}"

    # Build APNs payload
    aps: dict = {
        "alert": {"title": title, "body": body},
        "sound": sound,
    }
    if badge is not None:
        aps["badge"] = badge

    payload: dict = {"aps": aps}
    if data:
        payload.update(data)

    headers = {
        "authorization": f"bearer {token}",
        "apns-topic": settings.APPLE_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
    }

    try:
        async with httpx.AsyncClient(http2=True) as client:
            response = await client.post(
                url,
                json=payload,
                headers=headers,
                timeout=10.0,
            )

        if response.status_code == 200:
            logger.info("Push sent to device %s...%s", device_token[:8], device_token[-4:])
            return True
        else:
            logger.warning(
                "APNs returned %s for device %s: %s",
                response.status_code,
                device_token[:8],
                response.text,
            )
            return False
    except Exception:
        logger.exception("Failed to send push notification to %s", device_token[:8])
        return False


async def send_debrief_push(
    device_token: str,
    week_start_str: str,
    week_end_str: str,
    *,
    use_sandbox: bool = False,
) -> bool:
    """Send a debrief-ready push notification.

    Convenience wrapper with the standard debrief alert copy.
    """
    return await send_push_notification(
        device_token=device_token,
        title="Your Weekly Health Debrief",
        body=f"Your debrief for {week_start_str} – {week_end_str} is ready",
        data={"type": "debrief_ready"},
        use_sandbox=use_sandbox,
    )
