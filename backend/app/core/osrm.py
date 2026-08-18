import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("locus.osrm")


async def get_route(waypoints: list[tuple[float, float]]) -> dict | None:
    """Real road-network route via OSRM (Defense 8's straight-line haversine
    estimate was always a documented stand-in for this — see routing.py and
    bottleneck_scanner.py). Takes (lat, lng) pairs in visiting order,
    OSRM itself speaks (lng, lat), so the conversion happens at the edges
    only; every caller in this codebase stays in (lat, lng).

    Best-effort — never raises. The public demo server
    (router.project-osrm.org) is unauthenticated, rate-limited, and
    documented as "not for production use", so a miss here (timeout, rate
    limit, no road path between the points) just means the caller falls
    back to whatever straight-line estimate it already had before OSRM
    existed — it never blocks the operational flow that triggered it.

    Returns None, or {"distance_m": float, "duration_s": float,
    "geometry": list[[lat, lng], ...]} — geometry follows the actual roads,
    ready to hand straight to a Polyline component.
    """
    if len(waypoints) < 2:
        return None

    settings = get_settings()
    coord_str = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in waypoints)
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{coord_str}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            # "simplified" (Douglas-Peucker-reduced) is what OSRM itself
            # recommends for map display — "full" returns every road-segment
            # vertex, which is precise but was measured at 6700+ points for
            # a single ~570km route: far too heavy to ship to a Leaflet
            # Polyline for no visible difference at dashboard zoom levels.
            resp = await client.get(url, params={"overview": "simplified", "geometries": "geojson"})
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:  # network issues, rate limiting, malformed coords — never block on this
        logger.warning("OSRM route failed for %d waypoints: %s", len(waypoints), exc)
        return None

    if data.get("code") != "Ok" or not data.get("routes"):
        logger.info("OSRM found no route for %d waypoints (code=%s)", len(waypoints), data.get("code"))
        return None

    route = data["routes"][0]
    try:
        lnglat_coords = route["geometry"]["coordinates"]
        return {
            "distance_m": float(route["distance"]),
            "duration_s": float(route["duration"]),
            "geometry": [[lat, lng] for lng, lat in lnglat_coords],
        }
    except (KeyError, ValueError, TypeError) as exc:
        logger.warning("OSRM returned an unparseable route: %s", exc)
        return None
