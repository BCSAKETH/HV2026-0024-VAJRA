from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class HubPoint(BaseModel):
    id: str
    name: str
    type: str
    gps_lat: float
    gps_lng: float


class KpiScope(BaseModel):
    type: Literal["NETWORK", "HUB"]
    hub_id: str | None = None
    hub_name: str | None = None


class KpiOut(BaseModel):
    total_active_orders: int
    average_tat_hours: float | None
    network_integrity_index: float
    status_breakdown: dict[str, int]
    scope: KpiScope


class ActiveTransit(BaseModel):
    bag_id: str
    status: str
    origin_hub: HubPoint
    destination_hub: HubPoint
    departed_at: str
    estimated_hours: float
    progress_hint: float  # 0..1, server's best-effort estimate at fetch time; client ticks it forward live


class SecurityEvent(BaseModel):
    id: str
    event_type: str
    bag_id: str | None
    tracking_id: str | None
    lat: float | None
    lng: float | None
    created_at: str
    meta: dict
    staff_id: str | None


class StaffLookupOut(BaseModel):
    id: str
    name: str | None
    phone: str
    role: str
    error_points: int


class BottleneckOut(BaseModel):
    bag_id: str
    origin_hub: HubPoint
    destination_hub: HubPoint
    departed_at: str
    elapsed_hours: float
    estimated_hours: float
    delay_ratio: float
    suggested_waypoint: HubPoint | None
    polyline: list[list[float]]


class TrackTimelineEvent(BaseModel):
    event_type: str
    lat: float | None
    lng: float | None
    created_at: str


class TrackOut(BaseModel):
    tracking_id: str
    status: str
    status_confidence: str
    recipient_name: str | None
    delivery_pincode: str | None
    condition_photo_urls: list[str]
    timeline: list[TrackTimelineEvent]
    badge: Literal["VERIFIED_GENUINE", "CLONE_ATTACK_DETECTED"]
    created_at: str
    delivered_at: str | None


# ---- Hub Manager / Super Admin "Search Tracking" (req. 5) ----
# Unlike the public TrackOut above, this is authenticated staff-only, so it's
# fine to include recipient phone, assigned staff, declared value, and who
# scanned each timeline event — none of that is exposed publicly.


class SearchTimelineEvent(BaseModel):
    event_type: str
    lat: float | None
    lng: float | None
    created_at: str
    staff_name: str | None
    staff_role: str | None


class SearchTrackingParcelOut(BaseModel):
    result_type: Literal["PARCEL"] = "PARCEL"
    tracking_id: str
    shortcode: str
    status: str
    status_confidence: str
    recipient_name: str | None
    recipient_phone: str | None
    delivery_address: str | None
    delivery_pincode: str | None
    weight_grams: float | None
    declared_value: float | None
    tamper_seal_id: str | None
    condition_photo_urls: list[str]
    current_bag_id: str | None
    assigned_staff_name: str | None
    assigned_staff_role: str | None
    created_at: str
    delivered_at: str | None
    timeline: list[SearchTimelineEvent]


class SearchTrackingBagOut(BaseModel):
    result_type: Literal["BAG"] = "BAG"
    bag_id: str
    shortcode: str
    status: str
    origin_hub_name: str | None
    destination_hub_name: str | None
    expected_weight: float
    actual_weight: float | None
    child_count: int
    timeline: list[SearchTimelineEvent]


SearchTrackingOut = Annotated[Union[SearchTrackingParcelOut, SearchTrackingBagOut], Field(discriminator="result_type")]
