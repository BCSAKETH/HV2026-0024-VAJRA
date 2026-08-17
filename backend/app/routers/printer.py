from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.ids import new_bag_ids, new_shipment_ids
from app.core.security import require_roles
from app.core.supabase_client import get_admin_client
from app.models.phase2 import PrinterGenerateIn, PrinterGenerateOut, PrinterItemOut

router = APIRouter(prefix="/printer", tags=["printer"])

_ALLOWED_ROLES = ("WAREHOUSE_STAFF", "HUB_MANAGER", "SUPER_ADMIN")


@router.post("/generate", response_model=PrinterGenerateOut)
def generate(
    payload: PrinterGenerateIn,
    staff: Annotated[dict, Depends(require_roles(*_ALLOWED_ROLES))],
) -> PrinterGenerateOut:
    admin = get_admin_client()
    items: list[PrinterItemOut] = []

    if payload.type == "PARCEL":
        rows = []
        for _ in range(payload.count):
            tracking_id, shortcode = new_shipment_ids()
            rows.append({"tracking_id": tracking_id, "shortcode": shortcode, "status": "PRE_ALLOCATED"})
        admin.table("shipments").insert(rows).execute()
        items = [PrinterItemOut(id=r["tracking_id"], shortcode=r["shortcode"]) for r in rows]
    else:
        rows = []
        for _ in range(payload.count):
            bag_id, shortcode = new_bag_ids()
            rows.append({"bag_id": bag_id, "shortcode": shortcode, "status": "PRE_ALLOCATED"})
        admin.table("master_bags").insert(rows).execute()
        items = [PrinterItemOut(id=r["bag_id"], shortcode=r["shortcode"]) for r in rows]

    return PrinterGenerateOut(type=payload.type, items=items)
