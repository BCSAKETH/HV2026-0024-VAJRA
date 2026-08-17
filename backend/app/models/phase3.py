from typing import Literal

from pydantic import BaseModel, Field

from app.models.phase2 import BagOut


class DepartIn(BaseModel):
    staff_lat: float | None = None
    staff_lng: float | None = None


class ArriveIn(BaseModel):
    staff_lat: float | None = None
    staff_lng: float | None = None
    via_shortcode: bool = False
    soft_audit_tracking_ids: list[str] = Field(default_factory=list)


BagAction = Literal["DEPART", "ARRIVE"]
SyncStatus = Literal["applied", "discarded_stale", "failed"]


class SyncEventIn(BaseModel):
    client_event_id: str
    action: BagAction
    bag_id: str
    lat: float | None = None
    lng: float | None = None
    client_timestamp: str  # ISO 8601, set on-device at the moment of the scan
    via_shortcode: bool = False
    soft_audit_tracking_ids: list[str] = Field(default_factory=list)


class SyncBatchIn(BaseModel):
    events: list[SyncEventIn]


class SyncResultItem(BaseModel):
    client_event_id: str
    status: SyncStatus
    message: str | None = None
    bag: BagOut | None = None
