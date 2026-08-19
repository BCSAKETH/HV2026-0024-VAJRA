from datetime import datetime, timezone
from typing import Annotated

from dateutil import parser as dateparser
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.bags import child_count as _child_count
from app.core.bottleneck_scanner import compute_bottlenecks
from app.core.hub_scope import AVG_TRUCK_SPEED_KMH, DELAY_THRESHOLD_MULTIPLIER, resolve_scope_hub_id
from app.core.security import require_roles
from app.core.staff_provisioning import delete_auth_user, get_or_create_auth_user
from app.core.supabase_client import fetch_one, get_admin_client
from app.core.velocity import haversine_km
from app.models.network_admin import CreateHubIn, CreatePincodeRouteIn, HubOut, PincodeRouteOut
from app.models.phase5 import (
    ActiveTransit,
    BottleneckOut,
    HubPoint,
    KpiOut,
    KpiScope,
    SearchTimelineEvent,
    SearchTrackingBagOut,
    SearchTrackingOut,
    SearchTrackingParcelOut,
    SecurityEvent,
    StaffLookupOut,
)
from app.models.staff_admin import HUB_MANAGER_CREATABLE_ROLES, CreateStaffIn, StaffOut

router = APIRouter(prefix="/admin", tags=["admin"])

_ROLES = ("HUB_MANAGER", "SUPER_ADMIN")


def _hub_bag_ids(admin, hub_id: str) -> list[str]:
    result = admin.table("master_bags").select("bag_id").or_(f"origin_hub_id.eq.{hub_id},destination_hub_id.eq.{hub_id}").execute()
    return [b["bag_id"] for b in result.data]


def _hub_point(admin, hub_id: str) -> HubPoint | None:
    result = fetch_one(admin.table("hubs").select("*").eq("id", hub_id).maybe_single())
    return HubPoint(**result) if result else None


@router.get("/kpis", response_model=KpiOut)
def get_kpis(staff: Annotated[dict, Depends(require_roles(*_ROLES))], preview_hub_id: Annotated[str | None, Query()] = None) -> KpiOut:
    admin = get_admin_client()
    hub_id = resolve_scope_hub_id(staff, preview_hub_id)

    if hub_id:
        bag_ids = _hub_bag_ids(admin, hub_id)
        pincodes = [p["pincode"] for p in admin.table("pincode_routes").select("pincode").eq("destination_hub_id", hub_id).execute().data]

        shipments: list[dict] = []
        seen: set[str] = set()
        if bag_ids:
            for s in admin.table("shipments").select("*").in_("current_bag_id", bag_ids).execute().data:
                if s["tracking_id"] not in seen:
                    seen.add(s["tracking_id"])
                    shipments.append(s)
        if pincodes:
            for s in admin.table("shipments").select("*").in_("delivery_pincode", pincodes).is_("current_bag_id", "null").execute().data:
                if s["tracking_id"] not in seen:
                    seen.add(s["tracking_id"])
                    shipments.append(s)
    else:
        bag_ids = None
        shipments = admin.table("shipments").select("*").neq("status", "PRE_ALLOCATED").execute().data

    total_active = sum(1 for s in shipments if s["status"] not in ("DELIVERED", "RTO"))

    tats_hours = []
    for s in shipments:
        if s["status"] == "DELIVERED" and s.get("delivered_at"):
            created = dateparser.isoparse(s["created_at"])
            done = dateparser.isoparse(s["delivered_at"])
            tats_hours.append((done - created).total_seconds() / 3600)
    average_tat = round(sum(tats_hours) / len(tats_hours), 1) if tats_hours else None

    event_query = admin.table("tracking_events").select("event_type").in_("event_type", ["DEPARTED", "ARRIVED_AT_HUB", "COMPROMISED"])
    if hub_id:
        event_query = event_query.in_("bag_id", bag_ids) if bag_ids else None
    events = event_query.execute().data if event_query is not None else []
    total_scans = len(events)
    compromised = sum(1 for e in events if e["event_type"] == "COMPROMISED")
    integrity = 100.0 if total_scans == 0 else round((1 - compromised / total_scans) * 100, 1)

    hub_point = _hub_point(admin, hub_id) if hub_id else None

    status_breakdown: dict[str, int] = {}
    for s in shipments:
        status_breakdown[s["status"]] = status_breakdown.get(s["status"], 0) + 1

    return KpiOut(
        total_active_orders=total_active,
        average_tat_hours=average_tat,
        network_integrity_index=integrity,
        status_breakdown=status_breakdown,
        scope=KpiScope(type="HUB" if hub_id else "NETWORK", hub_id=hub_id, hub_name=hub_point.name if hub_point else None),
    )


@router.get("/active-transits", response_model=list[ActiveTransit])
def get_active_transits(staff: Annotated[dict, Depends(require_roles(*_ROLES))], preview_hub_id: Annotated[str | None, Query()] = None) -> list[ActiveTransit]:
    """Initial snapshot for the Live Topology Map. The frontend layers
    Supabase Realtime on top of this for live delta updates — we don't
    collect continuous GPS pings, only depart/arrive scan events, so a
    truck's position between those two points is an honest straight-line
    time-based estimate, not a real live ping."""
    admin = get_admin_client()
    hub_id = resolve_scope_hub_id(staff, preview_hub_id)

    query = admin.table("master_bags").select("*").eq("status", "IN_TRANSIT")
    if hub_id:
        query = query.or_(f"origin_hub_id.eq.{hub_id},destination_hub_id.eq.{hub_id}")
    bags = query.execute().data

    hubs = {h["id"]: h for h in admin.table("hubs").select("*").execute().data}
    now = datetime.now(timezone.utc)
    transits: list[ActiveTransit] = []

    for bag in bags:
        origin, dest = hubs.get(bag["origin_hub_id"]), hubs.get(bag["destination_hub_id"])
        if not origin or not dest or not bag.get("dispatched_at"):
            continue
        distance_km = haversine_km(origin["gps_lat"], origin["gps_lng"], dest["gps_lat"], dest["gps_lng"])
        estimated_hours = max(distance_km / AVG_TRUCK_SPEED_KMH, 0.1)
        departed_at = dateparser.isoparse(bag["dispatched_at"])
        elapsed_hours = (now - departed_at).total_seconds() / 3600
        progress = max(0.0, min(elapsed_hours / estimated_hours, 1.0))

        transits.append(
            ActiveTransit(
                bag_id=bag["bag_id"],
                status=bag["status"],
                origin_hub=HubPoint(**origin),
                destination_hub=HubPoint(**dest),
                departed_at=bag["dispatched_at"],
                estimated_hours=round(estimated_hours, 2),
                progress_hint=round(progress, 3),
            )
        )

    return transits


@router.get("/bottlenecks", response_model=list[BottleneckOut])
async def get_bottlenecks(staff: Annotated[dict, Depends(require_roles(*_ROLES))], preview_hub_id: Annotated[str | None, Query()] = None) -> list[BottleneckOut]:
    """The 'AI Bottleneck Auditor' — see app/core/bottleneck_scanner.py."""
    hub_id = resolve_scope_hub_id(staff, preview_hub_id)
    results = await compute_bottlenecks()
    if hub_id:
        results = [b for b in results if b.origin_hub.id == hub_id or b.destination_hub.id == hub_id]
    return results


@router.get("/security-events", response_model=list[SecurityEvent])
def get_security_events(staff: Annotated[dict, Depends(require_roles(*_ROLES))], preview_hub_id: Annotated[str | None, Query()] = None, limit: int = 50) -> list[SecurityEvent]:
    admin = get_admin_client()
    hub_id = resolve_scope_hub_id(staff, preview_hub_id)

    query = admin.table("tracking_events").select("*").in_("event_type", ["COMPROMISED", "AUTO_HEALED"]).order("created_at", desc=True).limit(limit)
    if hub_id:
        bag_ids = _hub_bag_ids(admin, hub_id)
        if not bag_ids:
            return []
        query = query.in_("bag_id", bag_ids)
    return [SecurityEvent(**row) for row in query.execute().data]


@router.get("/staff-lookup", response_model=list[StaffLookupOut])
def staff_lookup(staff: Annotated[dict, Depends(require_roles(*_ROLES))], ids: Annotated[str, Query(description="comma-separated staff UUIDs")]) -> list[StaffLookupOut]:
    """Resolves the bare staff_id UUIDs that come back over the (anon-key)
    Realtime feed into names — kept behind normal staff auth so the roster
    itself is never exposed to the public Realtime channel."""
    admin = get_admin_client()
    id_list = [i for i in ids.split(",") if i]
    if not id_list:
        return []
    result = admin.table("staff").select("id,name,phone,role,error_points").in_("id", id_list).execute()
    return [StaffLookupOut(**row) for row in result.data]


@router.get("/staff", response_model=list[StaffOut])
def list_staff(staff: Annotated[dict, Depends(require_roles(*_ROLES))], preview_hub_id: Annotated[str | None, Query()] = None) -> list[StaffOut]:
    """Hub Manager sees only their own hub's roster; Super Admin sees
    everyone (optionally previewing a specific hub, same pattern as every
    other /admin endpoint)."""
    admin = get_admin_client()
    hub_id = resolve_scope_hub_id(staff, preview_hub_id)
    query = admin.table("staff").select("*").order("created_at", desc=True)
    if hub_id:
        query = query.eq("assigned_hub_id", hub_id)
    return [StaffOut(**row) for row in query.execute().data]


@router.post("/staff", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
def create_staff(payload: CreateStaffIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> StaffOut:
    admin = get_admin_client()

    if staff["role"] == "HUB_MANAGER":
        if payload.role not in HUB_MANAGER_CREATABLE_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Hub Managers can only add {', '.join(HUB_MANAGER_CREATABLE_ROLES)} staff — not {payload.role}.",
            )
        assigned_hub_id = staff["assigned_hub_id"]  # forced server-side — the payload's hub is never trusted here
    else:
        if payload.role != "SUPER_ADMIN" and not payload.assigned_hub_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="assigned_hub_id is required for this role.")
        assigned_hub_id = payload.assigned_hub_id

    existing = fetch_one(admin.table("staff").select("id").eq("phone", payload.phone).maybe_single())
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{payload.phone} is already registered as staff.")

    user_id = get_or_create_auth_user(admin, payload.phone)
    inserted = admin.table("staff").insert(
        {"id": user_id, "phone": payload.phone, "name": payload.name, "role": payload.role, "assigned_hub_id": assigned_hub_id}
    ).execute()
    return StaffOut(**inserted.data[0])


@router.delete("/staff/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_staff(staff_id: str, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> None:
    admin = get_admin_client()

    if staff_id == staff["id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't remove your own account.")

    target = fetch_one(admin.table("staff").select("*").eq("id", staff_id).maybe_single())
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown staff id")

    if staff["role"] == "HUB_MANAGER":
        if target["assigned_hub_id"] != staff["assigned_hub_id"] or target["role"] not in HUB_MANAGER_CREATABLE_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only remove your own hub's operational staff.")

    admin.table("staff").delete().eq("id", staff_id).execute()
    delete_auth_user(admin, staff_id)


# ---------------------------------------------------------------------------
# Network management: hubs are Super-Admin-only (creating infrastructure
# isn't a "my hub" decision the way staff is). Pincode routes follow the
# staff pattern — a Hub Manager can add/remove routes pointing to their OWN
# hub; Super Admin can touch any hub's routes.
# ---------------------------------------------------------------------------


@router.post("/hubs", response_model=HubOut, status_code=status.HTTP_201_CREATED)
def create_hub(payload: CreateHubIn, staff: Annotated[dict, Depends(require_roles("SUPER_ADMIN"))]) -> HubOut:
    admin = get_admin_client()
    inserted = admin.table("hubs").insert(payload.model_dump()).execute()
    return HubOut(**inserted.data[0])


@router.delete("/hubs/{hub_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hub(hub_id: str, staff: Annotated[dict, Depends(require_roles("SUPER_ADMIN"))]) -> None:
    admin = get_admin_client()
    if not fetch_one(admin.table("hubs").select("id").eq("id", hub_id).maybe_single()):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown hub id")

    try:
        admin.table("hubs").delete().eq("id", hub_id).execute()
    except Exception as exc:
        # pincode_routes references hubs with ON DELETE RESTRICT on purpose —
        # a route silently going nowhere is worse than a blocked deletion.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Can't delete this hub — pincode routes still point to it. Remove those routes first.",
        ) from exc


@router.get("/pincode-routes", response_model=list[PincodeRouteOut])
def list_pincode_routes(staff: Annotated[dict, Depends(require_roles(*_ROLES))], preview_hub_id: Annotated[str | None, Query()] = None) -> list[PincodeRouteOut]:
    admin = get_admin_client()
    hub_id = resolve_scope_hub_id(staff, preview_hub_id)
    query = admin.table("pincode_routes").select("*").order("pincode")
    if hub_id:
        query = query.eq("destination_hub_id", hub_id)
    return [PincodeRouteOut(**row) for row in query.execute().data]


@router.post("/pincode-routes", response_model=PincodeRouteOut, status_code=status.HTTP_201_CREATED)
def create_pincode_route(payload: CreatePincodeRouteIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> PincodeRouteOut:
    admin = get_admin_client()

    if staff["role"] == "HUB_MANAGER":
        destination_hub_id = staff["assigned_hub_id"]  # forced — never trust the payload's hub for a Hub Manager
    else:
        if not payload.destination_hub_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="destination_hub_id is required.")
        destination_hub_id = payload.destination_hub_id

    if fetch_one(admin.table("pincode_routes").select("pincode").eq("pincode", payload.pincode).maybe_single()):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Pincode {payload.pincode} is already routed.")

    inserted = admin.table("pincode_routes").insert({"pincode": payload.pincode, "destination_hub_id": destination_hub_id}).execute()
    return PincodeRouteOut(**inserted.data[0])


@router.delete("/pincode-routes/{pincode}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pincode_route(pincode: str, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> None:
    admin = get_admin_client()
    route = fetch_one(admin.table("pincode_routes").select("*").eq("pincode", pincode).maybe_single())
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown pincode")

    if staff["role"] == "HUB_MANAGER" and route["destination_hub_id"] != staff["assigned_hub_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only remove routes pointing to your own hub.")

    admin.table("pincode_routes").delete().eq("pincode", pincode).execute()


# ---------------------------------------------------------------------------
# Search Tracking (req. 5): Hub Manager / Super Admin enter any code — real
# tracking_id, real bag_id, or the 6-char shortcode of either — and get the
# full authenticated detail + timeline. Same shortcode-first dual-lookup
# pattern as track.py's public endpoint, just tried against both tables.
# ---------------------------------------------------------------------------


def _resolve_staff(admin, staff_id: str | None) -> tuple[str | None, str | None]:
    if not staff_id:
        return None, None
    row = fetch_one(admin.table("staff").select("name,phone,role").eq("id", staff_id).maybe_single())
    if not row:
        return None, None
    return row.get("name") or row["phone"], row["role"]


def _events_to_timeline(admin, rows: list[dict]) -> list[SearchTimelineEvent]:
    staff_ids = {r["staff_id"] for r in rows if r.get("staff_id")}
    staff_map: dict[str, tuple[str | None, str | None]] = {}
    if staff_ids:
        for row in admin.table("staff").select("id,name,phone,role").in_("id", list(staff_ids)).execute().data:
            staff_map[row["id"]] = (row.get("name") or row["phone"], row["role"])
    return [
        SearchTimelineEvent(
            event_type=e["event_type"],
            lat=e.get("lat"),
            lng=e.get("lng"),
            created_at=e["created_at"],
            staff_name=staff_map.get(e.get("staff_id"), (None, None))[0],
            staff_role=staff_map.get(e.get("staff_id"), (None, None))[1],
        )
        for e in sorted(rows, key=lambda e: e["created_at"])
    ]


def _parcel_timeline(admin, shipment: dict) -> list[SearchTimelineEvent]:
    own_events = admin.table("tracking_events").select("*").eq("tracking_id", shipment["tracking_id"]).execute().data
    bag_ids = {e["bag_id"] for e in own_events if e.get("bag_id")}
    if shipment.get("current_bag_id"):
        bag_ids.add(shipment["current_bag_id"])
    bag_departed = (
        admin.table("tracking_events").select("*").in_("bag_id", list(bag_ids)).eq("event_type", "DEPARTED").execute().data if bag_ids else []
    )
    return _events_to_timeline(admin, own_events + bag_departed)


@router.get("/search-tracking", response_model=SearchTrackingOut)
def search_tracking(code: str, staff: Annotated[dict, Depends(require_roles(*_ROLES))]):
    admin = get_admin_client()
    normalized = code.strip()

    shipment = fetch_one(admin.table("shipments").select("*").eq("shortcode", normalized.upper()).maybe_single())
    if not shipment:
        shipment = fetch_one(admin.table("shipments").select("*").eq("tracking_id", normalized).maybe_single())
    if shipment:
        assigned_name, assigned_role = _resolve_staff(admin, shipment.get("assigned_staff_id"))
        return SearchTrackingParcelOut(
            tracking_id=shipment["tracking_id"],
            shortcode=shipment["shortcode"],
            status=shipment["status"],
            status_confidence=shipment["status_confidence"],
            recipient_name=shipment.get("recipient_name"),
            recipient_phone=shipment.get("recipient_phone"),
            delivery_address=shipment.get("delivery_address"),
            delivery_pincode=shipment.get("delivery_pincode"),
            weight_grams=shipment.get("weight_grams"),
            declared_value=shipment.get("declared_value"),
            tamper_seal_id=shipment.get("tamper_seal_id"),
            condition_photo_urls=shipment.get("condition_photo_urls") or [],
            current_bag_id=shipment.get("current_bag_id"),
            assigned_staff_name=assigned_name,
            assigned_staff_role=assigned_role,
            created_at=shipment["created_at"],
            delivered_at=shipment.get("delivered_at"),
            timeline=_parcel_timeline(admin, shipment),
        )

    bag = fetch_one(admin.table("master_bags").select("*").eq("shortcode", normalized.upper()).maybe_single())
    if not bag:
        bag = fetch_one(admin.table("master_bags").select("*").eq("bag_id", normalized).maybe_single())
    if bag:
        hub_names = {h["id"]: h["name"] for h in admin.table("hubs").select("id,name").execute().data}
        bag_events = admin.table("tracking_events").select("*").eq("bag_id", bag["bag_id"]).execute().data
        return SearchTrackingBagOut(
            bag_id=bag["bag_id"],
            shortcode=bag["shortcode"],
            status=bag["status"],
            origin_hub_name=hub_names.get(bag.get("origin_hub_id")),
            destination_hub_name=hub_names.get(bag.get("destination_hub_id")),
            expected_weight=bag.get("expected_weight") or 0,
            actual_weight=bag.get("actual_weight"),
            child_count=_child_count(admin, bag["bag_id"]),
            timeline=_events_to_timeline(admin, bag_events),
        )

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No tracking ID, bag ID, or shortcode matches that code.")
