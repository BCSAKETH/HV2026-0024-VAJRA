from pydantic import BaseModel

from app.models.phase2 import BagOut, ShipmentOut


class StaffManifestOut(BaseModel):
    """Everything currently linked to one staff member via assigned_staff_id
    — bags they're carrying (LINE_HAUL) and/or packages assigned to them
    (LAST_MILE). Populated purely from real scans, never from a
    notification/assignment suggestion."""

    bags: list[BagOut]
    shipments: list[ShipmentOut]


class NotifyStaffIn(BaseModel):
    message: str
    bag_id: str | None = None
    tracking_id: str | None = None


class StaffNotificationOut(BaseModel):
    id: str
    staff_id: str
    created_by: str | None
    message: str
    bag_id: str | None
    tracking_id: str | None
    created_at: str
    read_at: str | None
