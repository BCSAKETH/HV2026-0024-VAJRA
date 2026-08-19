from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.ids import new_bag_ids, new_shipment_ids
from app.core.security import require_roles
from app.core.supabase_client import fetch_one, get_admin_client
from app.models.phase2 import PrinterGenerateIn, PrinterGenerateOut, PrinterHistoryItemOut, PrinterItemOut

router = APIRouter(prefix="/printer", tags=["printer"])

# QR_PASTER is the dedicated role for this screen; Hub Manager/Super Admin
# can also reach it for oversight/troubleshooting.
_ALLOWED_ROLES = ("QR_PASTER", "HUB_MANAGER", "SUPER_ADMIN")


def _hub_name(admin, hub_id: str | None) -> str | None:
    if not hub_id:
        return None
    hub = fetch_one(admin.table("hubs").select("name").eq("id", hub_id).maybe_single())
    return hub["name"] if hub else None


@router.post("/generate", response_model=PrinterGenerateOut)
def generate(
    payload: PrinterGenerateIn,
    staff: Annotated[dict, Depends(require_roles(*_ALLOWED_ROLES))],
) -> PrinterGenerateOut:
    """One QR at a time — matches the real one-at-a-time pace of pasting a
    sticker onto a box/bag before requesting the next. No batching."""
    admin = get_admin_client()
    hub_name = _hub_name(admin, staff.get("assigned_hub_id"))

    if payload.type == "PARCEL":
        tracking_id, shortcode = new_shipment_ids()
        inserted = admin.table("shipments").insert(
            {
                "tracking_id": tracking_id,
                "shortcode": shortcode,
                "status": "PRE_ALLOCATED",
                "generated_by_staff_id": staff["id"],
            }
        ).execute()
        row = inserted.data[0]
        item = PrinterItemOut(id=tracking_id, shortcode=shortcode, created_at=row["created_at"], generated_by_hub_name=hub_name)
    else:
        bag_id, shortcode = new_bag_ids()
        inserted = admin.table("master_bags").insert(
            {
                "bag_id": bag_id,
                "shortcode": shortcode,
                "status": "PRE_ALLOCATED",
                "generated_by_staff_id": staff["id"],
            }
        ).execute()
        row = inserted.data[0]
        item = PrinterItemOut(id=bag_id, shortcode=shortcode, created_at=row["created_at"], generated_by_hub_name=hub_name)

    return PrinterGenerateOut(type=payload.type, item=item)


@router.get("/history", response_model=list[PrinterHistoryItemOut])
def history(
    staff: Annotated[dict, Depends(require_roles("QR_PASTER"))],
    from_date: Annotated[str | None, Query(alias="from")] = None,
    to_date: Annotated[str | None, Query(alias="to")] = None,
) -> list[PrinterHistoryItemOut]:
    """QR Paster's own generation history only — hard-scoped to this staff
    member's id, never hub-wide. Deliberately minimal: just the QR + code +
    when, no timeline/detail (that's Hub Manager's Search Tracking instead)."""
    admin = get_admin_client()

    def _query(table: str, id_col: str):
        q = admin.table(table).select(f"{id_col}, shortcode, created_at").eq("generated_by_staff_id", staff["id"])
        if from_date:
            q = q.gte("created_at", from_date)
        if to_date:
            q = q.lte("created_at", to_date)
        return q.execute().data

    items = [
        PrinterHistoryItemOut(id=r["tracking_id"], shortcode=r["shortcode"], type="PARCEL", created_at=r["created_at"])
        for r in _query("shipments", "tracking_id")
    ] + [
        PrinterHistoryItemOut(id=r["bag_id"], shortcode=r["shortcode"], type="BAG", created_at=r["created_at"])
        for r in _query("master_bags", "bag_id")
    ]

    items.sort(key=lambda x: x.created_at, reverse=True)
    return items
