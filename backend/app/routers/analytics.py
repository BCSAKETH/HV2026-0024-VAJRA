from typing import Annotated

from dateutil import parser as dateparser
from fastapi import APIRouter, Depends, Query

from app.core.hub_scope import resolve_scope_hub_id
from app.core.security import require_roles
from app.core.supabase_client import get_admin_client
from app.models.analytics import (
    AnalyticsOut,
    DefenseMetric,
    MsmeStatEntry,
    MsmeStats,
    RoutingGap,
    StaffLeaderboardEntry,
    ThroughputStats,
    ValueRiskStats,
)

router = APIRouter(prefix="/admin", tags=["analytics"])

_ROLES = ("HUB_MANAGER", "SUPER_ADMIN")
HIGH_VALUE_THRESHOLD = 5000


def _hub_bag_ids(admin, hub_id: str) -> list[str]:
    result = admin.table("master_bags").select("bag_id").or_(f"origin_hub_id.eq.{hub_id},destination_hub_id.eq.{hub_id}").execute()
    return [b["bag_id"] for b in result.data]


def _scoped_shipments(admin, hub_id: str | None) -> list[dict]:
    """Same scoping approach as /admin/kpis — a shipment is "in" a hub's
    scope if it ever rode in a bag touching that hub, or (before it was ever
    bagged) its delivery pincode routes to that hub."""
    if not hub_id:
        return admin.table("shipments").select("*").neq("status", "PRE_ALLOCATED").execute().data

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
    return shipments


@router.get("/analytics", response_model=AnalyticsOut)
def get_analytics(staff: Annotated[dict, Depends(require_roles(*_ROLES))], preview_hub_id: Annotated[str | None, Query()] = None) -> AnalyticsOut:
    admin = get_admin_client()
    hub_id = resolve_scope_hub_id(staff, preview_hub_id)
    hub_name = None
    if hub_id:
        hub_row = admin.table("hubs").select("name").eq("id", hub_id).maybe_single().execute()
        hub_name = hub_row.data["name"] if hub_row and hub_row.data else None

    shipments = _scoped_shipments(admin, hub_id)
    shipment_ids = {s["tracking_id"] for s in shipments}

    # --- Events in scope: everything logged against a bag touching this hub,
    # plus everything logged directly against a shipment already in scope
    # (covers pre-bagged defense blocks like a pincode mismatch, which never
    # gets a bag_id at all). ---
    if hub_id:
        bag_ids = _hub_bag_ids(admin, hub_id)
        events: list[dict] = []
        seen_event_ids: set[str] = set()
        if bag_ids:
            for e in admin.table("tracking_events").select("*").in_("bag_id", bag_ids).execute().data:
                if e["id"] not in seen_event_ids:
                    seen_event_ids.add(e["id"])
                    events.append(e)
        for e in admin.table("tracking_events").select("*").in_("tracking_id", list(shipment_ids) or ["__none__"]).execute().data:
            if e["id"] not in seen_event_ids:
                seen_event_ids.add(e["id"])
                events.append(e)
    else:
        events = admin.table("tracking_events").select("*").execute().data

    def _blocked_count(defense: str) -> int:
        return sum(1 for e in events if e["event_type"] == "DEFENSE_BLOCKED" and (e.get("meta") or {}).get("defense") == defense)

    compromised_count = sum(1 for e in events if e["event_type"] == "COMPROMISED")
    auto_healed_count = sum(1 for e in events if e["event_type"] == "AUTO_HEALED")
    transit_leakage_count = sum(1 for e in events if e["event_type"] == "ARRIVED_AT_HUB" and (e.get("meta") or {}).get("via") == "bag_arrival")

    out_for_delivery_count = sum(1 for s in shipments if s["status"] == "OUT_FOR_DELIVERY" and s.get("assigned_staff_id"))

    defenses = [
        DefenseMetric(number=1, name="Pincode Collision", count=_blocked_count("PINCODE_COLLISION")),
        DefenseMetric(number=2, name="Tamper Seal Required", count=_blocked_count("TAMPER_SEAL")),
        DefenseMetric(number=3, name="Weight Tolerance Block", count=_blocked_count("WEIGHT_TOLERANCE")),
        DefenseMetric(
            number=4,
            name="Transit Leakage (bulk-assumed at hub)",
            count=transit_leakage_count,
            note="Informational — every bag arrival that soft-confirmed its contents, not a blocked attempt.",
        ),
        DefenseMetric(number=5, name="Soft Audit Triggered", count=_blocked_count("SOFT_AUDIT")),
        DefenseMetric(number=6, name="Teleportation Alert (clone/velocity)", count=compromised_count),
        DefenseMetric(number=7, name="Auto-Healed Stowaway", count=auto_healed_count),
        DefenseMetric(
            number=8,
            name="Route Efficiency (TSP/multi-drop)",
            count=0,
            note="Computed live per manifest (GET /agent/manifest), not persisted — nothing to aggregate historically yet.",
        ),
        DefenseMetric(number=9, name="Geofence Block", count=_blocked_count("GEOFENCE")),
        DefenseMetric(
            number=10,
            name="Handover-Resumable Manifest",
            count=out_for_delivery_count,
            note="Packages currently OUT_FOR_DELIVERY and assigned — this is exactly what a device swap would resume.",
        ),
    ]

    # --- Throughput ---
    delivered = [s for s in shipments if s["status"] == "DELIVERED"]
    rto = [s for s in shipments if s["status"] == "RTO"]
    denom = len(delivered) + len(rto)
    dwell_hours = []
    for s in delivered:
        if s.get("delivered_at"):
            created = dateparser.isoparse(s["created_at"])
            done = dateparser.isoparse(s["delivered_at"])
            dwell_hours.append((done - created).total_seconds() / 3600)

    if hub_id:
        bags_awaiting = admin.table("master_bags").select("bag_id", count="exact").eq("status", "ARRIVED").eq("destination_hub_id", hub_id).execute()
    else:
        bags_awaiting = admin.table("master_bags").select("bag_id", count="exact").eq("status", "ARRIVED").execute()

    throughput = ThroughputStats(
        intake_count=len([s for s in shipments if s["status"] != "PRE_ALLOCATED"]),
        delivered_count=len(delivered),
        rto_count=len(rto),
        rto_rate_pct=round(len(rto) / denom * 100, 1) if denom else 0.0,
        bags_awaiting_pickup=bags_awaiting.count or 0,
        avg_dwell_hours=round(sum(dwell_hours) / len(dwell_hours), 1) if dwell_hours else None,
    )

    # --- Staff leaderboard (error_points), scoped to this hub if applicable ---
    staff_query = admin.table("staff").select("id,name,phone,role,error_points").gt("error_points", 0).order("error_points", desc=True).limit(10)
    if hub_id:
        staff_query = staff_query.eq("assigned_hub_id", hub_id)
    leaderboard = [StaffLeaderboardEntry(**row) for row in staff_query.execute().data]

    # --- Value / risk exposure ---
    total_value = sum(float(s.get("declared_value") or 0) for s in shipments)
    in_transit_value = sum(float(s.get("declared_value") or 0) for s in shipments if s["status"] in ("IN_TRANSIT", "ASSUMED_AT_HUB", "OUT_FOR_DELIVERY"))
    high_value_undelivered = sum(1 for s in shipments if (s.get("declared_value") or 0) > HIGH_VALUE_THRESHOLD and s["status"] not in ("DELIVERED", "RTO"))

    value_risk = ValueRiskStats(
        total_declared_value=round(total_value, 2),
        value_in_transit=round(in_transit_value, 2),
        high_value_undelivered_count=high_value_undelivered,
    )

    # --- MSME stats (network-wide — MSMEs aren't owned by a hub) ---
    msme_counts: dict[str, int] = {}
    for s in (admin.table("shipments").select("msme_id").not_.is_("msme_id", "null").execute().data if not hub_id else []):
        msme_counts[s["msme_id"]] = msme_counts.get(s["msme_id"], 0) + 1
    top_msmes: list[MsmeStatEntry] = []
    total_msmes = 0
    if not hub_id:
        all_msmes = admin.table("msmes").select("id,business_name").execute().data
        total_msmes = len(all_msmes)
        name_by_id = {m["id"]: m["business_name"] for m in all_msmes}
        top_ids = sorted(msme_counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
        top_msmes = [MsmeStatEntry(id=mid, business_name=name_by_id.get(mid, "Unknown"), shipment_count=count) for mid, count in top_ids]

    msme_stats = MsmeStats(total_msmes=total_msmes, top_by_volume=top_msmes)

    # --- Routing-gap detection: delivery pincodes with no configured route ---
    routed_pincodes = {p["pincode"] for p in admin.table("pincode_routes").select("pincode").execute().data}
    gap_counts: dict[str, int] = {}
    for s in shipments:
        pin = s.get("delivery_pincode")
        if pin and pin not in routed_pincodes:
            gap_counts[pin] = gap_counts.get(pin, 0) + 1
    routing_gaps = [RoutingGap(pincode=p, shipment_count=c) for p, c in sorted(gap_counts.items(), key=lambda kv: kv[1], reverse=True)]

    return AnalyticsOut(
        scope_type="HUB" if hub_id else "NETWORK",
        scope_hub_name=hub_name,
        defenses=defenses,
        throughput=throughput,
        staff_leaderboard=leaderboard,
        value_risk=value_risk,
        msme_stats=msme_stats,
        routing_gaps=routing_gaps,
    )
