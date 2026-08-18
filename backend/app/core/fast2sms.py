import logging
import re

import httpx

from app.core.config import get_settings

logger = logging.getLogger("locus.fast2sms")

_API_URL = "https://www.fast2sms.com/dev/bulkV2"


def _to_fast2sms_number(phone: str) -> str:
    """Fast2SMS wants a bare 10-digit Indian mobile number — no country
    code, no '+'. Strips a leading 91/+91 if present, then takes the last
    10 digits so both '+919182790213' and '9182790213' normalize the same."""
    digits = re.sub(r"\D", "", phone)
    return digits[-10:]


async def send_sms(to_phone: str, body: str) -> bool:
    """Best-effort send — never raises. A failure here should never block
    the operational flow that triggered it.

    Uses route=q (Quick SMS) — the only Fast2SMS route that accepts
    arbitrary custom text without DLT template registration. That route is
    gated behind a real ₹100+ wallet top-up regardless of account/trial
    status (not documented anywhere; found by testing) until the wallet
    clears it, so an unconfigured or not-yet-unlocked account degrades to a
    logged no-op rather than raising."""
    settings = get_settings()
    if not settings.FAST2SMS_API_KEY:
        logger.info("Fast2SMS not configured — skipping SMS send to %s", to_phone)
        return False

    number = _to_fast2sms_number(to_phone)
    if len(number) != 10:
        logger.warning("Fast2SMS send to %r skipped — not a valid 10-digit Indian mobile number", to_phone)
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                _API_URL,
                params={"message": body, "route": "q", "numbers": number},
                headers={"authorization": settings.FAST2SMS_API_KEY},
            )
        data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        if resp.status_code >= 300 or not data.get("return"):
            logger.warning("Fast2SMS send to %s failed (%s): %s", to_phone, resp.status_code, resp.text[:300])
            return False
        return True
    except Exception as exc:
        logger.warning("Fast2SMS send to %s raised: %s", to_phone, exc)
        return False


async def send_intake_receipt(to_phone: str, tracking_id: str, tracking_url: str) -> bool:
    body = (
        f"LOCUS: Your package {tracking_id} has been picked up and is on its way. "
        f"Track it live: {tracking_url}"
    )
    return await send_sms(to_phone, body)


async def send_out_for_delivery(to_phone: str, tracking_id: str, otp: str, eta_minutes: int = 45) -> bool:
    body = (
        f"LOCUS: Your package {tracking_id} is out for delivery, ETA ~{eta_minutes} mins. "
        f"Share this code with the agent ONLY at the doorstep: {otp}"
    )
    return await send_sms(to_phone, body)
