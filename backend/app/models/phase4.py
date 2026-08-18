from pydantic import BaseModel, Field

from app.models.phase2 import ShipmentOut


class UnsealIn(BaseModel):
    staff_lat: float | None = None
    staff_lng: float | None = None


class ClaimChildIn(BaseModel):
    tracking_id: str
    staff_lat: float | None = None
    staff_lng: float | None = None


class ClaimChildOut(BaseModel):
    shipment: ShipmentOut
    stowaway: bool
    penalized_staff_id: str | None = None
    message: str | None = None


class ProceedToDeliverOut(BaseModel):
    manifest_size: int
    notified: int


class ManifestStop(BaseModel):
    sequence: int
    lat: float | None
    lng: float | None
    needs_manual_location: bool
    shipments: list[ShipmentOut]


class ManifestOut(BaseModel):
    stops: list[ManifestStop]
    total_packages: int
    # Real road-network total for the run, via OSRM, in the same
    # already-TSP-sorted stop order returned above. None when there's no
    # GPS start point, fewer than 2 routable stops, or OSRM couldn't be
    # reached — the manifest itself never depends on this being present.
    total_distance_km: float | None = None
    total_duration_minutes: float | None = None


class DeliverIn(BaseModel):
    otp: str = Field(..., min_length=4, max_length=4)
    staff_lat: float | None = None
    staff_lng: float | None = None


class RtoIn(BaseModel):
    staff_lat: float | None = None
    staff_lng: float | None = None
    reason: str | None = None
