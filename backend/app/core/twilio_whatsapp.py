import logging

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger("locus.twilio")


def _to_whatsapp(phone: str) -> str:
    return phone if phone.startswith("whatsapp:") else f"whatsapp:{phone}"


def _basic_auth(settings: Settings) -> tuple[str, str] | None:
    """Account SID is always required (it's the account the URL path
    authenticates against, not a credential by itself). Either an API Key
    SID/Secret pair or the account's own Auth Token can supply the actual
    credential — Twilio accepts both the same way over Basic Auth. The API
    Key pair wins when both are configured: scoped, revocable without
    rotating the account's master Auth Token."""
    if not settings.TWILIO_ACCOUNT_SID:
        return None
    if settings.TWILIO_API_KEY_SID and settings.TWILIO_API_KEY_SECRET:
        return (settings.TWILIO_API_KEY_SID, settings.TWILIO_API_KEY_SECRET)
    if settings.TWILIO_AUTH_TOKEN:
        return (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return None


async def send_whatsapp(to_phone: str, body: str) -> bool:
    """Best-effort send — never raises. Twilio Sandbox only delivers to
    numbers that have first texted the sandbox its join code; a failure here
    should never block the operational flow that triggered it."""
    settings = get_settings()
    auth = _basic_auth(settings)
    if not (auth and settings.TWILIO_WHATSAPP_FROM):
        logger.info("Twilio not configured — skipping WhatsApp send to %s", to_phone)
        return False

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    data = {"From": _to_whatsapp(settings.TWILIO_WHATSAPP_FROM), "To": _to_whatsapp(to_phone), "Body": body}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, data=data, auth=auth)
        if resp.status_code >= 300:
            logger.warning("Twilio WhatsApp send to %s failed (%s): %s", to_phone, resp.status_code, resp.text[:300])
            return False
        return True
    except Exception as exc:
        logger.warning("Twilio WhatsApp send to %s raised: %s", to_phone, exc)
        return False


async def send_intake_receipt(to_phone: str, tracking_id: str, tracking_url: str) -> bool:
    body = (
        f"LOCUS: Your package {tracking_id} has been picked up and is on its way. "
        f"Track it live: {tracking_url}"
    )
    return await send_whatsapp(to_phone, body)


async def send_out_for_delivery(to_phone: str, tracking_id: str, otp: str, eta_minutes: int = 45) -> bool:
    body = (
        f"LOCUS: Your package {tracking_id} is out for delivery, ETA ~{eta_minutes} mins. "
        f"Share this code with the agent ONLY at the doorstep: {otp}"
    )
    return await send_whatsapp(to_phone, body)
