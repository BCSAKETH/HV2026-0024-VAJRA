from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.bags import bag_out as _bag_out
from app.core.bags import child_count as _child_count
from app.core.bags import get_bag_or_404 as _get_bag_or_404
from app.core.security import require_roles
from app.core.supabase_client import fetch_one, get_admin_client
from app.models.phase2 import (
    BagBindIn,
    BagOut,
    DispatchIn,
    DispatchOut,
    ScanChildIn,
    ScanChildOut,
    ShipmentOut,
)

router = APIRouter(prefix="/bags", tags=["consolidation"])

_ROLES = ("WAREHOUSE_STAFF", "SUPER_ADMIN")
TOLERANCE_PCT = 1.5
HIGH_VALUE_THRESHOLD = 5000


@router.get("/{bag_id}", response_model=BagOut)
def get_bag(bag_id: str, staff: Annotated[dict, Depends(require_roles(*_ROLES, "HUB_MANAGER"))]) -> BagOut:
    admin = get_admin_client()
    return _bag_out(admin, _get_bag_or_404(admin, bag_id))


@router.post("/{bag_id}/bind", response_model=BagOut)
def bind_bag(
    bag_id: str,
    payload: BagBindIn,
    staff: Annotated[dict, Depends(require_roles(*_ROLES))],
) -> BagOut:
    admin = get_admin_client()
    bag = _get_bag_or_404(admin, bag_id)

    if bag["status"] != "PRE_ALLOCATED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Bag '{bag_id}' is already {bag['status']}, it can't be re-bound.",
        )
    if not staff.get("assigned_hub_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your staff profile has no assigned hub")

    hub = fetch_one(admin.table("hubs").select("id").eq("id", payload.destination_hub_id).maybe_single())
    if not hub:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown destination_hub_id")

    admin.table("master_bags").update(
        {
            "destination_hub_id": payload.destination_hub_id,
            "origin_hub_id": staff["assigned_hub_id"],
            "status": "OPEN",
        }
    ).eq("bag_id", bag_id).execute()

    admin.table("tracking_events").insert(
        {
            "bag_id": bag_id,
            "event_type": "CONSOLIDATED",
            "staff_id": staff["id"],
            "meta": {"action": "bound_destination", "destination_hub_id": payload.destination_hub_id},
        }
    ).execute()

    return _bag_out(admin, _get_bag_or_404(admin, bag_id))


@router.post("/{bag_id}/scan-child", response_model=ScanChildOut)
def scan_child(
    bag_id: str,
    payload: ScanChildIn,
    staff: Annotated[dict, Depends(require_roles(*_ROLES))],
) -> ScanChildOut:
    admin = get_admin_client()
    bag = _get_bag_or_404(admin, bag_id)

    if bag["status"] != "OPEN":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"Bag '{bag_id}' isn't open for consolidation (status={bag['status']})."
        )

    shipment = fetch_one(admin.table("shipments").select("*").eq("tracking_id", payload.tracking_id).maybe_single())
    if not shipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown tracking_id")

    # Idempotent re-scan of an item already in *this* bag — don't double-count weight.
    if shipment.get("current_bag_id") == bag_id:
        return ScanChildOut(shipment=ShipmentOut(**shipment), bag_child_count=_child_count(admin, bag_id))

    if shipment["status"] != "CREATED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"'{payload.tracking_id}' can't be consolidated (status={shipment['status']}). Confirm intake first.",
        )

    # --- Defense 1: Pincode Collision ---
    route = fetch_one(admin.table("pincode_routes").select("destination_hub_id").eq("pincode", shipment.get("delivery_pincode") or "").maybe_single())
    if not route:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "PINCODE_NOT_ROUTED", "message": f"No hub route is configured for pincode {shipment.get('delivery_pincode')}."},
        )
    if route["destination_hub_id"] != bag["destination_hub_id"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "PINCODE_MISMATCH",
                "message": f"'{payload.tracking_id}' (pincode {shipment.get('delivery_pincode')}) does not route to this bag's destination hub.",
            },
        )

    # --- Defense 2: Weight/Value Substitution — high-value tamper seal ---
    declared_value = shipment.get("declared_value") or 0
    tamper_seal_id = payload.tamper_seal_id or shipment.get("tamper_seal_id")
    if declared_value > HIGH_VALUE_THRESHOLD and not tamper_seal_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "TAMPER_SEAL_REQUIRED",
                "message": f"'{payload.tracking_id}' is worth ₹{declared_value:g} — attach a tamper seal and resubmit with tamper_seal_id.",
            },
        )

    update = {"current_bag_id": bag_id, "status": "IN_BAG"}
    if payload.tamper_seal_id:
        update["tamper_seal_id"] = payload.tamper_seal_id

    updated = admin.table("shipments").update(update).eq("tracking_id", payload.tracking_id).execute()
    updated_row = updated.data[0]

    new_expected_weight = float(bag.get("expected_weight") or 0) + float(shipment.get("weight_grams") or 0)
    admin.table("master_bags").update({"expected_weight": new_expected_weight}).eq("bag_id", bag_id).execute()

    admin.table("tracking_events").insert(
        {
            "tracking_id": payload.tracking_id,
            "bag_id": bag_id,
            "event_type": "CONSOLIDATED",
            "staff_id": staff["id"],
            "lat": payload.staff_lat,
            "lng": payload.staff_lng,
        }
    ).execute()

    return ScanChildOut(shipment=ShipmentOut(**updated_row), bag_child_count=_child_count(admin, bag_id))


@router.post("/{bag_id}/dispatch", response_model=DispatchOut)
def dispatch_bag(
    bag_id: str,
    payload: DispatchIn,
    staff: Annotated[dict, Depends(require_roles(*_ROLES))],
) -> DispatchOut:
    admin = get_admin_client()
    bag = _get_bag_or_404(admin, bag_id)

    if bag["status"] != "OPEN":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Bag '{bag_id}' isn't open (status={bag['status']}).")

    child_count = _child_count(admin, bag_id)
    if child_count == 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot dispatch an empty bag.")

    expected = float(bag.get("expected_weight") or 0)
    actual = payload.actual_weight
    diff_pct = (abs(actual - expected) / expected * 100) if expected > 0 else (100.0 if actual > 0 else 0.0)
    within = diff_pct <= TOLERANCE_PCT

    # --- Defense 3: Ghost Packages — Dynamic Tolerance Engine ---
    if not within:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "WEIGHT_TOLERANCE_EXCEEDED",
                "message": "Physical weight is outside the ±1.5% tolerance — dispatch blocked. Recheck the bag's contents.",
                "expected_weight": expected,
                "actual_weight": actual,
                "diff_pct": round(diff_pct, 2),
                "tolerance_pct": TOLERANCE_PCT,
            },
        )

    admin.table("master_bags").update(
        {
            "actual_weight": actual,
            "status": "SEALED",
            "sealed_by_staff_id": staff["id"],
            "sealed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("bag_id", bag_id).execute()

    admin.table("tracking_events").insert(
        {
            "bag_id": bag_id,
            "event_type": "SEALED",
            "staff_id": staff["id"],
            "meta": {"expected_weight": expected, "actual_weight": actual, "diff_pct": round(diff_pct, 2)},
        }
    ).execute()

    return DispatchOut(
        bag=_bag_out(admin, _get_bag_or_404(admin, bag_id)),
        expected_weight=expected,
        actual_weight=actual,
        tolerance_pct=TOLERANCE_PCT,
        diff_pct=round(diff_pct, 2),
        within_tolerance=True,
    )
