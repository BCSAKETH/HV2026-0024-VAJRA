from datetime import datetime, timezone
from typing import Annotated

from dateutil import parser as dateparser
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.bags import bag_out, child_count, get_bag_or_404
from app.core.security import require_roles
from app.core.supabase_client import get_admin_client
from app.core.velocity import CloneSuspected, assert_not_cloned, clone_http_error
from app.models.phase2 import BagOut
from app.models.phase3 import ArriveIn, DepartIn, SyncBatchIn, SyncResultItem

router = APIRouter(prefix="/bags", tags=["linehaul"])

_ROLES = ("LINE_HAUL", "SUPER_ADMIN")
MIN_SOFT_AUDIT_ITEMS = 3


def _depart_bag(admin, bag: dict, staff_id: str, lat: float | None, lng: float | None) -> dict:
    if bag["status"] != "SEALED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Bag '{bag['bag_id']}' isn't SEALED (status={bag['status']}) — can't depart.")

    try:
        assert_not_cloned(admin, bag_id=bag["bag_id"], tracking_id=None, lat=lat, lng=lng)
    except CloneSuspected as exc:
        admin.table("tracking_events").insert(
            {"bag_id": bag["bag_id"], "event_type": "COMPROMISED", "lat": lat, "lng": lng, "staff_id": staff_id, "meta": {"speed_kmh": exc.speed_kmh, "distance_km": exc.distance_km, "stage": "DEPART"}}
        ).execute()
        raise clone_http_error(exc) from exc

    admin.table("master_bags").update({"status": "IN_TRANSIT", "assigned_staff_id": staff_id, "dispatched_at": datetime.now(timezone.utc).isoformat()}).eq("bag_id", bag["bag_id"]).execute()
    admin.table("tracking_events").insert({"bag_id": bag["bag_id"], "event_type": "DEPARTED", "lat": lat, "lng": lng, "staff_id": staff_id}).execute()

    return get_bag_or_404(admin, bag["bag_id"])


def _arrive_bag(admin, bag: dict, staff_id: str, lat: float | None, lng: float | None, via_shortcode: bool, soft_audit_ids: list[str]) -> dict:
    if bag["status"] != "IN_TRANSIT":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Bag '{bag['bag_id']}' isn't IN_TRANSIT (status={bag['status']}) — can't arrive.")

    try:
        assert_not_cloned(admin, bag_id=bag["bag_id"], tracking_id=None, lat=lat, lng=lng)
    except CloneSuspected as exc:
        admin.table("tracking_events").insert(
            {"bag_id": bag["bag_id"], "event_type": "COMPROMISED", "lat": lat, "lng": lng, "staff_id": staff_id, "meta": {"speed_kmh": exc.speed_kmh, "distance_km": exc.distance_km, "stage": "ARRIVE"}}
        ).execute()
        raise clone_http_error(exc) from exc

    # --- Defense 5: Mutilated QR Fallback -> Soft Audit ---
    if via_shortcode:
        children = admin.table("shipments").select("tracking_id").eq("current_bag_id", bag["bag_id"]).execute()
        child_ids = {c["tracking_id"] for c in children.data}
        required = min(MIN_SOFT_AUDIT_ITEMS, len(child_ids))
        proven = {t for t in soft_audit_ids if t in child_ids}
        if len(proven) < required:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "SOFT_AUDIT_REQUIRED",
                    "message": f"QR was entered manually — physically scan {required} item(s) from inside this bag to prove possession.",
                    "required": required,
                    "proven": len(proven),
                },
            )

    admin.table("master_bags").update({"status": "ARRIVED", "arrived_at": datetime.now(timezone.utc).isoformat()}).eq("bag_id", bag["bag_id"]).execute()
    admin.table("tracking_events").insert({"bag_id": bag["bag_id"], "event_type": "ARRIVED_AT_HUB", "lat": lat, "lng": lng, "staff_id": staff_id}).execute()

    # --- Defense 4: Transit Leakage — bulk-assume every child is now at the hub ---
    children = admin.table("shipments").select("tracking_id").eq("current_bag_id", bag["bag_id"]).eq("status", "IN_BAG").execute()
    child_ids = [c["tracking_id"] for c in children.data]
    if child_ids:
        admin.table("shipments").update({"status": "ASSUMED_AT_HUB", "status_confidence": "SOFT"}).in_("tracking_id", child_ids).execute()
        admin.table("tracking_events").insert(
            [{"tracking_id": tid, "event_type": "ARRIVED_AT_HUB", "lat": lat, "lng": lng, "staff_id": staff_id, "meta": {"via": "bag_arrival"}} for tid in child_ids]
        ).execute()

    return get_bag_or_404(admin, bag["bag_id"])


@router.post("/{bag_id}/depart", response_model=BagOut)
def depart_bag(bag_id: str, payload: DepartIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> BagOut:
    admin = get_admin_client()
    bag = get_bag_or_404(admin, bag_id)
    updated = _depart_bag(admin, bag, staff["id"], payload.staff_lat, payload.staff_lng)
    return bag_out(admin, updated)


@router.post("/{bag_id}/arrive", response_model=BagOut)
def arrive_bag(bag_id: str, payload: ArriveIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> BagOut:
    admin = get_admin_client()
    bag = get_bag_or_404(admin, bag_id)
    updated = _arrive_bag(admin, bag, staff["id"], payload.staff_lat, payload.staff_lng, payload.via_shortcode, payload.soft_audit_tracking_ids)
    return bag_out(admin, updated)


sync_router = APIRouter(prefix="/sync", tags=["linehaul"])


def _is_stale(admin, bag_id: str, client_timestamp: datetime) -> bool:
    """The offline-queue staleness guard: if the DB already has a tracking
    event for this bag newer than when the cached action happened on-device,
    the world has moved on — discard rather than replay it out of order."""
    last = admin.table("tracking_events").select("created_at").eq("bag_id", bag_id).order("created_at", desc=True).limit(1).execute()
    if not last.data:
        return False
    last_ts = dateparser.isoparse(last.data[0]["created_at"])
    return client_timestamp <= last_ts


@sync_router.post("/bag-events", response_model=list[SyncResultItem])
def sync_bag_events(payload: SyncBatchIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> list[SyncResultItem]:
    """Where the Split-Brain Fix lands. Mobile queues DEPART/ARRIVE actions
    locally while offline and replays them here on reconnect, in the order
    they happened on-device."""
    admin = get_admin_client()
    results: list[SyncResultItem] = []

    for event in sorted(payload.events, key=lambda e: e.client_timestamp):
        try:
            client_ts = dateparser.isoparse(event.client_timestamp)
        except (ValueError, TypeError):
            results.append(SyncResultItem(client_event_id=event.client_event_id, status="failed", message="Unparseable client_timestamp"))
            continue

        if _is_stale(admin, event.bag_id, client_ts):
            results.append(SyncResultItem(client_event_id=event.client_event_id, status="discarded_stale", message="A newer event already exists for this bag"))
            continue

        try:
            bag = get_bag_or_404(admin, event.bag_id)
            if event.action == "DEPART":
                updated = _depart_bag(admin, bag, staff["id"], event.lat, event.lng)
            else:
                updated = _arrive_bag(admin, bag, staff["id"], event.lat, event.lng, event.via_shortcode, event.soft_audit_tracking_ids)
            results.append(SyncResultItem(client_event_id=event.client_event_id, status="applied", bag=bag_out(admin, updated)))
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else exc.detail.get("message", str(exc.detail))
            results.append(SyncResultItem(client_event_id=event.client_event_id, status="failed", message=detail))

    return results
