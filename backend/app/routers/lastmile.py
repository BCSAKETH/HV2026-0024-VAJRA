import base64
import secrets
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.bags import bag_out, get_bag_or_404
from app.core.config import get_settings
from app.core.osrm import get_route
from app.core.routing import group_multidrop, nearest_neighbor_route
from app.core.security import require_roles
from app.core.storage import upload_condition_photo
from app.core.supabase_client import fetch_one, get_admin_client
from app.core.fast2sms import send_out_for_delivery
from app.core.velocity import haversine_km
from app.models.phase2 import BagOut, ShipmentOut
from app.models.phase4 import ClaimChildIn, ClaimChildOut, DeliverIn, ManifestOut, ManifestStop, ProceedToDeliverOut, RtoIn, UnsealIn

router = APIRouter(tags=["lastmile"])

_ROLES = ("LAST_MILE", "SUPER_ADMIN")
GEOFENCE_METERS = 100
CLAIMED_FILTER = {"status": "ASSUMED_AT_HUB", "status_confidence": "HARD"}


def _generate_delivery_otp() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(4))


def _fetch_shipment_or_404(admin, tracking_id: str) -> dict:
    result = fetch_one(admin.table("shipments").select("*").eq("tracking_id", tracking_id).maybe_single())
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown tracking_id")
    return result


def _check_geofence(admin, staff_id: str, shipment: dict, lat: float | None, lng: float | None) -> None:
    """Defense 9's server-side enforcement — the mobile UI locks the OTP
    field client-side too, but that's UX, not security. A package with no
    geocoded address can't be checked at all, so it's allowed through (the
    "Call Recipient" button is the fallback in that case, not a hard block)."""
    if shipment.get("delivery_lat") is None or lat is None or lng is None:
        return
    distance_m = haversine_km(shipment["delivery_lat"], shipment["delivery_lng"], lat, lng) * 1000
    if distance_m > GEOFENCE_METERS:
        admin.table("tracking_events").insert(
            {
                "tracking_id": shipment["tracking_id"],
                "event_type": "DEFENSE_BLOCKED",
                "staff_id": staff_id,
                "lat": lat,
                "lng": lng,
                "meta": {"defense": "GEOFENCE", "distance_m": round(distance_m)},
            }
        ).execute()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "GEOFENCE_TOO_FAR",
                "message": f"You're {distance_m:.0f}m from the delivery address — get within {GEOFENCE_METERS}m first.",
                "distance_m": round(distance_m),
            },
        )


@router.post("/bags/{bag_id}/unseal", response_model=BagOut)
def unseal_bag(bag_id: str, payload: UnsealIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> BagOut:
    admin = get_admin_client()
    bag = get_bag_or_404(admin, bag_id)
    if bag["status"] != "ARRIVED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Bag '{bag_id}' isn't ARRIVED (status={bag['status']}) — can't unseal.")

    admin.table("master_bags").update({"status": "UNSEALED", "assigned_staff_id": staff["id"]}).eq("bag_id", bag_id).execute()
    admin.table("tracking_events").insert({"bag_id": bag_id, "event_type": "UNSEALED", "staff_id": staff["id"], "lat": payload.staff_lat, "lng": payload.staff_lng}).execute()
    return bag_out(admin, get_bag_or_404(admin, bag_id))


@router.post("/bags/{bag_id}/claim-child", response_model=ClaimChildOut)
def claim_child(bag_id: str, payload: ClaimChildIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> ClaimChildOut:
    admin = get_admin_client()
    bag = get_bag_or_404(admin, bag_id)
    if bag["status"] != "UNSEALED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Bag '{bag_id}' isn't unsealed (status={bag['status']}).")

    shipment = _fetch_shipment_or_404(admin, payload.tracking_id)
    if shipment["status"] in ("DELIVERED", "RTO", "COMPROMISED"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"'{payload.tracking_id}' is already {shipment['status']} — can't claim it.")

    if shipment.get("current_bag_id") == bag_id:
        # --- Normal claim: physically-scanned confirmation upgrades SOFT -> HARD ---
        update = {"status_confidence": "HARD", "assigned_staff_id": staff["id"]}
        updated = admin.table("shipments").update(update).eq("tracking_id", payload.tracking_id).execute().data[0]
        admin.table("tracking_events").insert(
            {"tracking_id": payload.tracking_id, "bag_id": bag_id, "event_type": "CLAIMED", "staff_id": staff["id"], "lat": payload.staff_lat, "lng": payload.staff_lng}
        ).execute()
        return ClaimChildOut(shipment=ShipmentOut(**updated), stowaway=False)

    # --- Defense 7: Stowaway Self-Healing ---
    route = fetch_one(admin.table("pincode_routes").select("destination_hub_id").eq("pincode", shipment.get("delivery_pincode") or "").maybe_single())
    if not route or route["destination_hub_id"] != bag["destination_hub_id"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "WRONG_DESTINATION",
                "message": f"'{payload.tracking_id}' isn't headed to this hub's delivery area — don't claim it, hand it back to the hub desk.",
            },
        )

    old_bag_id = shipment.get("current_bag_id")
    update = {"current_bag_id": bag_id, "status": "ASSUMED_AT_HUB", "status_confidence": "HARD", "assigned_staff_id": staff["id"]}
    updated = admin.table("shipments").update(update).eq("tracking_id", payload.tracking_id).execute().data[0]

    penalized_staff_id: str | None = None
    consolidated_event = (
        admin.table("tracking_events")
        .select("staff_id")
        .eq("tracking_id", payload.tracking_id)
        .eq("event_type", "CONSOLIDATED")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if consolidated_event.data and consolidated_event.data[0].get("staff_id"):
        origin_staff_id = consolidated_event.data[0]["staff_id"]
        origin_staff = fetch_one(admin.table("staff").select("error_points").eq("id", origin_staff_id).maybe_single())
        if origin_staff:
            admin.table("staff").update({"error_points": origin_staff["error_points"] + 1}).eq("id", origin_staff_id).execute()
            penalized_staff_id = origin_staff_id

    admin.table("tracking_events").insert(
        {
            "tracking_id": payload.tracking_id,
            "bag_id": bag_id,
            "event_type": "AUTO_HEALED",
            "staff_id": staff["id"],
            "lat": payload.staff_lat,
            "lng": payload.staff_lng,
            "meta": {"previous_bag_id": old_bag_id, "penalized_staff_id": penalized_staff_id},
        }
    ).execute()

    return ClaimChildOut(
        shipment=ShipmentOut(**updated),
        stowaway=True,
        penalized_staff_id=penalized_staff_id,
        message="Stowaway auto-healed — this package was misplaced during consolidation, now reassigned to the correct bag.",
    )


@router.get("/agent/claimed", response_model=list[ShipmentOut])
def get_claimed(staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> list[ShipmentOut]:
    admin = get_admin_client()
    result = admin.table("shipments").select("*").eq("assigned_staff_id", staff["id"]).match(CLAIMED_FILTER).execute()
    return [ShipmentOut(**row) for row in result.data]


@router.post("/agent/proceed-to-deliver", response_model=ProceedToDeliverOut)
async def proceed_to_deliver(staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> ProceedToDeliverOut:
    admin = get_admin_client()
    claimed = admin.table("shipments").select("*").eq("assigned_staff_id", staff["id"]).match(CLAIMED_FILTER).execute().data
    if not claimed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nothing claimed yet — scan packages before proceeding to deliver.")

    otps: dict[str, str] = {s["tracking_id"]: _generate_delivery_otp() for s in claimed}
    # Per-row update, not upsert — these are always existing rows, and upsert
    # makes postgrest build a candidate INSERT to check the conflict target,
    # which fails NOT NULL columns (like shortcode) that this partial payload
    # doesn't include, even though the row is only ever going to be updated.
    for tid, otp in otps.items():
        admin.table("shipments").update({"status": "OUT_FOR_DELIVERY", "delivery_otp": otp}).eq("tracking_id", tid).execute()
    admin.table("tracking_events").insert(
        [{"tracking_id": tid, "event_type": "OUT_FOR_DELIVERY", "staff_id": staff["id"]} for tid in otps]
    ).execute()

    notified = 0
    settings = get_settings()
    for s in claimed:
        if s.get("recipient_phone"):
            ok = await send_out_for_delivery(s["recipient_phone"], s["tracking_id"], otps[s["tracking_id"]])
            notified += int(ok)

    return ProceedToDeliverOut(manifest_size=len(claimed), notified=notified)


@router.get("/agent/manifest", response_model=ManifestOut)
async def get_manifest(
    staff: Annotated[dict, Depends(require_roles(*_ROLES))],
    lat: Annotated[float | None, Query()] = None,
    lng: Annotated[float | None, Query()] = None,
) -> ManifestOut:
    """Defense 8 (TSP + multi-drop) AND Defense 10 (dead-battery handover) in
    one place: this is purely a query over `assigned_staff_id` + status, no
    separate "manifest" table — so whichever staff.id is logged in gets
    their own in-progress run back, device-independent."""
    admin = get_admin_client()
    shipments = admin.table("shipments").select("*").eq("assigned_staff_id", staff["id"]).eq("status", "OUT_FOR_DELIVERY").execute().data

    groups = group_multidrop(shipments)
    ordered = nearest_neighbor_route((lat, lng), groups) if lat is not None and lng is not None else groups

    stops = [
        ManifestStop(sequence=i + 1, lat=g["lat"], lng=g["lng"], needs_manual_location=g["lat"] is None, shipments=[ShipmentOut(**s) for s in g["shipments"]])
        for i, g in enumerate(ordered)
    ]

    # Real driving distance/ETA for the whole run, in the order above — the
    # TSP ordering itself stays haversine-based (see routing.py), this just
    # measures the already-decided route against actual roads. Only
    # possible with a GPS start point and at least one routable stop.
    total_distance_km: float | None = None
    total_duration_minutes: float | None = None
    if lat is not None and lng is not None:
        waypoints = [(lat, lng)] + [(g["lat"], g["lng"]) for g in ordered if g["lat"] is not None]
        if len(waypoints) >= 2:
            route = await get_route(waypoints)
            if route:
                total_distance_km = round(route["distance_m"] / 1000, 1)
                total_duration_minutes = round(route["duration_s"] / 60, 1)

    return ManifestOut(
        stops=stops,
        total_packages=len(shipments),
        total_distance_km=total_distance_km,
        total_duration_minutes=total_duration_minutes,
    )


@router.post("/shipments/{tracking_id}/deliver", response_model=ShipmentOut)
def deliver_shipment(tracking_id: str, payload: DeliverIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> ShipmentOut:
    admin = get_admin_client()
    shipment = _fetch_shipment_or_404(admin, tracking_id)
    if shipment["status"] != "OUT_FOR_DELIVERY" or shipment.get("assigned_staff_id") != staff["id"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"'{tracking_id}' isn't in your active manifest.")

    _check_geofence(admin, staff["id"], shipment, payload.staff_lat, payload.staff_lng)  # Defense 9

    if payload.otp != shipment.get("delivery_otp"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect delivery OTP.")

    update: dict = {"status": "DELIVERED", "delivered_at": datetime.now(timezone.utc).isoformat()}
    if payload.delivery_photo_base64:
        raw_b64 = payload.delivery_photo_base64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        try:
            content = base64.b64decode(raw_b64)
            update["delivery_photo_url"] = upload_condition_photo(tracking_id, content, "image/jpeg")
        except Exception:
            # Proof-of-delivery is a nice-to-have on top of OTP+geofence, not
            # a third gate — a corrupt/undecodable photo must never block a
            # delivery that's already passed both real defenses.
            pass

    updated = (
        admin.table("shipments")
        .update(update)
        .eq("tracking_id", tracking_id)
        .execute()
        .data[0]
    )
    admin.table("tracking_events").insert(
        {"tracking_id": tracking_id, "event_type": "DELIVERED", "staff_id": staff["id"], "lat": payload.staff_lat, "lng": payload.staff_lng}
    ).execute()
    return ShipmentOut(**updated)


@router.post("/shipments/{tracking_id}/rto", response_model=ShipmentOut)
def rto_shipment(tracking_id: str, payload: RtoIn, staff: Annotated[dict, Depends(require_roles(*_ROLES))]) -> ShipmentOut:
    admin = get_admin_client()
    shipment = _fetch_shipment_or_404(admin, tracking_id)
    if shipment["status"] != "OUT_FOR_DELIVERY" or shipment.get("assigned_staff_id") != staff["id"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"'{tracking_id}' isn't in your active manifest.")

    _check_geofence(admin, staff["id"], shipment, payload.staff_lat, payload.staff_lng)  # same geofence gate as delivery

    updated = admin.table("shipments").update({"status": "RTO"}).eq("tracking_id", tracking_id).execute().data[0]
    admin.table("tracking_events").insert(
        {"tracking_id": tracking_id, "event_type": "RTO", "staff_id": staff["id"], "lat": payload.staff_lat, "lng": payload.staff_lng, "meta": {"reason": payload.reason}}
    ).execute()
    return ShipmentOut(**updated)
