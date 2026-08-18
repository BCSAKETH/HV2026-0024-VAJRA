from datetime import datetime, timezone

from dateutil import parser as dateparser

from app.core.hub_scope import AVG_TRUCK_SPEED_KMH, DELAY_THRESHOLD_MULTIPLIER
from app.core.osrm import get_route
from app.core.supabase_client import get_admin_client
from app.core.velocity import haversine_km
from app.models.phase5 import BottleneckOut, HubPoint

# A waypoint detour is only worth suggesting if it doesn't balloon the trip —
# otherwise "reroute via a random other hub" is worse advice than "just wait".
MAX_DETOUR_RATIO = 1.3


async def compute_bottlenecks() -> list[BottleneckOut]:
    """The AI Bottleneck Auditor. 'Delayed' is judged against a real
    road-network travel time from OSRM where it's reachable, falling back to
    a documented straight-line estimate (AVG_TRUCK_SPEED_KMH) when OSRM
    can't be reached — the public demo instance is rate-limited and best-
    effort, so this can never be the only path. The 'AI reroute' waypoint
    search stays a straight-line nearest-hub heuristic on purpose: it runs
    over every other hub for every delayed bag, and burning an OSRM call per
    candidate on every 20s dashboard poll would just get the public instance
    rate-limited — cheap to screen candidates, one real OSRM call to draw
    the final suggested route. Framed to the dashboard as a heuristic
    suggestion, not a guarantee.

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
        fallback_hours = max(direct_km / AVG_TRUCK_SPEED_KMH, 0.1)
        departed_at = dateparser.isoparse(bag["dispatched_at"])
        elapsed_hours = (now - departed_at).total_seconds() / 3600

        # Cheap pre-filter on the straight-line estimate first — most bags
        # are nowhere near "delayed" and should never cost an OSRM call.
        if elapsed_hours / fallback_hours < DELAY_THRESHOLD_MULTIPLIER:
            continue

        direct_route = await get_route([(origin["gps_lat"], origin["gps_lng"]), (dest["gps_lat"], dest["gps_lng"])])
        if direct_route:
            estimated_hours = max(direct_route["duration_s"] / 3600, 0.1)
            polyline = direct_route["geometry"]
        else:
            estimated_hours = fallback_hours
            polyline = [[origin["gps_lat"], origin["gps_lng"]], [dest["gps_lat"], dest["gps_lng"]]]

        delay_ratio = elapsed_hours / estimated_hours
        if delay_ratio < DELAY_THRESHOLD_MULTIPLIER:
            continue  # OSRM's real road time cleared it — the straight-line pre-filter was a false positive

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
        if best_hub and best_detour_km is not None and best_detour_km < direct_km * MAX_DETOUR_RATIO:
            suggested_waypoint = HubPoint(**best_hub)
            waypoint_route = await get_route(
                [(origin["gps_lat"], origin["gps_lng"]), (best_hub["gps_lat"], best_hub["gps_lng"]), (dest["gps_lat"], dest["gps_lng"])]
            )
            polyline = waypoint_route["geometry"] if waypoint_route else [
                [origin["gps_lat"], origin["gps_lng"]],
                [best_hub["gps_lat"], best_hub["gps_lng"]],
                [dest["gps_lat"], dest["gps_lng"]],
            ]

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
