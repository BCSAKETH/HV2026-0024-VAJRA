import math
from datetime import datetime, timezone

from dateutil import parser as dateparser
from fastapi import HTTPException, status

EARTH_RADIUS_KM = 6371.0
MAX_PLAUSIBLE_SPEED_KMH = 1000.0
GPS_JITTER_TOLERANCE_KM = 0.05  # ~50m — ignore noise around near-zero time deltas


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


class CloneSuspected(Exception):
    def __init__(self, speed_kmh: float, distance_km: float, prev_event: dict):
        self.speed_kmh = speed_kmh
        self.distance_km = distance_km
        self.prev_event = prev_event
        super().__init__(f"Implausible speed: {speed_kmh:.0f} km/h")


def assert_not_cloned(admin, *, bag_id: str | None, tracking_id: str | None, lat: float | None, lng: float | None) -> None:
    """Defense 6 — Haversine Anti-Clone Engine. Compares this scan's
    position/time against the subject's last recorded scan. Raises
    CloneSuspected (caller decides what to log/return) if implied speed
    exceeds what's physically possible for a truck. A scan with no GPS, or a
    subject with no prior located event, is skipped rather than blocked —
    this is a fraud detector, not a GPS-availability gate."""
    if lat is None or lng is None:
        return

    # Pull the last few events and filter in Python for the first with a
    # location — simpler and more portable than relying on postgrest's
    # null-filter operator chain across client versions.
    query = admin.table("tracking_events").select("*").order("created_at", desc=True).limit(5)
    query = query.eq("bag_id", bag_id) if bag_id else query.eq("tracking_id", tracking_id)
    result = query.execute()

    prev = next((e for e in result.data if e.get("lat") is not None and e.get("lng") is not None), None)
    if not prev:
        return

    prev_time = dateparser.isoparse(prev["created_at"])
    now = datetime.now(timezone.utc)
    hours_elapsed = (now - prev_time).total_seconds() / 3600

    distance_km = haversine_km(prev["lat"], prev["lng"], lat, lng)

    if hours_elapsed <= 0:
        speed_kmh = math.inf if distance_km > GPS_JITTER_TOLERANCE_KM else 0.0
    else:
        speed_kmh = distance_km / hours_elapsed

    if speed_kmh > MAX_PLAUSIBLE_SPEED_KMH:
        raise CloneSuspected(speed_kmh=speed_kmh, distance_km=distance_km, prev_event=prev)


def clone_http_error(exc: CloneSuspected) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "CLONE_SUSPECTED",
            "message": f"Rejected: implied speed of {exc.speed_kmh:,.0f} km/h since the last scan is physically impossible.",
            "speed_kmh": round(exc.speed_kmh, 1) if math.isfinite(exc.speed_kmh) else None,
            "distance_km": round(exc.distance_km, 2),
        },
    )
