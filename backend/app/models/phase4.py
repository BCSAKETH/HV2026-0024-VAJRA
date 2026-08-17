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


class DeliverIn(BaseModel):
    otp: str = Field(..., min_length=4, max_length=4)
    staff_lat: float | None = None
    staff_lng: float | None = None


class RtoIn(BaseModel):
    staff_lat: float | None = None
    staff_lng: float | None = None
    reason: str | None = None
