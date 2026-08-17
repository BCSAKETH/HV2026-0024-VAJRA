from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.security import get_current_staff
from app.core.supabase_client import fetch_one, get_admin_client

router = APIRouter(prefix="/resolve", tags=["resolve"])


class ResolveOut(BaseModel):
    type: Literal["PARCEL", "BAG"]
    id: str


@router.get("/{code}", response_model=ResolveOut)
def resolve_code(code: str, staff: Annotated[dict, Depends(get_current_staff)]) -> ResolveOut:
    """Resolves a scanned/typed code to a concrete tracking_id or bag_id.
    A QR's payload already IS the id (e.g. 'TRK-000042'), so this is really
    for the 6-digit shortcode fallback when a QR is unreadable/torn."""
    admin = get_admin_client()
    code = code.strip().upper()

    if code.startswith("TRK-"):
        return ResolveOut(type="PARCEL", id=code)
    if code.startswith("BAG-"):
        return ResolveOut(type="BAG", id=code)

    shipment = fetch_one(admin.table("shipments").select("tracking_id").eq("shortcode", code).maybe_single())
    if shipment:
        return ResolveOut(type="PARCEL", id=shipment["tracking_id"])

    bag = fetch_one(admin.table("master_bags").select("bag_id").eq("shortcode", code).maybe_single())
    if bag:
        return ResolveOut(type="BAG", id=bag["bag_id"])

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No parcel or bag matches code '{code}'")
