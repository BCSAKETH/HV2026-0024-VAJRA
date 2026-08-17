import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("locus.geocode")


async def geocode_address(address: str | None, pincode: str | None) -> tuple[float, float] | None:
    """Resolve a delivery address to (lat, lng) via Nominatim (OpenStreetMap) —
    NOT via Groq. Vision OCR only ever reads text off the bill; it cannot know
    real-world coordinates. This is what Defense 9's geofence is measured
    against, so a miss here just means the driver falls back to the
    "Call Recipient" button — it never blocks intake.
    """
    settings = get_settings()
    query_parts = [p for p in [address, pincode] if p]
    if not query_parts:
        return None
    query = ", ".join(query_parts)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{settings.NOMINATIM_BASE_URL}/search",
                params={"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "in"},
                headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
            )
            resp.raise_for_status()
            results = resp.json()
    except Exception as exc:  # network issues, bad address text, rate limiting — never block intake on this
        logger.warning("Nominatim geocode failed for %r: %s", query, exc)
        return None

    if not results:
        logger.info("Nominatim found no match for %r", query)
        return None

    try:
        return float(results[0]["lat"]), float(results[0]["lon"])
    except (KeyError, ValueError, TypeError):
        return None
