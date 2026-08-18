from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.ids import new_bag_ids, new_shipment_ids
from app.core.security import require_roles
from app.core.supabase_client import get_admin_client
from app.models.phase2 import PrinterGenerateIn, PrinterGenerateOut, PrinterItemOut

router = APIRouter(prefix="/printer", tags=["printer"])

# QR_PASTER is the dedicated role for this screen; Hub Manager/Super Admin
# can also reach it for oversight/troubleshooting.
_ALLOWED_ROLES = ("QR_PASTER", "HUB_MANAGER", "SUPER_ADMIN")


@router.post("/generate", response_model=PrinterGenerateOut)
def generate(
    payload: PrinterGenerateIn,
    staff: Annotated[dict, Depends(require_roles(*_ALLOWED_ROLES))],
) -> PrinterGenerateOut:
    """One QR at a time — matches the real one-at-a-time pace of pasting a
    sticker onto a box/bag before requesting the next. No batching."""
    admin = get_admin_client()

    if payload.type == "PARCEL":
        tracking_id, shortcode = new_shipment_ids()
        admin.table("shipments").insert({"tracking_id": tracking_id, "shortcode": shortcode, "status": "PRE_ALLOCATED"}).execute()
        item = PrinterItemOut(id=tracking_id, shortcode=shortcode)
    else:
        bag_id, shortcode = new_bag_ids()
        admin.table("master_bags").insert({"bag_id": bag_id, "shortcode": shortcode, "status": "PRE_ALLOCATED"}).execute()
        item = PrinterItemOut(id=bag_id, shortcode=shortcode)

    return PrinterGenerateOut(type=payload.type, item=item)
