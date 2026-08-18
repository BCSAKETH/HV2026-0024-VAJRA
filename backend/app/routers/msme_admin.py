from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.hub_scope import resolve_scope_hub_id
from app.core.security import require_roles
from app.core.supabase_client import fetch_one, get_admin_client
from app.models.msme_admin import MsmeDetailOut, MsmeSummaryOut
from app.models.phase2 import ShipmentOut

router = APIRouter(prefix="/admin/msmes", tags=["msmes"])

_ROLES = ("HUB_MANAGER", "SUPER_ADMIN")


def _hub_bag_ids(admin, hub_id: str) -> list[str]:
    result = admin.table("master_bags").select("bag_id").or_(f"origin_hub_id.eq.{hub_id},destination_hub_id.eq.{hub_id}").execute()
    return [b["bag_id"] for b in result.data]


def _scoped_msme_ids(admin, hub_id: str | None) -> set[str] | None:
    """None means "no scoping — every MSME". A Hub Manager only sees MSMEs
    whose shipments actually touched their hub (via a bag) or whose
    delivery pincode routes there before ever being bagged — same shape of
    scoping used everywhere else (KPIs, analytics)."""
    if not hub_id:
        return None

    bag_ids = _hub_bag_ids(admin, hub_id)
    pincodes = [p["pincode"] for p in admin.table("pincode_routes").select("pincode").eq("destination_hub_id", hub_id).execute().data]

    msme_ids: set[str] = set()
    if bag_ids:
        for s in admin.table("shipments").select("msme_id").in_("current_bag_id", bag_ids).not_.is_("msme_id", "null").execute().data:
            msme_ids.add(s["msme_id"])
    if pincodes:
        for s in admin.table("shipments").select("msme_id").in_("delivery_pincode", pincodes).not_.is_("msme_id", "null").execute().data:
            msme_ids.add(s["msme_id"])
    return msme_ids


@router.get("", response_model=list[MsmeSummaryOut])
def list_msmes(staff: Annotated[dict, Depends(require_roles(*_ROLES))], preview_hub_id: Annotated[str | None, Query()] = None) -> list[MsmeSummaryOut]:
    admin = get_admin_client()
    hub_id = resolve_scope_hub_id(staff, preview_hub_id)
    scoped_ids = _scoped_msme_ids(admin, hub_id)

    if scoped_ids is not None and not scoped_ids:
        return []

    query = admin.table("msmes").select("*").order("created_at", desc=True)
    if scoped_ids is not None:
        query = query.in_("id", list(scoped_ids))
    msmes = query.execute().data

    out: list[MsmeSummaryOut] = []
    for m in msmes:
        shipments = admin.table("shipments").select("created_at").eq("msme_id", m["id"]).order("created_at").execute().data
        out.append(
            MsmeSummaryOut(
                **m,
                shipment_count=len(shipments),
                first_shipped_at=shipments[0]["created_at"] if shipments else None,
            )
        )
    return out


@router.get("/{msme_id}", response_model=MsmeDetailOut)
def get_msme_detail(msme_id: str, staff: Annotated[dict, Depends(require_roles(*_ROLES))], preview_hub_id: Annotated[str | None, Query()] = None) -> MsmeDetailOut:
    admin = get_admin_client()
    msme = fetch_one(admin.table("msmes").select("*").eq("id", msme_id).maybe_single())
    if not msme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown MSME id")

    hub_id = resolve_scope_hub_id(staff, preview_hub_id)
    if hub_id:
        scoped_ids = _scoped_msme_ids(admin, hub_id)
        if msme_id not in (scoped_ids or set()):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This MSME hasn't shipped through your hub")

    shipments = admin.table("shipments").select("*").eq("msme_id", msme_id).order("created_at", desc=True).execute().data

    total_value = sum(float(s.get("declared_value") or 0) for s in shipments)
    delivered_count = sum(1 for s in shipments if s["status"] == "DELIVERED")
    rto_count = sum(1 for s in shipments if s["status"] == "RTO")

    return MsmeDetailOut(
        **msme,
        total_shipments=len(shipments),
        total_value=round(total_value, 2),
        delivered_count=delivered_count,
        rto_count=rto_count,
        shipments=[ShipmentOut(**s) for s in shipments],
    )
