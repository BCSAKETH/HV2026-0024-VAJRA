from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.core.geocode import geocode_address
from app.core.security import get_current_staff, require_roles
from app.core.storage import upload_condition_photo
from app.core.supabase_client import fetch_one, get_admin_client
from app.core.fast2sms import send_intake_receipt
from app.models.phase2 import ConditionPhotosOut, IntakeConfirmIn, MsmeOut, ShipmentOut

router = APIRouter(tags=["shipments"])

_INTAKE_ROLES = ("BILL_SCANNER", "SUPER_ADMIN")


def _get_shipment_or_404(admin, tracking_id: str) -> dict:
    result = fetch_one(admin.table("shipments").select("*").eq("tracking_id", tracking_id).maybe_single())
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown tracking_id")
    return result


def _get_or_create_msme(admin, phone: str, business_name: str | None) -> dict:
    existing = fetch_one(admin.table("msmes").select("*").eq("phone", phone).maybe_single())
    if existing:
        return existing
    if not business_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This MSME phone number isn't on file yet — msme_business_name is required to create it.",
        )
    inserted = admin.table("msmes").insert({"business_name": business_name, "phone": phone}).execute()
    return inserted.data[0]


@router.get("/msmes/by-phone/{phone}", response_model=MsmeOut)
def get_msme_by_phone(phone: str, staff: Annotated[dict, Depends(get_current_staff)]) -> MsmeOut:
    admin = get_admin_client()
    result = fetch_one(admin.table("msmes").select("*").eq("phone", phone).maybe_single())
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No MSME on file for that phone")
    return MsmeOut(**result)


@router.get("/shipments/{tracking_id}", response_model=ShipmentOut)
def get_shipment(tracking_id: str, staff: Annotated[dict, Depends(get_current_staff)]) -> ShipmentOut:
    admin = get_admin_client()
    return ShipmentOut(**_get_shipment_or_404(admin, tracking_id))


@router.post("/shipments/{tracking_id}/intake", response_model=ShipmentOut)
async def confirm_intake(
    tracking_id: str,
    payload: IntakeConfirmIn,
    staff: Annotated[dict, Depends(require_roles(*_INTAKE_ROLES))],
) -> ShipmentOut:
    admin = get_admin_client()
    shipment = _get_shipment_or_404(admin, tracking_id)

    if shipment["status"] not in ("PRE_ALLOCATED", "CREATED"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{tracking_id}' has already moved past intake (status={shipment['status']}).",
        )

    # This must be checked BEFORE the update below, since the update itself
    # moves status to CREATED — this flag distinguishes a genuine first
    # confirm from a retry/edit of an already-confirmed intake. Without it,
    # a client that retries on a timeout (even though the first call already
    # succeeded) re-logs an INTAKE event and re-sends the SMS receipt every
    # single retry — confirmed live: one flaky mobile submission produced 4
    # duplicate INTAKE events and 4 duplicate SMS to the same customer.
    is_first_confirm = shipment["status"] == "PRE_ALLOCATED"

    update: dict = {"status": "CREATED"}
    for field in (
        "recipient_name",
        "recipient_phone",
        "delivery_address",
        "delivery_pincode",
        "weight_grams",
        "declared_value",
    ):
        value = getattr(payload, field)
        if value is not None:
            update[field] = value

    if payload.msme_phone:
        msme = _get_or_create_msme(admin, payload.msme_phone, payload.msme_business_name)
        update["msme_id"] = msme["id"]

    # Geocode the bill's address text — NOT part of the Groq OCR step. Best
    # effort: a miss here degrades Defense 9 to the "Call Recipient" fallback
    # later, it never blocks intake.
    address_for_geocode = update.get("delivery_address", shipment.get("delivery_address"))
    pincode_for_geocode = update.get("delivery_pincode", shipment.get("delivery_pincode"))
    geocoded = await geocode_address(address_for_geocode, pincode_for_geocode)
    if geocoded:
        update["delivery_lat"], update["delivery_lng"] = geocoded

    updated = admin.table("shipments").update(update).eq("tracking_id", tracking_id).execute()
    row = updated.data[0]

    # Only the genuine first confirm gets a ledger entry and an SMS. A retry
    # or a manual correction of an already-CREATED shipment updates the
    # fields (a real, useful thing — e.g. fixing a bad OCR read) but must
    # not spam the customer or duplicate the immutable tracking_events log.
    if is_first_confirm:
        admin.table("tracking_events").insert(
            {
                "tracking_id": tracking_id,
                "event_type": "INTAKE",
                "lat": payload.staff_lat,
                "lng": payload.staff_lng,
                "staff_id": staff["id"],
            }
        ).execute()

        if row.get("recipient_phone"):
            settings = get_settings()
            # shortcode, not tracking_id -- the public /track/[id] page accepts
            # either, but the sequential tracking_id (TRK-000017, ...) is
            # trivially enumerable by incrementing the number in the URL. The
            # shortcode is a cryptographically random 6-char code instead.
            tracking_url = f"{settings.PUBLIC_WEB_BASE_URL}/track/{row['shortcode']}"
            await send_intake_receipt(row["recipient_phone"], tracking_id, tracking_url)

    return ShipmentOut(**row)


@router.post("/shipments/{tracking_id}/condition-photos", response_model=ConditionPhotosOut)
async def upload_condition_photos(
    tracking_id: str,
    staff: Annotated[dict, Depends(require_roles(*_INTAKE_ROLES))],
    files: Annotated[list[UploadFile], File(...)],
) -> ConditionPhotosOut:
    admin = get_admin_client()
    shipment = _get_shipment_or_404(admin, tracking_id)

    if len(files) > 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Max 4 condition photos per upload")

    new_urls: list[str] = []
    for f in files:
        content = await f.read()
        if not content:
            continue
        new_urls.append(upload_condition_photo(tracking_id, content, f.content_type or "image/jpeg"))

    all_urls = [*shipment["condition_photo_urls"], *new_urls]
    admin.table("shipments").update({"condition_photo_urls": all_urls}).eq("tracking_id", tracking_id).execute()

    return ConditionPhotosOut(tracking_id=tracking_id, condition_photo_urls=all_urls)
