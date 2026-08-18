import base64
import json
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("locus.vision_ocr")

# Groq was the originally-specced provider, but as of this build Groq has
# zero working vision-capable chat models (every Llama vision variant is
# decommissioned, confirmed via a live call, not just docs) — see README for
# the full trail. Mistral's `ministral-*` line is the live replacement,
# verified end-to-end against a synthetic test bill before switching.
_PROMPT = """You are reading a photographed courier waybill / invoice for an MSME shipment.
Extract exactly these fields as strict JSON, nothing else:
{
  "sender_name": string or null,       // the MSME/business's own name — usually a letterhead, "From:", or shop name
  "sender_phone": string or null,      // the sender business's own phone number, if printed
  "recipient_name": string or null,
  "recipient_phone": string or null,   // digits only, include country code if visible, else null
  "delivery_address": string or null,  // the full street/locality address line(s), NOT including pincode
  "delivery_pincode": string or null,  // 6-digit Indian PIN code
  "declared_value": number or null,    // the item/order value in rupees, numeric only
  "weight_grams": number or null       // if a weight is printed on the bill, in grams; else null
}
Only extract what is actually printed/handwritten on the bill. Do not guess. Do not invent coordinates —
you are not able to know GPS location from an address, so never include lat/lng.
Respond with ONLY the JSON object, no markdown fences, no commentary."""


class VisionOcrError(RuntimeError):
    pass


async def extract_bill_fields(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    settings = get_settings()
    if not settings.MISTRAL_API_KEY:
        raise VisionOcrError("MISTRAL_API_KEY is not configured")

    b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": settings.MISTRAL_VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT},
                    # Mistral's wire format takes the data URI directly as a string,
                    # not nested in {"url": ...} like OpenAI/Groq — confirmed via a
                    # live test call, not assumed from the SDK's abstraction of it.
                    {"type": "image_url", "image_url": f"data:{mime_type};base64,{b64}"},
                ],
            }
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.MISTRAL_API_KEY}"},
            json=payload,
        )

    if resp.status_code != 200:
        logger.warning("Mistral OCR call failed (%s): %s", resp.status_code, resp.text[:500])
        raise VisionOcrError(f"Mistral API returned {resp.status_code}. Check MISTRAL_VISION_MODEL is still live.")

    body = resp.json()
    try:
        content = body["choices"][0]["message"]["content"]
        fields = json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        logger.warning("Could not parse Mistral OCR response: %s", body)
        raise VisionOcrError("Mistral returned a response that wasn't valid JSON") from exc

    # A 200 with every field null is a silent failure from the caller's
    # point of view (mobile shows "couldn't read the bill" with nothing to
    # go on) but wasn't logged anywhere until now -- there was genuinely no
    # trace to diagnose it from, live or in hindsight. This doesn't fix a
    # hard-to-read photo, it just means the next one leaves a record.
    non_null = sum(1 for v in fields.values() if v not in (None, ""))
    if non_null == 0:
        logger.warning("Mistral OCR returned an all-null extraction (image_bytes=%d, mime=%s) -- likely an unreadable/blank photo", len(image_bytes), mime_type)

    return fields
