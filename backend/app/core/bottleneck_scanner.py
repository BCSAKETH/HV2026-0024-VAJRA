from datetime import datetime, timezone

from dateutil import parser as dateparser

from app.core.hub_scope import AVG_TRUCK_SPEED_KMH, DELAY_THRESHOLD_MULTIPLIER
from app.core.supabase_client import get_admin_client
from app.core.velocity import haversine_km
from app.models.phase5 import BottleneckOut, HubPoint

# A waypoint detour is only worth suggesting if it doesn't balloon the trip —
# otherwise "reroute via a random other hub" is worse advice than "just wait".
MAX_DETOUR_RATIO = 1.3


def compute_bottlenecks() -> list[BottleneckOut]:
    """The AI Bottleneck Auditor. No real road-network or traffic data is
    available, so 'delayed' is judged against a documented straight-line
    time estimate (AVG_TRUCK_SPEED_KMH), and the 'AI reroute' is a nearest-
    waypoint heuristic (does detouring through some other hub not blow up
    the trip?) — not genuine traffic-aware routing. Framed to the dashboard
    as a heuristic suggestion, not a guarantee.

    Computed fresh on every call rather than cached by a background loop —
    on serverless (Vercel Functions), a process only lives for the duration
    of one request, so there is no "background" for a loop to run in. The
    dashboard already polls this endpoint every 20s, so the user-visible
    behavior is identical either way; this is just the version of it that's
    honest about where it actually runs."""
    admin = get_admin_client()
    bags = admin.table("master_bags").select("*").eq("status", "IN_TRANSIT").execute().data
    hubs = {h["id"]: h for h in admin.table("hubs").select("*").execute().data}
    now = datetime.now(timezone.utc)
    results: list[BottleneckOut] = []

    for bag in bags:
        origin, dest = hubs.get(bag["origin_hub_id"]), hubs.get(bag["destination_hub_id"])
        if not origin or not dest or not bag.get("dispatched_at"):
            continue

        direct_km = haversine_km(origin["gps_lat"], origin["gps_lng"], dest["gps_lat"], dest["gps_lng"])
        estimated_hours = max(direct_km / AVG_TRUCK_SPEED_KMH, 0.1)
        departed_at = dateparser.isoparse(bag["dispatched_at"])
        elapsed_hours = (now - departed_at).total_seconds() / 3600
        delay_ratio = elapsed_hours / estimated_hours

        if delay_ratio < DELAY_THRESHOLD_MULTIPLIER:
            continue

        best_hub, best_detour_km = None, None
        for hub_id, hub in hubs.items():
            if hub_id in (bag["origin_hub_id"], bag["destination_hub_id"]):
                continue
            detour_km = haversine_km(origin["gps_lat"], origin["gps_lng"], hub["gps_lat"], hub["gps_lng"]) + haversine_km(
                hub["gps_lat"], hub["gps_lng"], dest["gps_lat"], dest["gps_lng"]
            )
            if best_detour_km is None or detour_km < best_detour_km:
                best_detour_km, best_hub = detour_km, hub

        suggested_waypoint = None
        polyline = [[origin["gps_lat"], origin["gps_lng"]], [dest["gps_lat"], dest["gps_lng"]]]
        if best_hub and best_detour_km is not None and best_detour_km < direct_km * MAX_DETOUR_RATIO:
            suggested_waypoint = HubPoint(**best_hub)
            polyline = [[origin["gps_lat"], origin["gps_lng"]], [best_hub["gps_lat"], best_hub["gps_lng"]], [dest["gps_lat"], dest["gps_lng"]]]

        results.append(
            BottleneckOut(
                bag_id=bag["bag_id"],
                origin_hub=HubPoint(**origin),
                destination_hub=HubPoint(**dest),
                departed_at=bag["dispatched_at"],
                elapsed_hours=round(elapsed_hours, 2),
                estimated_hours=round(estimated_hours, 2),
                delay_ratio=round(delay_ratio, 2),
                suggested_waypoint=suggested_waypoint,
                polyline=polyline,
            )
        )

    return results
