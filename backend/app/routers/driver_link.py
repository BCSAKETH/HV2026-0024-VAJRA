from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.bags import bag_out
from app.core.hub_scope import resolve_scope_hub_id
from app.core.security import get_current_staff, require_roles
from app.core.supabase_client import fetch_one, get_admin_client
from app.models.driver_link import NotifyStaffIn, StaffManifestOut, StaffNotificationOut
from app.models.phase2 import ShipmentOut

router = APIRouter(prefix="/admin/staff", tags=["driver-link"])
notifications_router = APIRouter(prefix="/notifications", tags=["driver-link"])

_ROLES = ("HUB_MANAGER", "SUPER_ADMIN")


def _get_staff_in_scope_or_404(admin, staff: dict, target_staff_id: str) -> dict:
    """Same hub-lock every other admin/staff endpoint uses — a Hub Manager
    can only look at / notify staff assigned to their own hub."""
    target = fetch_one(admin.table("staff").select("*").eq("id", target_staff_id).maybe_single())
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown staff id")

    hub_id = resolve_scope_hub_id(staff, None)
    if hub_id and target.get("assigned_hub_id") != hub_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This staff member isn't in your hub")
    return target


@router.get("/{staff_id}/manifest", response_model=StaffManifestOut)
def get_staff_manifest(staff_id: str, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> StaffManifestOut:
    """Plan item 5b — everything currently linked to this staff member via
    assigned_staff_id (real scans only, never a notification/suggestion).
    A Line-Haul driver shows the bags they're carrying; a Last-Mile agent
    shows their delivery manifest; anyone else is normally empty, since
    only those two roles ever get assigned_staff_id set on anything."""
    admin = get_admin_client()
    _get_staff_in_scope_or_404(admin, staff, staff_id)

    bags = admin.table("master_bags").select("*").eq("assigned_staff_id", staff_id).order("created_at", desc=True).limit(50).execute().data
    shipments = (
        admin.table("shipments").select("*").eq("assigned_staff_id", staff_id).order("created_at", desc=True).limit(100).execute().data
    )

    return StaffManifestOut(
        bags=[bag_out(admin, b) for b in bags],
        shipments=[ShipmentOut(**s) for s in shipments],
    )


@router.post("/{staff_id}/notify", response_model=StaffNotificationOut, status_code=status.HTTP_201_CREATED)
def notify_staff(staff_id: str, payload: NotifyStaffIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> StaffNotificationOut:
    """Plan item 5c — a Hub Manager 'assigning' a driver to a bag/package is
    purely a notification. It never writes to assigned_staff_id — only a
    real physical scan does that (see linehaul.py / lastmile.py), which is
    what keeps Defense 7 (stowaway self-healing) and Defense 10
    (dead-battery handover) honest: the system always reflects who actually
    has the package in hand, never who was merely asked to go get it."""
    admin = get_admin_client()
    _get_staff_in_scope_or_404(admin, staff, staff_id)

    if payload.bag_id and not fetch_one(admin.table("master_bags").select("bag_id").eq("bag_id", payload.bag_id).maybe_single()):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown bag_id")
    if payload.tracking_id and not fetch_one(admin.table("shipments").select("tracking_id").eq("tracking_id", payload.tracking_id).maybe_single()):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown tracking_id")

    inserted = (
        admin.table("staff_notifications")
        .insert({"staff_id": staff_id, "created_by": staff["id"], "message": payload.message, "bag_id": payload.bag_id, "tracking_id": payload.tracking_id})
        .execute()
    )
    return StaffNotificationOut(**inserted.data[0])


@notifications_router.get("/mine", response_model=list[StaffNotificationOut])
def list_my_notifications(staff: Annotated[dict, Depends(get_current_staff)]) -> list[StaffNotificationOut]:
    admin = get_admin_client()
    rows = admin.table("staff_notifications").select("*").eq("staff_id", staff["id"]).order("created_at", desc=True).limit(50).execute().data
    return [StaffNotificationOut(**r) for r in rows]


@notifications_router.post("/{notification_id}/ack", response_model=StaffNotificationOut)
def acknowledge_notification(notification_id: str, staff: Annotated[dict, Depends(get_current_staff)]) -> StaffNotificationOut:
    admin = get_admin_client()
    existing = fetch_one(admin.table("staff_notifications").select("*").eq("id", notification_id).maybe_single())
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown notification id")
    if existing["staff_id"] != staff["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your notification")

    from datetime import datetime, timezone

    updated = admin.table("staff_notifications").update({"read_at": datetime.now(timezone.utc).isoformat()}).eq("id", notification_id).execute()
    return StaffNotificationOut(**updated.data[0])
